import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from personal_positions import PersonalPositionStore, PositionConflict

class PersonalPositionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.path = Path(self.temp.name) / 'positions.sqlite3'
        self.store = PersonalPositionStore(self.path)
        self.item = dict(code='600036', name='Owner security', asset_class='stock', quantity='10.1', total_cost='100.01', currency='CNY', as_of='2026-01-01')
        self.now = datetime(2026, 10, 23, 10, tzinfo=timezone.utc)
    def tearDown(self):
        self.temp.cleanup()
    def quote(self, **overrides):
        return dict(price='12', currency='CNY', as_of='2026-10-23T09:00:00Z', source='verified-provider', valid=True, purpose='personal_valuation', **overrides)
    def test_empty_has_no_fabricated_performance(self):
        p = self.store.portfolio()
        self.assertEqual(p['holdings'], [])
        self.assertIsNone(p['pnl'])
        self.assertIsNone(p['market_value'])
        self.assertIn('import_csv', p['actions'])
    def test_crud_persistence_and_revision_conflict(self):
        row = self.store.save(self.item, 0)
        self.assertEqual(PersonalPositionStore(self.path).list()['holdings'][0]['total_cost'], '100.01')
        with self.assertRaises(PositionConflict): self.store.save(self.item, 0, row['id'])
        updated = self.store.save(dict(self.item, quantity='11'), 1, row['id'])
        self.assertEqual(updated['revision'], 2)
        self.store.delete(row['id'], 2)
        self.assertEqual(self.store.list(), {'revision': 3, 'holdings': []})
    def test_decimal_cost_and_no_quote(self):
        self.store.save(self.item, 0)
        p = self.store.portfolio()
        self.assertEqual(p['total_cost'], '100.01')
        self.assertEqual(p['allocation'][0]['weight_pct'], '100')
        self.assertIsNone(p['pnl'])
        self.assertEqual(p['holdings'][0]['quote_quality'], 'missing')
    def test_valid_quotes_compute_exact_values(self):
        self.store.save(self.item, 0)
        p = self.store.portfolio({'600036': self.quote()}, now=self.now)
        self.assertEqual(p['market_value'], '121.2')
        self.assertEqual(p['pnl'], '21.19')
    def test_invalid_stale_future_and_research_quotes_remain_unknown(self):
        self.store.save(self.item, 0)
        for change, quality in [({'valid': False}, 'invalid'), ({'purpose': 'research'}, 'invalid'), ({'as_of': '2025-10-01T00:00:00Z'}, 'stale'), ({'as_of': '2026-10-24T00:00:00Z'}, 'future'), ({'source': ''}, 'invalid'), ({'as_of': '2026-10-23T09:00:00'}, 'invalid'), ({'price': 'NaN'}, 'invalid')]:
            q = self.quote(); q.update(change)
            p = self.store.portfolio({'600036': q}, now=self.now)
            self.assertEqual(p['holdings'][0]['quote_quality'], quality)
            self.assertIsNone(p['pnl'])
    def test_partial_quotes_do_not_claim_portfolio_performance(self):
        self.store.save(self.item, 0)
        self.store.save(dict(self.item, code='FUND1', asset_class='fund', total_cost='50'), 1)
        p = self.store.portfolio({'600036': self.quote()}, now=self.now)
        self.assertEqual(p['total_cost'], '150.01')
        self.assertIsNone(p['market_value'])
        self.assertIsNone(p['pnl'])
    def test_import_preview_no_holdings_then_atomic_idempotent_confirm(self):
        csv = 'code,name,asset_class,quantity,total_cost,currency,as_of\n600036,Owner security,stock,10.1,100.01,CNY,2026-01-01\n'
        preview = self.store.preview_csv(csv)
        self.assertEqual(self.store.list()['holdings'], [])
        result = self.store.confirm_import(preview['preview_id'], 0)
        self.assertEqual(result, self.store.confirm_import(preview['preview_id'], 0))
        self.assertEqual(len(self.store.list()['holdings']), 1)
        with self.assertRaises(ValueError): self.store.preview_csv(csv)
    def test_changed_inventory_rejects_import(self):
        preview = self.store.preview_csv('code,name,asset_class,quantity,total_cost,as_of\nFUND1,Fund,fund,1,1,2026-01-01\n')
        self.store.save(self.item, 0)
        with self.assertRaises(PositionConflict): self.store.confirm_import(preview['preview_id'], 0)
        self.assertEqual(len(self.store.list()['holdings']), 1)
    def test_invalid_inputs_do_not_mutate(self):
        for change in ({'quantity':'0'}, {'quantity':1.2}, {'total_cost':'-1'}, {'total_cost':'Infinity'}, {'currency':'USD'}, {'as_of':'2999-01-01'}, {'name':''}, {'asset_class':'research'}):
            with self.assertRaises(ValueError): self.store.save(dict(self.item, **change), 0)
        self.assertEqual(self.store.list()['revision'], 0)
    def test_zero_cost_has_unknown_percentage(self):
        self.store.save(dict(self.item, total_cost='0'), 0)
        p = self.store.portfolio({'600036': self.quote()}, now=self.now)
        self.assertIsNone(p['pnl_pct'])
        self.assertIsNone(p['allocation'][0]['weight_pct'])
    def test_freshness_cannot_be_relaxed(self):
        with self.assertRaises(ValueError): self.store.portfolio(max_quote_age=timedelta(days=365))

if __name__ == '__main__': unittest.main()

