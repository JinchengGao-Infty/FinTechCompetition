"""Conservative duplicate hints; matching never authorizes merging or deletion."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
import json
import re
import unicodedata


_GENERIC = {'消费', '支出', '付款', '订单', '支付', '收入', '退款', '收款', '转账',
            '交易', '账单', '其他', 'expense', 'income', 'payment', 'order', 'refund'}


def _text(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', str(value or '')).casefold()
                   if unicodedata.category(c)[0] in {'L', 'N'})


def _metadata(row):
    value = row.get('metadata') or {}
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def _normalized(row):
    if row.get('errors') or row.get('enabled') is False or row.get('selected') is False:
        return None
    try:
        raw_date = row['event_date']
        day = raw_date.date() if isinstance(raw_date, datetime) else (
            raw_date if isinstance(raw_date, date) else date.fromisoformat(str(raw_date)[:10]))
        amount = Decimal(str(row['amount'])) * 100
        if not amount.is_finite() or amount <= 0 or amount != amount.to_integral_value():
            return None
        kind = row['type']
        currency = str(row.get('currency', 'CNY')).upper()
        if kind not in {'income', 'expense'} or currency != 'CNY':
            return None
        meta = _metadata(row)
        movement = row.get('movement', meta.get('movement', 'cashflow'))
        if movement not in {'cashflow', 'internal_transfer', 'principal'}:
            return None
        description = _text(row.get('description'))
        if not description:
            return None
        # Refunds are income, but must also stay distinct from normal income.
        refund = _text(row.get('category')) in {'退款', 'refund'}
        return (day, kind, currency, int(amount), movement, refund, description,
                _text(row.get('payment_method', meta.get('payment_method'))))
    except (ValueError, TypeError, KeyError, InvalidOperation):
        return None


def duplicate_evidence(a, b):
    """Return reason keys for a potential repeat, or [] when evidence is insufficient.

    Account identity and import identifiers are deliberately not inferred. A hint
    must be resolved by the caller through an explicit keep/skip decision.
    """
    left, right = _normalized(a), _normalized(b)
    if left is None or right is None or left[:6] != right[:6]:
        return []
    first, second = left[6], right[6]
    if first == second:
        reason = 'description_exact'
    else:
        shorter, longer = sorted((first, second), key=len)
        substantive = shorter not in _GENERIC
        cjk_count = len(re.findall(r'[\u3400-\u9fff]', shorter))
        if substantive and shorter in longer and cjk_count >= 2:
            reason = 'description_substantive_containment'
        elif (substantive and first not in _GENERIC and second not in _GENERIC
              and min(len(first), len(second)) >= 3
              and SequenceMatcher(None, first, second).ratio() >= .75):
            reason = 'description_similar'
        else:
            return []
    reasons = ['same_date', 'same_type', 'same_currency', 'same_amount_minor',
               'same_movement', 'same_refund_semantics', reason]
    if left[7] and left[7] == right[7]:
        reasons.append('same_payment_method')
    return reasons


def candidate_duplicate_hints(rows):
    """Map each later selected row number to earlier candidates with evidence.

    Every input row remains independent, including rows with different external
    import keys. The result is advisory and never modifies the supplied rows.
    """
    earlier, hints = [], {}
    for row in rows:
        if not isinstance(row, dict) or row.get('row') is None or _normalized(row) is None:
            continue
        matches = []
        for prior in earlier:
            reasons = duplicate_evidence(prior, row)
            if reasons:
                matches.append({'row': prior['row'], 'reasons': reasons})
        if matches:
            hints[row['row']] = matches
        earlier.append(row)
    return hints
