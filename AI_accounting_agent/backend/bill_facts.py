"""Deterministic, auditable facts from the current ledger (never a bank balance).

Amounts are integer CNY cents. Expense totals are gross recorded expenses;
refunds are separate and net = income + refunds - expenses. No LLM arithmetic.
"""
from __future__ import annotations

import calendar
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from accounting_schema import EXPENSE_CATEGORIES, INCOME_CATEGORIES

EVIDENCE_LIMIT = 100
_MONTH = re.compile(r"(?:(?P<year>\d{4})年\s*)?(?P<month>\d{1,2})月|(?P<relative>本月|这个月|当月|上个月|上月|上上个月|上上月)")
_COMPARE = re.compile(r"比较|对比|相比|比起|环比|(?<!货)比(?!例|重)|相较")
# Unsupported date expressions must not silently become the current month.
_UNSUPPORTED = re.compile(
    r"今年|去年|前年|明年|年度|全年|季度|半年|周|星期|今天|今日|昨天|昨日|前天|明天|"
    r"最近|近期|近\s*[\d一二三四五六七八九十]+|过去|本年度|本年|本季度|月初|月底|月末|"
    r"上旬|中旬|下旬|截止|截至|至今|以来|\d{1,2}[日号]|"
    r"[一二三四五六七八九十正腊]+月|\d{4}[-/.]\d{1,2}|"
    r"\d{4}年(?!\s*\d{1,2}月)|\d+个?月(?:内|以来|期间)|每月|逐月|月均|月度趋势|年度报告"
)
_CATEGORY_ALIASES = {
    "餐费": "餐饮", "吃饭": "餐饮", "饭钱": "餐饮", "交通": "出行",
    "房租": "住房", "水电": "生活缴费", "医疗": "医疗健康", "教育": "教育学习",
}
_SCOPE_NOTE = "口径：当前账本人民币记录；不代表完整银行流水或实际账户余额，模拟银行资金不并入日常流水。"
_INFLOW = re.compile(r"收入|进来(?:的)?钱|进账|收进|收到的钱|挣(?:来|到)?(?:的)?钱|赚(?:来|到)?(?:的)?钱")
_OUTFLOW = re.compile(r"支出|消费|花(?:了|掉|出去)?(?:的)?钱|花掉的|开销|付出去")
_TO_DATE = re.compile(r"到现在|到目前(?:为止)?|(?:截至|截止)(?:今天|今日|目前|现在)|(?:到|至)(?:今天|今日)|至今|迄今|以来|目前为止")


def is_cashflow_query(query: str) -> bool:
    """Recognize paired everyday inflow/outflow concepts, not account balance."""
    return bool(_INFLOW.search(query) and _OUTFLOW.search(query))


def _requested_metric(query: str, category: str | None) -> str:
    if is_cashflow_query(query) or re.search(r"收支|净流入|净收入|净额|结余", query):
        return 'net'
    if category == '退款' or re.search(r"退款", query) and not re.search(r"不含|不包括|排除", query):
        return 'refund'
    if _INFLOW.search(query):
        return 'income'
    if _OUTFLOW.search(query) or category in EXPENSE_CATEGORIES:
        return 'expense'
    return 'income' if category in INCOME_CATEGORIES else 'net'


def _month_start(year: int, month: int) -> date:
    if not 1 <= year <= 9999 or not 1 <= month <= 12:
        raise ValueError("年份或月份无效，请使用有效年份和 1—12 月。")
    return date(year, month, 1)


def _shift_month(day: date, offset: int) -> date:
    index = day.year * 12 + day.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def _period(start: date) -> dict:
    return {"start_date": start.isoformat(),
            "end_date": date(start.year, start.month, calendar.monthrange(start.year, start.month)[1]).isoformat()}


def _resolve_month(match, reference: date, *, comparison_anchor: date | None = None) -> date:
    relative = match.group("relative")
    if relative:
        if relative in {"本月", "这个月", "当月"}:
            return reference.replace(day=1)
        anchor = comparison_anchor or reference
        return _shift_month(anchor, -2 if "上上" in relative else -1)
    # Without a year, use the explicitly stated primary year for comparisons,
    # otherwise the calendar reference year. Both years are displayed to users.
    return _month_start(int(match.group("year") or (comparison_anchor or reference).year), int(match.group("month")))


