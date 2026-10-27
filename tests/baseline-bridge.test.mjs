import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaselineBridge} from '../web/baseline-bridge.mjs';
import {fresh,createTask,transition} from '../web/engine.mjs';
import {financialFacts} from '../web/finance-state.mjs';

const bridge=s=>createBaselineBridge({getState:()=>s,save(){},render(){},esc:String,money:n=>'¥'+n,showModal(){},closeModal(){},start(){},icon:()=>'',getCsrf:()=>'',namespace:'unit',setFinancial(){},setInvestment(){},openRisk(){}});
function complete(s,key,amount){const t=createTask(s,key);transition(s,t.id,'grant');if(amount)transition(s,t.id,'edit',{amount});transition(s,t.id,'confirm',{revision:t.revision});if(t.status==='verify')transition(s,t.id,'verify',{verified:true});transition(s,t.id,'complete');return t}

test('copied overview/trend DTO reconciles to task ledger after one transfer',()=>{
 const s=fresh(),t=complete(s,'salary',1800),b=bridge(s),d=b.report(),f=financialFacts(s);
 assert.equal(s.balance,48200);assert.equal(d.totals.gross_expense_minor,f.expenseMinor);assert.equal(d.totals.gross_income_minor,f.incomeMinor);assert.equal(d.totals.refund_minor,f.refundMinor);assert.equal(d.totals.net_expense_minor,f.netExpenseMinor);assert.equal(d.totals.net_cashflow_minor,f.netCashflowMinor);
 assert.equal(d.trend.reduce((n,r)=>n+r.gross_expense_minor,0),f.expenseMinor);assert.equal(d.expense_categories.find(c=>c.category==='人情往来').amount_minor,180000);assert.equal(s.ledger.filter(r=>r.receipt===t.receipt).length,1);
});
test('copied overview excludes principal flows and keeps refund separate',()=>{
 const s=fresh(),before=bridge(s).report().totals;complete(s,'investment',2800);complete(s,'redemption',1000);const after=bridge(s).report().totals;
 assert.deepEqual(after,before);assert.equal(s.balance,48200);assert.equal(s.invested,1800);
});
test('native shell route adaptation has exactly five distinct correct links',()=>{
 const html=bridge(fresh()).nav('investment');assert.deepEqual([...html.matchAll(/href="#\/([^\"]+)"/g)].map(m=>m[1]),['today','bot','finance','investment','me']);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.match(html,/data-nav-tab="investment" aria-current="page"/);
});

 test('native month filter keeps visible rows and totals on the same period',()=>{const b=bridge(fresh());b.ui.month='2026-10';assert.equal(b.ledgerRows().length,0);assert.equal(b.report(b.ledgerRows()).totals.gross_expense_minor,0);b.ui.month='2026-11';assert.equal(b.ledgerRows().length,10)});

test('recovered old-month budget request cannot write the current month or reuse changed parameters',async()=>{const s=fresh(),b=bridge(s),nov=await b.request('/budget?month=2026-11');const data={total_minor:100000,categories:[],expected_revision:0,request_id:'oct-recovery'};const oct=await b.request('/budget?month=2026-10',{method:'PUT',body:data});assert.equal(oct.month,'2026-10');assert.deepEqual(await b.request('/budget?month=2026-11'),nov);assert.deepEqual(await b.request('/budget?month=2026-10',{method:'PUT',body:data}),oct);await assert.rejects(b.request('/budget?month=2026-11',{method:'PUT',body:data}),/参数已变化/)});

test('receipt navigation clears stale month and day filters',()=>{const s=fresh(),t=complete(s,'salary',1800),b=bridge(s);b.ui.month='2026-10';b.ui.ledgerRange={start_date:'2026-10-01',end_date:'2026-10-01'};b.receipt(t.receipt);assert.equal(b.ui.month,'2026-11');assert.equal(b.ui.ledgerRange,null);assert.equal(b.ledgerRows().length,1);assert.equal(b.ledgerRows()[0].metadata.receipt,t.receipt)});

test('category and date drilldowns each replace unrelated stale filters',async()=>{const b=bridge(fresh());b.ui.ledgerRange={start_date:'2026-11-01',end_date:'2026-11-01'};b.ui.filter={category:'住房',q:'old',type:'income'};await b.action('pa-category',{dataset:{category:'餐饮'}});assert.equal(b.ui.ledgerRange,null);assert.equal(b.ledgerRows().length,3);await b.action('pa-point-ledger',{dataset:{pointIndex:'0'}});assert.deepEqual(b.ui.filter,{category:'',q:'',type:''});assert.equal(b.ledgerRows().length,2)});
