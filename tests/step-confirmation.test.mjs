import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {createCompanionController} from '../web/companion-controller.mjs';

// The actual controller, policy and local adapters are used. The model response
// and microphone are controlled boundaries; these are not real-provider claims.
const copy=x=>structuredClone(x);
const compoundFields={items:[
 {id:'item-1',kind:'sms',contact_id:'mom',message:'妈妈，周六中午一起吃饭。'},
 {id:'item-2',kind:'cake',product_id:'demo-cake-01',date:'2026-11-09',pickup_time:'16:00',fulfillment:'pickup',source_account:'living_1608'}
]};
const response=(fields=compoundFields,extra={})=>({status:'propose',scenario:'compound',reply:'请先核对给妈妈的短信，再逐项确认蛋糕。',speak:null,
 fields:copy(fields),missing:[],mode:'create',task_id:null,context_action:'new',cards:[{type:'compound_plan'}],actions:[{type:'prepare_compound'}],query:null,period_month:null,...extra});
const control=(id,action='cancel')=>({status:'propose',scenario:'plan_control',reply:'已停止后续安排。',speak:null,
 fields:{plan_action:action},missing:[],mode:'update',task_id:id,context_action:'continue',cards:[{type:'plan_control'}],actions:[{type:'control_plan'}],query:null,period_month:null});
const closed=new Set(['succeeded','cancelled']);
function nextWrite(plan){return plan.steps.find(n=>n.confirmation_required&&!closed.has(n.status)&&(n.dependencies||[]).every(d=>plan.steps.find(x=>x.id===d)?.status==='succeeded'));}
async function until(predicate){const end=performance.now()+3000;while(!predicate()){if(performance.now()>end)throw Error('Expected local write boundary was not reached');await new Promise(r=>setTimeout(r,2));}}
async function withController(run){
 const oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),oldFetch=globalThis.fetch;
 let state=fresh(),controller,calls=0;state.reduceMotion=true;const errors=[],sends=[];
 Object.defineProperty(globalThis,'location',{value:{href:'http://127.0.0.1:65321/?session=step-confirmation-tests&app=1#/bot'},configurable:true});
 globalThis.fetch=async()=>{calls++;throw Error('No provider or TTS network calls belong to this fixture');};
 try{
  controller=createCompanionController({getState:()=>state,commit:next=>{state=copy(next);},esc:x=>String(x),repaint(){},onSend:(text,options)=>sends.push({text,options}),onError:x=>errors.push(x)});
  const h={controller,get state(){return state;},errors,sends,
   plan:()=>controller.manager.getPlan(state.companion.activePlanId||controller.manager.snapshot().plans.at(-1)?.id),
   grantIds:()=>Object.keys(state.safety.grants),
   writes:()=>Object.values(state.safety.executions).filter(x=>x.status==='completed'&&x.snapshot.writes),
   button(plan,node){return {dataset:{plan:plan.id,step:node.id,revision:String(plan.revision)}};},
   async confirm(){await until(()=>!!nextWrite(h.plan()));const p=h.plan(),n=nextWrite(p);await controller.handleAction('plan-confirm',h.button(p,n),{isTrusted:true});return n.id;}
  };
  await run(h);assert.equal(calls,0);
 }finally{controller?.dispose();globalThis.fetch=oldFetch;if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else delete globalThis.location;}
}
const plainMain=html=>html.split('<details')[0];

test('a compound proposal retains both requests and displays the exact pending SMS before any write consent',async()=>{
 await withController(async h=>{
  const balance=h.state.balance,rows=h.state.ledger.length;
  h.controller.applyModelResult(response(),{originTurnId:'compound-visible-1'});
  await until(()=>!!nextWrite(h.plan()));
  assert.equal(h.plan().kind,'compound');assert.equal(h.plan().fields.items.length,2);
  assert.deepEqual(h.plan().steps.filter(n=>n.confirmation_required).map(n=>n.operation),['send_sms','message_contact','pay_deposit']);
  assert.equal(h.grantIds().length,0);assert.equal(h.writes().length,0);
  assert.equal(h.state.balance,balance);assert.equal(h.state.ledger.length,rows);
  const main=plainMain(h.controller.render());assert.match(main,/妈妈/);assert.match(main,/138\s*0000\s*0001/);assert.match(main,/妈妈，周六中午一起吃饭。/);
  assert.doesNotMatch(main,/前面的安排已处理|已发送|已预订|已付定金/);
 });
});

