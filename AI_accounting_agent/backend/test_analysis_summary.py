import unittest
from analysis_summary import analysis_from_book_db, build_analysis_summary


def bill(identifier, amount, kind='expense', category='餐饮', day='2026-01-10', **metadata):
    return dict(id=identifier, amount=amount, type=kind, category=category,
                event_date=day, currency='CNY', metadata=metadata)


class AnalysisSummaryTests(unittest.TestCase):
    def setUp(self):
        self.rows = [bill(1, '100.00', 'income', '工资'), bill(2, '10.10'),
                     bill(3, '0.20', category='交通'),
                     bill(4, '1.10', 'income', '退款', refund_of_bill_id=2),
                     bill(5, '0.30', 'income', '退款'),
                     bill(6, '20.00', movement='internal_transfer'),
                     bill(7, '25.00', 'income', movement='principal')]

    def summary(self, rows=None, **options):
        return build_analysis_summary(self.rows if rows is None else rows,
                                      '2026-01-01', '2026-01-31', **options)

    def test_refunds_and_excluded_movements(self):
        result = self.summary()
        self.assertEqual(result['totals'], dict(gross_income_minor=10000, refund_minor=140,
            gross_expense_minor=1030, net_expense_minor=890, net_cashflow_minor=9110))
        self.assertEqual(result['refunds']['attributed_minor'], 110)
        self.assertEqual(result['refunds']['unmatched_minor'], 30)
        self.assertIsNone(result['refunds']['items'][1]['category'])
        self.assertEqual(result['excluded_movements']['internal_transfer']['expense_minor'], 2000)
        self.assertEqual(result['excluded_movements']['principal']['income_minor'], 2500)

    def test_drilldown_reconciles(self):
        result = self.summary()
        by_id = {row['id']: row for row in self.rows}
        for category in result['expense_categories']:
            expected = sum(round(float(by_id[i]['amount']) * 100) for i in category['bill_ids'])
            self.assertEqual(category['amount_minor'], expected)
        self.assertEqual(sum(x['amount_minor'] for x in result['expense_categories']),
                         result['totals']['gross_expense_minor'])
        self.assertEqual(set(result['operational_bill_ids']), {1, 2, 3, 4, 5})

    def test_month_year_and_trend_equivalence(self):
        rows = self.rows + [bill(8, '3.33', day='2026-12-31')]
        year = build_analysis_summary(rows, '2026-01-01', '2026-12-31', granularity='month')
        december = build_analysis_summary(rows, '2026-12-01', '2026-12-31')
        for key, value in year['totals'].items():
            self.assertEqual(value, self.summary()['totals'][key] + december['totals'][key])
            self.assertEqual(value, sum(item[key] for item in year['trend']))
        self.assertEqual(self.summary()['totals'], self.summary(granularity='month')['totals'])

    def test_minor_precision(self):
        result = self.summary([bill(i, '0.01') for i in range(1000)])
        self.assertEqual(result['totals']['gross_expense_minor'], 1000)
        with self.assertRaises(ValueError):
            self.summary([bill(1, '1.001')])

    def test_empty_and_range_validation(self):
        self.assertEqual(self.summary([])['state'], 'empty')
        calls = []
        with self.assertRaises(ValueError):
            analysis_from_book_db(lambda *args: calls.append(args), '2026-02-01', '2026-01-01')
        self.assertEqual(calls, [])
        for start, end in [('bad', '2026-01-01'), ('2000-01-01', '2026-01-01')]:
            with self.assertRaises(ValueError):
                build_analysis_summary([], start, end)
        with self.assertRaises(ValueError):
            self.summary(granularity='year')

    def test_inclusive_boundaries_and_currency(self):
        rows = [bill(1, '1', day='2026-01-01'), bill(2, '2', day='2026-01-31'),
                bill(3, '3', day='2026-02-01')]
        rows.append({**bill(4, '4'), 'currency': 'USD'})
        self.assertEqual(self.summary(rows)['bill_ids'], [1, 2])

    def test_explicit_link_outside_period_and_invalid_link(self):
        result = self.summary([bill(1, '10', day='2025-12-01'),
            bill(2, '2', 'income', '退款', refund_of_bill_id=1),
            bill(3, '3', 'income', '退款', refund_of_bill_id=999)])
        self.assertEqual(result['refunds']['attributed_minor'], 200)
        self.assertEqual(result['refunds']['unmatched_minor'], 300)
        self.assertEqual(result['expense_categories'], [])

    def test_adapter(self):
        calls = []
        def fetch(start, end):
            calls.append((start.isoformat(), end.isoformat()))
            return self.rows
        self.assertEqual(analysis_from_book_db(fetch, '2026-01-01', '2026-01-31')['totals'],
                         self.summary()['totals'])
        self.assertEqual(calls, [('2026-01-01', '2026-01-31')])


if __name__ == '__main__':
    unittest.main()
