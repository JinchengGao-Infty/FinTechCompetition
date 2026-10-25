from contextlib import closing
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from budget_store import BudgetStore, BudgetError

class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)/'budget.sqlite'
        self.store = BudgetStore(self.path)
    def tearDown(self):
        self.temp.cleanup()
    def save(self, **kw):
        args = dict(actor_id='alice',month='2026-10',total_minor=10000,categories=[{'category':'餐饮','limit_minor':3000}],expected_revision=0,request_id='r1')
        args.update(kw)
        return self.store.save(**args)
    def test_unset_and_refresh(self):
        self.assertEqual(self.store.get('alice','2026-10')['status'],'unset')
        saved = self.save()
        self.assertEqual(BudgetStore(self.path).get('alice','2026-10'),saved)
    def test_cas(self):
        self.save()
        with self.assertRaises(BudgetError) as e: self.save(request_id='r2')
        self.assertEqual(e.exception.status_code,409)
        self.assertEqual(self.save(request_id='r2',expected_revision=1)['revision'],2)
    def test_idempotency_returns_original(self):
        first = self.save()
        self.save(request_id='r2',expected_revision=1,total_minor=20000)
        self.assertEqual(self.save(),first)
        self.assertEqual(self.store.get('alice','2026-10')['revision'],2)
        with self.assertRaises(BudgetError): self.save(total_minor=5000)
    def test_actor_and_month_isolation(self):
        self.save()
        self.assertEqual(self.store.get('bob','2026-10')['status'],'unset')
        self.assertEqual(self.store.get('alice','2026-11')['status'],'unset')
        self.assertEqual(self.save(actor_id='bob')['revision'],1)
    def test_invalid_is_atomic(self):
        for changes in [dict(total_minor=0),dict(total_minor=True),dict(total_minor=1.5),dict(total_minor=-1),dict(month='2026-13'),dict(expected_revision=True),dict(request_id=''),dict(categories=[{'category':'餐饮','limit_minor':10001}]),dict(categories=[{'category':'餐饮','limit_minor':1}]*2),dict(categories=[{'category':'餐饮','limit_minor':False}])]:
            with self.subTest(changes=changes):
                with self.assertRaises(BudgetError): self.save(**changes)
                self.assertEqual(self.store.get('alice','2026-10')['status'],'unset')
    def test_concurrent_cas_one_winner(self):
        def attempt(i):
            try: return self.save(request_id=str(i))['revision']
            except BudgetError as e: return e.status_code
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(attempt,range(2)))
        self.assertEqual(sorted(results),[1,409])
    def test_no_ledger_tables(self):
        import sqlite3
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'personal_budgets','personal_budget_requests'})

if __name__ == '__main__': unittest.main()
