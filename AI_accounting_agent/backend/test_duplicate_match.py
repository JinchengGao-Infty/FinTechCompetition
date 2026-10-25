import copy
import unittest
from duplicate_match import candidate_duplicate_hints, duplicate_evidence


def bill(description='午餐', **changes):
    return dict(dict(row=1, event_date='2026-10-23', type='expense', amount='28.00',
                     currency='CNY', category='餐饮', description=description), **changes)


class DuplicateMatchTests(unittest.TestCase):
    def test_merchant_wording(self):
        evidence = duplicate_evidence(bill(), bill('美团支付-午餐'))
        self.assertIn('description_substantive_containment', evidence)

    def test_unicode_and_punctuation(self):
        self.assertIn('description_exact', duplicate_evidence(bill('Ｃａｆé 午餐！'), bill('café午餐')))

    def test_fuzzy(self):
        self.assertIn('description_similar', duplicate_evidence(bill('星巴克咖啡拿铁'), bill('星巴克咖啡奶铁')))

    def test_never_amount_date_alone(self):
        self.assertEqual(duplicate_evidence(bill(), bill('地铁交通')), [])
        self.assertEqual(duplicate_evidence(bill('消费'), bill('美团消费')), [])
        self.assertEqual(duplicate_evidence(bill('付款'), bill('微信付款')), [])

    def test_payment_method_support_only(self):
        self.assertEqual(duplicate_evidence(bill(payment_method='微信'),
                                          bill('地铁', payment_method='微信')), [])
        self.assertIn('same_payment_method', duplicate_evidence(bill(payment_method='微信'),
                          bill('美团支付午餐', metadata={'payment_method': '微信'})))
        self.assertTrue(duplicate_evidence(bill(payment_method='微信'), bill(payment_method='支付宝')))

    def test_direction_movement_refund_and_amount(self):
        for changed in [dict(type='income', category='退款'), dict(movement='internal_transfer'),
                        dict(amount='28.01'), dict(currency='USD'), dict(event_date='2026-10-22')]:
            self.assertEqual(duplicate_evidence(bill(), bill(**changed)), [])
        self.assertEqual(duplicate_evidence(bill(type='income', category='退款'),
                                          bill(type='income', category='工资')), [])

    def test_repeats_remain_rows_and_external_keys_do_not_merge(self):
        rows = [bill(import_key='one'), bill('美团支付午餐', row=2, import_key='two'),
                bill(row=3, import_key='three')]
        before = copy.deepcopy(rows)
        hints = candidate_duplicate_hints(rows)
        self.assertEqual([x['row'] for x in hints[2]], [1])
        self.assertEqual([x['row'] for x in hints[3]], [1, 2])
        self.assertEqual(rows, before)
        self.assertEqual(len(rows), 3)

    def test_invalid_and_unselected(self):
        rows = [bill(amount='bad'), bill(row=2, enabled=False), bill(row=3, errors=['date']),
                bill(row=4, selected=False), bill(row=5), bill(row=6)]
        self.assertEqual([x['row'] for x in candidate_duplicate_hints(rows)[6]], [5])
        for amount in ['NaN', 'Infinity', '0.001', '-1', '0']:
            self.assertEqual(duplicate_evidence(bill(), bill(amount=amount)), [])


if __name__ == '__main__':
    unittest.main()