test('three separate confirmations send SMS, create the cake order, then debit only its deposit',async()=>{
 await withController(async h=>{
  const balance=h.state.balance,rows=h.state.ledger.length;
  h.controller.applyModelResult(response(),{originTurnId:'compound-three-steps'});
  assert.equal(await h.confirm(),'item-1.sms');
  assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').status,'succeeded');
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.order').status,'succeeded');
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.deposit').status,'succeeded');
  assert.deepEqual(h.writes().map(x=>x.snapshot.kind),['message']);assert.equal(h.state.balance,balance);assert.equal(h.state.ledger.length,rows);
  const cake=plainMain(h.controller.render());assert.match(cake,/麦穗蛋糕|陈老板/);assert.match(cake,/138\s*0000\s*0004/);assert.match(cake,/2026-11-09/);assert.match(cake,/16:00/);assert.match(cake,/188/);assert.match(cake,/50/);assert.doesNotMatch(cake,/预订2026-11-09 16:00自取的六寸草莓蛋糕一份/);assert.match(h.controller.render(),/预订2026-11-09 16:00自取的六寸草莓蛋糕一份/);
  assert.equal(await h.confirm(),'item-2.cake.order');
  assert.equal(h.plan().steps.find(n=>n.id==='item-2.cake.order').status,'succeeded');
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.deposit').status,'succeeded');
  assert.equal(h.writes().length,2);assert.equal(h.state.balance,balance);assert.equal(h.state.ledger.length,rows);
  assert.equal(await h.confirm(),'item-2.cake.deposit');
  assert.equal(h.plan().status,'succeeded');assert.equal(h.writes().length,3);
  assert.equal(h.state.balance,balance-50);assert.equal(h.state.ledger.length,rows+1);
  const receipt=h.plan().steps.find(n=>n.id==='item-2.cake.deposit').receipt_id;assert.ok(receipt);
  await h.controller.manager.tick({execute:true});
  assert.equal(h.state.balance,balance-50);assert.equal(h.state.ledger.length,rows+1);
  assert.equal(h.plan().steps.find(n=>n.id==='item-2.cake.deposit').receipt_id,receipt);
  assert.deepEqual(h.errors,[]);
 });
});

test('an old SMS confirmation button cannot consent to the newly displayed cake order',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-stale-button'});await until(()=>!!nextWrite(h.plan()));
  const p=h.plan(),old=h.button(p,nextWrite(p));await h.controller.handleAction('plan-confirm',old,{isTrusted:true});
  const writes=h.writes().length,grants=h.grantIds().length,balance=h.state.balance;
  await h.controller.handleAction('plan-confirm',old,{isTrusted:true}).catch(()=>{});
  assert.equal(h.writes().length,writes);assert.equal(h.grantIds().length,grants);assert.equal(h.state.balance,balance);
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.order').status,'succeeded');
 });
});

test('editing a pending SMS invalidates its former button and preserves both request items',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-edit-sms'});await until(()=>!!nextWrite(h.plan()));
  const old=h.plan(),button=h.button(old,nextWrite(old)),updated=copy(compoundFields);updated.items[0].message='妈妈，改成周日中午一起吃饭。';
  h.controller.applyModelResult(response(updated,{mode:'update',task_id:old.id,context_action:'continue'}),{originTurnId:'compound-edited-sms'});
  assert.ok(h.plan().revision>old.revision);assert.equal(h.plan().fields.items.length,2);
  assert.match(plainMain(h.controller.render()),/改成周日中午/);assert.doesNotMatch(plainMain(h.controller.render()),/妈妈，周六中午/);
  await h.controller.handleAction('plan-confirm',button,{isTrusted:true}).catch(()=>{});
  assert.equal(h.writes().length,0);assert.equal(h.grantIds().length,0);
  assert.equal(await h.confirm(),'item-1.sms');assert.equal(h.writes().length,1);
 });
});

test('editing the future cake after a sent SMS preserves that receipt and never sends SMS again',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-edit-cake'});await h.confirm();
  const p=h.plan(),smsReceipt=p.steps.find(n=>n.id==='item-1.sms').receipt_id,updated=copy(compoundFields);updated.items[1].date='2026-11-10';
  h.controller.applyModelResult(response(updated,{mode:'update',task_id:p.id,context_action:'continue'}),{originTurnId:'compound-new-cake-date'});
  assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').receipt_id,smsReceipt);assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').status,'succeeded');
  assert.equal(await h.confirm(),'item-2.cake.order');assert.equal(await h.confirm(),'item-2.cake.deposit');
  assert.equal(h.writes().filter(x=>x.snapshot.parameters.includes('item-1.sms')).length,1);
  assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').receipt_id,smsReceipt);
 });
});

