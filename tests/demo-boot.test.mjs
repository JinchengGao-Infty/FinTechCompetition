import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,createTask} from '../web/engine.mjs';
import {resetDemoOnBoot,createDocumentLifetime} from '../web/demo-boot.mjs';
import {prepareCardProduct,commitCardProduct,hasIssuedCard} from '../web/bank-card-products.mjs';
import {lockSafety} from '../web/safety-policy.mjs';

test('two cards become three once, next document resets only card/chat presentation',()=>{
 const state=fresh(),financial={balance:state.balance,ledger:structuredClone(state.ledger),invested:state.invested};
 const before=prepareCardProduct(state,'apply');commitCardProduct(state,before);
 state.messages=[{role:'user',text:'old'}];state.agentDraftHistory={old:{status:'awaiting_details'}};
 state.companion={eventCursor:'test:4',proactiveSnapshot:{plans:[{id:'old-scheduled'}]}};
 state.bankCards.living={paused:true};
 resetDemoOnBoot(state);
 assert.equal(hasIssuedCard(state),false);assert.deepEqual(state.messages,[]);
 assert.deepEqual(state.agentDraftHistory,{});assert.deepEqual(state.companion,{eventCursor:'test:4'});
 assert.deepEqual(state.bankCards.living,{paused:true});
 assert.equal(state.balance,financial.balance);assert.deepEqual(state.ledger,financial.ledger);assert.equal(state.invested,financial.invested);
 assert.throws(()=>commitCardProduct(state,before),e=>e.code==='stale_write');
 commitCardProduct(state,prepareCardProduct(state,'apply'));assert.equal(hasIssuedCard(state),true);
});

test('refresh cancels pending Bot work and retains completed facts and safety lock',()=>{
 const state=fresh(),pending=createTask(state,'transfer',{reuse:false});pending.agentOrigin=true;
 const done={...structuredClone(pending),id:'completed',status:'done',receipt:'synthetic-receipt'};state.tasks.push(done);
 lockSafety(state,'manual_lock');const beforeEpoch=state.safety.epoch,balance=state.balance;
 resetDemoOnBoot(state);
 assert.equal(pending.status,'cancelled');assert.equal(done.status,'done');assert.equal(done.receipt,'synthetic-receipt');
 assert.equal(state.safety.locked,true);assert.ok(state.safety.epoch>beforeEpoch);assert.equal(state.balance,balance);
});

test('a response after pagehide cannot overwrite a fresh document',async()=>{
 const oldPage=createDocumentLifetime(),newPage=createDocumentLifetime();let stored='old';
 let finish;const response=new Promise(resolve=>finish=resolve).then(()=>oldPage.commit(()=>{stored='late old task';}));
 oldPage.stop();newPage.commit(()=>{stored='new empty conversation';});finish();await response;
 assert.equal(stored,'new empty conversation');assert.equal(oldPage.active(),false);assert.equal(newPage.active(),true);
});


test('new document clears synthetic source and breaker while invalidating old work',()=>{
 for(const reason of ['prompt_injection','password_failures','reported_scam']){
  const state=fresh();state.messages=[{eventCard:{type:'injection_order'}}];
  state.companion={eventCursor:'test:9',securityNotice:{stage:'verify'},pendingEvent:{type:'injection_order'}};
  lockSafety(state,reason);const epoch=state.safety.epoch,balance=state.balance;
  resetDemoOnBoot(state);
  assert.equal(state.safety.locked,false);assert.equal(state.safety.lock,null);
  assert.ok(state.safety.epoch>epoch);assert.deepEqual(state.messages,[]);
  assert.deepEqual(state.companion,{eventCursor:'test:9'});assert.equal(state.balance,balance);
 }
});
