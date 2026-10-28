// Paper positions live in the same local namespace and integer-fen ledger as
// the rest of the demo. No brokerage, bank, or order-routing integration.
import {DEMO_BANK_CARDS} from './bank-cards.mjs';
import {ensureFinance,syncFinance,STORY_DATE} from './finance-state.mjs';

const integer=(n,label,positive=false)=>{if(!Number.isSafeInteger(n)||(positive?n<=0:n<0))throw Error(label+'无效');return n;};
const costMinor=value=>integer(Math.round(Number(value)*100),'持仓成本');
export function priceMinor(value){
 const text=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('价格最多保留两位小数');
 return integer(Math.round(Number(text)*100),'价格',true);
}
export function ensurePaperPortfolio(state,baseline){
 ensureFinance(state);
 if(!state.paperPortfolio){
  if(!baseline||!Array.isArray(baseline.holdings))throw Error('持仓资料尚未读取');
  state.paperPortfolio={version:1,revision:0,seedRevision:baseline.revision,seedIds:baseline.holdings.map(r=>r.id),holdings:structuredClone(baseline.holdings),trades:[]};
 }
 const p=state.paperPortfolio;
 if(baseline&&p.seedRevision===baseline.revision&&!p.seedIds)p.seedIds=baseline.holdings.map(r=>r.id);
 if(baseline&&p.seedRevision!==baseline.revision&&p.seedIds){
  // Existing registration/CSV controller is retained. Newly registered rows
  // enter this local overlay once; they never debit cash or erase paper trades.
  const known=new Set(p.seedIds);let changed=false;
  for(const row of baseline.holdings){if(known.has(row.id))continue;const held=p.holdings.find(r=>r.code===row.code);if(held){held.quantity=String(Number(held.quantity)+Number(row.quantity));held.total_cost=((costMinor(held.total_cost)+costMinor(row.total_cost))/100).toFixed(2);}else p.holdings.push(structuredClone(row));known.add(row.id);changed=true;}
  p.seedIds=[...known];p.seedRevision=baseline.revision;if(changed)p.revision++;
 }
 return state.paperPortfolio;
}
export function paperPortfolio(state,baseline){
 const p=ensurePaperPortfolio(state,baseline),held=p.holdings.filter(r=>Number(r.quantity)>0);
 let cost=0,value=0,available=true;
 const holdings=held.map(r=>{
  const total=costMinor(r.total_cost),quote=Number(r.reference_price??r.price??r.latest_price??(Number(r.market_value)/Number(r.quantity)));
  const valid=Number.isFinite(quote)&&quote>0,market=valid?Math.round(quote*100)*Number(r.quantity):null;
  cost+=total;if(market===null)available=false;else value+=market;
  return {...r,total_cost:(total/100).toFixed(2),market_value:market===null?null:(market/100).toFixed(2),quote_quality:valid?'reference_close':'unavailable',reference_price:valid?quote:null};
 });
 const allocation=new Map();
 for(const r of holdings){r.cost_weight_pct=cost?costMinor(r.total_cost)/cost*100:0;allocation.set(r.asset_class,(allocation.get(r.asset_class)||0)+costMinor(r.total_cost));}
 return {...baseline,revision:p.revision,holdings,total_cost:(cost/100).toFixed(2),market_value:available?(value/100).toFixed(2):null,pnl:available?((value-cost)/100).toFixed(2):null,pnl_pct:available&&cost?(value-cost)/cost*100:null,quote_quality:available?'reference_close':'partial',allocation:[...allocation].map(([asset_class,n])=>({asset_class,weight_pct:cost?n/cost*100:0})),paper:true};
}
const fingerprint=x=>JSON.stringify([x.code,x.name,x.side,x.quantity,x.priceMinor,x.referenceMinor,x.amountMinor,x.quoteDate,x.revision]);
export function reviewTrade(state,input){
 const p=ensurePaperPortfolio(state),code=String(input.code||''),name=String(input.name||'').trim();
 if(!/^\d{6}$/.test(code)||!name||name.length>100)throw Error('证券资料无效');
 if(!['buy','sell'].includes(input.side))throw Error('操作类型无效');
 const quantity=integer(Number(input.quantity),'数量',true),unit=priceMinor(input.price),amount=integer(quantity*unit,'金额',true);
 const row=p.holdings.find(r=>r.code===code);
 if(row&&row.name!==name)throw Error('证券资料已变化，请重新打开');
 if(input.side==='sell'&&(!row||quantity>Number(row.quantity)))throw Error('卖出数量超过当前持仓');
 if(input.side==='buy'&&amount>Math.round(state.balance*100))throw Error('可用余额不足');
 if(input.side==='buy'&&Math.round(state.balance*100)-amount<800000)throw Error('需保留房租和生活费 ¥8,000');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.quoteDate||''))throw Error('参考行情日期缺失，暂不能买卖');
 const reference=row?row.reference_price??Number(row.market_value)/Number(row.quantity):input.referencePrice??input.price;
 const referenceMinor=priceMinor(Number(reference).toFixed(2));
 const review={code,name,side:input.side,quantity,priceMinor:unit,referenceMinor,amountMinor:amount,quoteDate:input.quoteDate,revision:p.revision};
 return {...review,fingerprint:fingerprint(review)};
}
export function executePaperTrade(state,review,requestId){
 const p=ensurePaperPortfolio(state);
 if(typeof requestId!=='string'||!/^[-\w]{8,100}$/.test(requestId))throw Error('操作标识无效');
 const previous=p.trades.find(t=>t.requestId===requestId);
 if(previous){if(previous.fingerprint!==review.fingerprint)throw Error('操作参数已变化');return previous;}
 if(review.fingerprint!==fingerprint(review)||review.revision!==p.revision)throw Error('持仓已变化，请重新核对');
 const checked=reviewTrade(state,{...review,price:(review.priceMinor/100).toFixed(2),referencePrice:review.referenceMinor/100});
 if(checked.fingerprint!==review.fingerprint)throw Error('操作参数已变化，请重新核对');
 const index=p.holdings.findIndex(r=>r.code===review.code),old=p.holdings[index],quantity=Number(old?.quantity||0),cost=old?costMinor(old.total_cost):0;
 const nextQuantity=quantity+(review.side==='buy'?review.quantity:-review.quantity);
 const nextCost=review.side==='buy'?cost+review.amountMinor:nextQuantity===0?0:cost-Math.round(cost*review.quantity/quantity);
 integer(nextQuantity,'变更后数量');integer(nextCost,'变更后成本');
 const receipt='FP-ST-'+(p.revision+1)+'-'+requestId.replace(/-/g,'').slice(-10).toUpperCase();
 const entry={...review,requestId,receipt,date:STORY_DATE,status:'completed'};
 const next={...old,id:old?.id||'paper:'+review.code,code:review.code,name:review.name,asset_class:'stock',quantity:String(nextQuantity),total_cost:(nextCost/100).toFixed(2),as_of:STORY_DATE,currency:'CNY',reference_price:review.referenceMinor/100,quote_as_of:review.quoteDate,quote_quality:'reference_close'};
 if(index<0)p.holdings.push(next);else p.holdings[index]=next;
 p.trades.push(entry);p.revision++;
 state.ledger.push({id:'paper-trade:'+requestId,date:STORY_DATE,title:(review.side==='buy'?'买入':'卖出')+review.name,category:'证券本金',amountMinor:review.amountMinor,direction:review.side==='buy'?'expense':'income',movement:'principal',kind:review.side==='buy'?'stock-buy':'stock-sell',icon:'invest',order:state.ledger.length,receipt,accountLabel:'投资结算账户',source:'synthetic'});
 syncFinance(state);return entry;
}

