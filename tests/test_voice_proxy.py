"""Same-origin voice proxy contract. Uses only a synthetic loopback app and fake TTS upstream."""
import http.client
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
import wave

spec = importlib.util.spec_from_file_location('voice_proxy_test_server', Path(__file__).parents[1] / 'server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class VoiceProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.FinPilotHTTPServer(('127.0.0.1', 0), app.Handler)
        app.PORT = cls.server.server_port
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        app.ALLOW_API = False
        app.AGENT_VALIDATION = False
        app.SESSIONS.clear()
        self.calls = []
        self.connections = []
        self.close_events = []
        self.status = 200
        self.upstream_headers = {'Content-Type': 'application/json'}
        self.body = json.dumps({'ready':True,'engine':'sherpa-onnx-vits','model':'vits-icefall-zh-aishell3',
                                'load_ms':234.5,'session':'voice-fixture-session-only-123','offline':True,
                                'private_extra':'must-never-be-forwarded'}).encode()
        self.upstream_error = None
        test = self
        class Response:
            def __init__(self): self.status = test.status
            def getheader(self, key, default=None):
                return next((value for name, value in test.upstream_headers.items() if name.lower() == key.lower()), default)
            def read(self, maximum):
                test.read_limit = maximum
                if test.upstream_error:
                    raise test.upstream_error
                return test.body[:maximum]
        class Connection:
            def __init__(self, host, port, timeout):
                test.connections.append({'host':host,'port':port,'timeout':timeout,'closed':False})
                self.record = test.connections[-1]
                self.closed_event = threading.Event()
                test.close_events.append(self.closed_event)
            def request(self, method, path, body, headers):
                test.calls.append({'method':method,'path':path,'body':body,'headers':dict(headers)})
            def getresponse(self): return Response()
            def close(self):
                self.record['closed'] = True
                self.closed_event.set()
        app._VOICE_CONNECTION_FACTORY = Connection
        self.read_limit = None
        status, headers, body = self.request('GET', '/api/session', authenticated=False)
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.csrf = json.loads(body)['csrf']

    def request(self, method, path, data=None, *, headers=None, authenticated=True, raw=None):
        actual = {'Origin':f'http://127.0.0.1:{app.PORT}'}
        if authenticated:
            actual.update({'Cookie':self.cookie,'X-CSRF-Token':self.csrf})
        actual.update(headers or {})
        if raw is None and data is not None:
            raw = json.dumps(data).encode()
            actual.setdefault('Content-Type', 'application/json')
        before_connections = len(self.connections)
        connection = http.client.HTTPConnection('127.0.0.1', app.PORT, timeout=3)
        try:
            connection.request(method, path, raw, actual)
            response = connection.getresponse()
            status, headers, body = response.status, dict(response.getheaders()), response.read()
            # A response body can arrive before the handler's finally closes its
            # upstream connection. Observe that completion without a timing race.
            for event in self.close_events[before_connections:]:
                self.assertTrue(event.wait(1), 'Voice upstream connection did not close')
            return status, headers, body
        finally:
            connection.close()

    def tts(self, data=None, **kwargs):
        headers = {'Content-Type':'application/json','X-Voice-Session':'voice-fixture-session-only-123', **kwargs.pop('headers', {})}
        return self.request('POST', '/api/voice/tts', {'speak':'你好，我会先核对安排。'} if data is None else data, headers=headers, **kwargs)

    def audio(self):
        stream = io.BytesIO()
        with wave.open(stream, 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(22050)
            output.writeframes(b'\0\0' * 100)
        self.body = stream.getvalue()
        self.upstream_headers = {'Content-Type':'audio/wav','Content-Length':str(len(self.body)),
                                 'X-Voice-Engine':'sherpa-onnx-vits','X-Voice-First-Audio-Ms':'123.5',
                                 'Set-Cookie':'upstream-must-not-leak','Authorization':'upstream-must-not-leak'}

    def test_health_uses_fixed_target_and_filters_metadata_with_model_api_disabled(self):
        status, _, raw = self.request('GET', '/api/voice/health')
        self.assertEqual(status, 200)
        info = json.loads(raw)
        self.assertEqual(set(info), {'ready','engine','model','load_ms','session','offline'})
        self.assertNotIn('private_extra', info)
        self.assertFalse(app.ALLOW_API)
        self.assertEqual(self.connections, [{'host':'127.0.0.1','port':65323,'timeout':2,'closed':True}])
        self.assertEqual(self.calls[0]['path'], '/health')
        self.assertEqual(self.calls[0]['method'], 'GET')
        self.assertEqual(self.read_limit, app.VOICE_HEALTH_LIMIT + 1)

    def test_kokoro_health_handshake_is_accepted_without_forwarding_private_model_metadata(self):
        self.body = json.dumps({'ready':True,'engine':'sherpa-onnx-kokoro','model':'kokoro-multi-lang-v1_1',
                                'load_ms':3060.0,'session':'voice-fixture-session-only-123','offline':True,
                                'voice':{'id':'zf_001','gender':'female'},
                                'model_path':'private-model-location-must-not-leak',
                                'unsafe_target':'https://untrusted.invalid'}).encode()
        status, _, raw = self.request('GET','/api/voice/health')
        self.assertEqual(status,200)
        info = json.loads(raw)
        self.assertEqual(info,{'ready':True,'engine':'sherpa-onnx-kokoro','model':'kokoro-multi-lang-v1_1',
                               'load_ms':3060.0,'session':'voice-fixture-session-only-123','offline':True})
        self.assertNotIn(b'private-model-location',raw)
        self.assertEqual(self.connections[0]['host'],'127.0.0.1')
        self.assertEqual(self.connections[0]['port'],65323)
        self.assertEqual(self.calls[0]['path'],'/health')
        self.assertEqual(set(self.calls[0]['headers']),{'Accept','Origin'})

    def test_kokoro_audio_and_metrics_reach_same_origin_without_relaxing_request_scope(self):
        self.audio()
        self.upstream_headers['X-Voice-Engine'] = 'sherpa-onnx-kokoro'
        status, headers, raw = self.tts()
        self.assertEqual(status,200)
        self.assertEqual(raw,self.body)
        self.assertEqual(headers['X-Voice-Engine'],'sherpa-onnx-kokoro')
        self.assertEqual(headers['Content-Type'],'audio/wav')
        self.assertNotIn('Set-Cookie',headers)
        self.assertNotIn('Authorization',headers)
        self.assertEqual(self.connections[0]['port'],65323)
        self.assertEqual(json.loads(self.calls[0]['body']),{'speak':'你好，我会先核对安排。'})
        self.assertEqual(self.tts({'speak':'你好','engine':'arbitrary-backend'})[0],400)
        self.assertEqual(len(self.calls),1)

    def test_kokoro_still_requires_the_full_offline_health_protocol(self):
        baseline={'ready':True,'engine':'sherpa-onnx-kokoro','model':'kokoro-multi-lang-v1_1',
                  'load_ms':10,'session':'voice-fixture-session-only-123','offline':True}
        for patch in ({'ready':False},{'engine':'kokoro-untrusted-backend'},{'session':'short'},
                      {'offline':False},{'load_ms':True},{'model':'../../untrusted'}):
            with self.subTest(patch=list(patch)):
                self.body=json.dumps({**baseline,**patch}).encode()
                status, _, raw=self.request('GET','/api/voice/health')
                self.assertEqual(status,502)
                self.assertEqual(json.loads(raw)['code'],'voice_invalid_response')

    def test_health_rejects_missing_session_and_cross_origin_before_upstream(self):
        self.assertEqual(self.request('GET', '/api/voice/health', authenticated=False)[0], 401)
        self.assertEqual(self.request('GET', '/api/voice/health', headers={'Origin':'https://untrusted.invalid'})[0], 403)
        self.assertEqual(self.connections, [])

    def test_tts_forwards_only_voice_nonce_and_audio_metrics_without_provider_credentials(self):
        next(iter(app.SESSIONS.values()))['key'] = 'unit-test-existing-key-only'
        self.audio()
        status, headers, raw = self.tts(headers={'Authorization':'test-client-provider-value','X-Unsafe-Target':'https://untrusted.invalid'})
        self.assertEqual(status, 200)
        self.assertEqual(raw, self.body)
        self.assertEqual(headers['Content-Type'], 'audio/wav')
        self.assertEqual(headers['X-Voice-Engine'], 'sherpa-onnx-vits')
        self.assertEqual(headers['X-Voice-First-Audio-Ms'], '123.5')
        self.assertNotIn('Set-Cookie', headers)
        self.assertNotIn('Authorization', headers)
        forwarded = self.calls[0]
        self.assertEqual(forwarded['path'], '/tts')
        self.assertEqual(forwarded['headers']['X-Voice-Session'], 'voice-fixture-session-only-123')
        self.assertEqual(set(forwarded['headers']), {'Accept','Origin','Content-Type','X-Voice-Session'})
        self.assertEqual(json.loads(forwarded['body']), {'speak':'你好，我会先核对安排。'})
        self.assertEqual(self.connections[0]['timeout'], 10)
        self.assertTrue(self.connections[0]['closed'])
        self.assertEqual(next(iter(app.SESSIONS.values()))['key'], 'unit-test-existing-key-only')

    def test_tts_preserves_app_session_origin_and_csrf_guards(self):
        for options in ({'authenticated':False}, {'headers':{'Origin':'https://untrusted.invalid'}}, {'headers':{'X-CSRF-Token':'invalid'}}):
            with self.subTest(options=options):
                self.assertEqual(self.tts(**options)[0], 400)
        self.assertEqual(self.connections, [])

    def test_tts_requires_voice_nonce_and_does_not_forward_invalid_headers(self):
        for value in ('', 'short', 'not a token', 'x' * 129):
            with self.subTest(value_length=len(value)):
                self.assertEqual(self.tts(headers={'X-Voice-Session':value})[0], 403)
        self.assertEqual(self.connections, [])

    def test_tts_accepts_only_bounded_speak_json_not_actions_or_proxy_targets(self):
        for data in ({'speak':''},{'speak':' '},{'speak':'x' * 601},{'speak':123},
                     {'speak':'你好','actions':[{'action':'transfer'}]}, {'speak':'你好','url':'https://untrusted.invalid'}):
            with self.subTest(fields=list(data)):
                self.assertEqual(self.tts(data)[0], 400)
        self.assertEqual(self.tts(headers={'Content-Type':'text/plain'})[0], 415)
        self.assertEqual(self.tts(raw=b'{invalid-json')[0], 400)
        self.assertEqual(self.tts(raw=b'x' * (app.VOICE_REQUEST_LIMIT + 1))[0], 400)
        self.assertEqual(self.connections, [])

    def test_unknown_paths_and_query_targets_never_turn_into_an_open_proxy(self):
        for method, path in [('GET','/api/voice/health?url=https://untrusted.invalid'),
                             ('POST','/api/voice/tts?url=https://untrusted.invalid'),
                             ('GET','/api/voice/tts'),('POST','/api/voice/arbitrary')]:
            with self.subTest(method=method,path=path):
                self.assertEqual(self.request(method,path,{'speak':'你好'} if method=='POST' else None)[0],404)
        self.assertEqual(self.connections, [])

    def test_upstream_failures_are_sanitized_and_do_not_read_error_bodies(self):
        self.body = b'private-upstream-payload-must-not-appear'
        for upstream, expected, code in [(403,403,'voice_session_expired'),(429,429,'voice_busy'),(500,503,'voice_unavailable')]:
            with self.subTest(upstream=upstream):
                self.status = upstream
                status, _, raw = self.request('GET','/api/voice/health')
                self.assertEqual(status,expected)
                self.assertEqual(json.loads(raw)['code'],code)
                self.assertNotIn(self.body,raw)
                self.assertIsNone(self.read_limit)

    def test_upstream_timeout_and_connection_errors_do_not_expose_exception_text(self):
        for failure, expected in [(TimeoutError('private timeout details'),504),(ConnectionRefusedError('private connection details'),503)]:
            with self.subTest(error=type(failure).__name__):
                self.upstream_error = failure
                status, _, raw = self.request('GET','/api/voice/health')
                self.assertEqual(status,expected)
                self.assertNotIn(b'private',raw)

    def test_invalid_health_json_types_tokens_and_oversize_fail_closed(self):
        baseline={'ready':True,'engine':'sherpa-onnx-vits','model':'vits-icefall-zh-aishell3','load_ms':10,'session':'voice-fixture-session-only-123','offline':True}
        for patch in ({'ready':False},{'engine':'untrusted-engine'},{'session':'short'},{'offline':False},{'load_ms':True},{'load_ms':float('inf')},{'model':'<script>'}):
            with self.subTest(patch=list(patch)):
                self.body=json.dumps({**baseline,**patch}).encode()
                self.assertEqual(self.request('GET','/api/voice/health')[0],502)
        self.body=b'{invalid';self.assertEqual(self.request('GET','/api/voice/health')[0],502)
        self.body=b'x'*(app.VOICE_HEALTH_LIMIT+1);self.assertEqual(self.request('GET','/api/voice/health')[0],502)
        self.body=json.dumps(baseline).encode();self.upstream_headers={'Content-Type':'text/html'}
        self.assertEqual(self.request('GET','/api/voice/health')[0],502)

    def test_invalid_or_oversize_audio_does_not_reach_the_browser(self):
        self.audio();self.upstream_headers['Content-Type']='text/plain'
        self.assertEqual(self.tts()[0],502)
        self.audio();self.body=b'not-a-wave' * 10;self.upstream_headers['Content-Length']=str(len(self.body))
        self.assertEqual(self.tts()[0],502)
        self.audio();self.upstream_headers['Content-Length']=str(app.VOICE_AUDIO_LIMIT+1)
        self.assertEqual(self.tts()[0],502)
        self.audio();self.upstream_headers.pop('Content-Length');self.body+=b'x' * app.VOICE_AUDIO_LIMIT
        self.assertEqual(self.tts()[0],502)
        self.assertEqual(self.read_limit,app.VOICE_AUDIO_LIMIT+1)

    def test_audio_forwards_no_unvalidated_metric_or_engine_headers(self):
        self.audio();self.upstream_headers.update({'X-Voice-Engine':'private-upstream-value','X-Voice-First-Audio-Ms':'nan'})
        status, headers, _=self.tts()
        self.assertEqual(status,200)
        self.assertNotIn('X-Voice-Engine',headers)
        self.assertNotIn('X-Voice-First-Audio-Ms',headers)

    def test_voice_does_not_enable_model_api_and_csp_allows_only_same_origin_blob_media(self):
        self.audio();self.assertEqual(self.tts()[0],200)
        status, _, _=self.request('POST','/api/config',{'mode':'api','base_url':app.BASE,'key':'test-not-a-real-credential'})
        self.assertEqual(status,412)
        _, headers, _=self.request('GET','/')
        csp=headers['Content-Security-Policy']
        self.assertIn("connect-src 'self'",csp)
        self.assertIn("media-src 'self' blob:",csp)
        self.assertIn("frame-ancestors 'self'",csp)
        self.assertNotIn('*',csp)
