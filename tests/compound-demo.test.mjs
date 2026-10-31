import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompoundFields,compoundMissing,mergeCompoundFields} from '../web/compound-fields.mjs';
import {validateCompanionResult,companionModelContext} from '../web/companion-planner.mjs';
import {createProactiveDemo,createLocalDemoAdapters,createDemoClock,PROACTIVE_DEMO_FIXTURES} from '../web/proactive-demo.mjs';
import {createProactiveSafetyBridge,proactiveSafetyOperation} from '../web/delegation-engine.mjs';
import * as policy from '../web/safety-policy.mjs';
import {fresh} from '../web/engine.mjs';
import {syncFinance} from '../web/finance-state.mjs';
const USER={kind:'user',method:'click'},copy=x=>structuredClone(x);
const fields=()=>({items:[{id:'item-1',kind:'sms',contact_id:'mom',message:'周末回家吃饭。'},{id:'item-2',kind:'cake',product_id:'demo-cake-01',date:'2026-11-09',pickup_time:'16:00',fulfillment:'pickup',source_account:'living_1608'}]});
const proposal=(patch={})=>({status:'propose',scenario:'compound',reply:'这两项逐项核对后继续。',speak:'这两项逐项核对后继续。',fields:fields(),missing:[],mode:'create',task_id:null,context_action:'new',query:null,period_month:null,cards:[{type:'compound_plan'}],actions:[{type:'prepare_compound'}],...patch});
function setup(hook,snapshot,existingState){
 let state=existingState?copy(existingState):fresh();policy.ensureSafety(state);state.compoundTest??={grants:{},effects:[]};
 const clock=createDemoClock('2026-11-02T01:00:00Z'),raw=createLocalDemoAdapters(),calls=[];
 const bridge=createProactiveSafetyBridge({policy,getState:()=>state,persist:next=>{state=copy(next);},getGrantId:op=>state.compoundTest.grants[op.id],acceptReplay:()=>true,
  onCommitEffect(next,{operation,result,context}){const key=operation.id+':v'+operation.revision;assert.ok(!next.compoundTest.effects.some(x=>x.key===key));next.compoundTest.effects.push({key,operation:context.step.operation,payload:copy(context.step.payload),receipt:result.receipt_id});if(operation.amountMinor){next.ledger.push({id:'compound:'+key,date:'2026-11-02',title:context.step.title,category:'餐饮',amountMinor:operation.amountMinor,direction:'expense',movement:'cashflow',kind:'transfer',taskId:operation.id,receipt:result.receipt_id,source:'synthetic'});syncFinance(next);}}});
 const manager=createProactiveDemo({clock,snapshot,safetyGate:bridge,adapters:{mode:'local_demo',reset:()=>raw.reset(),execute:async input=>{calls.push(copy(input));return hook?hook(input,raw):raw.execute(input);}}});
 const op=(plan,node)=>proactiveSafetyOperation({mode:'local_demo',plan_id:plan.id,revision:plan.revision,step:node,source:plan.source,now:clock.now()});
 function consent(id,stepId){const plan=manager.getPlan(id),node=plan.steps.find(n=>n.id===stepId);const next=copy(state);const operation=op(plan,node),grant=policy.authorizeSafety(next,operation,{source:USER,now:Date.parse(clock.now())});next.compoundTest.grants[operation.id]=grant.id;state=next;manager.authorize(id,{revision:plan.revision,step_ids:[stepId],confirmed:true,expires_at:new Date(Date.parse(clock.now())+300000).toISOString()});}
 return {manager,clock,calls,consent,state:()=>copy(state),replace:x=>{state=copy(x);}};
}

test('all ordered SMS/cake requests normalize inertly and cannot carry phone, grants or arbitrary tools',()=>{
 const normalized=validateCompanionResult(proposal());assert.deepEqual(normalized.fields,fields());assert.equal(normalized.actions[0].type,'prepare_compound');
 for(const patch of [{phone:'13800000099'},{authorized:true},{backend:'other'},{grant:'self'}]){const value=fields();Object.assign(value.items[0],patch);assert.throws(()=>validateCompanionResult(proposal({fields:value})));}
 assert.throws(()=>validateCompoundFields({items:[{id:'item-1',kind:'transfer'}]}));
 assert.throws(()=>validateCompanionResult(proposal({actions:[{type:'send_sms'}]})));
});

