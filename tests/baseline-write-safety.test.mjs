import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaselineBridge} from '../web/baseline-bridge.mjs';
import {fresh} from '../web/engine.mjs';
import {
 ensureSafety,lockSafety,invalidateSafetyEpoch,beginRecovery,recoverSafety,DEMO_VERIFICATION_CODE
} from '../web/safety-policy.mjs';

const NOW=Date.parse('2026-11-02T01:00:00.000Z');
const USER={kind:'user',method:'click'};
const errorCode=code=>error=>error?.code===code;
const uncertainWrite=code=>error=>error?.code===code&&error.outcomeUnknown===true;
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function harness({refreshSession}={}){
 const state=fresh();ensureSafety(state);
 let saves=0;
 const bridge=createBaselineBridge({getState:()=>state,save(){saves++;},render(){},esc:String,money:String,
  showModal(){},closeModal(){},start(){},icon:()=>'',getCsrf:()=>'',namespace:'baseline-safety-test',
  setFinancial(){},setInvestment(){},openRisk(){},refreshSession});
 return {state,bridge,get saves(){return saves;}};
}
function recover(state){
 const challenge=beginRecovery(state,{source:USER,now:NOW+1});
 assert.equal(recoverSafety(state,{challengeId:challenge.id,code:DEMO_VERIFICATION_CODE,source:USER,now:NOW+2}).ok,true);
}
function budgetBody(id='budget-safety'){
 return {total_minor:900000,categories:[{category:'housing',limit_minor:350000}],expected_revision:0,request_id:id};
}

test('locked or paused budget writes cannot create budget data, request receipts or saves',async()=>{
 for(const reason of ['locked','paused']){
  const h=harness();
  if(reason==='locked')lockSafety(h.state,'manual_lock',{now:NOW});else h.state.paused=true;
  const before=structuredClone(h.state);
  await assert.rejects(h.bridge.request('/budget?month=2026-11',{method:'PUT',body:budgetBody()}),errorCode(reason));
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
 }
});

test('a new reviewed budget write after recovery succeeds once; locking blocks its replay too',async()=>{
 const h=harness(),body=budgetBody('after-recovery');
 lockSafety(h.state,'manual_lock',{now:NOW});recover(h.state);
 const result=await h.bridge.request('/budget?month=2026-11',{method:'PUT',body});
 assert.equal(result.total_minor,900000);assert.equal(result.revision,1);assert.equal(h.saves,1);
 assert.deepEqual(await h.bridge.request('/budget?month=2026-11',{method:'PUT',body}),result);
 assert.equal(h.saves,1);
 lockSafety(h.state,'manual_lock',{now:NOW+3});
 await assert.rejects(h.bridge.request('/budget?month=2026-11',{method:'PUT',body}),errorCode('locked'));
 assert.equal(h.state.nativeBudget['2026-11'].revision,1);assert.equal(h.saves,1);
});

test('locked position maintenance rejects every write verb before dispatch',async t=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Unexpected network dispatch');};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness();lockSafety(h.state,'manual_lock',{now:NOW});
 for(const method of ['POST','PUT','DELETE']){
  await assert.rejects(h.bridge.request('/positions/synthetic',{method,body:{request_id:'blocked-'+method}}),errorCode('locked'));
 }
 await assert.rejects(h.bridge.request('/position-imports/synthetic/confirm',{method:'POST',body:{request_id:'blocked-import'}}),errorCode('locked'));
 assert.equal(calls,0);assert.equal(h.saves,0);
});

test('already-dispatched position response cannot refill the UI after a lock; it is never retried',async t=>{
 const previous=globalThis.fetch,body=deferred(),arrived=deferred();let calls=0,refreshes=0,refills=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,status:200,json(){arrived.resolve();return body.promise;}};};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness({refreshSession:async()=>{refreshes++;}}),before=structuredClone(h.state);
 const pending=h.bridge.request('/positions/synthetic',{method:'PUT',body:{quantity:4,request_id:'late-lock'}})
  .then(result=>{refills++;h.state.syntheticPositionOverlay=result;return result;});
 const rejection=assert.rejects(pending,uncertainWrite('locked'));
 await arrived.promise;lockSafety(h.state,'manual_lock',{now:NOW});
 body.resolve({id:'synthetic',quantity:4});await rejection;
 assert.equal(calls,1);assert.equal(refreshes,0);assert.equal(refills,0);assert.equal(h.saves,0);
 assert.equal(h.state.syntheticPositionOverlay,undefined);
 assert.deepEqual(h.state.ledger,before.ledger);assert.equal(h.state.balance,before.balance);
 // The synthetic response cannot prove rollback of an already-sent server write.
 // This test asserts only local rejection and no retry, never remote cancellation.
});

