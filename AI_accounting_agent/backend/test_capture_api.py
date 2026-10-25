"""Faults run against disposable TestClient databases, never a running account."""
import importlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient


class CaptureRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.environment=patch.dict(os.environ,{'AI_BOOKKEEPER_DATA_DIR':self.temp.name,
            'FINANCE_STATE_DIR':str(Path(self.temp.name)/'finance'),'LLM_PROVIDER':'disabled',
            'AI_BOOKKEEPER_IMPORT_JSONL':'false','FINANCE_PUBLIC_ORIGINS':'http://testserver'})
        self.environment.start();sys.modules.pop('app',None)
        self.module=importlib.import_module('app')
        self.client=TestClient(self.module.app,raise_server_exceptions=False);self.client.__enter__()
        session=self.client.get('/finance/session').json()
        self.client.headers.update({'Origin':'http://testserver','X-Qingcai-CSRF':session['csrf']})
        self.workspace=self.module.finance_router.workspace()
        response=self.client.post('/finance/capture/manual',json={'request_id':'recovery-test-1','bill':{
            'event_date':'2026-10-21','category':'餐饮','type':'expense','amount':28,'description':'恢复测试午餐','currency':'CNY'}})
        self.assertEqual(response.status_code,200,response.text)
        self.draft=response.json()
        self.body={'challenge':self.draft['challenge'],'rows':[{k:v for k,v in row.items() if k in
            {'row','event_date','category','type','amount','description','movement','payment_method','refund_of_bill_id'}} for row in self.draft['rows']]}
        self.url='/finance/capture/'+self.draft['id']

    def tearDown(self):
        self.client.__exit__(None,None,None);self.module._db_conn.close();self.environment.stop();self.temp.cleanup()

    def test_profile_failure_before_commit_recovers_without_second_bill(self):
        original=self.workspace.apply_ledger_event;calls=[]
        def fail_once(event):
            if not calls:calls.append(event);raise RuntimeError('profile unavailable')
            return original(event)
        self.workspace.apply_ledger_event=fail_once
        response=self.client.post(self.url+'/confirm',json=self.body)
        self.assertEqual(response.status_code,500)
        detail=self.client.get(self.url).json()
        self.assertEqual(detail['status'],'imported');self.assertTrue(detail['profile_sync_pending'])
        response=self.client.post(self.url+'/confirm',json=self.body)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(self.client.get('/bills').json()),1)
        self.assertEqual(self.workspace.profile().ledger_scope,'personal')
        self.assertFalse(self.client.get(self.url).json()['profile_sync_pending'])

    def test_failure_after_profile_commit_does_not_reset_newer_confirmation(self):
        original=self.workspace.apply_ledger_event;calls=[]
        def commit_then_fail(event):
            original(event)
            if not calls:calls.append(event);raise RuntimeError('lost profile acknowledgement')
        self.workspace.apply_ledger_event=commit_then_fail
        self.assertEqual(self.client.post(self.url+'/confirm',json=self.body).status_code,500)
        self.workspace.save_profile(self.workspace.profile().model_copy(update={'cashflow_confirmed':True}))
        response=self.client.post(self.url+'/reconcile',json={'challenge':self.draft['challenge']})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(self.client.get('/bills').json()),1)
        self.assertTrue(self.workspace.profile().cashflow_confirmed)
        self.assertFalse(self.client.get(self.url).json()['profile_sync_pending'])

    def test_invalid_challenge_cannot_reconcile(self):
        self.assertEqual(self.client.post(self.url+'/confirm',json=self.body).status_code,200)
        response=self.client.post(self.url+'/reconcile',json={'challenge':'wrong-challenge-123456789'})
        self.assertEqual(response.status_code,409)


if __name__=='__main__':unittest.main()
