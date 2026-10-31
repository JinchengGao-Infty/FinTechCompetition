"""Optional, loopback-only Chinese TTS. No transaction tools, microphone capture, or credentials.

Run --download-model explicitly once, install requirements-voice-demo.txt in a venv,
then run --model-dir PATH. Importing this file never downloads or loads a model.
"""
import argparse
import array
import hashlib
import hmac
import io
import json
from pathlib import Path
import re
import secrets
import sys
import tarfile
import threading
import time
import unicodedata
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_NAME = "vits-icefall-zh-aishell3"
HQ_MODEL_NAME = "matcha-icefall-zh-baker"
FEMALE_MODEL_NAME = "kokoro-multi-lang-v1_1"
FEMALE_ARCHIVE_BYTES = 364855331
FEMALE_ARCHIVE_SHA256 = "b78e1ac42b852e839cceaafbe88f66806bf5860992d1d7b9a3f2ad1198427aed"
FEMALE_FP32_SHA256 = "99db0bc8fd0c5033d249fe922db16768b71b4a6b26cfd93d206fbf66c76efb5f"
FEMALE_VOICES = tuple("zf_" + name for name in "001 002 003 004 005 006 007 008 017 018 019 021 022 023 024 026 027 028 032 036 038 039 040 042 043 044 046 047 048 049 051 059 060 067 070 071 072 073 074 075 076 077 078 079 083 084 085 086 087 088 090 092 093 094 099".split())
MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + MODEL_NAME + ".tar.bz2"
MODEL_ARCHIVE_LIMIT = 40 * 1024 * 1024
DEFAULT_ORIGINS = {"http://127.0.0.1:65321", "http://localhost:65321"}
MAX_TEXT = 600


def female_release(precision="fp32"):
    if precision == "fp32":
        return FEMALE_MODEL_NAME, FEMALE_ARCHIVE_BYTES, FEMALE_ARCHIVE_SHA256
    if precision == "int8":
        return "kokoro-int8-multi-lang-v1_1", 147052523, "259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c"
    raise ValueError("Unknown Kokoro precision")


def female_voice(speaker=None):
    speaker = 3 if speaker is None else speaker
    if type(speaker) is not int or not 3 <= speaker <= 57:
        raise ValueError("Kokoro demo requires a Chinese female speaker ID 3-57")
    return {"speaker_id": speaker, "name": FEMALE_VOICES[speaker - 3], "gender": "female", "language": "zh-CN"}


