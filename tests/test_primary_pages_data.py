"""Batch-one page amounts against a temporary API ledger; never opens live data."""
import json
import os
from pathlib import Path
from test_backend import bookkeeper, bill


def test_primary_page_amounts_and_category_drillthrough(bookkeeper):
    entries = [
        ('2026-09-05', '工资', 'income', 1000.10, {}),
        ('2026-09-08', '退款', 'income', 12.34, {}),
        ('2026-09-09', '餐饮', 'expense', 30.28, {}),
        ('2026-09-10', '出行', 'expense', 8.50, {}),
        ('2026-09-11', '住房', 'expense', 100, {}),
        ('2026-09-12', '其他', 'expense', 500, {'movement':'internal_transfer'}),
        ('2026-09-13', '其他', 'expense', 300, {'movement':'principal'}),
        ('2026-08-02', '住房', 'expense', 110, {}),
        ('2026-08-10', '餐饮', 'expense', 40, {}),
        ('2026-08-11', '出行', 'expense', 20, {}),
        ('2026-08-01', '住房', 'expense', 999, {}),
    ]
    for day,category,kind,amount,metadata in entries:
        payload=bill();payload.update(event_date=day,category=category,type=kind,amount=amount,metadata=metadata,description=category+'记录')
        result=bookkeeper.post('/bills',json=payload)
        assert result.status_code==201, result.text
    dates={'start_date':'2026-09-01','end_date':'2026-09-30'}
    rows=bookkeeper.get('/bills',params=dates).json()
    report=bookkeeper.get('/reports/aggregate',params=dates).json()['custom']
    assert len(rows)==7
    assert report['summary']=={'income_total':1012.44,'expense_total':138.78}
    assert report['net']['current']==873.66
    assert sum(round(row['previous']*100) for row in report['categories'])==17000
    for category in report['pie']:
        found=bookkeeper.get('/bills',params={**dates,'type':'expense','category':category['name']}).json()
        assert sum(round(row['amount']*100) for row in found)==round(category['value']*100)
    target=Path(os.environ.get('FINPILOT_UI_FIXTURE_OUT','.runtime/ui-batch1-evidence/data-fixture.json'))
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps({'dates':dates,'rows':rows,'report':report},ensure_ascii=False,indent=2))


def test_empty_period_remains_empty(bookkeeper):
    dates={'start_date':'2026-09-01','end_date':'2026-09-30'}
    assert bookkeeper.get('/bills',params=dates).json()==[]
    report=bookkeeper.get('/reports/aggregate',params=dates).json()['custom']
    assert report['summary']=={'income_total':0,'expense_total':0}
    assert report['pie']==[]
