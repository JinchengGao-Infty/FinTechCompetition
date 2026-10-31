"""The HTTP contract is tested without downloading or loading any neural model."""
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
import wave

spec = importlib.util.spec_from_file_location("voice_service", Path(__file__).resolve().parents[1] / "voice_service.py")
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


class FakeModel:
    engine = "sherpa-onnx-vits"
    model = "test-only"
    load_ms = 1

    def __init__(self):
        self.spoken = []
        self.error = None

    def synthesize(self, text):
        if self.error:
            raise self.error
        self.spoken.append(text)
        return voice.wav_bytes([0.1, -0.1] * 100, 22050), {"first_audio_ms": 12.5, "engine": self.engine}


class PayloadTests(unittest.TestCase):
    def test_chinese_female_profile_is_explicit_and_rejects_male_or_unknown_voice(self):
        self.assertEqual(len(voice.FEMALE_VOICES), 55)
        self.assertEqual(voice.female_voice()["name"], "zf_001")
        self.assertEqual(voice.female_voice(12)["name"], "zf_018")
        self.assertEqual(voice.female_voice(25)["name"], "zf_040")
        for speaker in (0, 2, 58, 102, -1, "3", True):
            with self.subTest(speaker=speaker), self.assertRaises(ValueError):
                voice.female_voice(speaker)

    def test_unverified_kokoro_archive_is_rejected_before_extraction(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "not-a-model.tar.bz2"
            archive.write_bytes(b"not a model")
            with self.assertRaisesRegex(ValueError, "archive size"):
                voice.extract_female_model(archive, Path(temporary) / "out")
            self.assertFalse((Path(temporary) / "out").exists())

    def test_only_speak_accepted(self):
        for value in (None, [], {"reply": "hello"}, {"speak": "hello", "actions": []}, {"speak": 1}, {"speak": ""}, {"speak": "a" * 601}):
            with self.subTest(value=str(value)[:60]), self.assertRaises(ValueError):
                voice.parse_payload(value)
        self.assertEqual(voice.parse_payload({"speak": "我来核对。"}), "我来核对。")

    def test_sensitive_values_redacted(self):
        output = voice.sanitize_speech("卡号6222 1234 5678 9999，验证码：a1b2c3。密码秘密花园。")
        for secret in ("6222", "9999", "a1b2c3", "秘密花园"):
            self.assertNotIn(secret, output)
        self.assertNotIn("一二三四五六", voice.sanitize_speech("动态码一二三四五六。"))

    def test_plain_text_and_safe_amount(self):
        self.assertEqual(voice.sanitize_speech("<speak>向小林转账520元。</speak>"), "向小林转账520元。")

    def test_wav_is_real_pcm(self):
        payload = voice.wav_bytes([-2.0, 0, 2.0], 22050)
        with wave.open(io.BytesIO(payload)) as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getsampwidth(), 2)
            self.assertEqual(audio.getframerate(), 22050)
            self.assertEqual(audio.getnframes(), 3)

    def test_non_loopback_bind_denied(self):
        with self.assertRaises(ValueError):
            voice.VoiceHTTPServer(("0.0.0.0", 0), FakeModel())


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = FakeModel()
        cls.server = voice.VoiceHTTPServer(("127.0.0.1", 0), cls.model)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        self.model.error = None

    def request(self, path="/tts", payload=None, method="POST", origin="http://127.0.0.1:65321", session=True, headers=None):
        request_headers = {"Origin": origin, "Content-Type": "application/json"}
        if session:
            request_headers["X-Voice-Session"] = self.server.session
        request_headers.update(headers or {})
        data = None if method in {"GET", "OPTIONS"} else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(self.base + path, data=data, headers=request_headers, method=method)
        try:
            return urllib.request.urlopen(request, timeout=3)
        except urllib.error.HTTPError as response:
            return response

    def test_health_handshake_has_no_credentials_and_no_audio(self):
        with self.request("/health", method="GET", session=False) as response:
            result = json.load(response)
            self.assertTrue(result["ready"])
            self.assertEqual(result["session"], self.server.session)
            self.assertEqual(result["engine"], "sherpa-onnx-vits")
            self.assertTrue(result["offline"])
            self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_audio_request_returns_pcm_and_real_timing_header(self):
        with self.request(payload={"speak": "请核对。"}) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Content-Type"], "audio/wav")
            self.assertEqual(response.headers["X-Voice-First-Audio-Ms"], "12.5")
            self.assertTrue(response.read().startswith(b"RIFF"))

    def test_server_scrubs_sensitive_speech_before_model(self):
        with self.request(payload={"speak": "验证码123456。"}) as response:
            self.assertEqual(response.status, 200)
        self.assertNotIn("123456", self.model.spoken[-1])

    def test_unknown_origin_cannot_read_session_or_synthesize(self):
        for method, path in (("GET", "/health"), ("POST", "/tts"), ("OPTIONS", "/tts")):
            with self.request(path, payload={"speak": "hello"}, method=method, origin="https://untrusted.example") as response:
                self.assertEqual(response.status, 403)
                self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_ephemeral_session_is_required(self):
        with self.request(payload={"speak": "hello"}, session=False) as response:
            self.assertEqual(response.status, 403)
        with self.request(payload={"speak": "hello"}, headers={"X-Voice-Session": "wrong"}) as response:
            self.assertEqual(response.status, 403)

    def test_json_field_and_content_type_boundaries(self):
        for payload in ({"reply": "hello"}, {"speak": "hello", "actions": [{"type": "transfer"}]}, {"speak": "x" * 601}):
            with self.request(payload=payload) as response:
                self.assertEqual(response.status, 400)
        with self.request(payload={"speak": "hello"}, headers={"Content-Type": "text/plain"}) as response:
            self.assertEqual(response.status, 415)

    def test_busy_and_failed_tts_do_not_return_fake_audio(self):
        for error, status in ((BlockingIOError("busy"), 429), (RuntimeError("private internal data"), 503)):
            self.model.error = error
            with self.request(payload={"speak": "hello"}) as response:
                self.assertEqual(response.status, status)
                self.assertNotIn(b"private internal data", response.read())

    def test_repeated_early_rejections_deliver_status_without_windows_socket_reset(self):
        before = len(self.model.spoken)
        for _ in range(20):
            with self.request(payload={"speak": "hello"}, headers={"Content-Type": "text/plain"}) as response:
                self.assertEqual(response.status, 415)
                self.assertEqual(json.load(response), {"error": "json-required"})
        self.assertEqual(len(self.model.spoken), before)

    def test_paths_and_host_are_bounded(self):
        with self.request("/other", payload={"speak": "hello"}) as response:
            self.assertEqual(response.status, 404)
        with self.request("/health", method="GET", headers={"Host": "untrusted.example"}) as response:
            self.assertEqual(response.status, 403)

    def test_cors_preflight_is_specific(self):
        with self.request(method="OPTIONS") as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://127.0.0.1:65321")
            self.assertIn("X-Voice-Session", response.headers["Access-Control-Allow-Headers"])


if __name__ == "__main__":
    unittest.main()