test('unknown contact and missing cake slots preserve both requests; partial answers keep known slots and order',()=>{
 const incomplete=fields();incomplete.items[0].contact_id='unknown';incomplete.items[1].date=null;incomplete.items[1].pickup_time=null;
 assert.deepEqual(compoundMissing(incomplete),['items.0.contact_id','items.1.date','items.1.pickup_time']);
 assert.throws(()=>validateCompanionResult(proposal({fields:incomplete})));
 const first=mergeCompoundFields(incomplete,{'items.0.contact_id':'mom'}),second=mergeCompoundFields(first,{items:[{id:'item-2',kind:'cake',date:'2026-11-09'}]});
 assert.equal(second.items[0].message,'周末回家吃饭。');assert.equal(second.items[1].product_id,'demo-cake-01');assert.deepEqual(compoundMissing(second),['items.1.pickup_time']);
 assert.deepEqual(mergeCompoundFields(second,{'items.1.pickup_time':'16:00'}),fields());
 assert.throws(()=>mergeCompoundFields(second,{items:[{id:'item-3',kind:'sms',contact_id:'dad',message:'新任务'}]}));
});

test('compound context includes declared tasks only and never copies authority or unrelated state',()=>{
 const context=companionModelContext({kind:'compound',id:'proactive-1',revision:2,status:'needs_confirmation',fields:fields(),missing:[],grant:'private',ledger:[{private:true}]});
 assert.deepEqual(context,{scenario:'compound',fields:fields(),missing:[],revision:2,plan_id:'proactive-1',status:'needs_confirmation'});
 assert.equal(JSON.stringify(context).includes('private'),false);
});

test('local DAG exposes exact recipient/name/phone/message/order and requires separate SMS, cake and deposit consent',async()=>{
 const f=setup(),plan=f.manager.createCompoundPlan(fields(),{request_id:'turn-1'}),before=f.state().balance;
 assert.deepEqual(plan.steps.map(n=>n.operation),['send_sms','resolve_contact','message_contact','pay_deposit']);
 assert.equal(plan.steps[0].payload.recipient_name,'妈妈');assert.equal(plan.steps[0].payload.phone,'13800000001');assert.equal(plan.steps[0].payload.message,'周末回家吃饭。');
 assert.equal(plan.steps[2].payload.shop_name,'麦穗蛋糕');assert.equal(plan.steps[2].payload.phone,'13800000004');assert.equal(plan.steps[2].payload.deposit_minor,5000);assert.equal(plan.steps[2].payload.pickup_time,'16:00');
 await f.manager.run(plan.id);assert.equal(f.calls.length,0);
 f.consent(plan.id,'item-1.sms');await f.manager.run(plan.id);let after=f.manager.getPlan(plan.id);
 assert.equal(after.steps[0].status,'succeeded');assert.equal(after.steps[1].status,'succeeded');assert.equal(after.steps[2].status,'needs_confirmation');assert.equal(f.calls.length,2);assert.equal(f.state().balance,before);
 f.consent(plan.id,'item-2.cake.order');await f.manager.run(plan.id);after=f.manager.getPlan(plan.id);assert.equal(after.steps[2].status,'succeeded');assert.equal(after.steps[3].status,'needs_confirmation');assert.equal(f.state().balance,before);
 f.consent(plan.id,'item-2.cake.deposit');await f.manager.run(plan.id);assert.equal(f.manager.getPlan(plan.id).status,'succeeded');assert.equal(f.state().balance,before-50);
 await f.manager.run(plan.id);assert.equal(f.calls.length,4);assert.equal(f.state().balance,before-50);assert.equal(f.manager.createCompoundPlan(fields(),{request_id:'turn-1'}).id,plan.id);
});

test('a retry uses its originating turn id; changed same-turn parameters never silently duplicate a plan',()=>{
 const f=setup(),a=f.manager.createCompoundPlan(fields(),{request_id:'turn-a'});assert.equal(f.manager.createCompoundPlan(fields(),{request_id:'turn-a'}).id,a.id);assert.equal(f.manager.snapshot().plans.length,1);
 const changed=fields();changed.items[0].message='改一条短信';assert.throws(()=>f.manager.createCompoundPlan(changed,{request_id:'turn-a'}));assert.equal(f.manager.snapshot().plans.length,1);
 assert.notEqual(f.manager.createCompoundPlan(changed,{request_id:'turn-b'}).id,a.id);
});

