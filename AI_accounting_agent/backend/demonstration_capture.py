"""User-requested fixed recognition fixtures; no speech/OCR or bank access."""
VERSION='fixed-capture-20261025-v1'
def fixed_recognition_row(kind):
    if kind not in ('image','voice'):raise ValueError('Unknown fixed recognition mode')
    receipt=kind=='image'
    row={'row':1,'event_date':'2026-10-25','type':'expense','amount':'64.00' if receipt else '32.00',
         'category':'餐饮','description':'麦当劳' if receipt else '午餐',
         'currency':'CNY','movement':'cashflow','payment_method':'支付宝余额' if receipt else '微信支付',
         'enabled':True,'errors':[],
         'evidence':{'adapter':VERSION,'fixed_result':True,'kind':kind,
                     'text':'今天在麦当劳消费64元，支付宝余额支付。' if receipt else '今天午餐32元，微信支付。'}}
    row['origin']={k:row[k] for k in ('event_date','type','amount','category','description','payment_method')}
    return row
