import assert from 'node:assert/strict';
import {bucketCashflow,categoryTotals,selectLedgerRows} from '../AI_accounting_agent/frontend/liquid-glass/mobile-pages.js';
import {createRequestLifecycle} from '../AI_accounting_agent/frontend/liquid-glass/request-lifecycle.js';
import {parseRoute,routes,primaryTabs} from '../AI_accounting_agent/frontend/liquid-glass/navigation.js';

const rows=Array.from({length:22},(_,i)=>({id:i,event_date:`2026-10-${String(i+1).padStart(2,'0')}`,category:i%2?'餐饮':'出行',type:'expense',amount:(i+1)/100,description:'日常',metadata:{}}));
rows.push({id:90,event_date:'2026-10-05',category:'划转',type:'expense',amount:900,metadata:{movement:'internal_transfer'}});
rows.push({id:91,event_date:'2026-10-03',category:'退款',type:'income',amount:10.01,metadata:{}});
const buckets=bucketCashflow(rows,{start_date:'2026-10-01',end_date:'2026-10-22'});
assert.deepEqual(buckets.map(b=>[b.start,b.end]),[['2026-10-01','2026-10-07'],['2026-10-08','2026-10-14'],['2026-10-15','2026-10-21'],['2026-10-22','2026-10-22']]);
assert.equal(buckets.reduce((s,b)=>s+b.expense_minor,0),253);
assert.equal(buckets.reduce((s,b)=>s+b.income_minor,0),1001);
for(const count of [1,7,14,22,31,365]){
 const end=new Date(Date.UTC(2026,0,count)).toISOString().slice(0,10),bs=bucketCashflow([],{start_date:'2026-01-01',end_date:end});
 assert.equal(bs[0].start,'2026-01-01');assert.equal(bs.at(-1).end,end);
 for(let i=1;i<bs.length;i++)assert.equal(Date.parse(bs[i].start)-Date.parse(bs[i-1].end),86400000);
}
console.log('PASS: chart intervals include each selected day once, keep the partial last range explicit and sum integer ledger amounts excluding transfers.');

const categories=categoryTotals(rows);assert.equal(categories.reduce((s,c)=>s+c.minor,0),253);assert.equal(categories.find(c=>c.name==='餐饮').minor,132);
assert.deepEqual(selectLedgerRows(rows,{category:'餐饮',type:'expense',q:'日常',day:'2026-10-02'}).map(r=>r.id),[1]);
assert.equal(selectLedgerRows(rows,{category:'餐饮',type:'expense',q:'日常'}).length,11);
console.log('PASS: every category and actual transaction filter uses one stable ledger set; an aggregate is never emitted as a fake transaction.');

const lifecycle=createRequestLifecycle(),one=lifecycle.start();let aborted=0;one.signal.addEventListener('abort',()=>aborted++);
assert.equal(lifecycle.isCurrent(one),true);assert.equal(lifecycle.stop(),true);assert.equal(aborted,1);assert.equal(lifecycle.current,null);assert.equal(lifecycle.isCurrent(one),false);assert.equal(lifecycle.finish(one),false);
const two=lifecycle.start();assert.equal(lifecycle.isCurrent(two),true);assert.equal(lifecycle.finish(one),false);assert.equal(lifecycle.current,two);assert.equal(lifecycle.finish(two),true);assert.equal(lifecycle.current,null);
const three=lifecycle.start(),four=lifecycle.start();assert.equal(three.signal.aborted,true);assert.equal(lifecycle.isCurrent(three),false);assert.equal(lifecycle.isCurrent(four),true);lifecycle.stop();
console.log('PASS: Stop aborts the real signal, removes active pending ownership immediately, rejects late completions and permits a fresh request.');

assert.deepEqual(primaryTabs,['home','ledger','visualization','assistant','investment']);
assert.equal(routes.categories.tab,'visualization');assert.equal(routes.accounts.tab,'home');
const link='ledger?month=2026-09&start_date=2026-09-01&end_date=2026-09-30&category=%E9%A4%90%E9%A5%AE';
assert.equal(parseRoute('#/'+link).href,'#/'+link);assert.equal(routes.categories.parent,'visualization');
console.log('PASS: secondary category/account contexts keep canonical five-navigation ownership and query-bearing drill links.');

const {billQueryKind}=await import('../AI_accounting_agent/frontend/liquid-glass/bill-query.js');
assert.equal(billQueryKind('本月餐饮花了多少'),'expense');assert.equal(billQueryKind('9月收入'),'income');assert.equal(billQueryKind('本月结余'),'net');for(const question of ['上个月餐饮花了多少','去年收入','餐饮和购物支出','为什么支出增加','本月支出占比'])assert.equal(billQueryKind(question),null);
console.log('PASS: complex or relative-time language retains the existing assistant instead of being mislabeled as a current-month total.');

const quarters=bucketCashflow(rows,{start_date:'2026-01-01',end_date:'2026-10-22'},4,'year');assert.deepEqual(quarters.map(b=>[b.start,b.end]),[['2026-01-01','2026-03-31'],['2026-04-01','2026-06-30'],['2026-07-01','2026-09-30'],['2026-10-01','2026-10-22']]);assert.equal(quarters.reduce((s,b)=>s+b.expense_minor,0),253);console.log('PASS: year charts use calendar quarters while the last bucket retains the exact partial date range.');