def _parse_periods(query: str, reference: date):
    to_date = bool(_TO_DATE.search(query))
    if to_date:
        # Only a single current month has an unambiguous month-to-date meaning.
        # Never turn a historical/missing start or a comparison into this month.
        months = list(_MONTH.finditer(query))
        if len(months) != 1 or _resolve_month(months[0], reference) != reference.replace(day=1) or _COMPARE.search(query):
            raise ValueError("截至当前日期的查询请明确为本月至今；其他起始期间或比较暂需单独查询。")
        query = _TO_DATE.sub('', query)
    if _UNSUPPORTED.search(query):
        raise ValueError("当前事实查询支持单个自然月及两个月比较，请明确为例如“2026年9月”或“9月与8月比较”。")
    matches = list(_MONTH.finditer(query))
    remaining = _MONTH.sub("", query).replace("月度报告", "").replace("月报", "")
    if re.search(r"月|年|日|\d{4}[-/]", remaining):
        # 日常/日常账单 are scope words, not date requests.
        remaining = remaining.replace("日常", "").replace("生日", "")
        if re.search(r"月|年|日|\d{4}[-/]", remaining):
            raise ValueError("期间表述尚不明确，请给出一个自然月，或明确要比较的两个月。")
    compare = bool(_COMPARE.search(query))
    defaulted = False
    if len(matches) > 2:
        raise ValueError("一次支持一个月或两个月比较，请明确本次要查询的月份。")
    if len(matches) == 2:
        if not compare or re.search(r"到|至|—|~|～", query[matches[0].end():matches[1].start()]):
            raise ValueError("检测到多个或连续月份，请明确查询单月，或使用“两个月比较”的表述。")
        primary = _resolve_month(matches[0], reference)
        other = _resolve_month(matches[1], reference, comparison_anchor=primary)
    elif len(matches) == 1:
        match = matches[0]
        # “与8月相比” omits the primary month: explicitly default it to now.
        prefix = query[:match.start()]
        comparison_only = compare and bool(re.search(r"(?:与|和|跟|比|相较于|相比于)\s*$", prefix))
        if comparison_only:
            primary = reference.replace(day=1)
            other = _resolve_month(match, reference, comparison_anchor=primary)
            defaulted = True
        else:
            primary = _resolve_month(match, reference)
            other = _shift_month(primary, -1) if "环比" in query else None
            if compare and other is None:
                raise ValueError("请补充要比较的另一月份，例如“9月与8月比较”。")
    elif compare:
        if "环比" not in query:
            raise ValueError("请明确要比较的月份，例如“本月与上月比较”。")
        primary, other, defaulted = reference.replace(day=1), _shift_month(reference, -1), True
    else:
        primary, other, defaulted = reference.replace(day=1), None, True
    if other is not None and primary == other:
        raise ValueError("两个比较期间相同，请明确要比较的另一月份。")
    period = _period(primary)
    if to_date:
        period['end_date'] = reference.isoformat()
    return period, _period(other) if other is not None else None, defaulted


def _category(query: str) -> str | None:
    query = re.sub(r"(?:不含|不包括|排除)退款", "", query)
    if re.search(r"商户|门店|星巴克|咖啡|奶茶|外卖|淘宝|京东|支付宝|微信支付", query):
        raise ValueError("当前事实查询支持账本分类，尚不支持商户或支付渠道筛选；请确认分类后查询。")
    names = {name: name for name in EXPENSE_CATEGORIES + INCOME_CATEGORIES}
    names.update(_CATEGORY_ALIASES)
    pattern = "|".join(re.escape(x) for x in sorted(names, key=len, reverse=True))
    found = {names[match.group()] for match in re.finditer(pattern, query)}
    if len(found) > 1:
        raise ValueError("一次按一个账本分类核对，请明确分类或查询整体收支。")
    return next(iter(found), None)


def _totals() -> dict:
    return {"income_minor": 0, "expense_minor": 0, "refund_minor": 0, "net_minor": 0}


