"""Semantic/context regressions on synthetic in-memory drafts; no bank authority."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'AI_accounting_agent/backend'))
import banking_tasks
import bill_facts


@pytest.fixture
def dialog(monkeypatch):
    calls = []
    def model(messages, **kwargs):
        calls.append(deepcopy(messages))
        # Deliberately wrong slot values cannot override literal user evidence.
        return json.dumps(dict(intent='transfer', recipient='房东', amount='9999'))
    monkeypatch.setattr(banking_tasks, 'api_chat', model)
    build = bill_facts.build_bill_facts
    monkeypatch.setattr(bill_facts, 'build_bill_facts', lambda rows, query: build(rows, query, date(2026, 10, 19)))
    rows = [dict(id=i, event_date=day, amount=amount, type=kind, category=category, currency='CNY')
            for i, (day, amount, kind, category) in enumerate([
                ('2026-10-01', 1000, 'income', '工资'),
                ('2026-10-02', 40, 'expense', '餐饮'),
                ('2026-10-09', 20, 'expense', '出行'),
                ('2026-10-12', 50, 'expense', '日用品'),
                ('2026-10-15', 60, 'expense', '餐饮'),
                ('2026-10-29', 999, 'expense', '餐饮'),
                ('2026-09-01', 2000, 'income', '工资'),
            ], 1)]
    class Workspace:
        def read_bills(self): return deepcopy(rows)
    workspace = Workspace()
    def turn(text, task=None):
        task = deepcopy(task) if task else dict(kind='unknown', slots={}, history=[], version=0, status='collecting')
        task['version'] += 1
        return banking_tasks._advance(workspace, 'synthetic', task, text)
    return turn, calls


@pytest.mark.parametrize('query', [
    '这个月到现在，进来的钱减掉花掉的，还剩多少？',
    '本月截至今天，收入减去支出还剩多少钱？',
    '从本月开始到现在，挣的钱扣掉花的钱，结余多少？',
    '当月至今赚的钱减掉开销，净额多少？',
])
def test_month_to_date_net_is_read_only_and_excludes_future_records(dialog, query):
    turn, calls = dialog
    task = turn(query)
    assert task['kind'] == 'bills' and task['status'] == 'completed'
    assert task['facts']['period'] == dict(start_date='2026-10-01', end_date='2026-10-19')
    assert task['facts']['totals']['net_minor'] == 83000
    assert task['facts']['record_count'] == 5
    assert task['facts']['requested_metric'] == 'net'
    assert '净流入830.00元' in task['reply'] and '不代表完整银行流水或实际账户余额' in task['reply']
    assert task['draft'] is None and calls == []


@pytest.mark.parametrize('payment,recipient,amount', [
    ('帮我把饭钱给小林', 'acct-alice', '80块'),
    ('把餐费还给小林', 'acct-alice', '金额是80元'),
    ('帮我把房租付给房东', 'acct-landlord', '80'),
    ('将借款还给小林', 'acct-alice', '80元人民币'),
])
def test_payment_missing_amount_keeps_intent_and_recipient(dialog, payment, recipient, amount):
    turn, calls = dialog
    task = turn(payment)
    assert task['kind'] == 'transfer' and task['slots'] == {'recipient_id': recipient}
    assert task['missing_slots'] == ['amount'] and task['draft'] is None
    next_task = turn(amount, task)
    assert next_task['version'] == task['version'] + 1
    assert next_task['draft'] == dict(kind='transfer', recipient_id=recipient, amount='80.00')
    assert len(calls) == 2


@pytest.mark.parametrize('correction', [
    '刚才说错了，是50，不是80', '刚才说错了,是50,不是80', '不是80元，是50元',
    '金额改为50元，不要80元', '不是80，是50',
    '50元，不是80元', '80元不对，应该是50元', '改成50，不是80',
])
def test_affirmed_amount_replaces_valid_80_draft_without_changing_recipient(dialog, correction):
    turn, _ = dialog
    task = turn('给小林转80元')
    assert task['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='80.00')
    corrected = turn(correction, task)
    assert corrected['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='50.00')


@pytest.mark.parametrize('correction', ['不是80元', '不要80', '50元还是60元', '改为50元或60元', '改成0.001元', '改成- 50元', '改成1,000元', '改成50,80元'])
def test_negated_missing_invalid_or_ambiguous_amount_never_reuses_old_draft(dialog, correction):
    turn, _ = dialog
    task = turn('给小林转80元')
    corrected = turn(correction, task)
    assert corrected['draft'] is None and corrected['status'] == 'collecting'


def test_corrected_amount_survives_outage_without_reviving_old_amount(dialog, monkeypatch):
    turn, _ = dialog
    task = turn('给小林转80元')
    def unavailable(*args, **kwargs): raise HTTPException(503, 'controlled outage')
    monkeypatch.setattr(banking_tasks, 'api_chat', unavailable)
    task = turn('刚才说错了，是50，不是80', task)
    assert task['status'] == 'model_unavailable' and task['draft'] is None
    assert task['slots'] == dict(recipient_id='acct-alice', amount='50.00')
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *a, **k: '{"intent":"transfer"}')
    assert turn('继续', task)['draft']['amount'] == '50.00'


@pytest.mark.parametrize('text', ['把书还给小林', '这个月花了多少钱', '查一下本月房租支出'])
def test_payment_intent_requires_money_object_and_direction(text):
    assert banking_tasks._explicit_kind(text) is None


@pytest.mark.parametrize('payment', [
    '午餐钱付给小林', '午饭钱给小林', '替我付给小林八十元',
    '还小林80元', '借的80元还给小林', '餐饮费付给小林',
])
def test_semantic_transfer_enters_literal_slot_validation(dialog, payment):
    turn, _ = dialog
    task = turn(payment)
    assert task['kind'] == 'transfer'
    assert task['slots']['recipient_id'] == 'acct-alice'
    if '80' in payment or '八十' in payment:
        assert task['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='80.00')
    else:
        assert task['draft'] is None and task['missing_slots'] == ['amount']
        assert turn('八十元', task)['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='80.00')


@pytest.mark.parametrize('words,expected', [
    ('五十', '50.00'), ('十二', '12.00'), ('二十五', '25.00'), ('两百', '200.00'),
    ('一百零二', '102.00'), ('一千零八十', '1080.00'), ('九千九百九十九', '9999.00'),
    ('一万', '10000.00'), ('五十点五', '50.50'), ('零点零一', '0.01'),
])
def test_chinese_money_correction_preserves_recipient(dialog, words, expected):
    turn, _ = dialog
    original = turn('给小林转80元')
    changed = turn('金额调整到' + words + '元', original)
    assert changed['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount=expected)
    assert turn('小林', changed)['draft'] == changed['draft']


@pytest.mark.parametrize('correction', [
    '改成五十来元', '金额改成半百元', '金额改成少一点', '改成一百二元',
    '改成五六十元', '改成一万元以上', '改成负五十元', '改成五十点零零一元',
    '改成五十元五角', '改成五十分', '改成五十减十元', '改成50加10元', '改成五十块半',
])
def test_unresolved_amount_correction_cannot_revive_80(dialog, correction):
    turn, _ = dialog
    changed = turn(correction, turn('给小林转80元'))
    assert changed['slots'] == {'recipient_id': 'acct-alice'}
    assert changed['missing_slots'] == ['amount'] and changed['draft'] is None
    assert '已清除原金额' in changed['reply']
    following = turn('小林', changed)
    assert following['draft'] is None and 'amount' in following['missing_slots']


def test_chinese_amount_is_saved_before_model_outage(dialog, monkeypatch):
    turn, _ = dialog
    original = turn('给小林转80元')
    def unavailable(*args, **kwargs): raise HTTPException(503, 'controlled outage')
    monkeypatch.setattr(banking_tasks, 'api_chat', unavailable)
    changed = turn('改成五十元', original)
    assert changed['status'] == 'model_unavailable' and changed['draft'] is None
    assert changed['slots'] == dict(recipient_id='acct-alice', amount='50.00')
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *args, **kwargs: '{"intent":"transfer"}')
    assert turn('继续', changed)['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='50.00')


def test_bills_with_named_recipient_remain_read_only(dialog, monkeypatch):
    turn, _ = dialog
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *args, **kwargs: pytest.fail('Explicit bill query must work without a model'))
    task = turn('查一下本月给小林的餐饮支出')
    assert task['kind'] == 'bills' and task['status'] == 'completed' and task['draft'] is None


@pytest.mark.parametrize('words', ['改成大概一些钱', '再少一些吧', '换成合适的数目', '改一下吧'])
def test_unresolved_revision_invalidates_money_even_without_numerals(dialog, words):
    turn, _ = dialog
    changed = turn(words, turn('还小林80元'))
    assert changed['slots'] == {'recipient_id': 'acct-alice'}
    assert changed['draft'] is None and changed['missing_slots'] == ['amount']
    assert turn('小林', changed)['draft'] is None
    assert turn('50元', changed)['draft'] == dict(kind='transfer', recipient_id='acct-alice', amount='50.00')


def test_model_semantic_amount_change_cannot_supply_an_unstated_value(dialog, monkeypatch):
    turn, _ = dialog
    original = turn('给小林转80元')
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *a, **k: json.dumps(dict(
        intent='transfer', recipient='房东', amount='9999', changed_fields=['amount'])))
    changed = turn('凑个吉利数', original)
    assert changed['slots'] == {'recipient_id': 'acct-alice'}
    assert changed['draft'] is None and changed['missing_slots'] == ['amount']
    assert turn('小林', changed)['draft'] is None


@pytest.mark.parametrize('failure', ['outage', 'invalid', 'unsupported'])
def test_failed_interpretation_cannot_leave_inherited_amount_for_retry(dialog, monkeypatch, failure):
    turn, _ = dialog
    original = turn('给小林转80元')
    def failed(*args, **kwargs):
        if failure == 'outage': raise HTTPException(503, 'controlled outage')
        return '{bad json' if failure == 'invalid' else '{"intent":"unsupported"}'
    monkeypatch.setattr(banking_tasks, 'api_chat', failed)
    changed = turn('凑个吉利数', original)
    assert 'amount' not in changed['slots'] and changed['draft'] is None
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *a, **k: '{"intent":"transfer","changed_fields":["recipient"]}')
    assert turn('小林', changed)['draft'] is None


def test_known_object_revision_keeps_explicitly_unchanged_amount(dialog):
    turn, _ = dialog
    original = turn('给小林转80元')
    changed = turn('金额不变，收款人换成房东', original)
    assert changed['draft'] == dict(kind='transfer', recipient_id='acct-landlord', amount='80.00')


def test_explicitly_unchanged_amount_is_not_a_revision(dialog, monkeypatch):
    turn, _ = dialog
    original = turn('给小林转80元')
    # A mistaken model edit annotation cannot erase a party absent from this input.
    monkeypatch.setattr(banking_tasks, 'api_chat', lambda *a, **k: json.dumps(dict(
        intent='transfer', recipient='小林', amount='80.00', changed_fields=['recipient'])))
    assert turn('金额不变', original)['draft'] == original['draft']
