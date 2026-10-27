import importlib.util
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dot_server', Path(__file__).parents[1] / 'server.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        mod.BUDGET_FILE = Path(cls.temp.name) / 'budget.json'
        cls.server = mod.ThreadingHTTPServer(('127.0.0.1', 0), mod.Handler)
        mod.PORT = cls.server.server_port
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.temp.cleanup()

    def setUp(self):
        mod.ALLOW_API = False
        mod.SESSIONS.clear()
        mod.BUDGET.update(reserved=0, requests=0)
        mod.LAST_DIAGNOSTIC = None
        _, headers, body = self.request('GET', '/api/session')
        self.cookie = dict(headers)['Set-Cookie'].split(';')[0]
        self.csrf = json.loads(body)['csrf']

    def request(self, method, path, data=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', mod.PORT, timeout=3)
        base = {'Origin': f'http://127.0.0.1:{mod.PORT}'}
        if hasattr(self, 'cookie'):
            base.update(Cookie=self.cookie, **{'X-CSRF-Token': self.csrf})
        base.update(headers or {})
        raw = None if data is None else json.dumps(data)
        if raw:
            base['Content-Type'] = 'application/json'
        conn.request(method, path, raw, base)
        r = conn.getresponse()
        result = r.status, r.getheaders(), r.read().decode()
        conn.close()
        return result

    def test_disabled_config_and_bad_origin(self):
        self.assertEqual(self.request('POST', '/api/config', {'mode': 'api', 'base_url': mod.BASE, 'key': 'test-not-a-real-credential'})[0], 412)
        self.assertFalse(next(iter(mod.SESSIONS.values()))['key'])
        self.assertEqual(self.request('DELETE', '/api/config', headers={'Origin': 'https://untrusted.invalid'})[0], 403)
        self.assertEqual(self.request('POST', '/api/chat', {'text': 'hi'}, headers={'X-CSRF-Token': 'bad'})[0], 400)

    def test_configuration_never_returns_secret_and_delete_clears(self):
        mod.ALLOW_API = True
        fake = 'test-not-a-real-credential'
        code, _, body = self.request('POST', '/api/config', {'mode': 'api', 'base_url': mod.BASE, 'key': fake})
        self.assertEqual(code, 200)
        self.assertNotIn(fake, body)
        self.assertNotIn(fake, self.request('GET', '/api/session')[2])
        self.assertEqual(self.request('DELETE', '/api/config')[0], 200)
        self.assertIsNone(next(iter(mod.SESSIONS.values()))['key'])

    def test_static_module_mime_and_no_source_exposure(self):
        status, headers, _ = self.request('GET', '/engine.mjs')
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers)['Content-type'], 'text/javascript')
        self.assertEqual(self.request('GET', '/server.py')[0], 404)

    def test_stream_failure_is_error_not_success_and_budget_persists(self):
        mod.ALLOW_API = True
        self.request('POST', '/api/config', {'mode': 'api', 'base_url': mod.BASE, 'key': 'test-not-a-real-credential'})
        class Response:
            status = 200
            lines = iter([b'data: {"choices":[{"delta":{"content":"partial"}}]}\n', b''])
            def readline(self, size):
                return next(self.lines)
        class Upstream:
            def __init__(self, *args, **kwargs): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        with patch.object(mod.http.client, 'HTTPSConnection', Upstream):
            status, _, body = self.request('POST', '/api/chat', {'text': '工资怎么安排'})
        self.assertEqual(status, 200)
        self.assertIn('"error"', body)
        self.assertNotIn('[DONE]', body)
        self.assertNotIn('HTTP/1', body)
        self.assertEqual(json.loads(mod.BUDGET_FILE.read_text())['reserved'], .05)

    def fake_chat(self, lines=None, status=200, error=None, payload=None):
        mod.ALLOW_API = True
        self.request('POST', '/api/config', {'mode': 'api', 'base_url': mod.BASE, 'key': 'test-not-a-real-credential'})
        observed = {}
        class Response:
            def __init__(self):
                self.status = status
                self.lines = iter(lines or [])
            def readline(self, size): return next(self.lines, b'')
            def read(self, size): return payload or b'{}'
        class Upstream:
            def __init__(self, host, **kwargs): observed['host'] = host
            def request(self, method, path, body, headers):
                observed.update(method=method, path=path, body=json.loads(body), headers=headers)
            def getresponse(self):
                if error: raise error
                return Response()
            def close(self): pass
        with patch.object(mod.http.client, 'HTTPSConnection', Upstream):
            result = self.request('POST', '/api/chat', {'text': '只解释账单', 'context': {'balance': 50000}})
        return result, observed

    def test_normal_stream_usage_and_documented_wire_protocol(self):
        chunk = {'model': mod.MODEL, 'choices': [{'delta': {'content': '可以先核对账单。'}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 120, 'completion_tokens': 12, 'total_tokens': 132}}
        (code, _, body), observed = self.fake_chat([b'data: ' + json.dumps(chunk).encode() + b'\n', b'data: [DONE]\n'])
        self.assertEqual(code, 200)
        self.assertIn('[DONE]', body)
        self.assertTrue(mod.LAST_DIAGNOSTIC['completed'])
        self.assertEqual(mod.LAST_DIAGNOSTIC['usage']['total_tokens'], 132)
        self.assertEqual(observed['host'], 'www.micuapi.ai')
        self.assertEqual(observed['path'], '/v1/chat/completions')
        self.assertEqual(observed['body']['model'], mod.MODEL)
        self.assertEqual([m['role'] for m in observed['body']['messages']], ['system', 'user'])
        self.assertEqual(observed['body']['max_tokens'], 800)
        self.assertEqual(observed['body']['thinking'], {'type': 'disabled'})
        self.assertIn('Mozilla/', observed['headers']['User-Agent'])

    def test_timeout_is_sanitized_and_does_not_complete(self):
        (code, _, body), _ = self.fake_chat(error=TimeoutError('local fake timeout'))
        self.assertEqual(code, 502)
        self.assertEqual(mod.LAST_DIAGNOSTIC['error'], 'timeout')
        self.assertFalse(mod.LAST_DIAGNOSTIC['completed'])
        self.assertNotIn('test-not-a-real-credential', body)

    def test_provider_failure_keeps_only_allowlisted_error_metadata(self):
        raw = json.dumps({'error': {'code': 'invalid_api_key', 'message': 'test-not-a-real-credential'}}).encode()
        (code, _, body), _ = self.fake_chat(status=401, payload=raw)
        self.assertEqual(code, 502)
        self.assertEqual(mod.LAST_DIAGNOSTIC['upstream_status'], 401)
        self.assertEqual(mod.LAST_DIAGNOSTIC['error'], 'invalid_api_key')
        self.assertNotIn('test-not-a-real-credential', body)

    def test_credential_reflection_split_between_chunks_is_redacted(self):
        parts = ['prefix test-not-a-', 'real-credential suffix']
        lines = [b'data: ' + json.dumps({'choices': [{'delta': {'content': p}}]}).encode() + b'\n' for p in parts]
        lines.append(b'data: [DONE]\n')
        (code, _, body), _ = self.fake_chat(lines)
        self.assertEqual(code, 200)
        self.assertNotIn('test-not-a-', body)
        self.assertNotIn('real-credential', body)

    def test_truncation_is_not_a_completed_answer(self):
        lines = [b'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n', b'data: [DONE]\n']
        (code, _, body), _ = self.fake_chat(lines)
        self.assertEqual(code, 200)
        self.assertIn('"error"', body)
        self.assertNotIn('[DONE]', body)
        self.assertFalse(mod.LAST_DIAGNOSTIC['completed'])


if __name__ == '__main__':
    unittest.main()
