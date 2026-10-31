import test from 'node:test';
import assert from 'node:assert/strict';
import {birthdayPaymentSummary,createCompanionController} from '../web/companion-controller.mjs';
import {fresh} from '../web/engine.mjs';

const NOW=Date.parse('2026-11-02T01:00:00Z');
function plan(deposit='needs_confirmation',transfer='needs_confirmation',status='needs_confirmation'){
 return {kind:'birthday',status,steps:[
  {id:'cake.deposit',status:deposit,payload:{amount_minor:5000},receipt_id:deposit==='succeeded'?'DEMO:deposit':null},
  {id:'birthday.transfer',status:transfer,payload:{amount_minor:52000},scheduled_for:'2026-11-09T13:14:00+08:00',receipt_id:transfer==='succeeded'?'DEMO:transfer':null}
 ]};
}
const summary=p=>birthdayPaymentSummary(p,{now:NOW});
async function readyStep(controller,id,stepId){
 const until=performance.now()+2000;
 while(true){const p=controller.manager.getPlan(id),n=p.steps.find(x=>x.id===stepId);if(n&&(n.dependencies||[]).every(d=>p.steps.find(x=>x.id===d)?.status==='succeeded'))return p;if(performance.now()>until)throw Error('Birthday step dependencies did not complete');await new Promise(r=>setTimeout(r,2));}
}


test('unconfirmed birthday does not describe a planned deposit as paid',()=>{
 const text=summary(plan());assert.match(text,/尚未付款/);assert.match(text,/¥50\.00/);assert.match(text,/¥520\.00/);assert.doesNotMatch(text,/已付|已转账/);
});
test('a started deposit is processing rather than paid',()=>{
 const text=summary(plan('started','pending','scheduled'));assert.match(text,/定金 ¥50\.00 处理中/);assert.match(text,/尚无完成回执/);assert.doesNotMatch(text,/已付/);
});
test('a receipted deposit and future pending transfer show the exact scheduled wait',()=>{
 const text=summary(plan('succeeded','pending','scheduled'));assert.match(text,/已付定金 ¥50\.00/);assert.match(text,/转账 ¥520\.00 等待 2026\/11\/9 13:14:00/);assert.doesNotMatch(text,/已转账/);
});
test('an overdue or unconfirmed transfer asks for review rather than claiming a future authorized payment',()=>{
 const pending=plan('succeeded','pending','scheduled');
 assert.match(birthdayPaymentSummary(pending,{now:Date.parse('2026-11-09T05:15:00Z')}),/转账 ¥520\.00 待重新核对/);
 assert.match(summary(plan('succeeded','needs_confirmation')),/待重新核对/);
});
test('completed birthday reports both receipts and the actual total of 570 yuan',()=>{
 const text=summary(plan('succeeded','succeeded','succeeded'));assert.match(text,/已付定金 ¥50\.00，已转账 ¥520\.00，累计支出 ¥570\.00/);assert.doesNotMatch(text,/当前付款仅|生日当天转账|等待|待完成/);
});
test('cancellation before payment says no payment, not a retained deposit',()=>{
 const text=summary(plan('cancelled','cancelled','cancelled'));assert.match(text,/未完成步骤已取消；尚未付款/);assert.doesNotMatch(text,/已付|已转账|支出保留/);
});
test('cancellation after the deposit preserves the confirmed expense and never implies a refund',()=>{
 const text=summary(plan('succeeded','cancelled','cancelled'));assert.match(text,/已付定金 ¥50\.00/);assert.match(text,/已完成支出保留/);assert.doesNotMatch(text,/已转账|已退款|等待/);
});
test('failure before any payment is not presented as financial success',()=>{
 const text=summary(plan('failed','pending','failed'));assert.match(text,/尚未付款/);assert.match(text,/未完成步骤需处理/);assert.doesNotMatch(text,/已付|已转账/);
});
test('a failed transfer retains its completed deposit and does not claim 520 was paid',()=>{
 const text=summary(plan('succeeded','failed','failed'));assert.match(text,/已付定金 ¥50\.00/);assert.match(text,/未完成步骤需处理/);assert.doesNotMatch(text,/已转账|累计支出 ¥570/);
});
test('success without a receipt is unresolved, never paid or definitively unpaid',()=>{
 const p=plan('succeeded','pending','scheduled');p.steps[0].receipt_id=null;
 const text=summary(p);assert.match(text,/付款回执待核实/);assert.doesNotMatch(text,/已付定金|尚未付款/);
});
test('pausing a funded birthday does not promise automatic payment at the scheduled time',()=>{
 const text=birthdayPaymentSummary(plan('succeeded','pending','scheduled'),{now:NOW,paused:true});assert.match(text,/已付定金 ¥50\.00/);assert.match(text,/后续已暂停，需重新核对/);assert.doesNotMatch(text,/等待|已转账/);
});
test('payment amounts are derived from the bound steps, not hardcoded birthday fixture values',()=>{
 const p=plan('succeeded','succeeded','succeeded');p.steps[0].payload.amount_minor=2000;p.steps[1].payload.amount_minor=25000;
 assert.match(summary(p),/已付定金 ¥20\.00，已转账 ¥250\.00，累计支出 ¥270\.00/);
});

test('the actual birthday card follows the local ledger from unconfirmed to deposit to completed transfer',async()=>{
 const priorLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),priorFetch=globalThis.fetch;
 let current=fresh(),controller,calls=0;const errors=[];current.reduceMotion=true;
 Object.defineProperty(globalThis,'location',{value:{href:'http://127.0.0.1:65321/?session=birthday-summary'},configurable:true});
 globalThis.fetch=async()=>{calls++;throw Error('Birthday summary uses local adapters only');};
 try{
  controller=createCompanionController({getState:()=>current,commit:next=>{current=structuredClone(next);},esc:String,repaint(){},onError:message=>errors.push(message)});
  const before=current.balance;
  await controller.handleAction('demo-birthday',{},{});
  assert.match(controller.render(),/尚未付款/);
  const id=current.companion.activePlanId;
  for(const stepId of ['restaurant.reserve','cake.message','cake.deposit','birthday.schedule','birthday.transfer']){const p=await readyStep(controller,id,stepId);await controller.handleAction('plan-confirm',{dataset:{plan:id,step:stepId,revision:String(p.revision)}},{isTrusted:true});}
  assert.equal(current.balance,before-50);
  assert.match(controller.render(),/已付定金 ¥50\.00；转账 ¥520\.00 等待/);
  await controller.handleAction('demo-clock-birthday',{},{});
  const rows=current.ledger.filter(row=>row.companionRun===current.companion.runId);
  assert.equal(rows.length,2);assert.equal(rows.reduce((sum,row)=>sum+row.amountMinor,0),57000);
  assert.equal(current.balance,before-570);
  assert.match(controller.render(),/已付定金 ¥50\.00，已转账 ¥520\.00，累计支出 ¥570\.00/);
  assert.doesNotMatch(controller.render(),/当前付款仅定金50元/);
  assert.deepEqual(errors,[]);assert.equal(calls,0);
 }finally{
  controller?.dispose();globalThis.fetch=priorFetch;
  if(priorLocation)Object.defineProperty(globalThis,'location',priorLocation);else delete globalThis.location;
 }
});
