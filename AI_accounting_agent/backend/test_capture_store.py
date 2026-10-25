import json
import sqlite3
import threading
import unittest

from fastapi import HTTPException
from capture_store import CaptureStore


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('''CREATE TABLE bills (id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_date TEXT, category TEXT, type TEXT, amount REAL, currency TEXT,
            description TEXT, source TEXT, metadata TEXT, created_at TEXT)''')
        self.store = CaptureStore(self.db, threading.Lock(), lambda x:x)
        self.row = dict(row=1,event_date='2026-10-01',category='餐饮',type='expense',amount='28.00',
                        currency='CNY',description='测试午餐',movement='cashflow',errors=[])

    def tearDown(self):
        self.db.close()

    def draft(self, rows=None, key='request-1', kind='text'):
        return self.store.create('owner', key, kind, rows or [self.row], key)

    def confirm(self, draft, rows=None, callback=None):
        return self.store.confirm('owner', draft['id'], draft['challenge'], rows or draft['rows'], callback)

    def test_confirm_replay_does_not_repeat_side_effect(self):
        d=self.draft(); calls=[]
        first=self.confirm(d,callback=lambda:calls.append('changed'))
        self.assertEqual(first,self.confirm(d,callback=lambda:calls.append('changed')))
        self.assertEqual(calls,['changed'])
        self.assertEqual(self.db.execute('SELECT count(*) FROM bills').fetchone()[0],1)

    def test_lost_creation_response_lookup_edit_confirm_exactly_once(self):
        d=self.draft(key='manual-lost-request',kind='manual')
        recovered=self.store.find_request('owner','manual-lost-request')
        self.assertEqual(recovered['id'],d['id'])
        with self.assertRaises(HTTPException) as e:self.store.find_request('other','manual-lost-request')
        self.assertEqual(e.exception.status_code,404)
        with self.assertRaises(HTTPException) as e:self.store.find_request('owner','not-received')
        self.assertEqual(e.exception.status_code,404)
        edited=self.store.update('owner',d['id'],[{**self.row,'amount':'29.00'}],lambda row:row)
        first=self.confirm(edited)
        self.assertEqual(first,self.confirm(edited))
        self.assertEqual(self.db.execute('SELECT count(*),sum(amount) FROM bills').fetchone()[:],(1,29.0))
        self.assertEqual(self.store.find_request('owner','manual-lost-request')['status'],'imported')

    def test_cross_source_match_requires_choice_and_skip_preserves_old(self):
        old=self.confirm(self.draft())['bill_ids'][0]
        d=self.draft(key='request-2',kind='csv')
        with self.assertRaises(HTTPException) as e:self.confirm(d)
        self.assertEqual(e.exception.status_code,409)
        result=self.confirm(d,[{**self.row,'duplicate_decision':'skip'}])
        self.assertEqual(result['created'],0)
        self.assertEqual(self.db.execute('SELECT id FROM bills').fetchone()[0],old)

    def test_distinct_csv_row_keys_preserve_repeated_purchases(self):
        rows=[{**self.row,'import_key':'statement-row-1'},{**self.row,'row':2,'import_key':'statement-row-2'}]
        draft=self.draft(rows,kind='csv')
        self.assertEqual(draft['rows'][1]['candidate_duplicates'][0]['row'],1)
        rows[1]['duplicate_decision']='keep'
        self.assertEqual(self.confirm(draft,rows)['created'],2)

    def test_same_amount_two_purchases_can_be_kept(self):
        self.confirm(self.draft())
        d=self.draft(key='request-2',kind='csv')
        self.assertEqual(self.confirm(d,[{**self.row,'duplicate_decision':'keep'}])['created'],1)

    def test_second_row_conflict_rolls_back_whole_batch(self):
        self.confirm(self.draft())
        rows=[{**self.row,'description':'新流水'}, {**self.row,'row':2}]
        d=self.draft(rows,key='request-2')
        with self.assertRaises(HTTPException):self.confirm(d)
        self.assertEqual(self.db.execute('SELECT count(*) FROM bills').fetchone()[0],1)
        self.assertEqual(self.store.get('owner',d['id'])['status'],'pending')

    def test_strong_key_dedup_and_category_conflict(self):
        row={**self.row,'type':'income','category':'退款','import_key':'bank-key'}
        self.confirm(self.draft([row]))
        d=self.draft([row],key='request-2',kind='csv')
        self.assertEqual(self.confirm(d)['duplicates'],1)
        d=self.draft([row],key='request-3',kind='csv')
        with self.assertRaises(HTTPException) as e:self.confirm(d,[{**row,'category':'工资'}])
        self.assertEqual(e.exception.status_code,409)

    def test_refund_link_and_internal_transfer_survive(self):
        original=self.confirm(self.draft())['bill_ids'][0]
        refund={**self.row,'type':'income','category':'退款','description':'午餐退款','amount':'8.00','refund_of_bill_id':original}
        movement={**self.row,'row':2,'category':'其他','description':'账户划转','movement':'internal_transfer'}
        result=self.confirm(self.draft([refund,movement],key='request-2'))
        saved=[dict(r) for r in self.db.execute('SELECT * FROM bills WHERE id IN (?,?)',result['bill_ids'])]
        self.assertEqual(json.loads(saved[0]['metadata'])['refund_of_bill_id'],original)
        self.assertEqual(json.loads(saved[1]['metadata'])['movement'],'internal_transfer')

    def test_undo_is_atomic_and_only_removes_this_batch(self):
        d=self.draft();self.confirm(d)
        result=self.store.undo('owner',d['id'],d['challenge'])
        self.assertEqual(result,self.store.undo('owner',d['id'],d['challenge']))
        self.assertEqual(self.db.execute('SELECT count(*) FROM bills').fetchone()[0],0)
        with self.assertRaises(HTTPException):self.confirm(d)

    def test_undo_refuses_edited_bill(self):
        d=self.draft();bill_id=self.confirm(d)['bill_ids'][0]
        self.db.execute('UPDATE bills SET amount=29 WHERE id=?',(bill_id,));self.db.commit()
        with self.assertRaises(HTTPException) as e:self.store.undo('owner',d['id'],d['challenge'])
        self.assertEqual(e.exception.status_code,409)
        self.assertEqual(self.db.execute('SELECT amount FROM bills').fetchone()[0],29)

    def test_undo_refuses_to_orphan_another_batch_refund(self):
        original=self.draft();bill_id=self.confirm(original)['bill_ids'][0]
        refund=self.draft([{**self.row,'type':'income','category':'退款','refund_of_bill_id':bill_id}],key='refund-1')
        self.confirm(refund)
        with self.assertRaises(HTTPException) as error:self.store.undo('owner',original['id'],original['challenge'])
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(self.db.execute('SELECT count(*) FROM bills').fetchone()[0],2)

    def test_discard_pending_erases_source_and_blocks_confirmation(self):
        d=self.draft();first=self.store.discard('owner',d['id'],d['challenge'])
        self.assertEqual(first,self.store.discard('owner',d['id'],d['challenge']))
        self.assertEqual(self.store.get('owner',d['id'])['rows'],[])
        with self.assertRaises(HTTPException):self.confirm(d)

    def test_profile_failure_after_ledger_commit_can_be_reconciled(self):
        d=self.draft()
        def fail():raise RuntimeError('profile temporarily unavailable')
        with self.assertRaises(RuntimeError):self.confirm(d,callback=fail)
        self.assertEqual(self.db.execute('SELECT count(*) FROM bills').fetchone()[0],1)
        self.assertTrue(self.store.get('owner',d['id'])['profile_sync_pending'])
        applied=[]
        result=self.store.reconcile('owner',d['id'],d['challenge'],lambda:applied.append('once'))
        self.assertEqual(result['created'],1)
        self.assertFalse(self.store.get('owner',d['id'])['profile_sync_pending'])
        self.assertEqual(result,self.confirm(d,callback=lambda:applied.append('twice')))
        self.assertEqual(applied,['once'])

    def test_edit_keeps_source_identity_and_original_evidence(self):
        d=self.draft([{**self.row,'import_key':'original-key','evidence':{'text':'original receipt'}}])
        updated=self.store.update('owner',d['id'],[{'row':1,'amount':'30.00','import_key':'forged-key'}],lambda r:{'amount':r['amount'],'errors':[]})
        self.assertEqual(updated['rows'][0]['amount'],'30.00')
        self.assertEqual(updated['rows'][0]['origin']['amount'],'28.00')
        self.assertEqual(updated['rows'][0]['evidence']['text'],'original receipt')
        raw=json.loads(self.db.execute('SELECT payload FROM capture_batches').fetchone()[0])
        self.assertEqual(raw[0]['import_key'],'original-key')
        self.assertEqual(self.store.get('owner',d['id'])['rows'][0]['amount'],'30.00')

    def test_request_id_cannot_bind_different_source(self):
        self.draft()
        with self.assertRaises(HTTPException):self.store.create('owner','request-1','image',[self.row],'different')


if __name__=='__main__':unittest.main()