test('a new message hides the old operation card without completing or redisplaying its pending requests',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-new-message'});const id=h.state.companion.activePlanId;
  h.controller.setPending(true);assert.doesNotMatch(h.controller.render(),/妈妈，周六中午|13800000001|data-action="plan-confirm"/);
  h.controller.applyModelResult({status:'answer',scenario:'security_case',reply:'你好，可以继续说。',speak:null,fields:{},missing:[],mode:'none',task_id:null,context_action:'none',cards:[],actions:[],query:null,period_month:null});
  h.controller.setPending(false);assert.equal(h.controller.render(),'');assert.equal(h.state.companion.activePlanId,null);
  assert.equal(h.controller.manager.getPlan(id).fields.items.length,2);assert.equal(h.writes().length,0);
 });
});

test('contextual cancellation during SMS dispatch prevents its late completion and every later step',async()=>{
 await withController(async h=>{
  const balance=h.state.balance,rows=h.state.ledger.length;
  h.controller.applyModelResult(response(),{originTurnId:'compound-cancel-dispatch'});await until(()=>!!nextWrite(h.plan()));
  const p=h.plan(),node=nextWrite(p),inflight=h.controller.handleAction('plan-confirm',h.button(p,node),{isTrusted:true});
  await until(()=>Object.values(h.state.safety.executions).some(e=>e.status==='pending'&&e.snapshot.writes&&e.snapshot.kind==='message'));
  h.controller.applyModelResult(control(p.id));await inflight;
  assert.equal(h.plan().status,'cancelled');assert.equal(h.writes().length,0);
  assert.equal(h.state.balance,balance);assert.equal(h.state.ledger.length,rows);
  assert.equal(h.plan().steps.some(n=>n.confirmation_required&&n.status==='succeeded'),false);
  assert.doesNotMatch(h.controller.render(),/data-action="plan-confirm"/);
  assert.equal(h.state.messages.some(m=>/短信.*已发送|已发送.*短信|蛋糕.*已预订|已预订.*蛋糕|前面的安排已处理/.test(m.text)),false);
 });
});


test('compound fill-in retains the SMS and every known cake field while passing the explicit answer back to the model',async()=>{
 await withController(async h=>{
  const partial=copy(compoundFields);partial.items[1].date=null;
  h.controller.applyModelResult(response(partial,{status:'clarify',mode:'none',context_action:'new',missing:['items.1.date'],cards:[{type:'clarification'}],actions:[]}));
  assert.equal(h.controller.modelContext().fields.items.length,2);
  const oldForm=globalThis.FormData;
  globalThis.FormData=class {constructor(form){this.fields=form.fields;}*[Symbol.iterator](){yield* Object.entries(this.fields);}};
  try{assert.equal(await h.controller.handleSubmit({target:{id:'companion-model-form',fields:{'items.1.date':'2026-11-09'}}}),true);}finally{globalThis.FormData=oldForm;}
  assert.equal(h.sends.length,1);assert.equal(h.sends[0].options.companionClarification,true);
  assert.deepEqual(h.controller.modelContext().fields,compoundFields);
  assert.equal(h.controller.manager.snapshot().plans.length,0);assert.equal(h.grantIds().length,0);
  h.controller.applyModelResult(response(compoundFields,{context_action:'continue'}),{originTurnId:'compound-filled-response'});
  assert.equal(h.plan().fields.items.length,2);assert.equal(h.writes().length,0);
 });
});

test('retrying the same proposal origin does not create a duplicate plan or dispatch any write',async()=>{
 await withController(async h=>{
  const origin={originTurnId:'compound-retry-fixed-origin'};
  h.controller.applyModelResult(response(),origin);const id=h.state.companion.activePlanId;
  h.controller.applyModelResult(response(),origin);
  assert.equal(h.state.companion.activePlanId,id);assert.equal(h.controller.manager.snapshot().plans.length,1);
  assert.equal(h.plan().fields.items.length,2);assert.equal(h.grantIds().length,0);assert.equal(h.writes().length,0);
 });
});