def sanitize_speech(value):
    if not isinstance(value, str):
        raise ValueError("speak must be a string")
    text = unicodedata.normalize("NFKC", value)
    text = re.sub(r"[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", " ", text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", "链接已隐藏", text, flags=re.I)
    text = re.sub(r"(?:验证码|校验码|动态码|短信码|安全码|密码|口令|PIN|OTP|CVV|CVC|password|verification\s*code)\s*(?:是|为|is)?\s*[:：=]?[^，。！？；\n,;!?]{0,80}", "验证信息已隐藏", text, flags=re.I)
    text = re.sub(r"\d(?:[\s·•.,‐‑‒–—-]*\d){9,23}", "号码已隐藏", text)
    text = re.sub(r"[零〇一二三四五六七八九幺](?:[\s·•.,‐‑‒–—-]*[零〇一二三四五六七八九幺]){9,23}", "号码已隐藏", text)
    return re.sub(r"\s+", " ", text).strip()[:MAX_TEXT]


def parse_payload(value):
    if not isinstance(value, dict) or set(value) != {"speak"}:
        raise ValueError("Only the speak field is accepted")
    if not isinstance(value["speak"], str) or not 1 <= len(value["speak"]) <= MAX_TEXT:
        raise ValueError("Invalid speak length")
    text = sanitize_speech(value["speak"])
    if not text:
        raise ValueError("Empty speech")
    return text


def wav_bytes(samples, sample_rate):
    # Standard-library PCM output keeps the optional runtime small.
    pcm = array.array("h", (max(-32768, min(32767, round(float(sample) * 32767))) for sample in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(sample_rate)
        file.writeframes(pcm.tobytes())
    return output.getvalue()


def extract_female_model(archive, directory, precision="fp32"):
    """Extract only the fixed official release after checking its published digest."""
    archive = Path(archive).resolve()
    directory = Path(directory).resolve()
    name, expected_bytes, expected_sha = female_release(precision)
    if archive.stat().st_size != expected_bytes:
        raise ValueError("Unexpected Kokoro archive size")
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected_sha:
        raise ValueError("Kokoro official SHA-256 mismatch")
    directory.mkdir(parents=True, exist_ok=True)
    total = 0
    with tarfile.open(archive, mode="r|bz2") as bundle:
        for member in bundle:
            destination = (directory / member.name).resolve()
            if (not member.name.startswith(name + "/") and member.name != name) or directory not in destination.parents or member.issym() or member.islnk():
                raise ValueError("Unexpected Kokoro archive path")
            total += member.size
            if total > 512 * 1024 * 1024 or member.size > 384 * 1024 * 1024:
                raise ValueError("Kokoro extracted model exceeds limit")
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, destination.open("wb") as output:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        output.write(chunk)
            else:
                raise ValueError("Unexpected Kokoro archive member")
    return directory / name


def download_model(directory, engine="kokoro", archive_path=None, precision="fp32"):
    """Explicit opt-in download; use only the small official archive and selected files."""
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    if engine == "kokoro":
        name, expected_bytes, expected_sha = female_release(precision)
        url = MODEL_URL.replace(MODEL_NAME, name)
        archive = Path(archive_path).resolve() if archive_path else directory / (name + ".tar.bz2")
        if not archive_path:
            with urllib.request.urlopen(url, timeout=35) as response, archive.open("wb") as output:
                count = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > expected_bytes:
                        raise ValueError("Kokoro download exceeds limit")
                    output.write(chunk)
        result = extract_female_model(archive, directory, precision)
        manifest = {"source": url, "archive_bytes": expected_bytes, "archive_sha256": expected_sha,
                    "model": name, "precision": precision, "upstream": "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh", "license": "Apache-2.0"}
        (directory / "download-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return result
    if archive_path:
        raise ValueError("--archive is supported only for the verified Kokoro release")
    name = MODEL_NAME if engine == "vits" else HQ_MODEL_NAME
    url = MODEL_URL if engine == "vits" else MODEL_URL.replace(MODEL_NAME, HQ_MODEL_NAME)
    limit = MODEL_ARCHIVE_LIMIT if engine == "vits" else 90 * 1024 * 1024
    archive = directory / (name + ".tar.bz2")
    with urllib.request.urlopen(url, timeout=35) as response, archive.open("wb") as output:
        if int(response.headers.get("Content-Length", 0)) > limit:
            raise ValueError("Model archive exceeds download limit")
        count = 0
        while True:
            chunk = response.read(512 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > limit:
                raise ValueError("Model archive exceeds download limit")
            output.write(chunk)
    acoustic_name = "model.onnx" if engine == "vits" else "model-steps-3.onnx"
    selected = {acoustic_name, "tokens.txt", "lexicon.txt", "phone.fst", "number.fst", "date.fst", "LICENSE", "README.md"}
    model_directory = directory / name
    model_directory.mkdir(exist_ok=True)
    written = []
    with tarfile.open(archive) as bundle:
        for member in bundle.getmembers():
            if member.name not in {name + "/" + item for item in selected}:
                continue
            if not member.isfile() or member.issym() or member.islnk() or member.size > limit:
                raise ValueError("Unexpected archive member")
            # Basename-only output: no archive-controlled directory or link is followed.
            destination = model_directory / Path(member.name).name
            with bundle.extractfile(member) as source, destination.open("wb") as output:
                output.write(source.read())
            written.append(destination.name)
    if not {acoustic_name, "tokens.txt", "lexicon.txt"}.issubset(written):
        raise ValueError("Required model files missing")
    manifest = {"source": url, "archive_bytes": archive.stat().st_size,
                "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": written}
    if engine == "matcha":
        vocoder_url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx"
        vocoder = directory / "vocos-22khz-univ.onnx"
        with urllib.request.urlopen(vocoder_url, timeout=35) as response, vocoder.open("wb") as output:
            total = 0
            while True:
                chunk = response.read(512 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 60 * 1024 * 1024:
                    raise ValueError("Vocoder exceeds download limit")
                output.write(chunk)
        manifest["vocoder"] = {"source": vocoder_url, "bytes": vocoder.stat().st_size, "sha256": hashlib.sha256(vocoder.read_bytes()).hexdigest()}
    (directory / "download-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return model_directory


class LocalTTS:
    engine = "sherpa-onnx-vits"
    model = MODEL_NAME

    def __init__(self, directory, speaker=None, speed=1.0, threads=2, engine="kokoro", vocoder=None, precision="fp32"):
        import sherpa_onnx

        start = time.perf_counter()
        directory = Path(directory).resolve()
        if precision not in {"fp32", "int8"}:
            raise ValueError("Unknown Kokoro precision")
        acoustic_name = ("model.int8.onnx" if precision == "int8" else "model.onnx") if engine == "kokoro" else "model.onnx" if engine == "vits" else "model-steps-3.onnx"
        required = (acoustic_name, "tokens.txt", "lexicon-zh.txt", "voices.bin") if engine == "kokoro" else (acoustic_name, "tokens.txt", "lexicon.txt")
        for filename in required:
            if not (directory / filename).is_file():
                raise ValueError("Missing local model file: " + filename)
        rules = ("phone-zh.fst", "date-zh.fst", "number-zh.fst") if engine == "kokoro" else ("phone.fst", "date.fst", "number.fst")
        fsts = [str(directory / name) for name in rules if (directory / name).is_file()]
        if engine == "kokoro":
            self.voice = female_voice(speaker)
            speaker = self.voice["speaker_id"]
            lexicons = [str(directory / name) for name in ("lexicon-us-en.txt", "lexicon-zh.txt") if (directory / name).is_file()]
            model_config = sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(directory / acoustic_name), voices=str(directory / "voices.bin"), tokens=str(directory / "tokens.txt"), lexicon=",".join(lexicons)), num_threads=threads, provider="cpu", debug=False)
            self.engine = "sherpa-onnx-kokoro"
            self.model = female_release(precision)[0]
            self.voice["precision"] = precision
        elif engine == "vits":
            speaker = 21 if speaker is None else speaker
            model_config = sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=str(directory / acoustic_name), lexicon=str(directory / "lexicon.txt"), tokens=str(directory / "tokens.txt")), num_threads=threads, provider="cpu", debug=False)
        else:
            vocoder = Path(vocoder or directory.parent / "vocos-22khz-univ.onnx").resolve()
            if not vocoder.is_file():
                raise ValueError("Missing local Vocos vocoder")
            model_config = sherpa_onnx.OfflineTtsModelConfig(matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(acoustic_model=str(directory / acoustic_name), vocoder=str(vocoder), lexicon=str(directory / "lexicon.txt"), tokens=str(directory / "tokens.txt")), num_threads=threads, provider="cpu", debug=False)
            self.engine = "sherpa-onnx-matcha"
            self.model = HQ_MODEL_NAME
            speaker = 0
        config = sherpa_onnx.OfflineTtsConfig(model=model_config, rule_fsts=",".join(fsts), max_num_sentences=1)
        if not config.validate():
            raise ValueError("Invalid local TTS model configuration")
        self.tts = sherpa_onnx.OfflineTts(config)
        self.speaker = speaker
        self.speed = speed
        self.load_ms = round((time.perf_counter() - start) * 1000, 2)
        self.lock = threading.Lock()

    def synthesize(self, text):
        start = time.perf_counter()
        # Do not queue multiple inferences behind a long utterance.
        if not self.lock.acquire(blocking=False):
            raise BlockingIOError("Voice model busy")
        try:
            audio = self.tts.generate(text, sid=self.speaker, speed=self.speed)
            if not len(audio.samples):
                raise ValueError("TTS generated no audio")
            data = wav_bytes(audio.samples, audio.sample_rate)
            metrics = {"first_audio_ms": round((time.perf_counter() - start) * 1000, 2),
                       "duration_ms": round(len(audio.samples) / audio.sample_rate * 1000, 2),
                       "sample_rate": audio.sample_rate, "bytes": len(data), "engine": self.engine, "model": self.model}
            if hasattr(self, "voice"):
                metrics["voice"] = dict(self.voice)
            return data, metrics
        finally:
            self.lock.release()


class VoiceHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address, model, allowed_origins=None):
        if address[0] not in {"127.0.0.1", "localhost"}:
            raise ValueError("Voice service must bind loopback")
        self.model = model
        self.allowed_origins = set(allowed_origins or DEFAULT_ORIGINS)
        self.session = secrets.token_urlsafe(32)
        super().__init__(address, VoiceHandler)


class VoiceHandler(BaseHTTPRequestHandler):
    server_version = "FinPilotVoice/1"

    def log_message(self, *_args):
        pass  # Never write spoken text, authorization phrases, or identities to logs.

    def origin_allowed(self):
        host = self.headers.get("Host", "").split(":")[0]
        return host in {"127.0.0.1", "localhost"} and (not self.headers.get("Origin") or self.headers["Origin"] in self.server.allowed_origins)

    def send_body(self, status, data, content_type="application/json; charset=utf-8", metrics=None):
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Voice-Session")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Expose-Headers", "X-Voice-First-Audio-Ms, X-Voice-Engine")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if metrics:
            self.send_header("X-Voice-First-Audio-Ms", str(metrics["first_audio_ms"]))
            self.send_header("X-Voice-Engine", metrics["engine"])
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Client cancellation immediately stops playback; an in-flight CPU call may finish.

    def json_body(self, status, value):
        self.send_body(status, json.dumps(value).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_body(204 if self.origin_allowed() else 403, b"")

    def do_GET(self):
        if not self.origin_allowed():
            return self.json_body(403, {"error": "origin-denied"})
        if self.path != "/health":
            return self.json_body(404, {"error": "not-found"})
        self.json_body(200, {"ready": True, "engine": self.server.model.engine, "model": self.server.model.model,
                             "load_ms": self.server.model.load_ms, "session": self.server.session, "offline": True,
                             "voice": getattr(self.server.model, "voice", None)})

    def do_POST(self):
        # Consume only a bounded body before an early rejection. Closing a Windows
        # TCP socket with unread request bytes can reset it before the 4xx reply
        # reaches the caller. Never parse or synthesize unauthenticated content.
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192:
                return self.json_body(400, {"error": "invalid-speech-payload"})
            previous_timeout = self.connection.gettimeout()
            try:
                self.connection.settimeout(2)
                raw_body = self.rfile.read(length)
            finally:
                self.connection.settimeout(previous_timeout)
            if len(raw_body) != length:
                raise ValueError("Incomplete body")
        except (ValueError, OSError):
            return self.json_body(400, {"error": "invalid-speech-payload"})
        if not self.origin_allowed():
            return self.json_body(403, {"error": "origin-denied"})
        if self.path != "/tts":
            return self.json_body(404, {"error": "not-found"})
        if not hmac.compare_digest(self.headers.get("X-Voice-Session", ""), self.server.session):
            return self.json_body(403, {"error": "session-required"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.json_body(415, {"error": "json-required"})
        try:
            text = parse_payload(json.loads(raw_body))
        except (ValueError, UnicodeError, TypeError):
            return self.json_body(400, {"error": "invalid-speech-payload"})
        try:
            audio, metrics = self.server.model.synthesize(text)
        except BlockingIOError:
            return self.json_body(429, {"error": "voice-model-busy"})
        except Exception:
            return self.json_body(503, {"error": "voice-model-unavailable"})
        self.send_body(200, audio, "audio/wav", metrics)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--download-model", type=Path, metavar="DESTINATION")
    parser.add_argument("--port", type=int, default=65323)
    parser.add_argument("--engine", choices=("kokoro", "vits", "matcha"), default="kokoro")
    parser.add_argument("--precision", choices=("fp32", "int8"), default="fp32")
    parser.add_argument("--archive", type=Path, help="Use an already downloaded, checksum-verified Kokoro archive")
    parser.add_argument("--vocoder", type=Path)
    parser.add_argument("--allowed-origin", action="append")
    parser.add_argument("--speaker", type=int)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--threads", type=int)
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--text", default="我会先核对收款人与金额，确认后再继续。")
    parser.add_argument("--output", type=Path, default=Path("voice-demo-local.wav"))
    args = parser.parse_args()
    if args.download_model:
        print(download_model(args.download_model, args.engine, args.archive, args.precision))
        return
    threads = args.threads if args.threads is not None else 8 if args.engine == "kokoro" else 2
    if args.speaker is not None and not 0 <= args.speaker < 174 or not 0.5 <= args.speed <= 1.8 or not 1 <= threads <= 8:
        parser.error("speaker/speed/threads out of bounds")
    model_name = female_release(args.precision)[0] if args.engine == "kokoro" else MODEL_NAME if args.engine == "vits" else HQ_MODEL_NAME
    model_dir = args.model_dir or Path(__file__).resolve().parent / ".voice-demo" / model_name
    model = LocalTTS(model_dir, args.speaker, args.speed, threads, args.engine, args.vocoder, args.precision)
    if args.sample:
        text = parse_payload({"speak": args.text})
        data, first = model.synthesize(text)
        _, warm = model.synthesize(text)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(data)
        evidence = {"load_ms": model.load_ms, "first": first, "warm": warm,
                    "audio_sha256": hashlib.sha256(data).hexdigest(), "text": text,
                    "timing_definition": "Full first utterance generated to WAV in memory; excludes browser, network and LLM time."}
        args.output.with_suffix(".json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(evidence, ensure_ascii=True))
        return
    server = VoiceHTTPServer(("127.0.0.1", args.port), model, args.allowed_origin)
    print(json.dumps({"listening": "http://127.0.0.1:" + str(server.server_port), "engine": model.engine, "load_ms": model.load_ms}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
