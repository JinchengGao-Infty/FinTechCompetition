"""Local C2 integration harness. Separate SQLite state, never mounts user data.

Uses the application's actual analysis, capture, import and budget stores.
External AI, OCR, quotes and bank execution remain disconnected.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
from datetime import date, datetime
from decimal import Decimal
import argparse, hashlib, json, secrets, sqlite3, sys, threading, os
sys.dont_write_bytecode = True
os.environ['LLM_PROVIDER'] = 'disabled'

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--instance', choices=['candidate', 'test'], required=True)
parser.add_argument('--deps', help='Optional existing FastAPI dependency directory')
parser.add_argument('--port',type=int,default=0)
args = parser.parse_args()
source = root
backend = source / 'AI_accounting_agent/backend'
front = source / 'AI_accounting_agent/frontend/liquid-glass'
sys.path[:0] = [str(backend)] + ([args.deps] if args.deps else [])
os.environ['AI_RESEARCH_DATA_DIR'] = str(backend / 'data')
from fastapi import HTTPException
from analysis_summary import build_analysis_summary
from capture_store import CaptureStore, fingerprint
from budget_store import BudgetStore, BudgetError
from bank_import import parse_csv, decimal_amount
from accounting_schema import EXPENSE_CATEGORIES, INCOME_CATEGORIES
from personal_positions import PersonalPositionStore, PositionConflict
import investment_app
from market_reference import MarketReference
from demonstration_capture import fixed_recognition_row, VERSION as FIXTURE_VERSION
market = MarketReference(backend / 'data/research-current')

instance = root / 'local-state' / ('night-' + args.instance)
instance.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(instance / 'ledger.sqlite3', check_same_thread=False)
db.row_factory = sqlite3.Row
lock = threading.RLock()
db.execute('''CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_date TEXT, category TEXT, type TEXT, amount REAL, currency TEXT,
 description TEXT, source TEXT, metadata TEXT, created_at TEXT)''')
db.execute('CREATE TABLE IF NOT EXISTS environment (key TEXT PRIMARY KEY,value TEXT)')
if not db.execute("SELECT 1 FROM environment WHERE key='initialized'").fetchone():
 db.execute('INSERT INTO bills(event_date,category,type,amount,currency,description,source,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
  ('2026-10-23','餐饮','expense',42,'CNY','晚饭','local_reference',json.dumps({'account_label':'现金','movement':'cashflow'}),datetime.utcnow().isoformat()))
 db.execute("INSERT INTO environment VALUES('initialized','2026-10-24')")
 db.execute("INSERT INTO environment VALUES('cash_minor','5000000')")
 db.commit()

def validate(row):
 result = dict(row)
 try:
  day = date.fromisoformat(str(row['event_date'])[:10])
  if day > date.today(): raise ValueError('日期不能晚于今天')
  amount = decimal_amount(str(row['amount']))
  kind = row['type']
  if kind not in ('income','expense'): raise ValueError('请选择收入或支出')
  if row.get('category') not in (INCOME_CATEGORIES if kind=='income' else EXPENSE_CATEGORIES): raise ValueError('请选择分类')
  if row.get('currency','CNY') != 'CNY': raise ValueError('当前仅支持人民币')
  if not str(row.get('description','')).strip(): raise ValueError('请填写用途')
  movement=row.get('movement',(row.get('metadata') or {}).get('movement','cashflow'))
  if movement not in ('cashflow','internal_transfer','principal'): raise ValueError('资金性质无效')
  result.update(event_date=day.isoformat(),amount=format(amount,'.2f'),currency='CNY',movement=movement,errors=[])
 except (ValueError,KeyError) as error:
  result['errors']=[str(error)]
 return result

def validate_bill(row):
 value=validate(row)
 if value['errors']:raise HTTPException(422,value['errors'][0])
 return value
capture = CaptureStore(db,lock,validate_bill)
budget = BudgetStore(instance / 'budget.sqlite3')
positions = PersonalPositionStore(instance / 'positions.sqlite3')
actor = 'local-n1-fixed-review'
sessions = {}

def rows():
 with lock:
  result=[dict(row) for row in db.execute('SELECT * FROM bills ORDER BY event_date DESC,id DESC')]
 for row in result: row['metadata']=json.loads(row['metadata'] or '{}')
 return result

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw): super().__init__(*a,directory=str(front),**kw)
 def log_message(self,*args): pass
 def reply(self,value,status=200,mime='application/json; charset=utf-8',cookie=None):
  raw=value.encode() if isinstance(value,str) else json.dumps(value,ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store')
  if cookie:self.send_header('Set-Cookie',cookie)
  self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def session(self):
  cookie=dict(part.strip().split('=',1) for part in self.headers.get('Cookie','').split(';') if '=' in part)
  token=cookie.get('finpilot_local_n1_fixed');csrf=sessions.get(token)
  if not csrf: raise HTTPException(401,'请重新打开页面')
  if self.command!='GET':
   if self.headers.get('Origin') != origin or self.headers.get('X-Qingcai-CSRF') != csrf: raise HTTPException(403,'请在当前页面确认操作')
 def payload(self):
  size=int(self.headers.get('Content-Length','0'))
  if size>1500000: raise HTTPException(413,'文件过大')
  return json.loads(self.rfile.read(size) or b'{}')
 def handle_api(self):
  u=urlsplit(self.path);p=u.path;q=parse_qs(u.query);get=lambda k,d='':q.get(k,[d])[0]
  if p=='/runtime-config.js':return self.reply('window.FINTECH_SAME_ORIGIN=true;',mime='application/javascript')
  if p=='/preview-info':return self.reply({'build':'finpilot-night-isolated-fix-20261025','instance':args.instance,'state':'isolated SQLite reference data, not user ledger','external_services':False,'bank_execution':False,'analysis':'application analysis_summary.py','capture':'application CaptureStore','budget':'application BudgetStore','seed':'synthetic 13 calendar months 2025-11 to 2026-11, seed2026110130; no real user ledger'})
  if self.command != 'GET' and ('multipart/form-data' in self.headers.get('Content-Type','').lower() or p in ['/api/book/finance/capture/csv','/api/book/finance/capture/image','/api/book/finance/capture/voice'] or '/position-imports/' in p):
   raise HTTPException(403,'File upload is pending approval and disabled in this isolated non-upload preview')
  if not p.startswith('/api/'):
   if self.command=='GET':return super().do_GET()
   raise HTTPException(405,'此地址不支持写入')
  if p=='/api/book/finance/session' and self.command=='GET':
   token=secrets.token_urlsafe(24);csrf=secrets.token_urlsafe(24);sessions[token]=csrf
   return self.reply({'csrf':csrf,'actor_id':actor},cookie=f'finpilot_local_n1_fixed={token}; Path=/; HttpOnly; SameSite=Strict')
  if p=='/api/book/health' and self.command=='GET':
   data=rows();days=[row['event_date'] for row in data]
   return self.reply({'status':'ok','service':'local-c2','bill_count':len(data),'visible_bill_count':len(data),'ledger_scope':'local','date_range':{'start':min(days) if days else None,'end':max(days) if days else None},'categories':sorted(set(row['category'] for row in data)),'category_schema':{'expense':EXPENSE_CATEGORIES,'income':INCOME_CATEGORIES},'capabilities':{'ocr':False,'voice':False,'fixed_recognition':True,'recognition_mode':'fixed_result_adapter'},'dataset':{'version':'finpilot-ledger-13m-v1','source':'synthetic','seed':2026110130,'start_date':'2025-11-01','end_date':'2026-11-30'}})
  # Legacy bill reads are public in the existing application; writes in this
  # harness additionally require the same session/CSRF as finance operations.
  if p=='/api/book/bills' and self.command=='GET':
   data=[r for r in rows() if get('start_date','0000')<=r['event_date']<=get('end_date','9999') and (not get('category') or r['category']==get('category')) and (not get('type') or r['type']==get('type'))]
   offset=int(get('offset','0'));limit=min(500,int(get('limit','100')));return self.reply(data[offset:offset+limit])
  if p.startswith('/api/trader/') and self.command=='GET':
   route=p[len('/api/trader'):];parts=route.strip('/').split('/')
   if route=='/trader/portfolio':return self.reply(investment_app.get_portfolio())
   if route=='/trader/watchlist':return self.reply(market.watchlist())
   if len(parts)==4 and parts[:2]==['trader','stock']:
    code,view=parts[2:]
    if view=='quality':return self.reply(market.quality(code))
    if view=='kline':return self.reply(market.history(code,int(get('days','90'))))
    if view=='news':return self.reply(market.news(code))
  if p in ['/api/book/chat','/api/trader/chat','/api/book/finance/assistant'] and self.command=='POST':raise HTTPException(503,'\u54a8\u8be2\u670d\u52a1\u5c1a\u672a\u8fde\u63a5')
  self.session()
  if p=='/api/book/finance/capture/fixed' and self.command=='POST':
   data=self.payload()
   if data.get('kind') != 'voice':raise HTTPException(403,'Only the non-file fixed voice fixture is enabled; image/file approval remains pending')
   if data.get('fixture_version')!=FIXTURE_VERSION:raise HTTPException(422,'固定识别适配器版本不符')
   row=fixed_recognition_row(data['kind'])
   return self.reply(capture.create(actor,data['request_id'],data['kind'],[row],hashlib.sha256((FIXTURE_VERSION+data['kind']).encode()).hexdigest()))
  if p=='/api/book/finance/analysis' and self.command=='GET':return self.reply(build_analysis_summary(rows(),get('start_date'),get('end_date'),granularity=get('granularity','day')))
  if p=='/api/book/finance/budget':
   if self.command=='GET':return self.reply(budget.get(actor,get('month')))
   if self.command=='PUT':
    data=self.payload()
    if set(data)!={'total_minor','categories','expected_revision','request_id'}: raise HTTPException(422,'预算字段无效')
    return self.reply(budget.save(actor,get('month'),data['total_minor'],data['categories'],data['expected_revision'],data['request_id']))
  if p=='/api/book/finance/overview' and self.command=='GET':
   cash=int(db.execute("SELECT value FROM environment WHERE key='cash_minor'").fetchone()[0]);data=rows();months={r['event_date'][:7] for r in data};total=build_analysis_summary(data,'2026-01-01','2026-12-31')['totals'];count=max(1,len(months))
   profile={'ledger_scope':'local','stage':'unknown','goal_name':'','goal_amount':'0','goal_months':12,'reserve_months':3,'risk_answers':[],'goal_recorded_amount':'0','goal_percent':20,'goal_cycle':'month','goal_id':'local','cashflow_confirmed':False,'commitment_amount':'0','debt_monthly_amount':'0'}
   products=[{'id':'reserve','name':'\u7075\u6d3b\u73b0\u91d1','account':'fund-reserve','risk':1,'holding_minor':0,'eligible':True,'liquidity':'\u968f\u65f6\u8d4e\u56de','horizon_months':0,'fee':'0','purpose':'\u5e94\u6025\u91d1\u4e0e\u8fd1\u671f\u76ee\u6807'},{'id':'growth','name':'\u957f\u671f\u5747\u8861','account':'fund-growth','risk':3,'holding_minor':0,'eligible':False,'liquidity':'\u6309\u4ea7\u54c1\u89c4\u5219','horizon_months':12,'fee':'0','purpose':'\u4e00\u5e74\u4ee5\u4e0a\u7684\u957f\u671f\u8d44\u91d1'}]
   flow={'observed_months':len(months),'monthly_income_minor':total['gross_income_minor']//count,'monthly_expense_minor':total['gross_expense_minor']//count,'monthly_net_minor':total['net_cashflow_minor']//count,'income_stability':'\u5f85\u6838\u5bf9','start_date':min([r['event_date'] for r in data],default=''),'end_date':max([r['event_date'] for r in data],default='')}
   planning={'ready':False,'basis':{'observed_months':len(months)},'quality':{'message':'\u8bf7\u5148\u6838\u5bf9\u6708\u5ea6\u6536\u652f'},'monthly':{'available_minor':0},'after_goal_minor':None}
   return self.reply({'mode':'isolated_local_state','execution_available':False,'cash_minor':cash,'assets_minor':cash,'investable_minor':0,'products':products,'operations':[],'profile':profile,'cashflow':flow,'planning':planning,'risk_completed':False,'risk_level':1,'bill_checks':[],'reasons':[],'recipients':[],'mfa_enabled':False,'protection_locked':False})
  if p=='/api/book/finance/positions' and self.command=='GET':return self.reply(market.closing_portfolio(positions))
  if p=='/api/book/finance/positions' and self.command=='POST':
   data=self.payload();return self.reply(positions.save(data['position'],data['expected_revision']))
  if p.startswith('/api/book/finance/positions/'):
   identifier=p.rsplit('/',1)[-1];data=self.payload()
   if self.command=='PUT':return self.reply(positions.save(data['position'],data['expected_revision'],identifier))
   if self.command=='DELETE':return self.reply(positions.delete(identifier,data['expected_revision']))
  if p=='/api/book/finance/position-imports/preview' and self.command=='POST':return self.reply(positions.preview_csv(self.payload()['content']))
  if p.startswith('/api/book/finance/position-imports/') and p.endswith('/confirm') and self.command=='POST':return self.reply(positions.confirm_import(p.split('/')[-2],self.payload()['expected_revision']))
  base='/api/book/finance/capture'
  if p==base and self.command=='GET':return self.reply(capture.list(actor))
  if p.startswith(base+'/requests/') and self.command=='GET':return self.reply(capture.find_request(actor,p.split('/')[-1]))
  if p in (base+'/manual',base+'/csv') and self.command=='POST':
   data=self.payload();request_id=data['request_id']
   if p.endswith('/csv'):
    data_rows=parse_csv(data['content'],data.get('account_label',''));digest=hashlib.sha256((data.get('account_label','')+'\n'+data['content']).encode()).hexdigest();kind='csv'
   else:
    bill=data['bill'];row=validate({**bill,'row':1,'enabled':True})
    if row['errors']:raise HTTPException(422,row['errors'][0])
    data_rows=[row];digest=fingerprint(bill);kind='manual'
   return self.reply(capture.create(actor,request_id,kind,data_rows,digest))
  if p.startswith(base+'/'):
   parts=p[len(base)+1:].split('/');handle=parts[0]
   if self.command=='GET' and len(parts)==1:return self.reply(capture.get(actor,handle))
   data=self.payload()
   if self.command=='PUT' and len(parts)==1:return self.reply(capture.update(actor,handle,data['rows'],validate))
   if self.command=='DELETE' and len(parts)==1:return self.reply(capture.discard(actor,handle,data['challenge']))
   if self.command=='POST' and len(parts)==2:
    if parts[1]=='confirm':return self.reply(capture.confirm(actor,handle,data['challenge'],data['rows'],on_new_commit=lambda:None))
    if parts[1]=='undo':return self.reply(capture.undo(actor,handle,data['challenge']))
    if parts[1]=='reconcile':return self.reply(capture.reconcile(actor,handle,data['challenge'],lambda:None))
  if p.startswith('/api/book/bills/'):
   identifier=int(p.rsplit('/',1)[-1]);data=self.payload()
   with lock:
    if not db.execute('SELECT 1 FROM bills WHERE id=?',(identifier,)).fetchone(): raise HTTPException(404,'没有这条账单')
    if self.command=='DELETE':db.execute('DELETE FROM bills WHERE id=?',(identifier,));db.commit();return self.reply({'deleted':identifier})
    if self.command=='PUT':
     checked=validate(data)
     if checked['errors']:raise HTTPException(422,checked['errors'][0])
     db.execute('UPDATE bills SET event_date=?,category=?,type=?,amount=?,currency=?,description=?,metadata=? WHERE id=?',tuple(checked[k] for k in ('event_date','category','type','amount','currency','description'))+(json.dumps(checked.get('metadata') or {}),identifier));db.commit()
     return self.reply(next(row for row in rows() if row['id']==identifier))
  raise HTTPException(503,'此服务尚未连接')
 def dispatch(self):
  try:return self.handle_api()
  except PositionConflict as error:return self.reply({'detail':str(error)},409)
  except (HTTPException,BudgetError) as error:return self.reply({'detail':error.detail},error.status_code)
  except (ValueError,KeyError,TypeError) as error:return self.reply({'detail':str(error)},422)
 do_GET=dispatch;do_POST=dispatch;do_PUT=dispatch;do_DELETE=dispatch

server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
origin='http://127.0.0.1:'+str(server.server_port)
ready={'origin':origin,'instance':args.instance,'state_dir':str(instance),'pid':__import__('os').getpid(),'source':str(source),'mode':'isolated internal state; no existing databases or external connections','routes':['/#/home','/#/ledger','/#/visualization','/#/assistant']}
(root/('ISOLATED-'+args.instance.upper()+'-PREVIEW.json')).write_text(json.dumps(ready,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(ready),flush=True)
server.serve_forever()
