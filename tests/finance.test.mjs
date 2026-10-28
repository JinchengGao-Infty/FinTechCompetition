import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,createTask,transition} from '../web/engine.mjs';
import {ensureFinance,financialFacts,ledgerView} from '../web/finance-state.mjs';

function execute(s,key,amount){const t=createTask(s,key);transition(s,t.id,'grant');if(amount!==undefined)transition(s,t.id,'edit',{amount});transition(s,t.id,'confirm',{revision:t.revision});if(t.status==='verify')transition(s,t.id,'verify',{verified:true});return t;}
test('transfer receipt, ledger, balance, category, daily chart and summary reconcile once',()=>{
 let s=fresh();const before=financialFacts(s),count=s.ledger.length,t=execute(s,'salary',1800);
 transition(s,t.id,'unknown');assert.equal(s.ledger.length,count);assert.equal(s.balance,50000);assert.equal(financialFacts(s).expenseMinor,748711);
 transition(s,t.id,'complete');let rows=ledgerView(s).filter(r=>r.taskId===t.id);assert.equal(rows.length,1);assert.equal(rows[0].receipt,t.receipt);assert.equal(rows[0].amountMinor,180000);assert.equal(rows[0].title,'给妈妈转账');assert.equal(t.ledgerId,rows[0].id);
 let f=financialFacts(s);assert.equal(s.balance,48200);assert.equal(f.expenseMinor,928711);assert.equal(f.netExpenseMinor,893051);assert.equal(f.netCashflowMinor,686949);assert.equal(f.days[0],356800);assert.equal(f.days[1],928711);assert.equal(f.days.at(-1),928711);assert.equal(f.categories.find(x=>x[0]==='人情往来')[1],180000);
 s=JSON.parse(JSON.stringify(s));for(let i=0;i<3;i++)ensureFinance(s);assert.equal(s.balance,48200);assert.equal(s.ledger.length,count+1);assert.equal(financialFacts(s).expenseMinor,before.expenseMinor+180000);assert.throws(()=>transition(s,t.id,'complete'));assert.equal(s.ledger.length,count+1);
});
test('cancelled and unknown operations never create financial rows',()=>{
 const s=fresh(),count=s.ledger.length;let t=createTask(s,'salary');transition(s,t.id,'grant');transition(s,t.id,'cancel');assert.equal(s.ledger.length,count);assert.equal(s.balance,50000);
 t=execute(s,'salary',2000);transition(s,t.id,'unknown');const copy=JSON.parse(JSON.stringify(s));ensureFinance(copy);assert.equal(copy.balance,50000);assert.equal(copy.ledger.length,count);assert.equal(copy.tasks[0].receipt,null);
});
test('principal purchase and redemption have matching ledger rows, excluded from spending',()=>{
 const s=fresh(),baseline=financialFacts(s),historicalPrincipalCount=s.ledger.filter(r=>r.movement==='principal').length;let t=execute(s,'investment',2800);transition(s,t.id,'complete');assert.equal(s.balance,47200);assert.equal(s.invested,2800);assert.equal(financialFacts(s).expenseMinor,baseline.expenseMinor);assert.equal(financialFacts(s).principalOutMinor,280000);
 t=execute(s,'redemption',1000);transition(s,t.id,'complete');const f=financialFacts(s);assert.equal(s.balance,48200);assert.equal(s.invested,1800);assert.equal(f.incomeMinor,baseline.incomeMinor);assert.equal(f.expenseMinor,baseline.expenseMinor);assert.equal(f.principalInMinor,100000);assert.equal(s.balance+s.invested,50000);assert.equal(s.ledger.filter(r=>r.movement==='principal').length,historicalPrincipalCount+2);
});
test('old completed R1 receipt migrates to one row without double debit',()=>{
 const old={version:1,balance:48200,invested:0,spent:1800,tasks:[{id:'old-transfer',kind:'transfer',amount:1800,revision:2,status:'done',applied:true,receipt:'FP-OLD',logs:[]}]};
 ensureFinance(old);ensureFinance(old);assert.equal(old.balance,48200);assert.equal(old.ledger.filter(r=>r.receipt==='FP-OLD').length,1);assert.equal(financialFacts(old).expenseMinor,928711);
});
test('nonfinancial completion and repeated refund query do not invent cash movements',()=>{
 for(const key of['travel','subscription','safety','refund']){const s=fresh(),count=s.ledger.length,t=execute(s,key);transition(s,t.id,'complete');assert.equal(s.ledger.length,count);assert.equal(s.balance,50000);assert.equal(financialFacts(s).refundMinor,35660);}
});
