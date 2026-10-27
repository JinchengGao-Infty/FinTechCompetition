"""Verified downloaded market references, separate from synthetic positions.

No network calls or freshness overrides. Weekend closing references are not
labelled as a fresh personal-valuation quote by PersonalPositionStore.
"""
from pathlib import Path
from decimal import Decimal,ROUND_HALF_UP
import json,math

class MarketReference:
    def __init__(self,root):
        self.root=Path(root)
        self.quotes={r['symbol']:r for r in json.loads((self.root/'quotes.json').read_text(encoding='utf8'))}
        self.research={r['symbol']:r for r in json.loads((self.root/'research-index.json').read_text(encoding='utf8'))}
    def history(self,code,days=90):
        if code not in self.quotes:raise KeyError(code)
        rows=json.loads((self.root/code/'daily.json').read_text(encoding='utf8'))
        return rows[-max(1,min(250,int(days))):]
    def quote(self,code):
        record=self.quotes[code];latest=record['latest'];rows=self.history(code,2)
        previous=rows[-2]['close'] if len(rows)>1 else None
        return {'price':latest['close'],'change_pct':(latest['close']/previous-1)*100 if previous else None,
                'as_of':record['last_trade_date'],'status':'verified' if record.get('crosscheck',{}).get('OHLC_match') else 'partial',
                'currency':'CNY','source':'腾讯财经（前复权收盘）','source_url':record['kline_source_url'],
                'retrieved_at':record['retrieved_at_utc'],'adjustment':'qfq','volume_note':'腾讯成交量为整数手换算的近似股数'}
    def quality(self,code):
        rows=self.history(code,250);q=self.quote(code)
        return {'status':q['status'],'state':q['status'],'accepted':len(rows),'excluded':0,'latest_valid_date':rows[-1]['date'],
                'source':q['source'],'source_url':q['source_url'],'adjustment':'qfq','gaps':self.quotes[code].get('gaps',[])}
    def news(self,code):
        item=self.research[code]
        def normalize(r):return {**r,'日期':r.get('published_at','')[:10],'source':r.get('publisher') or '公司公开披露','content_kind':r['type']}
        return {'news':[normalize(r) for r in item.get('disclosures',[]) if r.get('download_status')=='ok'],
                'reports':[normalize(r) for r in item.get('research',[])],
                'as_of':self.quotes[code]['last_trade_date']}
    def watchlist(self):
        return [{'code':code,'name':r['name'],'quality':self.quality(code),'quote':self.quote(code),
                 'reports':self.news(code)['reports']} for code,r in self.quotes.items()]
    def closing_portfolio(self,store):
        result=store.portfolio()  # Preserve its strict fresh-quote contract.
        total=Decimal(0);complete=bool(result['holdings']);dates=[]
        for h in result['holdings']:
            q=self.quote(h['code']) if h['code'] in self.quotes else None
            if not q or q['status']!='verified':complete=False;continue
            price=Decimal(str(q['price']));cost=Decimal(h['total_cost']);value=(price*Decimal(h['quantity'])).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
            h.update(current_price=str(price),quote_price=str(price),market_value=str(value),pnl=str(value-cost),
                     pnl_pct=str((value-cost)/cost*100) if cost else None,quote_as_of=q['as_of'],
                     quote_quality='reference_close',quote_source=q['source'],source='synthetic_holdings_v1')
            total+=value;dates.append(q['as_of'])
        cost=Decimal(result['total_cost'])
        result.update(market_value=str(total) if complete else None,pnl=str(total-cost) if complete else None,
                      pnl_pct=str((total-cost)/cost*100) if complete and cost else None,
                      quote_quality='reference_close' if complete else 'incomplete',quote_as_of=min(dates) if dates else None,
                      quote_source='腾讯财经（前复权收盘），Yahoo OHLC交叉核验',
                      data_provenance='持仓为合成数据，成本用于演示；参考行情截至2026-10-23，为前复权收盘价，不是实时估值。')
        return result
