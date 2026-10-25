"""Visible protection facts, using temporary accounts and the real API boundary."""
import json
from pathlib import Path

import pytest

from test_finance_workspace import workspace, draft, confirm


def evidence(name, value):
    # Operation challenges and enrollment secrets are never part of review artifacts.
    def clean(item):
        if isinstance(item, dict):
            return {k: clean(v) for k, v in item.items() if k not in {'challenge', 'secret', 'otpauth_uri'}}
        if isinstance(item, list):
            return [clean(v) for v in item]
        return item
    folder = Path('.runtime/protection-view')
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f'{name}.json').write_text(json.dumps(clean(value), ensure_ascii=False, indent=2), encoding='utf-8')


def test_confirmation_fact_is_recorded_only_after_actual_verification(workspace):
    client, module = workspace
    before = client.get('/finance/overview').json()
    evidence('empty', before)
    op = client.post('/finance/operations/review', json={
        'kind': 'subscribe', 'product_id': 'reserve', 'amount': '80.00',
        'request_id': 'visible-mfa-subscribe'}).json()
    assert op['status'] == 'needs_mfa' and op['level'] == 'red'
    assert 'confirmation_record' not in op
    evidence('needs-mfa', op)
    assert confirm(client, op, code='000000').status_code == 409
    assert 'confirmation_record' not in client.get(f"/finance/operations/{op['handle']}").json()
    setup = client.post('/finance/mfa/setup', json={}).json()
    service = module.finance_router.workspace()
    code = service.totp(setup['secret'])
    assert client.post('/finance/mfa/activate', json={'code': code}).json()['enabled']
    assert confirm(client, op, code=code).status_code == 409
    assert 'confirmation_record' not in client.get(f"/finance/operations/{op['handle']}").json()
    import finance_workspace
    stamp = finance_workspace.time.time() + 31
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(finance_workspace.time, 'time', lambda: stamp)
        result = confirm(client, op, code=service.totp(setup['secret'])).json()
        assert result['status'] == 'succeeded'
        assert result['confirmation_record'] == {'confirmed_at': stamp, 'method': 'dynamic_code'}
        assert confirm(client, op).json()['confirmation_record'] == result['confirmation_record']
    after = client.get('/finance/overview').json()
    assert after['cash_minor'] == before['cash_minor'] - 8000
    assert after['products'][0]['holding_minor'] == 8000
    assert after['assets_minor'] == before['assets_minor']
    assert after['operations'][0]['confirmation_record'] == result['confirmation_record']
    assert not after['unresolved_operations']
    assert all('challenge' not in item for item in after['operations'])
    evidence('mfa-succeeded', result)
    evidence('after-mfa', after)


def test_unknown_result_is_listed_and_reconciled_without_a_second_effect(workspace, monkeypatch):
    client, module = workspace
    service = module.finance_router.workspace()
    original = service.gateway.execute
    before = client.get('/finance/overview').json()['cash_minor']
    op = draft(client, 'visible-unknown')
    evidence('needs-confirmation', op)
    assert 'confirmation_record' not in op

    def post_commit_fault(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError('lost response after durable posting')

    monkeypatch.setattr(service.gateway, 'execute', post_commit_fault)
    unknown = confirm(client, op).json()
    assert unknown['status'] == 'unknown'
    assert unknown['confirmation_record']['method'] == 'confirmation'
    assert unknown['confirmation_record']['confirmed_at'] > 0
    assert client.get('/finance/overview').json()['cash_minor'] == before - 1000
    assert confirm(client, op).json()['status'] == 'unknown'
    # Populate later historical rows to prove unresolved discovery is not capped by recent 12.
    with service.store._lock:
        row = service.store._db.execute('SELECT * FROM app_operations WHERE handle=?', (op['handle'],)).fetchone()
        columns = list(row.keys())
        for index in range(13):
            values = dict(row)
            values.update(handle=f'isolated-history-{index}', request_id=f'history-{index}',
                          action_id=f'history-action-{index}', created=row['created'] + index + 1,
                          result=json.dumps({'status': 'cancelled', 'params': unknown['params']}))
            service.store._db.execute(f"INSERT INTO app_operations ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", tuple(values[k] for k in columns))
        service.store._db.commit()
    snapshot = client.get('/finance/overview').json()
    assert len(snapshot['operations']) == 12
    assert not any(item['handle'] == op['handle'] for item in snapshot['operations'])
    assert [item['handle'] for item in snapshot['unresolved_operations']] == [op['handle']]
    assert 'challenge' not in snapshot['unresolved_operations'][0]
    evidence('unknown', unknown)
    evidence('pending-with-older-operation', snapshot)
    result = client.post(f"/finance/operations/{op['handle']}/reconcile", json={}).json()
    assert result['status'] == 'succeeded' and result['evidence'] == 'backend_reconciliation'
    assert result['confirmation_record'] == unknown['confirmation_record']
    assert client.get('/finance/overview').json()['unresolved_operations'] == []
    assert client.get('/finance/overview').json()['cash_minor'] == before - 1000
    evidence('reconciled', result)
