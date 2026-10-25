"""Existing catalog and account values; temporary API workspace, no live data."""
import json
from pathlib import Path
from test_bank_import import workspace
from test_finance_planning import planning_workspace, seed_months, profile


def test_investment_catalog_contract_and_account_basis(planning_workspace):
    client,module=planning_workspace
    seed_months(client,income=6000,expense=1000)
    profile(client,goal_name='旅行',goal_amount='1200',goal_months=6,risk_answers=[2,2,2,2])
    before=module.finance_router.workspace().bank.snapshot()['execution_count']
    response=client.get('/finance/overview')
    assert response.status_code==200
    data=response.json()
    assert {p['id'] for p in data['products']}=={'reserve','growth'}
    assert {p['risk'] for p in data['products']}=={1,3}
    assert all(p['fee']=='0' and isinstance(p['holding_minor'],int) for p in data['products'])
    assert all('annual_rate' not in p and 'yield' not in p for p in data['products'])
    assert data['assets_minor']==data['cash_minor']+sum(p['holding_minor'] for p in data['products'])
    assert data['investable_minor']<=data['cash_minor']
    assert module.finance_router.workspace().bank.snapshot()['execution_count']==before
    target=Path('.runtime/investment-focus/overview.json');target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(data,ensure_ascii=False,indent=2))


def test_investment_catalog_still_available_without_history(planning_workspace):
    client,module=planning_workspace
    data=client.get('/finance/overview').json()
    assert len(data['products'])==2
    assert data['planning']['ready'] is False
    reserve=next(p for p in data['products'] if p['id']=='reserve')
    growth=next(p for p in data['products'] if p['id']=='growth')
    assert reserve['eligible'] is True
    assert growth['eligible'] is False and data['investable_minor']==0
    assert module.finance_router.workspace().bank.snapshot()['execution_count']==0
