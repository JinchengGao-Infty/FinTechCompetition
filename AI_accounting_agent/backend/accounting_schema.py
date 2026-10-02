"""Shared categories and extraction contract used by training and the API."""
EXPENSE_CATEGORIES = ["餐饮", "出行", "购物", "生活缴费", "娱乐", "住房", "医疗健康", "教育学习", "保险", "人情往来", "旅行", "其他"]
INCOME_CATEGORIES = ["工资", "奖金", "副业", "理财收益", "退款", "其他收入"]


def explicit_payment(text):
    """Normalize only payment methods explicitly present in the user's text."""
    aliases = {"微信支付": ["微信"], "支付宝": ["支付宝"], "银行卡": ["银行卡", "银行转账"],
               "信用卡": ["信用卡"], "现金": ["现金"]}
    methods = [name for name, words in aliases.items() if any(word in text for word in words)]
    return methods[0] if len(methods) == 1 else "其他" if methods else ""


def extraction_prompt(reference_date):
    return (
        f"今天是 {reference_date}。提取用户描述中的一笔账单，只输出 JSON。"
        "字段：event_date(YYYY-MM-DD), category, type(expense/income), amount(正数，最多两位小数), "
        "currency(CNY), description(简短保留用途), payment_method(未说明则空字符串)。"
        f"支出分类：{'/'.join(EXPENSE_CATEGORIES)}。收入分类：{'/'.join(INCOME_CATEGORIES)}。"
        "只依据输入，不编造金额、日期或支付方式；未说明日期按今天。退款按现金流计为收入/退款，不计为工资或理财收益。"
        "内部转账、借款本金、投资本金买卖和信用卡还款不直接计为收支，返回"
        '{"needs_clarification":true,"reason":"说明需要核对的信息"}。'
        "缺金额、多笔交易、无法确定币种或日期时也返回 needs_clarification 和 reason，等待确认，不自动入账。"
    )