test('independent recovery does not revive an outstanding position callback or replay the request',async t=>{
 const previous=globalThis.fetch,body=deferred(),arrived=deferred();let calls=0,refills=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,status:200,json(){arrived.resolve();return body.promise;}};};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness(),epoch=h.state.safety.epoch;
 const pending=h.bridge.request('/position-imports/synthetic/confirm',{method:'POST',body:{request_id:'late-recovery'}})
  .then(result=>{refills++;return result;});
 const rejection=assert.rejects(pending,uncertainWrite('stale_write'));
 await arrived.promise;lockSafety(h.state,'manual_lock',{now:NOW});recover(h.state);
 assert.equal(h.state.safety.locked,false);assert.ok(h.state.safety.epoch>epoch);
 body.resolve({status:'confirmed',id:'synthetic'});await rejection;
 assert.equal(calls,1);assert.equal(refills,0);assert.equal(h.saves,0);
});

test('pause followed by resume invalidates an outstanding maintenance callback',async t=>{
 const previous=globalThis.fetch,body=deferred(),arrived=deferred();
 globalThis.fetch=async()=>({ok:true,status:200,json(){arrived.resolve();return body.promise;}});
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness();
 const pending=h.bridge.request('/positions/synthetic',{method:'DELETE',body:{request_id:'late-pause'}});
 const rejection=assert.rejects(pending,uncertainWrite('stale_write'));
 await arrived.promise;h.state.paused=true;invalidateSafetyEpoch(h.state,'manual_pause',{now:NOW});h.state.paused=false;
 body.resolve({deleted:true});await rejection;assert.equal(h.saves,0);
});

test('changing a maintenance payload while awaiting the response invalidates its binding',async t=>{
 const previous=globalThis.fetch,body=deferred(),arrived=deferred(),request={quantity:4,request_id:'parameter-edit'};let sent;
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,status:200,json(){arrived.resolve();return body.promise;}};};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness(),pending=h.bridge.request('/positions/synthetic',{method:'PUT',body:request});
 const rejection=assert.rejects(pending,uncertainWrite('stale_binding'));
 await arrived.promise;request.quantity=40;body.resolve({quantity:4});await rejection;
 assert.equal(sent.quantity,4);assert.equal(h.saves,0);
});

test('unauthorized metadata writes are not refreshed or retried automatically',async t=>{
 const previous=globalThis.fetch;let calls=0,refreshes=0;
 globalThis.fetch=async()=>{calls++;return {ok:false,status:401,json:async()=>({message:'Session expired'})};};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness({refreshSession:async()=>{refreshes++;}});
 await assert.rejects(h.bridge.request('/positions/synthetic',{method:'PUT',body:{quantity:4,request_id:'expired-write'}}),error=>error.status===401);
 assert.equal(calls,1);assert.equal(refreshes,0);assert.equal(h.saves,0);
});

test('locked read-only requests still work and may renew an expired session once',async t=>{
 const previous=globalThis.fetch;let calls=0,refreshes=0;
 globalThis.fetch=async()=>++calls===1?{ok:false,status:401,json:async()=>({})}:{ok:true,status:200,json:async()=>({items:[]})};
 t.after(()=>{globalThis.fetch=previous;});
 const h=harness({refreshSession:async()=>{refreshes++;}});lockSafety(h.state,'manual_lock',{now:NOW});
 assert.deepEqual(await h.bridge.request('/positions?read-only=1'),{items:[]});
 assert.equal(calls,2);assert.equal(refreshes,1);assert.equal(h.saves,0);
});
