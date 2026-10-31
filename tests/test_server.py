import importlib.util
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import types
import sys
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
        # Explicit legacy fixture: retain historical SSE/error regression coverage.
        # Official routing and legacy-endpoint rejection are tested separately.
        mod.MODEL='deepseek-v4-flash-0731'
        # The current config route defaults to the official credential slot.
        # MODEL stays legacy only to exercise the historical, fully mocked SSE reader.
        mod.BASE=mod.chat_profile.BASE
        profile_patch=patch.object(mod.chat_profile,'live_official_only',False)
        profile_patch.start();self.addCleanup(profile_patch.stop)
        mod.ALLOW_API = False
        mod.AGENT_VALIDATION = False
        mod.SESSIONS.clear()
        mod.BUDGET.update(reserved=0, requests=0, agent_requests=0)
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

    def test_saving_key_renews_browser_cookie_together_with_server_ttl(self):
        mod.ALLOW_API = True
        session=next(iter(mod.SESSIONS.values()))
        session['created']=mod.time.time()-mod.TTL+5
        status,headers,body=self.request('POST','/api/config',{'mode':'api','base_url':mod.BASE,'key':'test-not-a-real-credential'})
        self.assertEqual(status,200)
        renewed=dict(headers).get('Set-Cookie','')
        self.assertTrue(renewed.startswith(self.cookie+';'))
        self.assertIn('HttpOnly; SameSite=Strict; Path=/; Max-Age=3600',renewed)
        self.assertLess(mod.time.time()-session['created'],5)
        self.assertNotIn('test-not-a-real-credential',renewed+body)

    def test_api_only_settings_empty_connected_failed_and_disconnected_states(self):
        mod.ALLOW_API = True
        self.assertFalse(json.loads(self.request('GET','/api/session')[2])['configured'])
        blank={'mode':'api','base_url':mod.BASE,'key':''}
        self.assertEqual(self.request('POST','/api/config',blank)[0],400)
        self.assertFalse(json.loads(self.request('GET','/api/session')[2])['configured'])
        fake='unit-test-existing-credential-only'
        self.assertEqual(self.request('POST','/api/config',{**blank,'key':fake})[0],200)
        session=next(iter(mod.SESSIONS.values()))
        self.assertTrue(json.loads(self.request('GET','/api/session')[2])['configured'])
        code,_,body=self.request('POST','/api/config',{**blank,'model':' MiniMax-M3.1-Flash '})
        self.assertEqual(code,200)
        self.assertEqual(json.loads(body)['model'],'MiniMax-M3.1-Flash')
        self.assertEqual(session['key'],fake)
        self.assertNotIn(fake,body)
        for invalid in [{**blank,'model':' '},{**blank,'key':fake,'base_url':'https://untrusted.invalid/v1'}]:
            code,_,body=self.request('POST','/api/config',invalid)
            self.assertEqual(code,400)
            self.assertTrue(json.loads(self.request('GET','/api/session')[2])['configured'])
            self.assertEqual(session['key'],fake)
            self.assertNotIn(fake,body)
        self.assertEqual(self.request('DELETE','/api/config')[0],200)
        self.assertFalse(json.loads(self.request('GET','/api/session')[2])['configured'])
        self.assertIsNone(session['key'])

    def test_agent_code_reload_preserves_ram_session_and_exception_identity(self):
        mod.ALLOW_API=True;mod.AGENT_VALIDATION=True
        try:
            self.request('POST','/api/config',{'mode':'api','base_url':mod.BASE,'key':'test-not-a-real-credential'})
            previous=next(iter(mod.SESSIONS.values()))
            stable_error=mod.agent_provider.ProviderError
            plan={'status':'answer','scenario':'question','reply':'请看餐饮卡','query':'dining_month','fields':{},'missing':[],'mode':'none','task_id':None}
            encoded=json.dumps({'model':mod.MODEL,'choices':[{'finish_reason':'stop','message':{'content':json.dumps(plan)}}]}).encode()
            class Response:
                status=200
                def read(self,n):return encoded[:n]
            class Upstream:
                def __init__(self,*args,**kwargs):pass
                def request(self,*args,**kwargs):pass
                def getresponse(self):return Response()
                def close(self):pass
            data={'validation_scope':'finpilot-fifteen-v1','text':'本月餐饮','tool_catalog':['dining_month'],'run_history':[]}
            with patch.object(mod.http.client,'HTTPSConnection',Upstream):
                for _ in range(2):
                    status,_,body=self.request('POST','/api/agent',data)
                    self.assertEqual(status,200);self.assertEqual(json.loads(body)['source'],'llm')
            self.assertIs(previous,next(iter(mod.SESSIONS.values())))
            self.assertEqual(previous['key'],'test-not-a-real-credential')
            self.assertIs(stable_error,mod.agent_provider.ProviderError)
        finally:mod.AGENT_VALIDATION=False

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


    def test_expired_read_session_is_distinct_and_new_session_recovers(self):
        token = self.cookie.split('=', 1)[1]
        mod.SESSIONS[token]['created'] = 0
        self.assertEqual(self.request('GET', '/api/positions')[0], 401)
        _, headers, body = self.request('GET', '/api/session')
        self.cookie = dict(headers)['Set-Cookie'].split(';')[0]
        self.csrf = json.loads(body)['csrf']
        with patch.object(mod.baseline_api, 'read', return_value={'holdings': []}):
            self.assertEqual(self.request('GET', '/api/positions')[0], 200)

    def enable_agent(self):
        mod.ALLOW_API = True
        mod.AGENT_VALIDATION = True
        self.request('POST', '/api/config', {'mode': 'api', 'base_url': mod.BASE, 'key': 'unit-test-fake-key-only'})
        return {'validation_scope': 'finpilot-fifteen-v1', 'text': '本月餐饮', 'tool_catalog': ['dining_month'], 'run_history': []}

    def test_agent_no_total_cap_keeps_usage_and_private_context_boundary(self):
        payload = self.enable_agent()
        mod.BUDGET.update(agent_requests=1000, requests=1003, reserved=.15)
        previous = next(iter(mod.SESSIONS.values()))
        plan = {'status': 'answer', 'scenario': 'question', 'reply': '请看账本。', 'query': 'dining_month', 'fields': {}, 'missing': [], 'mode': 'none', 'task_id': None}
        encoded = json.dumps({'model': mod.MODEL, 'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(plan)}}], 'usage': {'total_tokens': 132}}).encode()
        class Upstream:
            calls = 0
            def __init__(self, *a, **kw): pass
            def request(self, *a, **kw): Upstream.calls += 1
            def getresponse(self):
                return types.SimpleNamespace(status=200, read=lambda n: encoded[:n])
            def close(self): pass
        with patch.object(mod.http.client, 'HTTPSConnection', Upstream):
            self.assertEqual(self.request('POST', '/api/agent', {**payload, 'preferences': 'old private data'})[0], 400)
            self.assertEqual(self.request('POST', '/api/agent', {**payload, 'validation_scope': 'other'})[0], 400)
            self.assertEqual(self.request('POST', '/api/chat', {'text': 'old input', 'context': {}})[0], 403)
            self.assertEqual(Upstream.calls, 0)
            for _ in range(2):
                code, _, body = self.request('POST', '/api/agent', payload)
                self.assertEqual(code, 200)
                self.assertEqual(json.loads(body)['source'], 'llm')
        persisted = json.loads(mod.BUDGET_FILE.read_text())
        self.assertEqual(persisted, {'reserved': .15, 'requests': 1005, 'agent_requests': 1002})
        self.assertIs(previous, next(iter(mod.SESSIONS.values())))
        self.assertEqual(previous['key'], 'unit-test-fake-key-only')
        health = json.loads(self.request('GET', '/api/health')[2])
        self.assertIsNone(health['agent_call_limit'])
        self.assertEqual(health['agent_request_policy'], 'no-total-cap-v1')
        self.assertEqual(health['last_request']['usage']['total_tokens'], 132)
        self.assertNotIn('unit-test-fake-key-only', json.dumps(health))

    def test_agent_busy_and_rate_limit_backoff_do_not_call_or_increment(self):
        payload = self.enable_agent()
        session = next(iter(mod.SESSIONS.values()))
        class Upstream:
            calls = 0
            def __init__(self, *a, **kw): pass
            def request(self, *a, **kw): Upstream.calls += 1
            def getresponse(self): return types.SimpleNamespace(status=429, read=lambda n: b'{}')
            def close(self): pass
        with patch.object(mod.http.client, 'HTTPSConnection', Upstream):
            session['agent_busy'] = True
            self.assertEqual(self.request('POST', '/api/agent', payload)[0], 429)
            self.assertEqual(Upstream.calls, 0)
            self.assertEqual(mod.BUDGET['agent_requests'], 0)
            session['agent_busy'] = False
            status, _, body = self.request('POST', '/api/agent', payload)
            self.assertEqual(status, 429)
            self.assertEqual(json.loads(body)['retry_after_seconds'], 15)
            # HTTP response bytes can arrive before the request thread's finally cleanup.
            # Bound the wait so a genuinely stuck busy flag still fails this regression.
            deadline = mod.time.monotonic() + 1
            while session.get('agent_busy') and mod.time.monotonic() < deadline:
                mod.time.sleep(.001)
            self.assertFalse(session['agent_busy'])
            status, _, body = self.request('POST', '/api/agent', payload)
            self.assertEqual(status, 429)
            self.assertEqual(json.loads(body)['code'], 'retry_later')
            self.assertEqual(Upstream.calls, 1)
            self.assertEqual(mod.BUDGET['agent_requests'], 1)
            # Advance only this synthetic session past its cooldown.
            session['agent_retry_after'] = 0
            status, _, body = self.request('POST', '/api/agent', payload)
            self.assertEqual(status, 429)
            self.assertEqual(json.loads(body)['retry_after_seconds'], 30)
            self.assertEqual(Upstream.calls, 2)
            self.assertEqual(mod.BUDGET['agent_requests'], 2)

    def test_agent_timeout_preserves_connection_and_requires_explicit_retry(self):
        payload = self.enable_agent()
        session = next(iter(mod.SESSIONS.values()))
        class Upstream:
            calls = 0
            def __init__(self, host, **kw): self.timeout = kw['timeout']
            def request(self, *a, **kw): Upstream.calls += 1
            def getresponse(self): raise TimeoutError('fake test timeout')
            def close(self): pass
        with patch.object(mod.http.client, 'HTTPSConnection', Upstream):
            status, _, body = self.request('POST', '/api/agent', payload)
            self.assertEqual(status, 504)
            self.assertEqual(json.loads(body)['retry_after_seconds'], 5)
            self.assertEqual(self.request('POST', '/api/agent', payload)[0], 429)
            self.assertEqual(Upstream.calls, 1)
        self.assertEqual(session['key'], 'unit-test-fake-key-only')
        self.assertFalse(session['agent_busy'])
        self.assertEqual(mod.BUDGET['agent_requests'], 1)
        self.assertFalse(mod.LAST_DIAGNOSTIC['completed'])

    def test_fixed_reload_policy_adoption_keeps_same_session_and_budget_objects(self):
        self.enable_agent()
        class Legacy(mod.Handler):
            def agent_validation_request(self, session): pass
        host = types.SimpleNamespace(**vars(mod))
        host.BASE=mod.chat_profile.MICU_BASE
        host.Handler = Legacy
        host.AGENT_CALL_LIMIT = 40
        session = next(iter(host.SESSIONS.values()))
        budget, sessions, diagnostic = host.BUDGET, host.SESSIONS, host.LAST_DIAGNOSTIC
        before = dict(budget)
        with patch.dict(sys.modules, {'__main__': host}):
            mod.importlib.reload(mod.agent_provider)
        self.assertEqual(Legacy.agent_validation_request._finpilot_request_policy, 'no-total-cap-v1')
        self.assertIs(host.SESSIONS, sessions)
        self.assertIs(host.BUDGET, budget)
        self.assertEqual(budget, before)
        self.assertIs(host.LAST_DIAGNOSTIC, diagnostic)
        self.assertIs(next(iter(host.SESSIONS.values())), session)
        self.assertEqual(session['key'], 'unit-test-fake-key-only')
        # Already-entered retired frames still see an integer; new frames never
        # consult it. Report the active handler policy, not the retired constant.
        self.assertEqual(host.AGENT_CALL_LIMIT, 40)
        fake = types.SimpleNamespace(path='/api/health', valid_host=lambda: True, reply=lambda data: data)
        current = Legacy.do_GET(fake)
        self.assertIsNone(current['agent_call_limit'])
        json.dumps(current, allow_nan=False)
        self.assertFalse(mod.agent_runtime.install_existing_service(host))
        alien = types.SimpleNamespace(**vars(host))
        alien.__file__ = '/unrelated/server.py'
        self.assertFalse(mod.agent_runtime.install_existing_service(alien))


if __name__ == '__main__':
    unittest.main()