def _amount(value) -> int:
    amount = Decimal(str(value))
    if not amount.is_finite() or amount <= 0:
        raise ValueError("invalid amount")
    cents = int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if cents <= 0 or cents > 10**16:
        raise ValueError("invalid amount")
    return cents


def _row_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _metadata(value) -> dict:
    if value is None or value == "":
        return {}
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise ValueError("invalid metadata")
    return value


def _in_period(day: str, period: dict | None) -> bool:
    return bool(period and period["start_date"] <= day <= period["end_date"])


def _money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    return f"{sign}{abs(cents) // 100:,}.{abs(cents) % 100:02d}"


def _summary(totals: dict) -> str:
    return (f"收入（不含退款）{_money(totals['income_minor'])}元，"
            f"支出{_money(totals['expense_minor'])}元，退款{_money(totals['refund_minor'])}元，"
            f"记录净流入{_money(totals['net_minor'])}元")


def build_bill_facts(rows, query: str, reference_date: date | None = None) -> dict:
    """Return ledger facts for a natural month with optional category/comparison.

    ``rows`` is the dictionary list returned by FinanceWorkspace.read_bills().
    ``excluded_count`` counts invalid/non-cashflow/simulation/non-CNY rows;
    valid rows outside the requested period/category are counted separately.
    Evidence contains both periods, marked by ``period_role``, with at most 100
    returned rows. Full aggregates are computed before evidence truncation.
    A missing comparison period never becomes evidence of zero actual spending.
    """
    reference = reference_date or datetime.now(ZoneInfo("Asia/Shanghai")).date()
    result = {
        "status": "ready", "reply": "", "currency": "CNY", "scope": "recorded_ledger",
        "scope_note": _SCOPE_NOTE, "reference_date": reference.isoformat(),
        "period": None, "comparison_period": None, "category": None,
        "totals": _totals(), "comparison": None, "evidence": [],
        "record_count": 0, "excluded_count": 0, "exclusion_reasons": {},
        "out_of_period_count": 0, "category_filtered_count": 0,
        "evidence_count": 0, "evidence_returned_count": 0, "evidence_truncated": False,
        "evidence_limit": EVIDENCE_LIMIT, "period_defaulted": False,
    }
    try:
        if not isinstance(query, str) or not query.strip():
            raise ValueError("请说明要查询的账单内容和月份。")
        period, other, defaulted = _parse_periods(query, reference)
        result.update(period=period, comparison_period=other, period_defaulted=defaulted)
    except (ValueError, OverflowError) as error:
        result.update(status="needs_clarification", missing_slots=["period"],
                      reply=f"需要确认查询期间：{error} {_SCOPE_NOTE}")
        return result
    try:
        result["category"] = category = _category(query)
    except ValueError as error:
        result.update(status="needs_clarification", missing_slots=["category"],
                      reply=f"需要确认账单分类：{error} {_SCOPE_NOTE}")
        return result

    result['requested_metric'] = _requested_metric(query, category)

    comparison_totals = _totals()
    comparison_count = 0
    demo_count = 0
    evidence = []
    counts = result["exclusion_reasons"]
    def exclude(reason):
        result["excluded_count"] += 1
        counts[reason] = counts.get(reason, 0) + 1

    for index, original in enumerate(rows):
        try:
            row = dict(original)
            day = _row_date(row.get("event_date")).isoformat()
            metadata = _metadata(row.get("metadata"))
            movement = metadata.get("movement", row.get("movement", "cashflow"))
            if movement in {"internal_transfer", "principal", "内部划转", "本金划转"}:
                exclude("internal_or_principal_transfer")
                continue
            if movement not in {"cashflow", "收支", None, ""}:
                exclude("unknown_movement")
                continue
            source = str(row.get("source") or "").lower()
            if source.startswith(("simulated_bank", "mock_bank", "simulation")) or any(
                metadata.get(key) in {"simulated_bank", "mock_bank", "simulation"}
                for key in ("mode", "source", "ledger", "scope")
            ):
                exclude("simulated_bank_funds")
                continue
            if str(row.get("currency", "")).upper() not in {"CNY", "RMB", "人民币", "元"}:
                exclude("unsupported_currency")
                continue
            kind = row.get("type")
            if kind not in {"income", "expense"}:
                raise ValueError("invalid direction")
            amount = _amount(row.get("amount"))
            row_category = str(row.get("category") or "")
            if not row_category or (row_category == "退款" and kind != "income"):
                raise ValueError("invalid category")
            role = "primary" if _in_period(day, period) else "comparison" if _in_period(day, other) else None
            if role is None:
                result["out_of_period_count"] += 1
                continue
            if category and row_category != category:
                result["category_filtered_count"] += 1
                continue
            totals = result["totals"] if role == "primary" else comparison_totals
            amount_key = "refund_minor" if row_category == "退款" else "income_minor" if kind == "income" else "expense_minor"
            totals[amount_key] += amount
            if role == "primary":
                result["record_count"] += 1
            else:
                comparison_count += 1
            evidence.append({"id": row.get("id", f"row-{index + 1}"), "event_date": day,
                             "amount_minor": amount, "currency": "CNY", "type": kind,
                             "category": row_category, "description": str(row.get("description") or ""),
                             "source": str(row.get("source") or ""),
                             "period_role": role, "accounting_role": amount_key.removesuffix("_minor"),
                             "id_is_synthetic": "id" not in row})
            if source.startswith("synthetic") or source == "jsonl":
                demo_count += 1
        except (TypeError, ValueError, InvalidOperation, OverflowError):
            exclude("invalid_record")

    for totals in (result["totals"], comparison_totals):
        totals["net_minor"] = totals["income_minor"] + totals["refund_minor"] - totals["expense_minor"]
    evidence.sort(key=lambda item: (item["event_date"], str(item["id"])), reverse=True)
    result.update(evidence=evidence[:EVIDENCE_LIMIT], evidence_count=len(evidence),
                  evidence_returned_count=min(len(evidence), EVIDENCE_LIMIT),
                  evidence_truncated=len(evidence) > EVIDENCE_LIMIT,
                  period_incomplete=period["start_date"] <= reference.isoformat() < period["end_date"])
    result["demo_record_count"] = demo_count
    if demo_count:
        result["scope"] = "demo_ledger_records" if demo_count == len(evidence) else "mixed_ledger_records"
        result["scope_note"] = "本次匹配记录含演示数据。" + _SCOPE_NOTE
    prefix = f"未指定查询月份，按本月（{period['start_date']}至{period['end_date']}）统计。" if defaulted else ""
    label = f"{period['start_date']}至{period['end_date']}" + (f" · {category}" if category else "")
    if result["record_count"]:
        reply = f"{prefix}{label}，账本已记录{result['record_count']}笔：{_summary(result['totals'])}。"
    else:
        result["status"] = "no_records"
        reply = f"{prefix}{label}，当前账本没有符合口径的记录；无法据此认定实际花费或收入为零。"
    if other:
        has_both = bool(result["record_count"] and comparison_count)
        delta = result["totals"]["expense_minor"] - comparison_totals["expense_minor"] if has_both else None
        result["comparison"] = {**comparison_totals, "expense_delta_minor": delta,
                                "record_count": comparison_count, "status": "ready" if comparison_count else "no_records"}
        if comparison_count:
            reply += f"对比期间{other['start_date']}至{other['end_date']}已记录{comparison_count}笔：{_summary(comparison_totals)}。"
        else:
            reply += f"对比期间{other['start_date']}至{other['end_date']}暂无符合口径的账本记录。"
        if has_both:
            reply += f"两期间已记录支出差额（本期减对比期）{_money(delta)}元；该差额不含退款抵扣。"
        else:
            reply += "至少一个期间无记录，暂不计算消费增减，不能将缺失记录当成零消费。"
    if result["period_incomplete"]:
        reply += "本月尚未结束，以上仅为已录入记录。"
    if result["excluded_count"]:
        reply += f"已排除{result['excluded_count']}条内部/本金划转、模拟资金、非人民币或无效记录（原因可核对）。"
    if result["evidence_truncated"]:
        reply += f"证据展示前{EVIDENCE_LIMIT}条，金额统计包含全部{len(evidence)}条匹配记录。"
    result["reply"] = reply + result["scope_note"]
    return result
