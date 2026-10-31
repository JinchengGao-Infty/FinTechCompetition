import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {prepareCardProduct,commitCardProduct,hasIssuedCard} from '../web/bank-card-products.mjs';
import {createBankCards,bankCardState} from '../web/bank-cards.mjs';
import {planOutcome,successFeedback,renderConversation} from '../web/task-feedback.mjs';
const esc=x=>String(x),money=n=>String(n);
const ui=s=>createBankCards({getState:()=>s,save(){},esc,money,icon:()=>'',onLedger(){}});
test('fresh wallet has two cards; explicit application creates exactly one third card and no debit',()=>{
 const s=fresh(),cash=s.balance,rows=s.ledger.length;
 assert.equal(hasIssuedCard(s),false);assert.match(ui(s).html(),/2张/);assert.doesNotMatch(ui(s).html(),/bank-card-credit/);
 const t=prepareCardProduct(s,'apply'),result=commitCardProduct(s,t);assert.equal(result.external,false);
 assert.match(ui(s).html(),/3张/);assert.equal(bankCardState(s,'credit').dueMinor,0);assert.equal(s.balance,cash);assert.equal(s.ledger.length,rows);
 const once=structuredClone(s);assert.deepEqual(commitCardProduct(s,t),result);assert.deepEqual(s,once);assert.throws(()=>prepareCardProduct(s,'apply'));
 assert.equal(Object.values(s.safety.executions).filter(e=>e.status==='completed').length,1);
});
test('limit change is bound, audited, persistent and never changes balance',()=>{
 let s=fresh();commitCardProduct(s,prepareCardProduct(s,'apply'));const cash=s.balance,t=prepareCardProduct(s,'limit',3000000);
 const changed=structuredClone(t);changed.parameters.limitMinor=4000000;assert.throws(()=>commitCardProduct(s,changed));
 commitCardProduct(s,t);s=JSON.parse(JSON.stringify(s));assert.equal(bankCardState(s,'credit').limitMinor,3000000);assert.equal(s.balance,cash);
 const stale=prepareCardProduct(s,'limit',3500000);commitCardProduct(s,prepareCardProduct(s,'limit',2500000));assert.throws(()=>commitCardProduct(s,stale));
 for(const amount of [0,99999,5000001,NaN])assert.throws(()=>prepareCardProduct(s,'limit',amount));
});
test('lock, expiry and recovery invalidate pending application without adding a card',()=>{
 for(const mode of ['lock','epoch','expiry']){const s=fresh(),t=prepareCardProduct(s,'apply');s.safety??={epoch:0};if(mode==='lock')s.safety.locked=true;if(mode==='epoch')s.safety.epoch++;const before=structuredClone(s);assert.throws(()=>commitCardProduct(s,t,{now:mode==='expiry'?t.expiresAt:Date.now()}));assert.deepEqual(s,before);assert.equal(hasIssuedCard(s),false);}
});
test('success animation requires a committed receipt, never pending, failure or cancellation',()=>{
 for(const status of ['pending','started','failed','cancelled'])assert.equal(successFeedback({status,receipt_id:'fake'},{esc}),'');
 assert.equal(successFeedback({status:'succeeded'},{esc}),'');assert.match(successFeedback({status:'succeeded',receipt_id:'receipt',operation:'send_sms'},{esc}),/sent/);
});
test('scheduled transfer is arranged but not paid; partial, failed and cancelled results remain distinct',()=>{
 const step=(id,status,receipt)=>({id,status,receipt_id:receipt,confirmation_required:true,payload:{amount_minor:5000},operation:'pay_deposit'});
 const p={kind:'birthday',status:'scheduled',steps:[step('deposit','succeeded','d'),{...step('later','pending'),operation:'transfer',scheduled_for:'2026-11-09T05:14:00Z'}]};
 const o=planOutcome(p,{now:Date.parse('2026-11-02'),granted:true});assert.equal(o.status,'已安排，待执行');assert.match(o.summary,/尚未转出/);assert.match(o.summary,/50/);assert.equal(o.collapse,true);
 assert.equal(planOutcome(p,{now:0,granted:false}).collapse,false);
 p.status='cancelled';assert.equal(planOutcome(p).status,'已取消');p.status='failed';assert.equal(planOutcome(p).status,'部分完成');
});
test('completed plan history folds only its own messages and keeps final summary and unrelated chat visible',()=>{
 const messages=[{id:'a',text:'first',planId:'p'},{id:'b',text:'hi'},{id:'c',text:'done',planId:'p'},{id:'d',text:'summary',planId:'p',planSummary:true}];
 const html=renderConversation(messages,{esc,renderMessage:m=>`<p>${m.text}</p>`,presentations:{p:{collapse:true,status:'已完成',title:'安排'}}});
 assert.equal((html.match(/<details/g)||[]).length,1);assert.match(html,/<\/details><p>hi<\/p><p>summary<\/p>/);assert.doesNotMatch(html,/<details[^>]*open/);
});
