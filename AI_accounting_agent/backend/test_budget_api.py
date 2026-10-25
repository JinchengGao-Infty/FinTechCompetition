import tempfile
import unittest
from pathlib import Path
try:
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from budget_api import create_budget_router
    HAS_ASGI = True
except ModuleNotFoundError:
    HAS_ASGI = False
from budget_store import BudgetStore

@unittest.skipUnless(HAS_ASGI, "FastAPI/TestClient dependencies unavailable")
class BudgetApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = BudgetStore(Path(self.temp.name)/'budget.sqlite')
        self.calls = []
        def trusted_actor(request):
            self.calls.append(request.method)
            # Local test dependency only; production injects the existing verifier.
            if request.headers.get('x-test-session') not in {'alice','bob'}:
                raise HTTPException(401,'session')
            if request.method == 'PUT' and request.headers.get('x-test-csrf') != 'local-fixture':
                raise HTTPException(403,'csrf')
            return request.headers['x-test-session']
        app = FastAPI()
        app.include_router(create_budget_router(self.store,trusted_actor))
        self.client = TestClient(app)
        self.headers = {'x-test-session':'alice','x-test-csrf':'local-fixture'}
        self.payload = dict(total_minor=10000,categories=[],expected_revision=0,request_id='r1')
        self.url = '/finance/budget?month=2026-10'
    def tearDown(self):
        self.client.close()
        self.temp.cleanup()
    def put(self, **changes):
        return self.client.put(self.url,headers=self.headers,json={**self.payload,**changes})
    def test_unset_save_reload(self):
        self.assertEqual(self.client.get(self.url,headers=self.headers).json()['status'],'unset')
        saved=self.put()
        self.assertEqual(saved.status_code,200)
        self.assertEqual(saved.headers['cache-control'],'no-store')
        self.assertEqual(self.client.get(self.url,headers=self.headers).json(),saved.json())
    def test_auth_and_csrf(self):
        self.assertEqual(self.client.get(self.url).status_code,401)
        self.assertEqual(self.client.put(self.url,headers={'x-test-session':'alice'},json=self.payload).status_code,403)
        self.assertEqual(self.store.get('alice','2026-10')['status'],'unset')
    def test_payload_cannot_select_actor(self):
        self.assertEqual(self.put(actor_id='bob').status_code,422)
        self.assertEqual(self.store.get('bob','2026-10')['status'],'unset')
    def test_cas_and_idempotency(self):
        first=self.put().json()
        self.assertEqual(self.put().json(),first)
        self.assertEqual(self.put(request_id='r2').status_code,409)
        self.assertEqual(self.put(total_minor=20000).status_code,409)
    def test_invalid_and_user_isolation(self):
        self.assertEqual(self.put(total_minor=True).status_code,422)
        self.assertEqual(self.put(total_minor=0).status_code,422)
        self.put()
        self.assertEqual(self.client.get(self.url,headers={'x-test-session':'bob'}).json()['status'],'unset')
        self.assertEqual(self.client.get('/finance/budget?month=2026-99',headers=self.headers).status_code,422)

class StandardLibraryContractTests(unittest.TestCase):
    """Executes real adapter closures against a minimal framework registration stub.
    This does not claim FastAPI/ASGI validation or middleware coverage.
    """
    def test_adapter_dependency_routes_and_errors(self):
        import importlib.util
        import sys
        import types
        from unittest.mock import patch
        class Error(Exception):
            def __init__(self,status_code,detail): self.status_code,self.detail=status_code,detail
        class Dependency:
            def __init__(self,fn): self.dependency=fn
        class Router:
            def __init__(self,**kw): self.routes={};self.prefix=kw['prefix']
            def get(self,path): return self.register('GET')
            def put(self,path): return self.register('PUT')
            def register(self,method):
                def attach(fn): self.routes[method]=fn;return fn
                return attach
        module=types.ModuleType('fastapi')
        module.APIRouter=Router;module.Body=lambda *a:None;module.Depends=Dependency
        module.HTTPException=Error;module.Request=object;module.Response=object
        spec=importlib.util.spec_from_file_location('budget_api_contract',Path(__file__).with_name('budget_api.py'))
        adapter=importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules,{'fastapi':module}): spec.loader.exec_module(adapter)
        with tempfile.TemporaryDirectory() as directory:
            store=BudgetStore(Path(directory)/'budget.sqlite')
            def trusted(request):
                if request != 'trusted-request': raise Error(401,'session')
                return 'server-actor'
            router=adapter.create_budget_router(store,trusted)
            self.assertEqual(router.prefix,'/finance/budget')
            get,put=router.routes['GET'],router.routes['PUT']
            for route in [get,put]:
                dependency=route.__defaults__[-1].dependency
                self.assertEqual(dependency('trusted-request'),'server-actor')
                with self.assertRaises(Error): dependency('untrusted')
            response=types.SimpleNamespace(headers={})
            payload=dict(total_minor=500,categories=[],expected_revision=0,request_id='fixture')
            first=put(response,'2026-10',payload,'server-actor')
            self.assertEqual(get(response,'2026-10','server-actor'),first)
            self.assertEqual(put(response,'2026-10',payload,'server-actor'),first)
            self.assertEqual(response.headers['Cache-Control'],'no-store')
            self.assertEqual(store.get('other-actor','2026-10')['status'],'unset')
            for invalid in [{**payload,'actor_id':'other-actor'},{**payload,'total_minor':True}]:
                with self.assertRaises(Error) as error: put(response,'2026-10',invalid,'server-actor')
                self.assertEqual(error.exception.status_code,422)
            with self.assertRaises(Error) as error: put(response,'2026-10',{**payload,'request_id':'new'},'server-actor')
            self.assertEqual(error.exception.status_code,409)

if __name__ == '__main__': unittest.main()
