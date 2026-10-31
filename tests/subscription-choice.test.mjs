import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../web/safety-policy.mjs';
import {createDemoClock,createLocalDemoAdapters,createProactiveDemo,PROACTIVE_DEMO_FIXTURES as F} from '../web/proactive-demo.mjs';
import {createProactiveSafetyBridge,proactiveSafetyOperation,reconcileProactiveSnapshot} from '../web/delegation-engine.mjs';

const copy=value=>structuredClone(value),USER={kind:'user',method:'click'},START='2026-11-25T01:00:00Z';
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function setup({adapterHook,gateHook,snapshot,core,clock=createDemoClock(START)}={}){
 const fixtures=copy(F);fixtures.subscription.current_rights_until='2026-11-28';
 let current=core?copy(core):{balance:50000,ledger:[],paused:false,subscription:{auto_renewal:true,current_rights_until:'2026-11-28'},grants:{},effects:[]};
 policy.ensureSafety(current);const contexts=[],raw=createLocalDemoAdapters({fixtures});
 const bridge=createProactiveSafetyBridge({policy,getState:()=>current,persist:next=>{current=copy(next);},
  getGrantId:operation=>current.grants[operation.id],acceptReplay:()=>true,
  onCommitEffect(next,{operation,result,context}){
   const key=operation.id+':v'+operation.revision;if(next.effects.some(item=>item.key===key))throw Error('Duplicate effect');
   if(context.step.operation==='renew_subscription'){
    next.balance-=operation.amountMinor/100;next.ledger.push({id:key,amountMinor:operation.amountMinor,kind:'subscription',receipt:result.receipt_id});
   }else if(context.step.operation==='cancel_subscription')next.subscription.auto_renewal=false;
   else throw Error('Unexpected subscription operation');
   next.effects.push({key,operation:context.step.operation,receipt:result.receipt_id,amountMinor:operation.amountMinor});
  }});
 const gate=context=>{contexts.push(copy(context));return gateHook?gateHook(context,bridge):bridge(context);};
 gate.invalidate=()=>bridge.invalidate();
 const adapters={mode:'local_demo',execute:input=>adapterHook?adapterHook(input,raw):raw.execute(input),reset:()=>raw.reset()};
 const demo=createProactiveDemo({clock,fixtures,safetyGate:gate,adapters,snapshot});
 const context=(plan,node)=>({phase:'before_execute',mode:'local_demo',now:clock.now(),plan_id:plan.id,revision:plan.revision,step:copy(node),source:copy(plan.source)});
 function consent(planId,{core=true}={}){
  const plan=demo.getPlan(planId),node=plan.steps[0];
  if(core){const operation=proactiveSafetyOperation(context(plan,node)),grant=policy.authorizeSafety(current,operation,{source:USER,now:Date.parse(clock.now())});current.grants[operation.id]=grant.grantId;assert.equal(grant.status,'ready');}
  return demo.authorize(planId,{revision:plan.revision,confirmed:true,step_ids:[node.id],expires_at:new Date(Date.parse(clock.now())+60000).toISOString()});
 }
 return {demo,clock,raw,bridge,contexts,context,consent,getState:()=>current,update:fn=>fn(current),
  lock(){policy.lockSafety(current,'manual_lock',{now:Date.parse(clock.now())});},
  node:id=>demo.getPlan(id).steps[0]};
}

