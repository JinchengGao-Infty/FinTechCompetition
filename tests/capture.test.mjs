import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {financialFacts,ensureFinance} from '../web/finance-state.mjs';
import {createCaptureStore} from '../web/capture-store.mjs';
import {createCaptureFlow,captureFields} from '../web/baseline/capture-flow.js';
const setup=()=>{const state=fresh();ensureFinance(state);let persisted,saves=0;return {state,get persisted(){return persisted},get saves(){return saves},request:createCaptureStore({getState:()=>state,save:()=>{saves++;persisted=JSON.parse(JSON.stringify(state));}})}};
const bill={event_date:'2026-11-02',amount:'28.45',type:'expense',category:'餐饮',description:'录入测试午餐',movement:'cashflow'};
const create=(r,id='manual-test',value=bill)=>r('/capture/manual',{method:'POST',body:{request_id:id,bill:value}});
const confirm=(r,b)=>r('/capture/'+b.id+'/confirm',{method:'POST',body:{challenge:b.challenge,rows:b.rows.map(captureFields)}});

const safety=state=>state.safety||=({epoch:0,locked:false});
test('lock and pause reject every new capture write without changing ledger or pending review',async()=>{
 for(const mode of ['locked','paused']){
  const x=setup(),b=await create(x.request),balance=x.state.balance;
  if(mode==='locked'){safety(x.state).locked=true;safety(x.state).epoch++;}else x.state.paused=true;
  const before=structuredClone(x.state),saves=x.saves;
  for(const write of [
   ()=>create(x.request,'after-lock'),
   ()=>confirm(x.request,b),
   ()=>x.request('/capture/'+b.id,{method:'PUT',body:{rows:b.rows}}),
   ()=>x.request('/capture/'+b.id,{method:'DELETE',body:{challenge:b.challenge}})
  ])await assert.rejects(write(),e=>e.code===mode&&e.status===409);
  assert.equal((await x.request('/capture/'+b.id)).status,'pending');assert.equal((await x.request('/capture')).batches.length,1);
  assert.equal(x.state.balance,balance);assert.deepEqual(x.state,before);assert.equal(x.saves,saves);
 }
});
test('locked undo cannot remove completed rows and the old ticket remains invalid after recovery',async()=>{
 const x=setup(),b=await create(x.request);await confirm(x.request,b);
 safety(x.state).locked=true;safety(x.state).epoch++;const before=structuredClone(x.state),saves=x.saves;
 const undo=()=>x.request('/capture/'+b.id+'/undo',{method:'POST',body:{challenge:b.challenge}});
 await assert.rejects(undo(),e=>e.code==='locked');assert.deepEqual(x.state,before);assert.equal(x.saves,saves);
 x.state.safety.locked=false;
 await assert.rejects(undo(),e=>e.code==='stale_write'&&e.status===409);assert.equal(x.state.ledger.filter(r=>r.captureId===b.id).length,1);
});
test('epoch invalidates pending capture after recovery; GET does not prepare an old callback again',async()=>{
 const x=setup(),b=await create(x.request);safety(x.state).locked=true;safety(x.state).epoch++;x.state.safety.locked=false;
 const before=structuredClone(x.state),saves=x.saves,reopened=await x.request('/capture/'+b.id);
 await assert.rejects(confirm(x.request,reopened),e=>e.code==='stale_write');
 await assert.rejects(x.request('/capture/'+b.id,{method:'PUT',body:{rows:b.rows}}),e=>e.code==='stale_write');
 assert.deepEqual(x.state,before);assert.equal(x.saves,saves);
 const freshBatch=await create(x.request,'review-after-recovery');await confirm(x.request,freshBatch);
 assert.equal(x.state.ledger.filter(r=>r.captureId).length,1);assert.equal(x.state.balance,49971.55);
});
test('row and challenge binding rejects changed confirmation payload or tampered pending snapshot',async()=>{
 const x=setup(),b=await create(x.request),before=structuredClone(x.state);
 for(const body of [
  {challenge:b.challenge,rows:[{...captureFields(b.rows[0]),amount:'1'}]},
  {challenge:b.challenge,rows:[{...captureFields(b.rows[0]),enabled:false}]},
  {challenge:'different',rows:b.rows.map(captureFields)},
  {challenge:b.challenge,rows:[]}
 ])await assert.rejects(x.request('/capture/'+b.id+'/confirm',{method:'POST',body}),e=>e.status===409);
 assert.deepEqual(x.state,before);
 x.state.capture.batches[0].rows[0].amount='1';const tampered=structuredClone(x.state);
 await assert.rejects(confirm(x.request,b),e=>e.code==='stale_binding');assert.deepEqual(x.state,tampered);
});
test('completed confirmation and reconcile are read-only receipts under lock, but changed replay is rejected',async()=>{
 const x=setup(),b=await create(x.request),result=await confirm(x.request,b);
 safety(x.state).locked=true;safety(x.state).epoch++;const before=structuredClone(x.state),saves=x.saves;
 assert.deepEqual(await confirm(x.request,b),result);
 assert.deepEqual(await x.request('/capture/'+b.id+'/reconcile',{method:'POST'}),result);
 assert.equal((await create(x.request,'manual-test')).id,b.id);
 await assert.rejects(x.request('/capture/'+b.id+'/confirm',{method:'POST',body:{challenge:b.challenge,rows:[{...captureFields(b.rows[0]),amount:'1'}]}}),e=>e.status===409);
 assert.deepEqual(x.state,before);assert.equal(x.saves,saves);assert.equal(x.state.ledger.filter(r=>r.captureId===b.id).length,1);
});
test('already-undone receipt replays read-only under lock and cannot affect new rows',async()=>{
 const x=setup(),b=await create(x.request);await confirm(x.request,b);
 const path='/capture/'+b.id+'/undo',body={challenge:b.challenge};await x.request(path,{method:'POST',body});
 const second=await create(x.request,'second');await confirm(x.request,second);safety(x.state).locked=true;
 const before=structuredClone(x.state),saves=x.saves;assert.deepEqual(await x.request(path,{method:'POST',body}),{status:'undone'});
 assert.deepEqual(x.state,before);assert.equal(x.saves,saves);assert.equal(x.state.ledger.filter(r=>r.captureId===second.id).length,1);
});
test('a lock or epoch change at the commit boundary rejects the in-flight clone',async()=>{
 for(const mode of ['locked','epoch','replaced','aborted']){
  const x=setup(),b=await create(x.request),initial=structuredClone(x.state);let state=x.state,calls=0,saves=0;
  const request=createCaptureStore({getState:()=>{
   calls++;
   if(calls===4){
    if(mode==='locked')safety(state).locked=true;
    if(mode==='epoch')safety(state).epoch++;
    if(mode==='replaced')state=structuredClone(state);
   }
   return state;
  },save:()=>saves++});
  // Initial read, preparation, original commit read, latest live commit read.
  const signal=mode==='aborted'?{get aborted(){return calls>=3}}:undefined;
  await assert.rejects(request('/capture/'+b.id+'/confirm',{method:'POST',body:{challenge:b.challenge,rows:b.rows.map(captureFields)},signal}),e=>mode==='locked'?e.code==='locked':mode==='epoch'?e.code==='stale_write':mode==='aborted'?e.name==='AbortError':e.status===409);
  assert.equal(saves,0);assert.equal(state.balance,initial.balance);assert.equal(state.ledger.filter(r=>r.captureId).length,0);
  assert.equal(state.capture.batches[0].status,'pending');
 }
});
test('legacy capture remains readable without silently creating a writable review ticket',async()=>{
 const x=setup(),b=await create(x.request);delete x.state.capture.batches[0].write_ticket;
 const before=structuredClone(x.state),saves=x.saves;assert.equal((await x.request('/capture/'+b.id)).id,b.id);
 await assert.rejects(confirm(x.request,b),e=>e.code==='stale_write');assert.deepEqual(x.state,before);assert.equal(x.saves,saves);
});
test('known guard rejection never turns the capture flow into an unknown financial result',async()=>{
 const x=setup(),store={get:()=>({}),set:()=>{}},flow=createCaptureFlow({request:x.request,store});
 await flow.manual(bill);safety(x.state).locked=true;safety(x.state).epoch++;
 await flow.confirm();assert.equal(flow.state.confirmationUnknown,false);assert.equal(x.state.balance,50000);
 assert.equal(x.state.ledger.filter(r=>r.captureId).length,0);
});
test('candidate review never posts until confirmed; confirmation and reload are idempotent; undo affects only its rows',async()=>{
 const x=setup(),before=financialFacts(x.state),b=await create(x.request);
 assert.equal(x.state.balance,50000);assert.equal((await x.request('/capture')).batches.length,1);
 await confirm(x.request,b);await confirm(x.request,b);
 assert.equal(x.state.balance,49971.55);assert.equal(financialFacts(x.state).expenseMinor,before.expenseMinor+2845);
 assert.equal(x.state.ledger.filter(r=>r.captureId===b.id).length,1);
 const reloaded=JSON.parse(JSON.stringify(x.persisted)),r=createCaptureStore({getState:()=>reloaded,save:()=>{}});
 await confirm(r,b);assert.equal(reloaded.balance,49971.55);
 await r('/capture/'+b.id+'/undo',{method:'POST',body:{challenge:b.challenge}});
 assert.equal(reloaded.balance,50000);assert.equal(financialFacts(reloaded).expenseMinor,before.expenseMinor);
});
test('edit invalidates old confirmation; duplicates need keep/skip; discarded and invalid candidates do not post',async()=>{
 const x=setup(),b=await create(x.request);
 const edited=await x.request('/capture/'+b.id,{method:'PUT',body:{rows:[{...b.rows[0],amount:'30'}]}});
 await assert.rejects(confirm(x.request,b),e=>e.status===409);await confirm(x.request,edited);
 const duplicate=await create(x.request,'dupe',{...bill,amount:'30'});
 await assert.rejects(confirm(x.request,duplicate),e=>e.status===409);
 const kept=await x.request('/capture/'+duplicate.id,{method:'PUT',body:{rows:[{...duplicate.rows[0],duplicate_decision:'keep'}]}});await confirm(x.request,kept);
 const bad=await create(x.request,'bad',{...bill,amount:'0',event_date:'2026-02-30'});
 await assert.rejects(confirm(x.request,bad),e=>e.status===422);
 await x.request('/capture/'+bad.id,{method:'DELETE',body:{challenge:bad.challenge}});
 assert.equal(x.state.ledger.filter(r=>r.captureId).length,2);
 await assert.rejects(create(x.request,'manual-test',{...bill,amount:'45'}),e=>e.status===409);
});
test('original flow imports UTF8 CSV and keeps internal/principal/refund accounting distinct',async()=>{
 const x=setup(),before=financialFacts(x.state);
 const csv='日期,收支,金额,分类,备注,资金性质\n2026-11-02,支出,20,其他,"测试,双引号""备注",internal_transfer\n2026-11-02,支出,100,理财本金,本金记录,principal\n2026-11-02,收入,5,退款,退款记录,cashflow';
 const content=Buffer.from(csv).toString('base64');
 const b=await x.request('/capture/csv',{method:'POST',body:{request_id:'csv1',content}});
 assert.equal(b.rows[0].description,'测试,双引号"备注');await confirm(x.request,b);
 assert.equal(x.state.balance,49905);assert.equal(x.state.invested,100);
 const f=financialFacts(x.state);assert.equal(f.expenseMinor,before.expenseMinor);assert.equal(f.refundMinor,before.refundMinor+500);
 const store={get:()=>({}),set:()=>{}};const flow=createCaptureFlow({request:x.request,store});
 await flow.text('午餐32元','2026-11-02');await flow.confirm();assert.equal(x.state.balance,49873);
});
