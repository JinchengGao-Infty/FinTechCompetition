import concurrent.futures, datetime, hashlib, json, pathlib, urllib.parse
import fitz
from fetch_current import ROOT, get, savejson, now

DISCLOSURES={
'600036':'https://static.cninfo.com.cn/finalpage/2026-08-28/1225531453.PDF',
'600519':'https://static.cninfo.com.cn/finalpage/2026-08-15/1225475868.PDF',
'600900':'https://static.cninfo.com.cn/finalpage/2026-08-31/1225534923.PDF',
'601088':'https://static.cninfo.com.cn/finalpage/2026-08-29/1225531759.PDF',
'601138':'https://static.cninfo.com.cn/finalpage/2026-08-12/1225468066.PDF',
'601288':'https://www.abchina.com/cn/aboutabc/investor_relations/report/mm/202608/t20260828_2658912.htm',
'601398':'https://www.icbc-ltd.com/page/1266821007844429824.html',
'601628':'https://static.sse.com.cn/disclosure/listedinfo/announcement/c/new/2026-08-28/601628_20260828_WB6O.pdf',
'601857':'https://static.cninfo.com.cn/finalpage/2026-08-31/1225535179.PDF',
'601988':'https://www.boc.cn/investor/ir3/202608/t20260828_25688316.html'}

def verify(x):
    code=x['symbol'];folder=ROOT/code
    # API includes one consulting report: classify accurately, then download actual brokerage item.
    for doc in x['research']:
        if '智研' in (doc.get('publisher') or ''): doc['type']='consulting_research'
    if x['research'][0]['type']=='consulting_research' and len(x['research'])>1:
        doc=x['research'][1]
        try:
            raw=get(doc['url']); assert raw.startswith(b'%PDF'); f=folder/'broker-research.pdf';f.write_bytes(raw)
            doc.update(local_file=f'{code}/{f.name}',download_status='ok',sha256=hashlib.sha256(raw).hexdigest())
        except Exception as e: doc.update(download_status='failed',error=str(e))
    for doc in x['research']:
        if doc.get('local_file'):
            pdf=fitz.open(ROOT/doc['local_file']); text='\n'.join(pdf[i].get_text() for i in range(min(3,len(pdf))))
            doc.update(pdf_pages=len(pdf),stock_identity_verified=(code in text or x['name'] in text),verification='PDF first three pages contain code or company name')
            # Keep only identity evidence, not excessive extracted report reproduction.
            doc['identity_evidence']=code if code in text else x['name'] if x['name'] in text else None
    doc={'type':'company_disclosure','title':x['name']+'2026年半年度报告','url':DISCLOSURES[code],'retrieved_at_utc':now()}
    try:
        raw=get(doc['url']); f=folder/('company-disclosure.pdf' if raw.startswith(b'%PDF') else 'company-disclosure.html');f.write_bytes(raw)
        doc.update(download_status='ok',local_file=f'{code}/{f.name}',sha256=hashlib.sha256(raw).hexdigest())
        if raw.startswith(b'%PDF'):
            pdf=fitz.open(f); text='\n'.join(pdf[i].get_text() for i in range(min(5,len(pdf))))
            doc.update(stock_identity_verified=code in text or x['name'] in text,pdf_pages=len(pdf))
        else: doc['stock_identity_verified']=x['name'] in raw.decode('utf-8',errors='ignore')
    except Exception as e: doc.update(download_status='failed',error=str(e));x['gaps'].append('Company disclosure: '+str(e))
    x['disclosures']=[doc]
    # Independent public Yahoo daily chart, raw response retained. No vendor values silently overwrite Tencent.
    u=f'https://query1.finance.yahoo.com/v8/finance/chart/{code}.SS?range=5d&interval=1d'
    check={'source_url':u,'retrieved_at_utc':now()}
    try:
        raw=get(u);(folder/'yahoo_crosscheck_raw.json').write_bytes(raw);o=json.loads(raw)['chart']['result'][0]
        q=o['indicators']['quote'][0];i=len(o['timestamp'])-1;date=datetime.datetime.fromtimestamp(o['timestamp'][i],datetime.timezone.utc).strftime('%Y-%m-%d')
        vals={k:round(q[k][i],4) for k in ('open','high','low','close')};vals['volume']=q['volume'][i]
        check.update(status='ok',last_trade_date=date,values=vals,OHLC_match=all(abs(vals[k]-x['latest'][k])<0.011 for k in ('open','high','low','close')),volume_difference_shares=x['latest']['volume']-vals['volume'])
        if check['volume_difference_shares']: x['gaps'].append('Tencent volume rounded to whole lots; Yahoo exact share volume differs by '+str(check['volume_difference_shares'])+' shares on latest date.')
    except Exception as e: check.update(status='failed',error=str(e)); x['gaps'].append('Independent Yahoo crosscheck: '+str(e))
    x['crosscheck']=check
    savejson(folder/'metadata.json',x)
    print(code,check.get('status'),check.get('OHLC_match'),doc['download_status'],flush=True)
    return x

if __name__=='__main__':
    m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p: m['stocks']=list(p.map(verify,m['stocks']))
    m['verified_at_utc']=now();m['master_verified_sha']='599b6d26cf26f2215946beaf7c60eacd266add10';m['master_source_url']='https://api.github.com/repos/gr-peng/FinTechathon/branches/master'
    savejson(ROOT/'manifest.json',m)
    savejson(ROOT/'quotes.json',[{k:v for k,v in x.items() if k in ['symbol','name','last_trade_date','latest','kline_status','adjustment','units','kline_source_url','retrieved_at_utc','gaps','crosscheck']} for x in m['stocks']])
    savejson(ROOT/'research-index.json',[dict(symbol=x['symbol'],name=x['name'],research=x['research'],disclosures=x['disclosures']) for x in m['stocks']])