test('explicit subscription preparation works before reminder day and unknown choices are atomic',()=>{
 const h=setup();h.clock.set('2026-11-02T01:00:00Z');assert.equal(h.demo.scanSubscription(),null);
 const p=h.demo.prepareSubscription({action:'cancel'});assert.equal(p.fields.subscription_action,'cancel');assert.equal(p.planned_total_minor,0);
 const before=h.demo.snapshot();for(const input of [{},{action:'refund'},{action:'cancel',verified:true},null,[]])assert.throws(()=>h.demo.prepareSubscription(input));
 assert.deepEqual(h.demo.snapshot(),before);assert.throws(()=>h.demo.scanSubscription({action:'unknown'}));
});
test('legacy scanning remains one keep proposal per cycle without granting anything',async()=>{
 const h=setup(),p=h.demo.scanSubscription();assert.equal(h.demo.scanSubscription().id,p.id);assert.equal(p.fields.subscription_action,'keep');assert.deepEqual(p.grants,{});
 assert.equal(p.steps[0].payload.renewals,1);assert.equal(p.steps[0].payload.future_auto_renewal,false);await h.demo.run(p.id);
 assert.equal(h.getState().balance,50000);assert.equal(h.demo.snapshot().receipts.length,0);assert.equal(h.node(p.id).status,'needs_confirmation');
});
test('keep charges exactly one current 25-yuan cycle and repeated confirmations/events never charge twice',async()=>{
 const h=setup(),p=h.demo.prepareSubscription({action:'keep'});h.consent(p.id);await h.demo.run(p.id);await h.demo.run(p.id);
 assert.equal(h.getState().balance,49975);assert.equal(h.getState().ledger.length,1);assert.equal(h.demo.snapshot().receipts.length,1);
 assert.equal(h.demo.prepareSubscription({action:'keep'}).id,p.id);assert.equal(h.demo.scanSubscription().id,p.id);await h.demo.tick({execute:true});
 assert.equal(h.getState().balance,49975);assert.equal(h.node(p.id).attempts,1);assert.throws(()=>h.consent(p.id));
 const memory=h.demo.snapshot().memory.subscription;assert.equal(memory.paid_cycles['2026-11'].amount_minor,2500);assert.equal(memory.current_rights_until,'2026-11-28');
});
test('cancel executes a bounded local subscription cancellation, preserves rights, and creates no refund or cash row',async()=>{
 const h=setup(),p=h.demo.prepareSubscription({action:'cancel'}),beforeRights=h.demo.snapshot().memory.subscription.current_rights_until;
 assert.equal(p.steps[0].operation,'cancel_subscription');assert.equal(p.steps[0].payload.scope,'next_renewal');assert.equal(p.steps[0].payload.amount_minor,0);
 h.consent(p.id);await h.demo.run(p.id);await h.demo.run(p.id);
 const state=h.getState(),snapshot=h.demo.snapshot(),receipt=snapshot.receipts[0],effect=receipt.evidence.subscription_effect;
 assert.equal(h.demo.getPlan(p.id).status,'succeeded');assert.equal(state.balance,50000);assert.deepEqual(state.ledger,[]);assert.equal(state.effects.length,1);
 assert.equal(state.subscription.auto_renewal,false);assert.equal(state.subscription.current_rights_until,beforeRights);
 assert.equal(snapshot.memory.subscription.auto_renewal,false);assert.equal(snapshot.memory.subscription.current_rights_until,beforeRights);
 assert.equal(effect.charged_minor,0);assert.equal(effect.refunded_minor,0);assert.equal(effect.cash_delta_minor,0);assert.equal(effect.preserve_current_period,true);
 assert.equal(receipt.evidence.actual_external_effect,false);assert.equal(receipt.evidence.mcp_connected,false);assert.match(receipt.receipt_id,/^DEMO:/);
 assert.equal(h.demo.prepareSubscription({action:'cancel'}).id,p.id);h.clock.set('2026-12-25T01:00:00Z');assert.equal(h.demo.scanSubscription(),null);
});
test('abandoning a plan is distinct from actually cancelling subscription renewal',async()=>{
 const h=setup(),p=h.demo.prepareSubscription({action:'cancel'});h.consent(p.id);h.demo.cancel(p.id);await h.demo.tick({execute:true});
 assert.equal(h.demo.getPlan(p.id).status,'cancelled');assert.equal(h.getState().subscription.auto_renewal,true);assert.equal(h.demo.snapshot().receipts.length,0);
 assert.equal(h.demo.snapshot().memory.subscription.next_renewal_cancelled,undefined);assert.equal(h.getState().balance,50000);
});
test('switching a pending choice invalidates revision and both old confirmation and core grant binding',async()=>{
 const h=setup(),keep=h.demo.prepareSubscription({action:'keep'});h.consent(keep.id);
 const cancel=h.demo.prepareSubscription({action:'cancel'});assert.equal(cancel.id,keep.id);assert.equal(cancel.revision,keep.revision+1);assert.deepEqual(cancel.grants,{});
 assert.throws(()=>h.demo.authorize(keep.id,{revision:keep.revision,confirmed:true,step_ids:['subscription.renew']}));
 h.consent(cancel.id,{core:false});await h.demo.run(cancel.id);assert.equal(h.getState().effects.length,0);
 h.consent(cancel.id);await h.demo.run(cancel.id);assert.equal(h.getState().effects.length,1);assert.equal(h.getState().effects[0].operation,'cancel_subscription');assert.equal(h.getState().balance,50000);
});
test('completed renewal is immutable; a separate cancellation can stop future renewal without refunding that 25',async()=>{
 const h=setup(),keep=h.demo.prepareSubscription({action:'keep'});h.consent(keep.id);await h.demo.run(keep.id);
 const completed=copy(h.demo.getPlan(keep.id)),cancel=h.demo.prepareSubscription({action:'cancel'});assert.notEqual(cancel.id,keep.id);assert.deepEqual(h.demo.getPlan(keep.id),completed);
 h.consent(cancel.id);await h.demo.run(cancel.id);assert.deepEqual(h.demo.getPlan(keep.id),completed);
 assert.equal(h.getState().balance,49975);assert.equal(h.getState().ledger.length,1);assert.equal(h.getState().effects.length,2);assert.equal(h.demo.snapshot().receipts.length,2);
 assert.equal(h.demo.prepareSubscription({action:'keep'}).id,keep.id);assert.equal(h.demo.prepareSubscription({action:'cancel'}).id,cancel.id);await h.demo.run(keep.id);
 assert.equal(h.getState().balance,49975);assert.equal(h.getState().effects.length,2);
});
test('switching while an adapter waits ignores its old receipt and can finish the new branch',async()=>{
 const entered=deferred(),release=deferred(),h=setup({adapterHook:async(input,raw)=>{
  if(input.step.operation==='renew_subscription'){entered.resolve();await release.promise;}return raw.execute(input);
 }}),keep=h.demo.prepareSubscription({action:'keep'});h.consent(keep.id);const old=h.demo.run(keep.id);await entered.promise;
 const cancel=h.demo.prepareSubscription({action:'cancel'});h.consent(cancel.id);await h.demo.run(cancel.id);release.resolve();await old;
 assert.equal(h.getState().balance,50000);assert.equal(h.getState().effects.length,1);assert.equal(h.getState().effects[0].operation,'cancel_subscription');assert.equal(h.demo.snapshot().receipts.length,1);
 assert.equal(h.node(cancel.id).operation,'cancel_subscription');assert.equal(h.node(cancel.id).status,'succeeded');
});
test('choice replacement invalidates a core ticket held at the after-execute await',async()=>{
 const entered=deferred(),release=deferred(),h=setup({gateHook:async(context,bridge)=>{
  if(context.phase==='after_execute'&&context.step.operation==='renew_subscription'){entered.resolve();await release.promise;}return bridge(context);
 }}),keep=h.demo.prepareSubscription({action:'keep'});h.consent(keep.id);const old=h.demo.run(keep.id);await entered.promise;
 const cancel=h.demo.prepareSubscription({action:'cancel'});release.resolve();await old;
 assert.equal(h.getState().balance,50000);assert.equal(h.getState().effects.length,0);assert.deepEqual(h.demo.getPlan(cancel.id).grants,{});
 h.consent(cancel.id);await h.demo.run(cancel.id);assert.equal(h.getState().effects.length,1);assert.equal(h.getState().balance,50000);
});
test('core safety checks block each branch before dispatch and again after a late adapter response',async()=>{
 for(const action of ['keep','cancel'])for(const phase of ['before','after']){
  const entered=deferred(),release=deferred(),h=setup({adapterHook:async(input,raw)=>{entered.resolve();await release.promise;return raw.execute(input);}});
  const p=h.demo.prepareSubscription({action});h.consent(p.id);
  if(phase==='before'){h.lock();await h.demo.run(p.id);}else{const run=h.demo.run(p.id);await entered.promise;h.lock();release.resolve();await run;}
  assert.equal(h.getState().effects.length,0);assert.equal(h.getState().balance,50000);assert.equal(h.demo.snapshot().receipts.length,0);
  assert.equal(h.getState().subscription.auto_renewal,true);
 }
});
test('cancellation evidence cannot claim refund, alter rights, or use an unrelated subscription',async()=>{
 for(const mutate of [r=>delete r.evidence.subscription_effect,r=>r.evidence.subscription_effect.refunded_minor=2500,r=>r.evidence.subscription_effect.preserve_current_period=false,r=>r.evidence.parameters.subscription_id='unrelated']){
  const h=setup({adapterHook:async(input,raw)=>{const result=await raw.execute(input);mutate(result);return result;}}),p=h.demo.prepareSubscription({action:'cancel'});
  h.consent(p.id);await h.demo.run(p.id);assert.equal(h.getState().effects.length,0);assert.equal(h.demo.snapshot().receipts.length,0);assert.equal(h.getState().subscription.auto_renewal,true);
 }
});
test('snapshot restore preserves paid/cancelled effects and revokes incomplete consent without replaying adapters',async()=>{
 const h=setup(),keep=h.demo.prepareSubscription({action:'keep'});h.consent(keep.id);await h.demo.run(keep.id);
 const cancel=h.demo.prepareSubscription({action:'cancel'});h.consent(cancel.id);
 const restored=setup({core:h.getState(),snapshot:JSON.parse(JSON.stringify(h.demo.snapshot())),clock:h.clock});
 assert.equal(restored.node(keep.id).status,'succeeded');assert.deepEqual(restored.demo.getPlan(cancel.id).grants,{});await restored.demo.run(cancel.id);
 assert.equal(restored.getState().balance,49975);assert.equal(restored.getState().effects.length,1);assert.equal(restored.demo.snapshot().receipts.length,1);
 restored.consent(cancel.id);await restored.demo.run(cancel.id);
 const twice=setup({core:restored.getState(),snapshot:JSON.parse(JSON.stringify(restored.demo.snapshot())),clock:h.clock});await twice.demo.tick({execute:true});
 assert.equal(twice.getState().balance,49975);assert.equal(twice.getState().effects.length,2);assert.equal(twice.demo.snapshot().receipts.length,2);assert.equal(twice.demo.snapshot().memory.subscription.auto_renewal,false);
});
test('core-committed cancellation can reconcile a pre-journal snapshot without another adapter or effect',async()=>{
 const h=setup(),p=h.demo.prepareSubscription({action:'cancel'}),before=h.demo.snapshot();h.consent(p.id);await h.demo.run(p.id);
 const repaired=reconcileProactiveSnapshot(before,h.getState(),{policy,now:Date.parse(h.clock.now())});assert.equal(repaired.reconciled.length,1);
 const restored=setup({core:h.getState(),snapshot:repaired.snapshot,clock:h.clock,adapterHook:()=>{throw Error('must not execute on recovery');}});await restored.demo.tick({execute:true});
 assert.equal(restored.demo.snapshot().memory.subscription.auto_renewal,false);assert.equal(restored.getState().effects.length,1);assert.equal(restored.getState().balance,50000);assert.equal(restored.demo.snapshot().receipts.length,1);
});
