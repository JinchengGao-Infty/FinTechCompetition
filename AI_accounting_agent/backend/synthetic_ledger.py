"""Deterministic isolated ledger fixtures, adapted from master backend/data.py.

No network, real accounts, or default database replacement. Calendar months,
recurring schedules and skewed prices replace uniform random monthly scaling.
"""
from pathlib import Path
from datetime import date, timedelta
from collections import Counter, defaultdict
import argparse, ast, calendar, csv, hashlib, json, math, random, sqlite3

VERSION='finpilot-ledger-13m-v1'
SEED=2026110130
START=date(2025,11,1)
END=date(2026,11,30)
ORIGIN_COMMIT='599b6d26cf26f2215946beaf7c60eacd266add10'

def category_registry():
    path=Path(__file__).resolve().parents[1]/'frontend/liquid-glass/category-registry.js'
    return json.loads(path.read_text(encoding='utf8').split('/* REGISTRY_START */',1)[1].split('/* REGISTRY_END */',1)[0])

def original_catalog(path):
    # Parse only literal dictionaries; never execute the repository generator.
    tree=ast.parse(Path(path).read_text(encoding='utf8'))
    return {n.targets[0].id:ast.literal_eval(n.value) for n in tree.body
            if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)
            and n.targets[0].id in ('EXPENSE_CATEGORIES','INCOME_SOURCES','MONTH_EXPENSE_WEIGHTS')}

