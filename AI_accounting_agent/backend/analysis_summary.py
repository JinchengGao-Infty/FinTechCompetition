"""Read-only, interval-consistent ledger analytics. All monetary outputs are cents.

The DB adapter must return original bill IDs, amount strings and metadata. Refund
links use metadata.refund_of_bill_id; category names never imply a link.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import json


def _date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _minor(value):
    try:
        amount = Decimal(str(value))
        cents = amount * 100
        if not amount.is_finite() or cents != cents.to_integral_value() or amount < 0:
            raise ValueError('amount must be nonnegative with at most two decimal places')
        return int(cents)
    except (InvalidOperation, TypeError) as error:
        raise ValueError('invalid amount') from error


def _metadata(row):
    value = row.get('metadata') or {}
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            value = {}
    return value if isinstance(value, dict) else {}


def _totals():
    return dict.fromkeys(('gross_income_minor', 'refund_minor', 'gross_expense_minor',
                          'net_expense_minor', 'net_cashflow_minor'), 0)


def _finish(totals):
    totals['net_expense_minor'] = totals['gross_expense_minor'] - totals['refund_minor']
    totals['net_cashflow_minor'] = totals['gross_income_minor'] - totals['net_expense_minor']


def build_analysis_summary(rows, start_date, end_date, *, granularity='day', currency='CNY'):
    """Build one inclusive period. Invalid periods/amounts raise ValueError.

    Out-of-period and other-currency rows are excluded before aggregation. Refund
    attribution requires an explicit link to an operational expense in the input;
    the expense may be outside the selected period. Donut values remain gross.
    """
    start, end = _date(start_date), _date(end_date)
    if start > end or (end - start).days > 3660:
        raise ValueError('period must be ordered and no longer than 3661 days')
    if granularity not in {'day', 'month'}:
        raise ValueError('granularity must be day or month')
    rows = [dict(row) for row in rows]
    originals = {str(row['id']): row for row in rows if row.get('id') is not None}
    totals, expenses, incomes, trends = _totals(), {}, {}, {}
    excluded = {kind: {'income_minor': 0, 'expense_minor': 0, 'bill_ids': []}
                for kind in ('internal_transfer', 'principal')}
    refunds = {'attributed_minor': 0, 'unmatched_minor': 0, 'bill_ids': [], 'items': []}
    bill_ids, operational_ids = [], []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat() if granularity == 'day' else cursor.strftime('%Y-%m')
        trends.setdefault(key, {'period': key, **_totals(), 'bill_ids': []})
        cursor += timedelta(days=1)
    for row in rows:
        if row.get('currency', 'CNY') != currency or not start <= _date(row['event_date']) <= end:
            continue
        if row.get('id') is None:
            raise ValueError('bill ID is required for drilldown')
        identifier = row['id']
        if identifier in bill_ids:
            raise ValueError('duplicate bill ID')
        kind = row['type']
        if kind not in {'income', 'expense'}:
            raise ValueError('bill type must be income or expense')
        amount, meta = _minor(row['amount']), _metadata(row)
        bill_ids.append(identifier)
        movement = meta.get('movement', row.get('movement', 'cashflow'))
        if movement in excluded:
            excluded[movement][kind + '_minor'] += amount
            excluded[movement]['bill_ids'].append(identifier)
            continue
        operational_ids.append(identifier)
        day = _date(row['event_date'])
        key = day.isoformat() if granularity == 'day' else day.strftime('%Y-%m')
        bucket = trends[key]
        bucket['bill_ids'].append(identifier)
        is_refund = kind == 'income' and row.get('category') in {'退款', 'refund'}
        metric = 'refund_minor' if is_refund else 'gross_' + kind + '_minor'
        totals[metric] += amount
        bucket[metric] += amount
        if is_refund:
            original = originals.get(str(meta.get('refund_of_bill_id')))
            linked = (original is not None and original.get('type') == 'expense'
                      and original.get('currency', 'CNY') == currency
                      and _metadata(original).get('movement', original.get('movement', 'cashflow'))
                      not in excluded)
            refunds['attributed_minor' if linked else 'unmatched_minor'] += amount
            refunds['bill_ids'].append(identifier)
            refunds['items'].append({'bill_id': identifier, 'amount_minor': amount,
                'original_bill_id': original['id'] if linked else None,
                'category': original.get('category') if linked else None})
            continue
        categories = incomes if kind == 'income' else expenses
        category = row.get('category') or '未分类'
        item = categories.setdefault(category, {'category': category, 'amount_minor': 0, 'bill_ids': []})
        item['amount_minor'] += amount
        item['bill_ids'].append(identifier)
    _finish(totals)
    for bucket in trends.values():
        _finish(bucket)
    return {'state': 'ready' if bill_ids else 'empty',
        'period': {'start_date': start.isoformat(), 'end_date': end.isoformat(), 'inclusive': True},
        'currency': currency, 'totals': totals, 'bill_ids': bill_ids,
        'operational_bill_ids': operational_ids, 'excluded_movements': excluded, 'refunds': refunds,
        'expense_categories': sorted(expenses.values(), key=lambda x: (-x['amount_minor'], x['category'])),
        'income_categories': sorted(incomes.values(), key=lambda x: (-x['amount_minor'], x['category'])),
        'trend': list(trends.values()), 'metadata': {'amount_unit': 'minor', 'minor_scale': 100,
        'granularity': granularity, 'donut_basis': 'gross_expense',
        'refund_attribution': 'explicit_refund_of_bill_id_only',
        'cashflow_basis': 'gross_income_minus_gross_expense_plus_refunds',
        'excluded_movement_types': ['internal_transfer', 'principal']}}


def analysis_from_book_db(fetch_rows, start_date, end_date, **options):
    """Adapt a read-only bookDB callback accepting inclusive start/end dates."""
    start, end = _date(start_date), _date(end_date)
    # Validate before calling the database, including invalid range/granularity.
    build_analysis_summary([], start, end, **options)
    return build_analysis_summary(fetch_rows(start, end), start, end, **options)