test('a double click while the SMS adapter is in flight cannot mint another grant or advance the next action',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-double-click'});await until(()=>!!nextWrite(h.plan()));
  const p=h.plan(),button=h.button(p,nextWrite(p)),first=h.controller.handleAction('plan-confirm',button,{isTrusted:true});
  await until(()=>Object.values(h.state.safety.executions).some(e=>e.status==='pending'&&e.snapshot.writes));
  const count=h.grantIds().length;
  await h.controller.handleAction('plan-confirm',button,{isTrusted:true}).catch(()=>{});
  assert.equal(h.grantIds().length,count);await first;
  assert.equal(h.writes().length,1);assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').status,'succeeded');
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.order').status,'succeeded');
  assert.notEqual(h.plan().steps.find(n=>n.id==='item-2.cake.deposit').status,'succeeded');
 });
});


test('contextual cancel binds a compound clarification draft ID and cannot cancel another draft or grant authority',async()=>{
 await withController(async h=>{
  const partial=copy(compoundFields);partial.items[1].date=null;
  h.controller.applyModelResult(response(partial,{status:'clarify',mode:'none',missing:['items.1.date'],cards:[{type:'clarification'}],actions:[]}));
  const before=copy(h.state.companion.modelDraft),balance=h.state.balance,rows=h.state.ledger.length;
  assert.ok(before.draft_id);assert.equal(h.controller.modelContext().draft_id,before.draft_id);
  assert.throws(()=>h.controller.applyModelResult(control('unrelated-draft-id')),/当前安排/);
  assert.throws(()=>h.controller.applyModelResult(control(before.draft_id),{programEvent:true}),/当前安排/);
  for(const action of ['pause','resume'])assert.throws(()=>h.controller.applyModelResult(control(before.draft_id,action)),/当前安排/);
  assert.deepEqual(h.state.companion.modelDraft,before);
  h.controller.applyModelResult(control(before.draft_id));
  assert.equal(h.state.companion.modelDraft,null);assert.equal(h.controller.modelContext(),null);assert.equal(h.controller.render(),'');
  assert.equal(h.controller.manager.snapshot().plans.length,0);assert.equal(h.state.balance,balance);assert.equal(h.state.ledger.length,rows);assert.equal(h.grantIds().length,0);
 });
});

test('an ordinary greeting may hide a selected plan but cancellation still targets that exact plan and no other',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'compound-selected-cancel'});await until(()=>!!nextWrite(h.plan()));
  const selected=h.plan(),other=h.controller.manager.createBirthdayPlan({birthday_date:'2026-11-09',budget_minor:120000,partner_id:'partner-linxia',city:'上海',source_account:'living_1608'});
  assert.equal(h.controller.applyModelResult({status:'answer',scenario:'other',reply:'你好，可以继续说。',speak:null,fields:{},missing:[],mode:'none',task_id:null,context_action:'none',cards:[],actions:[],query:null,period_month:null}),null);
  h.controller.hidePresentation();
  assert.equal(h.state.companion.activePlanId,null);assert.equal(h.controller.render(),'');assert.equal(h.controller.modelContext().plan_id,selected.id);
  assert.throws(()=>h.controller.applyModelResult(control(other.id)),/当前安排/);
  assert.throws(()=>h.controller.applyModelResult(control(selected.id),{programEvent:true}),/当前安排/);
  h.controller.applyModelResult(control(selected.id));
  assert.equal(h.controller.manager.getPlan(selected.id).status,'cancelled');assert.deepEqual(h.controller.manager.getPlan(other.id),other);assert.equal(h.writes().length,0);
 });
});


test('contextual cancel during editing removes the stale form and preserves the already sent SMS',async()=>{
 await withController(async h=>{
  h.controller.applyModelResult(response(),{originTurnId:'editing-cancel'});await h.confirm();
  const p=h.plan(),receipt=p.steps.find(n=>n.id==='item-1.sms').receipt_id;
  await h.controller.handleAction('plan-edit',{dataset:{plan:p.id}},{isTrusted:true});
  assert.match(h.controller.render(),/companion-model-form/);
  h.controller.applyModelResult(control(p.id));
  assert.equal(h.plan().status,'cancelled');assert.equal(h.state.companion.modelDraft,null);
  assert.doesNotMatch(h.controller.render(),/companion-model-form|plan-confirm/);
  assert.equal(h.plan().steps.find(n=>n.id==='item-1.sms').receipt_id,receipt);
  assert.equal(h.writes().length,1);
 });
});