def generate(seed=SEED, origin_path=None):
    rng=random.Random(seed)
    catalog=original_catalog(origin_path) if origin_path else {}
    merchants=catalog.get('EXPENSE_CATEGORIES',{})
    rows=[]
    def amount(median,spread=.24,low=1,high=None):
        # Right-skewed prices, in integer fen; occasional high bills remain rare.
        value=round(rng.lognormvariate(math.log(median),spread)*100)
        return min(int(high*100),max(int(low*100),value)) if high else max(int(low*100),value)
    def add(day,category,minor,description,kind='expense',account=None,payment=None,**extra):
        if not START<=day<=END:return None
        index=len(rows)+1
        meta={'dataset_id':VERSION,'seed':seed,'synthetic':True,'duplicate_check':True,'origin_commit':ORIGIN_COMMIT,
              'fixture_id':f'{VERSION}-{index:05d}','movement':'cashflow',
              'account_label':account or ('工资卡 0826' if kind=='income' else '生活账户 1608'),
              'payment_method':payment or ('银行入账' if kind=='income' else rng.choice(['微信支付','支付宝','银行卡'])),
              'merchant':description,**extra}
        rows.append({'_key':index,'event_date':day.isoformat(),'category':category,'type':kind,
                     'amount_minor':minor,'currency':'CNY','description':description,'source':'synthetic',
                     'metadata':meta,'created_at':day.isoformat()+'T12:00:00Z'})
        return rows[-1]
    def workday(day):
        while day.weekday()>=5:day+=timedelta(days=1)
        return day
    def pick(category):return rng.choice(merchants.get(category,['本地商店']))
    months=[]
    for offset in range(13):
        year=2025+(10+offset)//12;month=(10+offset)%12+1;months.append(f'{year}-{month:02}')
        last=calendar.monthrange(year,month)[1]
        # A consistent employed persona; pay rise and bonuses, not random salaries.
        salary=1186000 if (year,month)<(2026,4) else 1245000
        add(workday(date(year,month,10)),'工资',salary,'公司工资发放','income')
        add(date(year,month,3),'住房',268000 if (year,month)<(2026,7) else 278000,'房租',payment='银行转账')
        add(date(year,month,15),'生活缴费',5900,'中国移动话费',payment='银行卡')
        summer=month in (6,7,8,9)
        add(date(year,month,19),'生活缴费',amount(218 if summer else 98,.17,55,360),'国家电网电费')
        add(date(year,month,22),'生活缴费',amount(43,.15,28,80),'燃气费')
        if month%3==0:add(date(year,month,21),'生活缴费',amount(96,.12,65,130),'季度水费')
        add(date(year,month,8),'娱乐',2500,'腾讯视频月费',payment='支付宝')
        if month%2==1:add(date(year,month,12),'教育学习',9900,'在线课程')
        if month in (3,6,9):add(date(year,month,25),'奖金',rng.choice([160000,210000,240000]),'季度绩效奖金','income')
        if month==12:add(date(year,month,26),'奖金',620000,'年终奖金','income')
        if rng.random()<.55:add(date(year,month,rng.randint(20,27)),'副业',rng.choice([68000,125000,180000]),'设计项目结算','income')
        add(date(year,month,last),'理财收益',rng.randint(2600,5800),'现金管理分红','income')
        if month in (1,7):add(date(year,month,16),'其他收入',rng.choice([12000,22000]),'差旅补贴','income')
        if month==1:add(date(year,month,18),'保险',69000,'年度意外险')
        if month==5:add(date(year,month,18),'保险',128000,'年度医疗险')
        # Every calendar day can occur, including 29/30/31. Weekends have fewer
        # commutes and more social meals/leisure; no forced monthly target total.
        for d in range(1,last+1):
            day=date(year,month,d);weekend=day.weekday()>=5
            if rng.random()<(0.28 if weekend else .53):add(day,'餐饮',amount(11,.2,6,22),'早餐')
            if rng.random()<(.72 if weekend else .93):add(day,'餐饮',amount(48 if weekend else 25,.25,12,110),rng.choice(['周末午餐','朋友聚餐']) if weekend else '工作日午餐')
            if rng.random()<.68:add(day,'餐饮',amount(39 if weekend else 29,.3,14,130),pick('餐饮'))
            if rng.random()<.24:add(day,'餐饮',amount(19,.2,9,35),rng.choice(['瑞幸咖啡','喜茶']))
            if not weekend and rng.random()<.82:add(day,'出行',rng.choice([400,600,800,1000]),'地铁通勤',payment='微信支付')
            if rng.random()<(.12 if weekend else .045):add(day,'出行',amount(35,.35,15,110),rng.choice(['滴滴出行','高德打车']))
            if weekend and rng.random()<.24:add(day,'娱乐',amount(78,.45,30,260),rng.choice(['电影票','羽毛球场','展览门票']))
            if rng.random()<.065:add(day,'购物',amount(68,.45,15,260),'天猫超市日用品')
            if rng.random()<.025:add(day,'其他',amount(16,.4,4,58),rng.choice(['快递费','打印店']))
        # Seasonal shopping and irregular life events, not an equal category mix.
        for _ in range(rng.randint(1,3)+(2 if month in (6,11) else 0)):
            day=date(year,month,rng.randint(4,last-4))
            item=add(day,'购物',amount(360 if month in (6,11) else 190,.55,50,2200),rng.choice(['京东','淘宝','优衣库']))
            if rng.random()<.23:
                refund_day=day+timedelta(days=rng.randint(2,9))
                refund=add(refund_day,'退款',item['amount_minor'] if rng.random()<.7 else item['amount_minor']//2,item['description']+'退款','income',account=item['metadata']['account_label'],payment=item['metadata']['payment_method'],refund_fixture_key=item['_key'])
        if month in (2,4,8,10):add(date(year,month,rng.randint(6,24)),'医疗健康',amount(240,.5,70,900),rng.choice(['门诊及药品','牙科检查','配镜']))
        if month in (1,2,4,9,11):add(date(year,month,rng.randint(12,24)),'人情往来',rng.choice([20000,30000,50000,66000]),'新年红包' if month==2 else '生日礼物')
        if (year,month) in [(2025,12),(2026,2),(2026,5),(2026,8),(2026,10)]:
            add(date(year,month,2),'旅行',amount(1200,.25,650,2200),'短途旅行住宿')
            add(date(year,month,1),'出行',rng.choice([18500,26800,42500]),'12306往返车票')
        # Paired movements are visible ledger rows but excluded from income,
        # expenses and category analysis. Not fabricated investment performance.
        for n in range(rng.randint(1,2)):
            day=date(year,month,rng.randint(5,last-1));value=rng.choice([30000,50000,80000]);pair=f'transfer-{year}{month:02}-{n}'
            add(day,'其他',value,'生活账户补充','expense',account='工资卡 0826',payment='银行转账',movement='internal_transfer',transfer_id=pair,counterparty_account='生活账户 1608')
            add(day,'其他收入',value,'生活账户转入','income',account='生活账户 1608',payment='银行转账',movement='internal_transfer',transfer_id=pair,counterparty_account='工资卡 0826')
        if month in (3,6,9):
            day=date(year,month,27);pair=f'principal-{year}{month:02}'
            add(day,'其他',100000,'储蓄本金转出','expense',movement='principal',transfer_id=pair)
            add(day,'其他收入',100000,'储蓄本金转入','income',account='储蓄账户 3771',movement='principal',transfer_id=pair)
    rows.sort(key=lambda r:(r['event_date'],r['_key']))
    registry={r['label']:r for r in category_registry()}
    assert {r['category'] for r in rows}==set(registry), 'Every registered category must have coverage'
    assert all(registry[r['category']]['type']==r['type'] for r in rows)
    ids={r['_key']:i for i,r in enumerate(rows,1)}
    for i,row in enumerate(rows,1):
        row['id']=i;row.pop('_key')
        linked=row['metadata'].pop('refund_fixture_key',None)
        if linked:row['metadata']['refund_of_bill_id']=ids[linked]
        row['amount']=f"{row['amount_minor']//100}.{row['amount_minor']%100:02}"
    return rows

def export(output,origin_path,seed=SEED):
    output=Path(output)
    if output.exists():raise ValueError('Output must be a new isolated directory; never replace a dataset')
    output.mkdir(parents=True)
    rows=generate(seed,origin_path)
    payload=''.join(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n' for row in rows)
    (output/'bills.jsonl').write_text(payload,encoding='utf8')
    # JSONL prompt representation is formatted from final canonical amounts,
    # unlike the original scaled amounts whose earlier text was left stale.
    with (output/'synthetic_bank_bills.jsonl').open('w',encoding='utf8') as f:
        for row in rows:
            text=f"{row['event_date']} {row['description']} {'收入' if row['type']=='income' else '支出'}{row['amount']}元，{row['metadata']['payment_method']}。"
            f.write(json.dumps({'messages':[{'role':'user','content':text},{'role':'assistant','content':json.dumps(row,ensure_ascii=False)}]},ensure_ascii=False)+'\n')
    with (output/'bills.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f);writer.writerow(['日期','收支','金额','分类','备注','支付方式','资金性质','原支出ID'])
        for r in rows:writer.writerow([r['event_date'],'收入' if r['type']=='income' else '支出',r['amount'],r['category'],r['description'],r['metadata']['payment_method'],r['metadata']['movement'],r['metadata'].get('refund_of_bill_id','')])
    db=sqlite3.connect(output/'ledger.sqlite3')
    db.execute('CREATE TABLE bills(id INTEGER PRIMARY KEY AUTOINCREMENT,event_date TEXT,category TEXT,type TEXT,amount REAL,currency TEXT,description TEXT,source TEXT,metadata TEXT,created_at TEXT)')
    db.executemany('INSERT INTO bills VALUES(?,?,?,?,?,?,?,?,?,?)',[(r['id'],r['event_date'],r['category'],r['type'],float(r['amount']),r['currency'],r['description'],r['source'],json.dumps(r['metadata'],ensure_ascii=False),r['created_at']) for r in rows])
    db.execute('CREATE TABLE environment(key TEXT PRIMARY KEY,value TEXT)')
    db.executemany('INSERT INTO environment VALUES(?,?)',[('initialized',VERSION),('cash_minor','5000000'),('dataset_id',VERSION),('seed',str(seed))]);db.commit();db.close()
    monthly=defaultdict(lambda:Counter(count=0,income_minor=0,expense_minor=0,refund_minor=0,excluded_minor=0))
    for r in rows:
        m=monthly[r['event_date'][:7]];m['count']+=1
        field='excluded_minor' if r['metadata']['movement']!='cashflow' else 'refund_minor' if r['category']=='退款' else 'income_minor' if r['type']=='income' else 'expense_minor'
        m[field]+=r['amount_minor']
    for m in monthly.values():m['net_expense_minor']=m['expense_minor']-m['refund_minor'];m['net_cashflow_minor']=m['income_minor']-m['net_expense_minor']
    manifest={'version':VERSION,'seed':seed,'source':'synthetic','range':{'start':START.isoformat(),'end':END.isoformat()},'count':len(rows),'calendar_months':13,'categories':dict(Counter(r['category'] for r in rows)),'monthly':dict(sorted(monthly.items())),'row_sha256':hashlib.sha256(payload.encode()).hexdigest(),'original_script':{'repository':'gr-peng/FinTechathon','branch_checked':'master','commit':ORIGIN_COMMIT,'path':'AI_accounting_agent/backend/data.py','sha256':hashlib.sha256(Path(origin_path).read_bytes()).hexdigest()},'profile':'one employed adult, recurring wages/rent, weekday commuting, seasonal and irregular costs','future_fixtures':'2026-10/11 include requested future dates; not observed user transactions','refunds':'linked to original expense; deducted only in net expense','movements':'paired transfers/principal excluded from cashflow; amounts in fen; no monthly target scaling','changes_from_original':['calendar range not 30-day month offsets','stable local RNG seed','all 12 expense and 6 income categories','lognormal prices and scheduled bills','weekday/weekend and seasonal frequencies','linked refunds and paired internal transfers','final amount drives both text and structured output','new isolated directory only, never append to existing ledger']}
    (output/'DATASET.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--origin',required=True);parser.add_argument('--seed',type=int,default=SEED)
    args=parser.parse_args();print(json.dumps(export(args.output,args.origin,args.seed),ensure_ascii=False))
