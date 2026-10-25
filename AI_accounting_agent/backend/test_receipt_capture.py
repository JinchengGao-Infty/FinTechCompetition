import io
import unittest
from PIL import Image
from receipt_capture import ReceiptError, read_receipt, verify_draft


class ReceiptEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.evidence={'text':'2026-10-21 TOTAL CNY 28.00', 'date_evidence':['2026-10-21'], 'total_evidence':['28.00']}
        self.draft={'event_date':'2026-10-21','amount':28,'currency':'CNY','type':'expense','category':'餐饮'}

    def test_matching_evidence_can_be_reviewed(self):
        self.assertEqual(verify_draft(self.draft,self.evidence),self.draft)

    def test_wrong_amount_cannot_become_receipt_draft(self):
        self.assertTrue(verify_draft({**self.draft,'amount':48},self.evidence)['needs_clarification'])

    def test_date_cannot_be_invented(self):
        self.assertTrue(verify_draft({**self.draft,'event_date':'2026-10-23'},self.evidence)['needs_clarification'])

    def test_multiple_totals_need_review(self):
        self.assertTrue(verify_draft(self.draft,{**self.evidence,'total_evidence':['20.00','28.00']})['needs_clarification'])

    def test_foreign_currency_cannot_silently_become_cny(self):
        self.assertTrue(verify_draft(self.draft,{**self.evidence,'text':'TOTAL USD 28.00'})['needs_clarification'])

    def test_unreadable_image_does_not_create_fixed_amount(self):
        with self.assertRaises(ReceiptError):read_receipt(b'not-an-image')

    def test_blank_image_is_an_error(self):
        buffer=io.BytesIO();Image.new('RGB',(300,300),'white').save(buffer,format='PNG')
        with self.assertRaises(ReceiptError):read_receipt(buffer.getvalue())


if __name__=='__main__':unittest.main()
