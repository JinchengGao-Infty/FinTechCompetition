"""Read-only public market/research acquisition. No account, proxy or TLS changes."""
import concurrent.futures, csv, datetime, hashlib, io, json, pathlib, urllib.request, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
STOCKS = {'600036':'招商银行','600519':'贵州茅台','600900':'长江电力','601088':'中国神华','601138':'工业富联','601288':'农业银行','601398':'工商银行','601628':'中国人寿','601857':'中国石油','601988':'中国银行'}
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':'https://data.eastmoney.com/'})
    with urllib.request.urlopen(req, timeout=25) as r: return r.read()
def savejson(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def stock(code,name):
    folder=ROOT/code; folder.mkdir(parents=True,exist_ok=True)
    item={'symbol':code,'name':name,'exchange':'SSE','retrieved_at_utc':now(),'gaps':[],'research':[]}
    url=f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},day,,,250,qfq'
    item['kline_source_url']=url
    try:
        raw=get(url); (folder/'tencent_raw.json').write_bytes(raw)
        obj=json.loads(raw); data=obj['data']['sh'+code]; key='qfqday' if 'qfqday' in data else 'day'
        rows=[]
        for v in data[key]:
            d,o,c,h,l,vol=v[:6]
            row={'date':d,'open':float(o),'high':float(h),'low':float(l),'close':float(c),'volume_lots':float(vol),'volume':round(float(vol)*100)}
            if not row['low']<=min(row['open'],row['close'])<=max(row['open'],row['close'])<=row['high']: raise ValueError('OHLC invariant failed '+d)
            rows.append(row)
        rows=sorted(rows,key=lambda x:x['date'])
        if len({r['date'] for r in rows})!=len(rows): raise ValueError('duplicate dates')
        if any(r['date']>'2026-10-24' for r in rows): raise ValueError('future bar')
        item.update({'kline_status':'ok','bars':len(rows),'first_trade_date':rows[0]['date'],'last_trade_date':rows[-1]['date'],'latest':rows[-1],'adjustment':'forward-adjusted (qfq)' if key=='qfqday' else 'unadjusted','units':{'OHLC':'CNY/share','volume_lots':'100 shares/lot','volume':'shares'}})
        savejson(folder/'daily.json',rows)
        with (folder/'daily.csv').open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
        if rows[-1]['date']!='2026-10-23': item['gaps'].append('Last bar differs from expected last session 2026-10-23; do not claim current.')
    except Exception as e: item.update(kline_status='failed'); item['gaps'].append('Kline: '+str(e))
    rurl='https://reportapi.eastmoney.com/report/list?'+urllib.parse.urlencode({'code':code,'qType':0,'beginTime':'2026-07-01','endTime':'2026-10-24','pageSize':3,'pageNo':1})
    item['research_api_url']=rurl
    try:
        raw=get(rurl);(folder/'eastmoney_research_raw.json').write_bytes(raw); reports=json.loads(raw).get('data',[])
        for report in reports[:3]:
            info=report.get('infoCode'); doc={'type':'broker_research','title':report.get('title'),'publisher':report.get('orgSName'),'published_at':report.get('publishDate'),'info_code':info,'source_url':rurl,'retrieved_at_utc':now()}
            if info: doc['url']=f'https://pdf.dfcfw.com/pdf/H3_{info}_1.pdf'
            item['research'].append(doc)
        if not reports: item['gaps'].append('No recent broker research returned by public API.')
        for doc in item['research'][:1]:
            try:
                raw=get(doc['url'])
                if not raw.startswith(b'%PDF'): raise ValueError('not PDF')
                file=folder/'research-latest.pdf';file.write_bytes(raw);doc.update(local_file=f'{code}/{file.name}',sha256=hashlib.sha256(raw).hexdigest(),download_status='ok')
            except Exception as e: doc.update(download_status='failed',error=str(e))
    except Exception as e: item['gaps'].append('Research API: '+str(e))
    savejson(folder/'metadata.json',item)
    print(code,item.get('last_trade_date'),item.get('bars'),len(item['research']),item['gaps'],flush=True)
    return item
if __name__=='__main__':
    ROOT.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: items=list(pool.map(lambda p:stock(*p),STOCKS.items()))
    savejson(ROOT/'manifest.json',{'generated_at_utc':now(),'expected_last_session':'2026-10-23','purpose':'Public research data; demonstration holdings are separate simulated records.','stocks':items})
    savejson(ROOT/'quotes.json',[{k:v for k,v in x.items() if k in ['symbol','name','last_trade_date','latest','kline_status','adjustment','units','kline_source_url','retrieved_at_utc','gaps']} for x in items])
