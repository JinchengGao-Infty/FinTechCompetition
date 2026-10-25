import base64
import unittest
from bank_import import parse_csv


class WalletCSVTests(unittest.TestCase):
    def parse(self,text,encoding='utf-8-sig'):
        return parse_csv(base64.b64encode(text.encode(encoding)).decode(),'同一账户')

    def test_wechat_preamble_direction_and_item(self):
        rows=self.parse('微信支付账单明细\n微信昵称,隐私字段不应入账\n\n交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,备注\n2026-10-21 12:30:00,商户消费,测试商店,午餐,支出,¥28.00,微信支付,支付成功,ABC-123,/\n')
        self.assertEqual(len(rows),1)
        self.assertEqual((rows[0]['type'],rows[0]['amount'],rows[0]['category'],rows[0]['description']),('expense','28.00','餐饮','午餐'))
        self.assertEqual(rows[0]['payment_method'],'微信支付')
        self.assertFalse(rows[0]['errors'])
        self.assertNotIn('隐私',str(rows))

    def test_alipay_gb18030_and_refund_semantics(self):
        rows=self.parse('支付宝交易记录明细查询\n账号,private-account\n交易时间,交易类型,交易对方,商品说明,收/支,金额,收/付款方式,交易状态,交易单号\n2026-10-21 12:30:00,退款,测试商店,午餐返还,收入,8.80,余额,退款成功,REFUND-1\n','gb18030')
        self.assertEqual((rows[0]['type'],rows[0]['category'],rows[0]['amount']),('income','退款','8.80'))
        self.assertNotIn('private-account',str(rows))

    def test_closed_transaction_is_not_selected(self):
        rows=self.parse('交易时间,收/支,金额(元),商品,当前状态\n2026-10-21,支出,28.00,午餐,交易关闭\n')
        self.assertFalse(rows[0]['enabled'])
        self.assertTrue(rows[0]['errors'])

    def test_generic_tabs_and_real_repeats_still_supported(self):
        rows=self.parse('日期\t收支\t金额\t摘要\n2026-10-21\t支出\t28.00\t午餐\n2026-10-21\t支出\t28.00\t午餐\n')
        self.assertEqual(len(rows),2)
        self.assertNotEqual(rows[0]['import_key'],rows[1]['import_key'])


if __name__=='__main__':unittest.main()
