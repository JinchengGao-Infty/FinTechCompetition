// One local financial source. All amounts are integer fen; no bank connector.
import {HISTORY_ROWS,HISTORY_VERSION} from './history-ledger.mjs';
export const STORY_DATE='2026-11-02';
export const FINANCE_SCHEMA=2;
const seed=[
 ['salary','2026-11-02','工资入账','工资',1580000,'income','wallet'],
 ['refund','2026-11-02','购物退款','退款',35660,'income','wallet'],
 ['breakfast','2026-11-02','早餐与咖啡','餐饮',3200,'expense','receipt'],
 ['rent','2026-11-01','住房租金','住房',350000,'expense','home'],
 ['subscription','2026-11-01','视频会员','订阅',6800,'expense','card'],
 ['transport','2026-11-02','地铁与打车','出行',16466,'expense','plane'],
 ['lunch','2026-11-02','工作日午餐','餐饮',3791,'expense','receipt'],
 ['dinner','2026-11-02','家庭聚餐','餐饮',180309,'expense','receipt'],
 ['shopping','2026-11-02','生活用品','购物',159962,'expense','wallet'],
 ['utilities','2026-11-02','水电与日用品','其他',28183,'expense','home']
];
export const seedLedger=()=>seed.map(([id,date,title,category,amountMinor,direction,icon],i)=>({id:'seed:'+id,date,title,category,amountMinor,direction,icon,movement:'cashflow',order:i,taskId:null,receipt:null}));
const cashDelta=r=>r.movement==='internal_transfer'?0:(r.direction==='income'?1:-1)*r.amountMinor;
const finiteMinor=(v,fallback)=>Number.isSafeInteger(v)?v:fallback;
export function operationEntry(t,order){
 const amountMinor=Math.round(t.amount*100);
 if(!['transfer','investment','redemption'].includes(t.kind))return null;
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw Error('操作金额无效');
 const map={transfer:['给妈妈转账','人情往来','expense','cashflow','user'],investment:['申购灵活现金','理财本金','expense','principal','invest'],redemption:['赎回灵活现金','理财本金','income','principal','invest']};
 let [title,category,direction,movement,icon]=map[t.kind];if(t.kind==='transfer')title='给'+(t.payeeName||(t.payeeId==='dad'?'爸爸':'妈妈'))+'转账';
 return {id:'operation:'+t.id,date:t.scheduledDate||STORY_DATE,title,category,direction,movement,icon,accountLabel:t.sourceAccount==='living_1608'?'生活账户 1608':'工资账户 0826',payment_method:'银行转账',amountMinor,order,taskId:t.id,receipt:t.receipt,kind:t.kind,revision:t.revision};
}
export function postOperation(state,t){
 if(!Array.isArray(state.ledger))throw Error('财务数据尚未初始化');
 const id='operation:'+t.id;
 let row=state.ledger.find(r=>r.id===id);
 if(!row){row=operationEntry(t,state.ledger.length);if(row)state.ledger.push(row);}
 if(row){if(row.amountMinor!==Math.round(t.amount*100)||row.receipt!==t.receipt)throw Error('回执与原流水不一致');t.ledgerId=row.id;}
 return row;
}
export function ensureFinance(state){
 if(!Array.isArray(state.ledger)){
  state.ledger=seedLedger();state.openingCashMinor=4133051;state.openingInvestedMinor=0;
  // Upgrade old completed fixtures from their existing receipts, never debit twice.
  for(const t of [...(state.tasks||[])].reverse())if(t.applied&&t.receipt)postOperation(state,t);
  state.financeSchema=FINANCE_SCHEMA;
 }
 state.financeSchema=FINANCE_SCHEMA;
 state.openingCashMinor=finiteMinor(state.openingCashMinor,4133051);
 state.openingInvestedMinor=finiteMinor(state.openingInvestedMinor,0);
 if(state.ledgerHistoryVersion!==HISTORY_VERSION){
  // The opening cash is an as-of balance, not an opening before the recovered
  // year. Preserve today's cash exactly; older history must not be counted twice.
  const before=state.openingCashMinor+state.ledger.reduce((n,r)=>n+(!state.openingCashAsOf||r.date>=state.openingCashAsOf?cashDelta(r):0),0);
  const ids=new Set(state.ledger.map(r=>r.id));
  const fingerprint=r=>[r.date,r.title,r.category,r.amountMinor,r.direction].join('|');
  const existing=new Set(state.ledger.map(fingerprint));
  for(const [id,date,title,category,amountMinor,direction,movement,payment_method,accountLabel] of HISTORY_ROWS){
   const row={id,date,title,category,amountMinor,direction,movement,payment_method,accountLabel,source:'synthetic',icon:'receipt',order:state.ledger.length,taskId:null,receipt:null};
   if(!ids.has(id)&&!existing.has(fingerprint(row))){state.ledger.push(row);ids.add(id);}
  }
  state.openingCashAsOf='2026-11-01';
  state.openingCashMinor=before-state.ledger.reduce((n,r)=>n+(r.date>=state.openingCashAsOf?cashDelta(r):0),0);
  state.ledgerHistoryVersion=HISTORY_VERSION;
 }
 for(const t of state.tasks||[])if(t.applied&&t.receipt)postOperation(state,t);
 return syncFinance(state);
}
export function syncFinance(state){
 if(!Array.isArray(state.ledger))return ensureFinance(state);
 let cash=state.openingCashMinor,invested=state.openingInvestedMinor,spent=0;
 for(const row of state.ledger){
  if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<0)throw Error('流水金额格式无效');
  if(!state.openingCashAsOf||row.date>=state.openingCashAsOf)cash+=cashDelta(row);
  if(row.kind==='investment')invested+=row.amountMinor;
  if(row.kind==='redemption')invested-=row.amountMinor;
  if(row.kind==='transfer'&&row.date===STORY_DATE)spent+=row.amountMinor;
 }
 state.balance=cash/100;state.invested=invested/100;state.spent=spent/100;
 return state;
}
export function financialFacts(state,month='2026-11'){
 ensureFinance(state);
 const rows=state.ledger.filter(r=>r.date.startsWith(month));
 let incomeMinor=0,expenseMinor=0,refundMinor=0,principalInMinor=0,principalOutMinor=0;
 const categories=new Map(),daily=new Map();
 for(const row of rows){
  if(row.movement==='internal_transfer')continue;
  if(row.movement==='principal'){if(row.direction==='income')principalInMinor+=row.amountMinor;else principalOutMinor+=row.amountMinor;continue;}
  if(row.direction==='income'){if(row.category==='退款')refundMinor+=row.amountMinor;else incomeMinor+=row.amountMinor;}
  else{expenseMinor+=row.amountMinor;categories.set(row.category,(categories.get(row.category)||0)+row.amountMinor);const day=Number(row.date.slice(-2));daily.set(day,(daily.get(day)||0)+row.amountMinor);}
 }
 const [year,monthNumber]=month.split('-').map(Number);
 let cumulative=0;const days=Array.from({length:new Date(year,monthNumber,0).getDate()},(_,i)=>{cumulative+=daily.get(i+1)||0;return cumulative;});
 return {incomeMinor,expenseMinor,refundMinor,netExpenseMinor:expenseMinor-refundMinor,netCashflowMinor:incomeMinor+refundMinor-expenseMinor,principalInMinor,principalOutMinor,cashMinor:Math.round(state.balance*100),investedMinor:Math.round(state.invested*100),categories:[...categories].sort((a,b)=>b[1]-a[1]),days,rows};
}
export function ledgerView(state){ensureFinance(state);return [...state.ledger].sort((a,b)=>b.date.localeCompare(a.date)||b.order-a.order);}
