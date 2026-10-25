import concurrent.futures, hashlib, json
import fitz
from fetch_current import ROOT,get,savejson,now
EXTRA={
'601288':('农业银行2026年半年度报告（A股）','https://www.abchina.com/cn/aboutabc/investor_relations/report/mm/202608/P020260924668950211207.pdf'),
'601398':('工商银行2026年半年度报告（A股）','https://v.icbc.com.cn/userfiles/resources/icbcltd/download/2026/InterimReportA20260924.pdf'),
'601628':('中国人寿2026年半年度报告摘要','https://static.cninfo.com.cn/finalpage/2026-08-27/1225519054.PDF'),
'601988':('中国银行2026年半年度报告（A股）','https://pic.bankofchina.com/bocappd/report/202608/P020260828605977184329.pdf')}
def finalize(x):
    for d in x['disclosures']:
        d['document_form']='full_report_pdf' if d.get('local_file','').endswith('.pdf') else 'official_landing_page'
        if not d.get('stock_identity_verified'):
            d['download_status']='invalid_response';d['error']='Server returned HTML rather than requested company PDF; not a verified disclosure.'
    if x['symbol'] in EXTRA:
        title,url=EXTRA[x['symbol']]; d={'type':'company_disclosure','title':title,'url':url,'retrieved_at_utc':now(),'document_form':'report_summary_pdf' if x['symbol']=='601628' else 'full_report_pdf'}
        try:
            raw=get(url);assert raw.startswith(b'%PDF'),'Not a PDF';f=ROOT/x['symbol']/'company-verified.pdf';f.write_bytes(raw)
            pdf=fitz.open(f);text='\n'.join(pdf[i].get_text() for i in range(min(5,len(pdf))))
            d.update(download_status='ok',local_file=f'{x["symbol"]}/{f.name}',sha256=hashlib.sha256(raw).hexdigest(),stock_identity_verified=x['symbol'] in text or x['name'] in text,pdf_pages=len(pdf))
        except Exception as e: d.update(download_status='failed',error=str(e))
        x['disclosures'].append(d)
    savejson(ROOT/x['symbol']/'metadata.json',x);print(x['symbol'],[(d['download_status'],d.get('stock_identity_verified')) for d in x['disclosures']],flush=True)
    return x
if __name__=='__main__':
    m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:m['stocks']=list(p.map(finalize,m['stocks']))
    savejson(ROOT/'manifest.json',m)
    savejson(ROOT/'research-index.json',[dict(symbol=x['symbol'],name=x['name'],research=x['research'],disclosures=x['disclosures']) for x in m['stocks']])
    checks={'verified_at_utc':now(),'stocks':len(m['stocks']),'daily_bars':sum(x['bars'] for x in m['stocks']),'all_latest_20261023':all(x['last_trade_date']=='2026-10-23' for x in m['stocks']),'all_yahoo_ohlc_match':all(x['crosscheck'].get('OHLC_match') for x in m['stocks']),'research_metadata_count':sum(len(x['research']) for x in m['stocks']),'broker_pdfs_verified':sum(d.get('stock_identity_verified',False) for x in m['stocks'] for d in x['research'] if d['type']=='broker_research'),'company_pdfs_verified':sum(d.get('stock_identity_verified',False) for x in m['stocks'] for d in x['disclosures'] if d.get('local_file','').endswith('.pdf'))}
    savejson(ROOT/'validation.json',checks)
    files={str(f.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in ROOT.rglob('*') if f.is_file() and f.name!='SHA256SUMS.json' and '__pycache__' not in str(f)}
    savejson(ROOT/'SHA256SUMS.json',files)
    print(json.dumps(checks),flush=True)