test('clarify/retry keeps all compound items and rejects stale confirmation after edit',async()=>{
 const f=setup(),initial=fields();initial.items[1].date=null;const p=f.manager.createCompoundPlan(initial);
 assert.equal(p.steps.length,0);assert.deepEqual(p.missing,['items.1.date']);const next=f.manager.clarifyCompound(p.id,{'items.1.date':'2026-11-09'});assert.equal(next.fields.items[0].message,'周末回家吃饭。');assert.equal(next.revision,2);
 f.consent(p.id,'item-1.sms');const edited=f.manager.clarifyCompound(p.id,{'items.0.message':'换成周日回家。'});assert.equal(edited.revision,3);await f.manager.run(p.id);assert.equal(f.calls.length,0);assert.deepEqual(f.state().compoundTest.effects,[]);
});

test('cancelling or locking an in-flight SMS discards its late adapter result and no deposit follows',async()=>{
 for(const action of ['cancel','lock']){
  let start,release;const entered=new Promise(r=>start=r),hold=new Promise(r=>release=r);
  const f=setup(async(input,raw)=>{if(input.step.operation==='send_sms'){start();await hold;}return raw.execute(input);});const p=f.manager.createCompoundPlan(fields());f.consent(p.id,'item-1.sms');const running=f.manager.run(p.id);await entered;
  if(action==='cancel')f.manager.cancel(p.id);else{const state=f.state();policy.lockSafety(state,'manual_lock',{now:Date.parse(f.clock.now())});f.replace(state);f.manager.setLocked(true);}
  release();await running;assert.equal(f.state().compoundTest.effects.length,0);assert.equal(f.calls.length,1);await f.manager.run(p.id);assert.equal(f.state().compoundTest.effects.length,0);
 }
});

test('editing during an adapter await invalidates the old ticket; an explicit new consent uses new parameters',async()=>{
 let entered,release,first=true;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const f=setup(async(input,raw)=>{if(first&&input.step.operation==='send_sms'){first=false;entered();await hold;}return raw.execute(input);});const p=f.manager.createCompoundPlan(fields());f.consent(p.id,'item-1.sms');const run=f.manager.run(p.id);await started;
 f.manager.clarifyCompound(p.id,{'items.0.message':'星期天回家吃饭。'});release();await run;assert.equal(f.state().compoundTest.effects.length,0);
 f.consent(p.id,'item-1.sms');await f.manager.run(p.id);assert.equal(f.state().compoundTest.effects.filter(x=>x.operation==='send_sms').length,1);assert.equal(f.state().compoundTest.effects[0].payload.message,'星期天回家吃饭。');
});

test('completed SMS cannot be rewritten while a future cake item can change without replaying that SMS',async()=>{
 const f=setup(),p=f.manager.createCompoundPlan(fields());f.consent(p.id,'item-1.sms');await f.manager.run(p.id);
 assert.throws(()=>f.manager.clarifyCompound(p.id,{'items.0.message':'改已发短信'}));
 const changed=f.manager.clarifyCompound(p.id,{'items.1.pickup_time':'17:00'});assert.equal(changed.steps[0].status,'succeeded');f.consent(p.id,'item-2.cake.order');await f.manager.run(p.id);assert.equal(f.calls.filter(x=>x.step.operation==='send_sms').length,1);
});


test('snapshot restore preserves every request and completed SMS but does not replay or reuse old consent',async()=>{
 const first=setup(),p=first.manager.createCompoundPlan(fields());first.consent(p.id,'item-1.sms');await first.manager.run(p.id);
 const restored=setup(undefined,first.manager.snapshot(),first.state());const plan=restored.manager.getPlan(p.id);
 assert.deepEqual(plan.fields,fields());assert.equal(plan.steps[0].status,'succeeded');assert.equal(plan.steps[2].status,'needs_confirmation');
 await restored.manager.run(p.id);assert.equal(restored.calls.length,0);assert.equal(restored.state().compoundTest.effects.filter(x=>x.operation==='send_sms').length,1);
 restored.consent(p.id,'item-2.cake.order');await restored.manager.run(p.id);assert.equal(restored.calls.filter(x=>x.step.operation==='send_sms').length,0);assert.equal(restored.calls.filter(x=>x.step.operation==='message_contact').length,1);
});
