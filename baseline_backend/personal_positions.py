"""Explicit owner holdings, isolated from research snapshots and ledger balances.

Amounts are decimal strings. Quotes must be supplied by a trusted integration;
this module never loads repository prices or performs network requests.
"""
from __future__ import annotations
import csv
import io
import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
from pathlib import Path
from uuid import uuid4

ASSET_CLASSES = {'stock', 'fund', 'bond', 'cash', 'other'}

class PositionConflict(ValueError):
    """The owner must refresh before changing a newer inventory."""

def _number(value, *, positive=False):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('Amounts and quantities must be decimal strings')
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError('Invalid decimal') from exc
    if not result.is_finite() or result < 0 or (positive and result == 0) or result > Decimal('1e18') or result.as_tuple().exponent < -8:
        raise ValueError('Decimal outside supported range')
    return result

def _position(data):
    fields = {'code', 'name', 'asset_class', 'quantity', 'total_cost', 'currency', 'as_of'}
    if set(data) - fields:
        raise ValueError('Unknown position fields')
    item = dict(data)
    for key in ('code', 'name'):
        value = item.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 100 or any(ord(c) < 32 for c in value):
            raise ValueError('Security code and name are required')
        item[key] = value.strip()
    if item.get('asset_class') not in ASSET_CLASSES:
        raise ValueError('Unknown asset class')
    if item.get('currency', 'CNY') != 'CNY':
        raise ValueError('Only CNY is supported; no implicit FX conversion')
    item['currency'] = 'CNY'
    item['quantity'] = str(_number(item.get('quantity'), positive=True))
    item['total_cost'] = str(_number(item.get('total_cost')))
    try:
        as_of = date.fromisoformat(item['as_of'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('as_of must be an ISO date') from exc
    if as_of > datetime.now(timezone.utc).date():
        raise ValueError('Position date cannot be in the future')
    item['as_of'] = as_of.isoformat()
    return item

class PersonalPositionStore:
    def __init__(self, path):
        self.path = str(path)
        if self.path == ':memory:':
            raise ValueError('Use an explicit persistent database path')
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS personal_position_state(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
                INSERT OR IGNORE INTO personal_position_state VALUES(1,0);
                CREATE TABLE IF NOT EXISTS personal_positions(id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS personal_position_imports(id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, result TEXT);
            ''')

    @contextmanager
    def _connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _revision(db):
        return db.execute('SELECT revision FROM personal_position_state WHERE id=1').fetchone()[0]

    def _begin(self, db, expected_revision):
        db.execute('BEGIN IMMEDIATE')
        current = self._revision(db)
        if type(expected_revision) is not int or expected_revision != current:
            raise PositionConflict('Inventory changed; refresh and confirm again')
        return current + 1

    @staticmethod
    def _unique(db, item, exclude=''):
        for row in db.execute('SELECT id,payload FROM personal_positions'):
            existing = json.loads(row['payload'])
            if row['id'] != exclude and existing['code'].casefold() == item['code'].casefold():
                raise ValueError('Security already exists; update its position')

    def list(self):
        with self._connection() as db:
            db.execute('BEGIN')
            return {'revision': self._revision(db), 'holdings': [dict(id=r['id'], **json.loads(r['payload']), revision=r['revision'], source='owner_entered') for r in db.execute('SELECT * FROM personal_positions ORDER BY id')]}

    def save(self, data, expected_revision, position_id=None):
        item = _position(data)
        with self._connection() as db:
            revision = self._begin(db, expected_revision)
            if position_id is not None and not db.execute('SELECT 1 FROM personal_positions WHERE id=?', (position_id,)).fetchone():
                raise KeyError(position_id)
            self._unique(db, item, position_id or '')
            position_id = position_id or uuid4().hex
            db.execute('INSERT OR REPLACE INTO personal_positions VALUES(?,?,?)', (position_id, json.dumps(item), revision))
            db.execute('UPDATE personal_position_state SET revision=? WHERE id=1', (revision,))
        return {'id': position_id, **item, 'revision': revision}

    def delete(self, position_id, expected_revision):
        with self._connection() as db:
            revision = self._begin(db, expected_revision)
            if db.execute('DELETE FROM personal_positions WHERE id=?', (position_id,)).rowcount != 1:
                raise KeyError(position_id)
            db.execute('UPDATE personal_position_state SET revision=? WHERE id=1', (revision,))
        return {'revision': revision, 'deleted_id': position_id}

    def preview_csv(self, content):
        if not isinstance(content, str) or len(content) > 1_000_000:
            raise ValueError('CSV exceeds supported size')
        reader = csv.DictReader(io.StringIO(content.lstrip('\ufeff')))
        required = {'code', 'name', 'asset_class', 'quantity', 'total_cost', 'as_of'}
        if not reader.fieldnames or not required.issubset(reader.fieldnames) or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError('CSV requires unique position column headers')
        rows = [_position(row) for row in reader]
        if not rows or len(rows) > 1000 or len({r['code'].casefold() for r in rows}) != len(rows):
            raise ValueError('CSV must contain 1–1000 distinct securities')
        with self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            for item in rows:
                self._unique(db, item)
            revision = self._revision(db)
            preview_id = uuid4().hex
            db.execute('INSERT INTO personal_position_imports VALUES(?,?,?,NULL)', (preview_id, json.dumps(rows), revision))
        return {'preview_id': preview_id, 'revision': revision, 'holdings': rows, 'mode': 'add_only', 'requires_confirmation': True}

    def confirm_import(self, preview_id, expected_revision):
        with self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            preview = db.execute('SELECT * FROM personal_position_imports WHERE id=?', (preview_id,)).fetchone()
            if preview is None:
                raise KeyError(preview_id)
            if preview['result']:
                return json.loads(preview['result'])
            if type(expected_revision) is not int or expected_revision != preview['revision'] or self._revision(db) != expected_revision:
                raise PositionConflict('Inventory changed; preview the CSV again')
            revision = expected_revision + 1
            ids = []
            for item in json.loads(preview['payload']):
                self._unique(db, item)
                position_id = uuid4().hex
                ids.append(position_id)
                db.execute('INSERT INTO personal_positions VALUES(?,?,?)', (position_id, json.dumps(item), revision))
            result = {'revision': revision, 'imported_ids': ids, 'imported_count': len(ids)}
            db.execute('UPDATE personal_position_state SET revision=? WHERE id=1', (revision,))
            db.execute('UPDATE personal_position_imports SET result=? WHERE id=?', (json.dumps(result), preview_id))
        return result

    def portfolio(self, quotes=None, *, now=None, max_quote_age=timedelta(hours=24)):
        with localcontext() as context:
            context.prec = 80
            return self._portfolio(quotes, now=now, max_quote_age=max_quote_age)

    def _portfolio(self, quotes=None, *, now=None, max_quote_age=timedelta(hours=24)):
        """Quote contract: code-keyed price/currency/as_of/source/valid/purpose.

        Only explicit valid=True and purpose='personal_valuation' are accepted.
        Integration must verify provenance before supplying quotes. Research
        providers must never label historical snapshots as personal valuations.
        Default freshness is 24h; callers may tighten, never relax, that limit.
        """
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None or not timedelta(0) < max_quote_age <= timedelta(hours=24):
            raise ValueError('Timezone-aware now and freshness within 24h required')
        result = self.list()
        total_cost = sum((Decimal(h['total_cost']) for h in result['holdings']), Decimal(0))
        allocations = {}
        all_valid = bool(result['holdings'])
        total_market = Decimal(0)
        for h in result['holdings']:
            cost = Decimal(h['total_cost'])
            allocations[h['asset_class']] = allocations.get(h['asset_class'], Decimal(0)) + cost
            h.update(market_value=None, pnl=None, pnl_pct=None, current_price=None, quote_as_of=None, quote_source=None, quote_quality='missing')
            q = (quotes or {}).get(h['code'])
            if q:
                quality = 'invalid'
                try:
                    stamp = datetime.fromisoformat(q['as_of'].replace('Z', '+00:00'))
                    price = _number(q['price'], positive=True)
                    if q.get('valid') is True and q.get('purpose') == 'personal_valuation' and isinstance(q.get('source'), str) and q['source'].strip() and q.get('currency') == h['currency'] and stamp.tzinfo is not None:
                        age = now - stamp
                        quality = 'future' if age < timedelta(0) else ('stale' if age > max_quote_age else 'valid')
                        h.update(quote_as_of=q['as_of'], quote_source=q['source'])
                        if quality == 'valid':
                            market = price * Decimal(h['quantity'])
                            h.update(current_price=str(price), market_value=str(market), pnl=str(market-cost), pnl_pct=str((market-cost)/cost*100) if cost else None)
                            total_market += market
                except (KeyError, TypeError, ValueError, AttributeError):
                    pass
                h['quote_quality'] = quality
            all_valid = all_valid and h['quote_quality'] == 'valid'
            h['cost_weight_pct'] = str(cost / total_cost * 100) if total_cost else None
        result.update(total_cost=str(total_cost), currency='CNY', allocation_basis='cost', allocation=[{'asset_class': k, 'cost': str(v), 'weight_pct': str(v/total_cost*100) if total_cost else None} for k,v in sorted(allocations.items())], market_value=str(total_market) if all_valid else None, pnl=str(total_market-total_cost) if all_valid else None, pnl_pct=str((total_market-total_cost)/total_cost*100) if all_valid and total_cost else None, quote_quality='valid' if all_valid else ('no_holdings' if not result['holdings'] else 'incomplete'), actions=['add_position', 'import_csv'] if not result['holdings'] else ['update_position', 'import_csv'])
        return result

