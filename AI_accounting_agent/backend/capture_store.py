"""Persistent candidate inbox. Confirmation, bills and undo share one transaction."""
import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from duplicate_match import duplicate_evidence, candidate_duplicate_hints


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def fingerprint(row):
    return hashlib.sha256(canonical(dict(row)).encode()).hexdigest()


def possible_duplicates(db, bill):
    """A heuristic asks for a choice; it never silently removes a purchase."""
    amount = int(Decimal(str(bill['amount'])) * 100)
    description = re.sub(r'[\s\W_]+', '', bill['description']).casefold()
    movement = (bill.get('metadata') or {}).get('movement', 'cashflow')
    matches = []
    for record in db.execute('SELECT * FROM bills WHERE event_date=? AND type=? AND currency=?',
                             (str(bill['event_date']), bill['type'], bill.get('currency', 'CNY'))):
        old = dict(record)
        metadata = json.loads(old['metadata'] or '{}')
        if (str(old.get('source') or '').startswith('synthetic') or old.get('source') == 'jsonl') and metadata.get('duplicate_check') is not True:
            continue
        incoming = bill.get('metadata') or {}
        # Distinct statement row identities are deliberate repeats in the same
        # confirmed file. Only compare them against previously recorded bills.
        if incoming.get('bank_import_key') and any(incoming.get(k) and incoming[k] == metadata.get(k)
                                                   for k in ('capture_batch', 'import_batch')):
            continue
        if int(Decimal(str(old['amount'])) * 100) != amount:
            continue
        if metadata.get('movement', 'cashflow') != movement:
            continue
        reasons = duplicate_evidence(bill, old)
        if reasons:
            matches.append({'id': old['id'], 'source': old['source'], 'event_date': old['event_date'],
                            'amount': f'{Decimal(str(old["amount"])):.2f}', 'description': old['description'], 'reasons': reasons})
    return matches


