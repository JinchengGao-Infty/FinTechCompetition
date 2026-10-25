"""Actor-scoped monthly budget configuration; never reads or writes ledger tables.

categories: [{"category": str, "limit_minor": int}]. Unset revision is 0.
Retries return the ORIGINAL saved result even after later edits. A request ID is
actor-scoped and may not be reused for another payload/month/revision.
"""
import json
import re
import sqlite3
from contextlib import contextmanager


class BudgetError(ValueError):
    def __init__(self, message, status_code=422):
        super().__init__(message)
        self.status_code = status_code
        self.detail = message


class BudgetStore:
    def __init__(self, path):
        self.path = str(path)
        if self.path == ':memory:':
            raise BudgetError('Use a file path; each transaction opens its own connection')
        with self._db() as db:
            db.executescript("""CREATE TABLE IF NOT EXISTS personal_budgets (
                actor TEXT NOT NULL, month TEXT NOT NULL, payload TEXT NOT NULL,
                revision INTEGER NOT NULL, PRIMARY KEY(actor,month));
                CREATE TABLE IF NOT EXISTS personal_budget_requests (
                actor TEXT NOT NULL, request_id TEXT NOT NULL, submitted TEXT NOT NULL,
                result TEXT NOT NULL, PRIMARY KEY(actor,request_id));""")

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _identity(actor, month):
        if not isinstance(actor, str) or not actor.strip() or actor != actor.strip():
            raise BudgetError('actor_id must be a nonempty canonical string')
        if not isinstance(month, str) or not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', month) or month.startswith('0000'):
            raise BudgetError('month must be YYYY-MM')

    @staticmethod
    def _integer(value):
        return type(value) is int and 0 <= value <= 9007199254740991

    def get(self, actor_id, month):
        self._identity(actor_id, month)
        with self._db() as db:
            row = db.execute('SELECT payload FROM personal_budgets WHERE actor=? AND month=?', (actor_id, month)).fetchone()
            return json.loads(row[0]) if row else {'status':'unset', 'month':month, 'currency':'CNY', 'total_minor':None, 'categories':[], 'revision':0}

    def save(self, actor_id, month, total_minor, categories, expected_revision, request_id):
        self._identity(actor_id, month)
        if not self._integer(total_minor) or total_minor == 0:
            raise BudgetError('total_minor must be a positive integer')
        if not self._integer(expected_revision):
            raise BudgetError('expected_revision must be a nonnegative integer')
        if not isinstance(request_id, str) or not request_id.strip() or request_id != request_id.strip() or len(request_id) > 200:
            raise BudgetError('request_id must be a nonempty canonical string up to 200 characters')
        if not isinstance(categories, list):
            raise BudgetError('categories must be a list')
        limits, seen = [], set()
        for item in categories:
            if not isinstance(item, dict) or set(item) != {'category','limit_minor'}:
                raise BudgetError('category requires category and limit_minor only')
            name, limit = item['category'], item['limit_minor']
            if not isinstance(name, str) or not name.strip() or name != name.strip() or name in seen or not self._integer(limit):
                raise BudgetError('categories must be unique canonical names with nonnegative integer limits')
            seen.add(name)
            limits.append({'category':name, 'limit_minor':limit})
        if sum(item['limit_minor'] for item in limits) > total_minor:
            raise BudgetError('category limits exceed total budget')
        limits.sort(key=lambda item:item['category'])
        submitted = json.dumps([month,total_minor,limits,expected_revision], ensure_ascii=False, sort_keys=True)
        with self._db() as db:
            prior = db.execute('SELECT submitted,result FROM personal_budget_requests WHERE actor=? AND request_id=?', (actor_id,request_id)).fetchone()
            if prior:
                if prior[0] != submitted:
                    raise BudgetError('request_id already bound to another payload',409)
                return json.loads(prior[1])
            row = db.execute('SELECT revision FROM personal_budgets WHERE actor=? AND month=?',(actor_id,month)).fetchone()
            if (row[0] if row else 0) != expected_revision:
                raise BudgetError('budget revision changed; reload before editing',409)
            result = {'status':'set', 'month':month, 'currency':'CNY', 'total_minor':total_minor, 'categories':limits, 'revision':expected_revision+1}
            payload = json.dumps(result,ensure_ascii=False,sort_keys=True)
            db.execute('INSERT INTO personal_budgets VALUES (?,?,?,?) ON CONFLICT(actor,month) DO UPDATE SET payload=excluded.payload,revision=excluded.revision',(actor_id,month,payload,result['revision']))
            db.execute('INSERT INTO personal_budget_requests VALUES (?,?,?,?)',(actor_id,request_id,submitted,payload))
            return result