// Explainable local capacity suggestion, not a regulatory suitability rating.
// Preference is intentionally unknown; historical behaviour cannot establish it.
export function riskProfile(state,{asOf=STORY_DATE}={}){
 ensureFinance(state);
 const current=asOf.slice(0,7),groups=new Map();
 for(const r of state.ledger){
  if(r.date.slice(0,7)>=current||!Number.isSafeInteger(r.amountMinor)||['principal','internal_transfer'].includes(r.movement))continue;
  const month=r.date.slice(0,7);if(!/^\d{4}-\d{2}$/.test(month))continue;
  const g=groups.get(month)||{income:0,expense:0,refund:0,essential:0,days:new Set()};g.days.add(Number(r.date.slice(-2)));
  if(r.direction==='income'){if(r.category==='退款')g.refund+=r.amountMinor;else g.income+=r.amountMinor;}
  else {g.expense+=r.amountMinor;if(['住房','餐饮','出行','生活缴费','其他'].includes(r.category))g.essential+=r.amountMinor;}
  groups.set(month,g);
 }
 const months=[...groups].sort(([a],[b])=>a.localeCompare(b)).slice(-12).filter(([,g])=>g.days.size>=14&&Math.max(...g.days)-Math.min(...g.days)>=20),count=months.length,mean=key=>count?Math.round(months.reduce((s,[,g])=>s+g[key],0)/count):null;
 const income=mean('income'),expense=mean('expense'),refund=mean('refund'),essential=mean('essential'),cash=Math.round(state.balance*100);
 const surplus=count?income+refund-expense:null,positiveMonths=months.filter(([,g])=>g.income+g.refund>g.expense).length,knownDebt=DEMO_BANK_CARDS.reduce((n,c)=>n+(c.dueMinor||0),0),buffer=essential>0?Math.max(0,cash-knownDebt)/essential:null;
 const monthNumber=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
 const consecutive=count>0&&monthNumber(months.at(-1)[0])===monthNumber(current)-1&&months.every(([m],i)=>!i||monthNumber(m)===monthNumber(months[i-1][0])+1);
 const enough=count>=3&&consecutive&&months.every(([,g])=>g.income>0)&&cash>=0&&essential>0;
 let level=enough?(buffer<3||surplus<=0?1:buffer<6||positiveMonths<count*.75?2:3):null;
 const p=state.paperPortfolio,held=(p?.holdings||[]).filter(r=>Number(r.quantity)>0),costs=held.map(r=>Number(r.total_cost)),total=costs.reduce((s,n)=>s+n,0),concentration=total>0?Math.max(...costs)/total:null;
 if(level&&concentration>.6)level=Math.min(level,2);
 const completed=(state.tasks||[]).filter(t=>t.status==='done'&&t.applied).length,cancelled=(state.tasks||[]).filter(t=>t.status==='cancelled').length;
 return {version:1,asOf,ready:enough,level,label:!enough?'待完善':level===1?'保守':level===2?'稳健':'均衡',months:count,period:count?[months[0][0],months.at(-1)[0]]:null,incomeMinor:income,expenseMinor:expense,refundMinor:refund,surplusMinor:surplus,essentialMinor:essential,cashMinor:cash,knownDebtMinor:knownDebt,bufferMonths:buffer,positiveMonths,concentration,behaviour:{completed,cancelled,paperTrades:p?.trades?.length||0},preference:null,liabilities:'unknown',rules:'capacity-v1'};
}