class CaptureStore:
    def __init__(self, db, lock, validate):
        self.db, self.lock, self.validate = db, lock, validate
        with lock:
            db.execute('''CREATE TABLE IF NOT EXISTS capture_batches (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL,
                kind TEXT NOT NULL, source_digest TEXT NOT NULL, payload TEXT NOT NULL,
                challenge TEXT NOT NULL, status TEXT NOT NULL, submitted TEXT, result TEXT,
                created TEXT NOT NULL, profile_applied INTEGER NOT NULL DEFAULT 0, UNIQUE(owner,request_id))''')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(capture_batches)')}
            if 'profile_applied' not in columns:
                # Existing completed batches predate this recoverable side effect.
                db.execute('ALTER TABLE capture_batches ADD COLUMN profile_applied INTEGER NOT NULL DEFAULT 1')
            db.commit()

    def create(self, owner, request_id, kind, rows, source_digest):
        if not rows or len(rows) > 500:
            raise HTTPException(422, '一次可核对 1 至 500 笔')
        with self.lock:
            prior = self.db.execute('SELECT * FROM capture_batches WHERE owner=? AND request_id=?',
                                    (owner, request_id)).fetchone()
            if prior:
                if prior['kind'] != kind or prior['source_digest'] != source_digest:
                    raise HTTPException(409, '这次录入已绑定其他内容')
                return self._view(prior)
            handle = str(uuid4())
            rows = [{**record, 'origin': record.get('origin') or {k: record.get(k) for k in ('event_date','amount','type','category','description','payment_method') if record.get(k) is not None}} for record in rows]
            self.db.execute('INSERT INTO capture_batches(id,owner,request_id,kind,source_digest,payload,challenge,status,submitted,result,created,profile_applied) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,0)',
                (handle, owner, request_id, kind, source_digest, canonical(rows), secrets.token_urlsafe(32),
                 'pending', datetime.utcnow().isoformat()))
            self.db.commit()
            return self._view(self._row(owner, handle))

    def _row(self, owner, handle):
        row = self.db.execute('SELECT * FROM capture_batches WHERE owner=? AND id=?', (owner, handle)).fetchone()
        if not row:
            raise HTTPException(404, '没有这批待确认记录')
        return row

    def _view(self, row):
        rows = json.loads(row['payload'])
        within = candidate_duplicate_hints(rows)
        for item in rows:
            item['candidate_duplicates'] = within.get(item['row'], [])
            item.pop('import_key', None)
            if not item.get('errors'):
                bill = {**item, 'metadata': {'movement': item.get('movement', 'cashflow')}}
                item['possible_duplicates'] = possible_duplicates(self.db, bill)
        return {'id': row['id'], 'kind': row['kind'], 'status': row['status'], 'created_at': row['created'],
                'rows': rows, 'challenge': row['challenge'],
                'result': json.loads(row['result']) if row['result'] else None,
                'profile_sync_pending': row['status'] == 'imported' and not row['profile_applied']}

    def get(self, owner, handle):
        with self.lock:
            return self._view(self._row(owner, handle))

    def find_request(self, owner, request_id):
        with self.lock:
            row = self.db.execute('SELECT * FROM capture_batches WHERE owner=? AND request_id=?',
                                  (owner, request_id)).fetchone()
            if not row:
                raise HTTPException(404, '没有这批待确认记录')
            return self._view(row)

    def list(self, owner):
        with self.lock:
            records = self.db.execute('SELECT * FROM capture_batches WHERE owner=? ORDER BY created DESC LIMIT 100',
                                       (owner,)).fetchall()
            return {'batches': [{'id': r['id'], 'kind': r['kind'], 'status': r['status'],
                                 'created_at': r['created'], 'count': len(json.loads(r['payload']))} for r in records]}

    def discard(self, owner, handle, challenge):
        with self.lock:
            batch = self._row(owner, handle)
            if not hmac.compare_digest(challenge, batch['challenge']):
                raise HTTPException(409, '请重新打开这批记录')
            if batch['status'] not in {'pending', 'discarded'}:
                raise HTTPException(409, '已入账的记录请先到明细处理')
            self.db.execute("UPDATE capture_batches SET status='discarded',payload='[]' WHERE id=?", (handle,))
            self.db.commit()
            return {'id': handle, 'status': 'discarded', 'bank_effect': False}

    def update(self, owner, handle, patches, normalize):
        fields = {'event_date','amount','type','category','description','movement','payment_method','refund_of_bill_id','duplicate_decision','enabled'}
        with self.lock:
            batch = self._row(owner, handle)
            if batch['status'] != 'pending':
                raise HTTPException(409, '这批记录已处理，请到流水修改')
            rows = json.loads(batch['payload'])
            by_id = {r['row']: r for r in rows}
            identifiers = [p.get('row') for p in patches]
            if any(type(i) is not int or i not in by_id for i in identifiers) or len(set(identifiers)) != len(identifiers):
                raise HTTPException(422, '请选择本批记录修改')
            for patch in patches:
                target = by_id[patch['row']]
                editable = {k:v for k,v in patch.items() if k in fields}
                corrected = normalize({**target, **editable})
                target.update(corrected)
            self.db.execute('UPDATE capture_batches SET payload=? WHERE id=?', (canonical(rows),handle))
            self.db.commit()
            return self._view(self._row(owner,handle))

    def confirm(self, owner, handle, challenge, items, on_new_commit=None):
        result = self._confirm_ledger(owner, handle, challenge, items)
        self.reconcile(owner, handle, challenge, on_new_commit)
        return result

    def reconcile(self, owner, handle, challenge, apply_profile=None):
        with self.lock:
            row = self._row(owner, handle)
            if not hmac.compare_digest(challenge, row['challenge']):
                raise HTTPException(409, '请重新打开这批记录')
            if row['status'] != 'imported' or not row['result']:
                raise HTTPException(409, '这批记录尚未入账或已经撤销')
            result = json.loads(row['result'])
            pending = not row['profile_applied']
        # The target runtime stores an event ID in the SAME transaction as the
        # profile update. Retrying after either database commits is safe.
        if pending and (not result['created'] or apply_profile is not None):
            if result['created']:
                apply_profile()
            with self.lock:
                self.db.execute('UPDATE capture_batches SET profile_applied=1 WHERE id=?', (handle,))
                self.db.commit()
        return result

    def _confirm_ledger(self, owner, handle, challenge, items):
        submitted = canonical(items)
        with self.lock:
            batch = self._row(owner, handle)
            if not hmac.compare_digest(challenge, batch['challenge']):
                raise HTTPException(409, '请重新打开这批记录再确认')
            if batch['status'] == 'undone':
                raise HTTPException(409, '这批记录已撤销')
            if batch['status'] == 'discarded':
                raise HTTPException(409, '这批记录已丢弃')
            if batch['result']:
                if submitted != batch['submitted']:
                    raise HTTPException(409, '这批记录已经入账，请在账本修改')
                return json.loads(batch['result'])
            sources = {r['row']: r for r in json.loads(batch['payload'])}
            if len(set(i['row'] for i in items)) != len(items) or any(i['row'] not in sources for i in items):
                raise HTTPException(422, '核对行号不属于这批记录或重复')
            created, duplicates, skipped, versions = [], [], [], {}
            try:
                self.db.execute('BEGIN IMMEDIATE')
                self.db.execute('CREATE TABLE IF NOT EXISTS bank_import_index (import_key TEXT PRIMARY KEY, bill_id INTEGER NOT NULL)')
                new_items = [i for i in items if i.get('duplicate_decision') != 'skip' and not (
                    sources[i['row']].get('import_key') and self.db.execute(
                        'SELECT 1 FROM bank_import_index i JOIN bills b ON b.id=i.bill_id WHERE i.import_key=?',
                        (sources[i['row']]['import_key'],)).fetchone())]
                within = candidate_duplicate_hints(new_items)
                for item in new_items:
                    if within.get(item['row']) and item.get('duplicate_decision') != 'keep':
                        raise HTTPException(409, {'code': 'candidate_duplicate', 'row': item['row'], 'matches': within[item['row']]})
                for item in items:
                    source = sources[item['row']]
                    choice = item.get('duplicate_decision')
                    if choice == 'skip':
                        skipped.append(item['row'])
                        continue
                    metadata = {'movement': item.get('movement', 'cashflow'), 'capture_batch': handle,
                                'capture_row': item['row'], 'capture_kind': batch['kind'],
                                'source_digest': batch['source_digest']}
                    if source.get('evidence',{}).get('fixed_result') is True:
                        metadata['recognition_mode']='fixed_result_adapter'
                        metadata['recognition_adapter']=source['evidence']['adapter']
                    if item.get('payment_method'):
                        metadata['payment_method'] = item['payment_method']
                    linked_id = item.get('refund_of_bill_id')
                    if linked_id is not None:
                        original = self.db.execute('SELECT * FROM bills WHERE id=?', (linked_id,)).fetchone()
                        if (item['type'] != 'income' or item['category'] != '退款' or original is None
                                or original['type'] != 'expense' or original['currency'] != 'CNY'
                                or json.loads(original['metadata'] or '{}').get('movement', 'cashflow') != 'cashflow'):
                            raise HTTPException(422, '请选择这笔退款对应的支出账单')
                        metadata['refund_of_bill_id'] = linked_id
                    if source.get('import_key'):
                        metadata['bank_import_key'] = source['import_key']
                    bill = self.validate({**item, 'currency': 'CNY', 'source': 'capture_' + batch['kind'], 'metadata': metadata})
                    key = source.get('import_key')
                    prior = self.db.execute('SELECT b.* FROM bank_import_index i JOIN bills b ON b.id=i.bill_id WHERE i.import_key=?',
                                            (key,)).fetchone() if key else None
                    if prior:
                        old = dict(prior)
                        comparable = ('event_date', 'category', 'type', 'currency', 'description')
                        old_movement = json.loads(old['metadata'] or '{}').get('movement', 'cashflow')
                        if any(str(old[k]) != str(bill[k]) for k in comparable) or Decimal(str(old['amount'])) != Decimal(str(bill['amount'])) or old_movement != metadata['movement']:
                            raise HTTPException(409, '相同流水标识的内容不同，请先核对原账单')
                        duplicates.append(old['id'])
                        continue
                    matches = possible_duplicates(self.db, bill)
                    if matches and choice != 'keep':
                        raise HTTPException(409, {'code': 'possible_duplicate', 'row': item['row'], 'matches': matches})
                    cursor = self.db.execute('INSERT INTO bills(event_date,category,type,amount,currency,description,source,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                        (str(bill['event_date']), bill['category'], bill['type'], float(bill['amount']), 'CNY', bill['description'],
                         bill['source'], canonical(metadata), datetime.utcnow().isoformat()))
                    bill_id = cursor.lastrowid
                    created.append(bill_id)
                    if key:
                        self.db.execute('INSERT OR REPLACE INTO bank_import_index VALUES (?,?)', (key, bill_id))
                    versions[str(bill_id)] = fingerprint(self.db.execute('SELECT * FROM bills WHERE id=?', (bill_id,)).fetchone())
                result = {'id': handle, 'status': 'imported', 'created': len(created), 'bill_ids': created,
                          'duplicates': len(duplicates), 'duplicate_bill_ids': duplicates, 'skipped_rows': skipped,
                          'versions': versions, 'bank_effect': False}
                self.db.execute('UPDATE capture_batches SET status=?,submitted=?,result=? WHERE id=?',
                                ('imported', submitted, canonical(result), handle))
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise
        return result

    def undo(self, owner, handle, challenge):
        with self.lock:
            batch = self._row(owner, handle)
            if not hmac.compare_digest(challenge, batch['challenge']):
                raise HTTPException(409, '撤销确认无效')
            if batch['status'] == 'undone':
                return {'id': handle, 'status': 'undone', 'bank_effect': False}
            if not batch['result']:
                raise HTTPException(409, '这批记录尚未入账')
            result = json.loads(batch['result'])
            try:
                self.db.execute('BEGIN IMMEDIATE')
                for bill_id, version in result['versions'].items():
                    current = self.db.execute('SELECT * FROM bills WHERE id=?', (int(bill_id),)).fetchone()
                    if current is None or fingerprint(current) != version:
                        raise HTTPException(409, '这批账单已有修改，请到明细核对后再处理')
                    linked = self.db.execute("SELECT id FROM bills WHERE json_valid(metadata) AND json_extract(metadata,'$.refund_of_bill_id')=?", (int(bill_id),)).fetchall()
                    if any(row['id'] not in result['bill_ids'] for row in linked):
                        raise HTTPException(409, '这批账单已关联退款，请先处理对应退款')
                for bill_id in result['bill_ids']:
                    self.db.execute('DELETE FROM bank_import_index WHERE bill_id=?', (bill_id,))
                    self.db.execute('DELETE FROM bills WHERE id=?', (bill_id,))
                self.db.execute('UPDATE capture_batches SET status=? WHERE id=?', ('undone', handle))
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise
            return {'id': handle, 'status': 'undone', 'bank_effect': False}
