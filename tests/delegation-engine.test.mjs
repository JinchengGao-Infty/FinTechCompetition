import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DEMO_CLOCK,ensureDelegations,createDelegation,getDelegation,listDelegations,queryDelegationNode,readyNodes,planOperation,startNode,finishNode,pauseDelegation,pauseAllDelegations,resumeDelegation,cancelDelegation,handoffDelegation,resolveHandoff,editDelegationNode,advanceDemoClock,requestCompensation,runLocalDemoAdapter,proactiveSafetyOperation,createProactiveSafetyBridge,reconcileProactiveSnapshot} from '../web/delegation-engine.mjs';
import * as policy from '../web/safety-policy.mjs';
import {createLocalDemoAdapters,createProactiveDemo,createDemoClock,PROACTIVE_DEMO_FIXTURES} from '../web/proactive-demo.mjs';

const user={kind:'user',id:'local-owner'},preset={kind:'preset',id:'birthday-fixture'};
const node=(id,kind='book_cake',extra={})=>({id,kind,label:id,target:'本地蛋糕店',parameters:{request:'生日预订'},...extra});
function setup(nodes=[node('cake')],extra={}){
 const state={balance:50000,ledger:[]};ensureDelegations(state);
 createDelegation(state,{id:'birthday',title:'生日安排',source:preset,nodes,...extra});return state;
}
function permission(state,nodeId,epoch=1){
 const operation=planOperation(state,'birthday',nodeId);
 const permit={operationId:operation.id,parameterKey:operation.parameterKey,executionId:operation.executionId,epoch};
 return {epoch,locked:false,permit,validatePermit(current,provided){return current.id===provided.operationId&&current.parameterKey===provided.parameterKey&&current.executionId===provided.executionId&&epoch===provided.epoch;}};
}
function complete(state,nodeId,epoch=1){
 const options=permission(state,nodeId,epoch),start=startNode(state,'birthday',nodeId,options);
 assert.equal(start.replay,false);
 const result=runLocalDemoAdapter(start.ticket.operation,{now:state.delegations.clockISO});
 return {ticket:start.ticket,result,options,finished:finishNode(state,start.ticket,result,options)};
}
const code=expected=>error=>error.code===expected;

test('declarative plans reject cycles, missing dependencies, executable content and self-granted authority',()=>{
 for(const nodes of [[node('a','read',{dependsOn:['a']})],[node('a','read',{dependsOn:['missing']})],
  [node('a','read',{dependsOn:['b']}),node('b','read',{dependsOn:['a']})],
  [node('a','execute_code')],[node('a','transfer',{amountMinor:2000001})],[node('a','message',{authorized:true})],
  [node('a','message',{parameters:{perform:()=>true}})],[node('a','message',{parameters:{api_key:'test-not-a-real-credential'}})]]){
  assert.throws(()=>setup(nodes),code('invalid_spec'));
 }
 assert.throws(()=>setup([node('a')],{source:{kind:'invented'}}),code('invalid_source'));
 assert.throws(()=>setup([node('a')],{authorized:true}),code('invalid_spec'));
});

test('a plan from external text is a proposal and cannot start a write without a host permit',()=>{
 const state=setup([node('cake','book_cake',{source:{kind:'external',id:'email-one'}})]);
 const ready=readyNodes(state,'birthday');assert.equal(ready.length,1);assert.equal(ready[0].status,'awaiting_consent');
 assert.equal(ready[0].source.kind,'external');assert.equal(queryDelegationNode(state,'birthday','cake').result,null);
 assert.throws(()=>startNode(state,'birthday','cake',{epoch:1,locked:false}),code('permit_required'));
 assert.throws(()=>startNode(state,'birthday','cake',{...permission(state,'cake'),validatePermit:()=>false}),code('permit_rejected'));
 assert.equal(state.balance,50000);assert.deepEqual(state.ledger,[]);
});

test('birthday dependencies run in order and the 520 transfer only becomes due at explicit 13:14',()=>{
 const state=setup([
  node('restaurant','book_restaurant',{target:'本地餐厅'}),node('cake'),
  node('message','message',{dependsOn:['cake']}),node('deposit','deposit',{amountMinor:12800,dependsOn:['message']}),
  node('gift','transfer',{target:'女友',amountMinor:52000,dependsOn:['restaurant','deposit'],scheduledAt:'2026-11-09T13:14:00+08:00'})
 ]);
 assert.deepEqual(readyNodes(state,'birthday').map(n=>n.id),['restaurant','cake']);
 assert.throws(()=>startNode(state,'birthday','gift',permission(state,'gift')),code('not_ready'));
 complete(state,'cake');assert.deepEqual(readyNodes(state,'birthday').map(n=>n.id),['restaurant','message']);
 complete(state,'restaurant');complete(state,'message');complete(state,'deposit');
 advanceDemoClock(state,'2026-11-09T13:13:59+08:00');assert.deepEqual(readyNodes(state,'birthday'),[]);
 advanceDemoClock(state,'2026-11-09T13:14:00+08:00');
 const due=readyNodes(state,'birthday');assert.equal(due.length,1);assert.equal(due[0].operation.amountMinor,52000);assert.equal(due[0].status,'awaiting_consent');
 const done=complete(state,'gift');assert.equal(done.result.source,'local_adapter');assert.equal(done.result.external,false);
 assert.equal(getDelegation(state,'birthday').status,'completed');assert.equal(state.balance,50000);assert.deepEqual(state.ledger,[]);
});

test('execution identifiers and local receipts survive reload without repeating completed effects',()=>{
 let state=setup();const done=complete(state,'cake'),auditCount=state.delegations.audit.length;
 state=JSON.parse(JSON.stringify(state));
 const replay=startNode(state,'birthday','cake',permission(state,'cake'));
 assert.equal(replay.replay,true);assert.deepEqual(replay.result,done.finished.result);
 assert.equal(finishNode(state,done.ticket,done.result,done.options).replay,true);
 assert.equal(state.delegations.audit.length,auditCount);assert.equal(getDelegation(state,'birthday').nodes[0].history.length,1);
});

test('changed parameters invalidate a callback and even a forged newer ticket cannot change the stored binding',()=>{
 const state=setup(),options=permission(state,'cake'),started=startNode(state,'birthday','cake',options);
 const result=runLocalDemoAdapter(started.ticket.operation);
 state.delegations.plans[0].nodes[0].target='另一家店';
 assert.throws(()=>finishNode(state,started.ticket,result,options),code('stale_callback'));
 const current=planOperation(state,'birthday','cake'),forged={...started.ticket,parameterKey:current.parameterKey};
 assert.throws(()=>finishNode(state,forged,{...result,parameterKey:current.parameterKey},{...permission(state,'cake')}),code('stale_callback'));
 assert.equal(queryDelegationNode(state,'birthday','cake').result,null);
});

test('the final callback checks current lock and safety epoch, not only the start-time permit',()=>{
 const state=setup(),options=permission(state,'cake'),started=startNode(state,'birthday','cake',options),result=runLocalDemoAdapter(started.ticket.operation);
 assert.throws(()=>finishNode(state,started.ticket,result,{...options,locked:true}),code('safety_locked'));
 assert.throws(()=>finishNode(state,started.ticket,result,{...options,epoch:2}),code('stale_callback'));
 assert.throws(()=>finishNode(state,{...started.ticket,epoch:2},result,{...options,epoch:2}),code('stale_callback'));
 assert.equal(queryDelegationNode(state,'birthday','cake').result,null);assert.deepEqual(state.ledger,[]);
});

test('adapter source, receipt and effect must match the exact permitted operation',()=>{
 const state=setup(),options=permission(state,'cake'),started=startNode(state,'birthday','cake',options),result=runLocalDemoAdapter(started.ticket.operation);
 for(const forged of [{...result,source:'llm'},{...result,external:true},{...result,receipt:'unrelated-receipt'},
  {...result,effect:{...result.effect,target:'另一家店'}},{...result,operationId:'different-operation'}]){
  assert.throws(()=>finishNode(state,started.ticket,forged,options),code('invalid_result'));
 }
 assert.equal(finishNode(state,started.ticket,result,options).accepted,true);
});

test('pause invalidates in-flight callbacks and scheduled nodes; resume does not replay or bypass review',()=>{
 const state=setup([node('cake'),node('gift','transfer',{target:'女友',amountMinor:52000,scheduledAt:'2026-11-09T13:14:00+08:00',dependsOn:['cake']})]);
 const options=permission(state,'cake'),started=startNode(state,'birthday','cake',options),result=runLocalDemoAdapter(started.ticket.operation);
 pauseAllDelegations(state,{reason:'安全锁定',epoch:2});
 assert.ok(getDelegation(state,'birthday').nodes.every(n=>n.status==='paused'));
 assert.throws(()=>finishNode(state,started.ticket,result,{...options,epoch:2}),code('stale_callback'));
 assert.throws(()=>resumeDelegation(state,'birthday',{source:preset,epoch:3,locked:false}),code('user_required'));
 resumeDelegation(state,'birthday',{source:user,epoch:3,locked:false});
 assert.equal(getDelegation(state,'birthday').status,'human_review');assert.deepEqual(readyNodes(state,'birthday'),[]);
 resolveHandoff(state,'birthday',{decision:'retry',nodeId:'cake',source:user,epoch:3,locked:false});
 const current=planOperation(state,'birthday','cake');assert.notEqual(current.executionId,started.ticket.executionId);
 assert.throws(()=>startNode(state,'birthday','cake',{...options,epoch:3}),code('permit_rejected'));
 complete(state,'cake',3);assert.equal(queryDelegationNode(state,'birthday','gift').result,null);
});

test('resuming an unstarted plan exposes fresh confirmation and does not run a due step',()=>{
 const state=setup(),old=permission(state,'cake');pauseDelegation(state,'birthday');
 const revision=queryDelegationNode(state,'birthday','cake').revision;pauseDelegation(state,'birthday');assert.equal(queryDelegationNode(state,'birthday','cake').revision,revision);
 resumeDelegation(state,'birthday',{source:user,epoch:2,locked:false});
 assert.equal(readyNodes(state,'birthday')[0].status,'awaiting_consent');
 assert.throws(()=>startNode(state,'birthday','cake',{...old,epoch:2}),code('permit_rejected'));
 assert.equal(queryDelegationNode(state,'birthday','cake').result,null);
});

test('pending and failed adapter outcomes require reconciliation or explicit human intervention',()=>{
 const state=setup(),options=permission(state,'cake'),started=startNode(state,'birthday','cake',options);
 finishNode(state,started.ticket,runLocalDemoAdapter(started.ticket.operation,{outcome:'pending'}),options);
 assert.equal(startNode(state,'birthday','cake',options).pending,true);
 finishNode(state,started.ticket,runLocalDemoAdapter(started.ticket.operation,{outcome:'failed'}),options);
 assert.equal(getDelegation(state,'birthday').status,'human_review');
 assert.throws(()=>startNode(state,'birthday','cake',options),code('not_ready'));
 resolveHandoff(state,'birthday',{decision:'resume',source:user,epoch:1,locked:false});
 assert.equal(getDelegation(state,'birthday').status,'human_review');
 resolveHandoff(state,'birthday',{decision:'retry',nodeId:'cake',source:user,epoch:1,locked:false});
 assert.throws(()=>startNode(state,'birthday','cake',options),code('permit_rejected'));
 complete(state,'cake');
});

test('cancellation retains completed history and invalidates only unsubmitted or in-flight steps',()=>{
 const state=setup([node('cake'),node('message','message',{dependsOn:['cake']})]);complete(state,'cake');
 const options=permission(state,'message'),started=startNode(state,'birthday','message',options),result=runLocalDemoAdapter(started.ticket.operation);
 cancelDelegation(state,'birthday',{source:user});
 assert.equal(queryDelegationNode(state,'birthday','cake').status,'completed');
 assert.equal(queryDelegationNode(state,'birthday','message').status,'cancelled');
 assert.throws(()=>finishNode(state,started.ticket,result,options),code('stale_callback'));
 assert.deepEqual(readyNodes(state,'birthday'),[]);
});

test('monthly 28th reminders use persistent occurrence IDs and never create recurring financial authority',()=>{
 const state=setup([node('subscription','reminder',{target:'会员续费',scheduledAt:'2026-11-28T18:00:00+08:00',repeat:{frequency:'monthly',day:28,until:'2026-12-28T18:00:00+08:00'}})]);
 assert.deepEqual(readyNodes(state,'birthday'),[]);advanceDemoClock(state,'2026-11-28T18:00:00+08:00');
 const first=complete(state,'subscription');let plan=getDelegation(state,'birthday');
 assert.equal(plan.nodes.length,2);assert.equal(plan.nodes[1].scheduledAt,'2026-12-28T18:00:00+08:00');
 finishNode(state,first.ticket,first.result,first.options);assert.equal(getDelegation(state,'birthday').nodes.length,2);
 advanceDemoClock(state,'2026-12-28T18:00:00+08:00');const due=readyNodes(state,'birthday');
 assert.equal(due.length,1);assert.notEqual(due[0].executionId,first.ticket.executionId);complete(state,due[0].id);
 assert.equal(getDelegation(state,'birthday').status,'completed');
 assert.throws(()=>setup([node('gift','transfer',{amountMinor:52000,scheduledAt:'2026-11-28T18:00:00+08:00',repeat:{frequency:'monthly',day:28}})]),code('invalid_spec'));
});

test('the demo clock requires a timezone and only explicit reset can move backwards',()=>{
 const state=setup();assert.equal(state.delegations.clockISO,DEFAULT_DEMO_CLOCK);
 assert.throws(()=>advanceDemoClock(state,'2026-11-09T13:14:00'),code('invalid_clock'));
 assert.throws(()=>advanceDemoClock(state,'2026-02-30T12:00:00+08:00'),code('invalid_clock'));
 advanceDemoClock(state,'2026-11-09T13:14:00+08:00');
 assert.throws(()=>advanceDemoClock(state,DEFAULT_DEMO_CLOCK),code('clock_backwards'));
 advanceDemoClock(state,DEFAULT_DEMO_CLOCK,{reset:true});assert.equal(state.delegations.clockISO,DEFAULT_DEMO_CLOCK);
 assert.throws(()=>advanceDemoClock(state,'2026-11-09T13:14:00+08:00',{source:{kind:'external'}}),code('user_required'));
});

test('booking compensation is a separate permitted action; messages and transfers cannot magically undo',()=>{
 const state=setup();const original=complete(state,'cake');
 const compensation=requestCompensation(state,'birthday','cake',{source:user});
 assert.equal(compensation.kind,'cancel_booking');assert.equal(compensation.parameters.bookingReceipt,original.result.receipt);
 assert.equal(requestCompensation(state,'birthday','cake',{source:user}).id,compensation.id);
 assert.equal(readyNodes(state,'birthday')[0].status,'awaiting_consent');
 assert.throws(()=>startNode(state,'birthday',compensation.id,{epoch:1,locked:false}),code('permit_required'));
 const finished=complete(state,compensation.id);assert.equal(finished.result.effect.kind,'cancel_booking');
 assert.equal(queryDelegationNode(state,'birthday','cake').status,'completed');
 const moneyState=setup([node('gift','transfer',{amountMinor:52000})]);complete(moneyState,'gift');
 assert.throws(()=>requestCompensation(moneyState,'birthday','gift',{source:user}),code('not_compensatable'));
});

test('parameter edits reject old grants, while human handoff never autoauthorizes a replacement',()=>{
 const state=setup(),old=permission(state,'cake');
 editDelegationNode(state,'birthday','cake',{target:'另一家本地蛋糕店'},{source:user});
 assert.throws(()=>startNode(state,'birthday','cake',old),code('permit_rejected'));
 handoffDelegation(state,'birthday',{reason:'人工核对商户'});assert.deepEqual(readyNodes(state,'birthday'),[]);
 resolveHandoff(state,'birthday',{decision:'resume',source:user,epoch:1,locked:false});
 assert.equal(readyNodes(state,'birthday')[0].status,'awaiting_consent');
 complete(state,'cake');assert.throws(()=>editDelegationNode(state,'birthday','cake',{target:'第三家店'},{source:user}),code('invalid_transition'));
 const events=state.delegations.audit.map(e=>e.event);assert.ok(events.includes('node_edited')&&events.includes('human_handoff')&&events.includes('human_resolved'));
 assert.equal(listDelegations(state).length,1);
});

function proactiveContext(extra={}){
 return {phase:'before_execute',now:'2026-11-02T09:00:00+08:00',mode:'local_demo',plan_id:'birthday-bridge',revision:1,
  source:{type:'user_request',trust:'user_intent'},step:{id:'cake.deposit',title:'支付蛋糕定金',app:'payments_demo',operation:'pay_deposit',
   payload:{recipient_id:'cake-shop',amount_minor:80000,currency:'CNY',source_account:'living_1608'},dependencies:[],scheduled_for:null,confirmation_required:true,attempts:0},...extra};
}
function bridgeHost({effect,acceptReplay}={}){
 let state={balance:50000,ledger:[]};policy.ensureSafety(state);
 const bridge=createProactiveSafetyBridge({policy,getState:()=>state,persist:next=>{state=next;},
  getGrantId(operation,context,draft){return Object.values(draft.safety.grants).find(g=>g.operationId===operation.id&&g.snapshot.parameters===operation.parameters&&g.status==='ready')?.id;},
  onCommitEffect:effect||((draft,{operation,result,permit})=>{draft.balance-=operation.amountMinor/100;draft.ledger.push({id:'local:'+permit.executionId,kind:operation.kind,date:'2026-11-02',amountMinor:operation.amountMinor,direction:'expense',receipt:result.receipt_id});}),
  ...(acceptReplay?{acceptReplay}:{})});
 const authorize=context=>policy.authorizeSafety(state,proactiveSafetyOperation(context),{source:user,now:Date.parse(context.now)});
 return {bridge,getState:()=>state,authorize};
}
async function bridgeResult(context){
 return createLocalDemoAdapters().execute({plan_id:context.plan_id,step:context.step,idempotency_key:context.plan_id+':'+context.step.id+':v'+context.revision,now:context.now});
}
const afterContext=(context,result)=>({...context,phase:'after_execute',step:{...context.step,attempts:context.step.attempts+1},idempotency_key:context.plan_id+':'+context.step.id+':v'+context.revision,result});

test('proactive bridge never treats a plan grant or external text as a safety grant',()=>{
 const host=bridgeHost(),context=proactiveContext({grant:{confirmed:true,source:'dialogue'}});
 assert.equal(host.bridge(context).decision,'needs_confirmation');
 assert.equal(Object.keys(host.getState().safety.executions).length,0);assert.equal(host.getState().balance,50000);
 const mail=proactiveSafetyOperation(proactiveContext({source:{trust:'external_content'},step:{...context.step,payload:{...context.step.payload,source_mismatch:true}}}));
 assert.equal(mail.source.kind,'external');assert.deepEqual(mail.riskFlags,['unverified_recipient']);
 assert.throws(()=>policy.authorizeSafety(host.getState(),mail,{source:user,now:Date.parse(context.now)}),error=>error.code==='risk_blocked');
});

test('proactive bridge commits permission and a local effect atomically without double-counting the same transfer',async()=>{
 const host=bridgeHost(),context=proactiveContext();host.authorize(context);
 assert.equal(host.bridge(context).decision,'allow');assert.equal(host.getState().balance,50000);
 const result=await bridgeResult(context),verdict=host.bridge(afterContext(context,result));
 assert.equal(verdict.decision,'allow');assert.equal(host.getState().balance,49200);assert.equal(host.getState().ledger.length,1);
 assert.equal(Object.values(host.getState().safety.executions)[0].status,'completed');
 assert.equal(host.bridge(afterContext(context,result)).replay,true);assert.equal(host.getState().ledger.length,1);
});

test('proactive adapter result arriving after safety lock cannot commit a ledger effect',async()=>{
 const host=bridgeHost(),context=proactiveContext();host.authorize(context);host.bridge(context);
 const result=await bridgeResult(context);policy.lockSafety(host.getState(),'manual_lock',{now:Date.parse(context.now)});
 const verdict=host.bridge(afterContext(context,result));
 assert.equal(verdict.decision,'pause');assert.equal(host.getState().balance,50000);assert.deepEqual(host.getState().ledger,[]);
 assert.equal(Object.values(host.getState().safety.executions)[0].status,'interrupted');
});

test('a local effect failure discards the completed clone and records failure on clean main state',async()=>{
 const host=bridgeHost({effect:draft=>{draft.balance=1;draft.ledger.push({amountMinor:1});throw Error('synthetic commit failure');}}),context=proactiveContext();
 host.authorize(context);host.bridge(context);const verdict=host.bridge(afterContext(context,await bridgeResult(context)));
 assert.equal(verdict.decision,'pause');assert.equal(host.getState().balance,50000);assert.deepEqual(host.getState().ledger,[]);
 const entries=Object.values(host.getState().safety.executions);assert.equal(entries.length,1);assert.equal(entries[0].status,'failed');
 assert.equal(host.getState().safety.audit.some(e=>e.type==='execution_completed'),false);
});

test('completed proactive receipts can reconcile after bridge recreation only with an explicit host replay decision',async()=>{
 const host=bridgeHost(),context=proactiveContext();host.authorize(context);host.bridge(context);const result=await bridgeResult(context);host.bridge(afterContext(context,result));
 let state=JSON.parse(JSON.stringify(host.getState())),effects=0;
 const common={policy,getState:()=>state,persist:next=>{state=next;},onCommitEffect:()=>{effects++;}};
 assert.equal(createProactiveSafetyBridge(common)(context).decision,'pause');
 const restored=createProactiveSafetyBridge({...common,acceptReplay:()=>true}),replay=restored(context);
 assert.equal(replay.replay,true);assert.deepEqual(replay.replay_result,result);assert.equal(effects,0);assert.equal(state.ledger.length,1);
 const reconciled=restored(afterContext(context,replay.replay_result));assert.equal(reconciled.decision,'allow');assert.equal(reconciled.replay,true);assert.equal(effects,0);assert.equal(state.ledger.length,1);
});

test('proactive bridge rejects forged evidence and does not call the effect hook',async()=>{
 let effects=0;const host=bridgeHost({effect:()=>{effects++;}}),context=proactiveContext();host.authorize(context);host.bridge(context);
 const result=await bridgeResult(context);result.evidence.parameters.amount_minor=1;
 assert.equal(host.bridge(afterContext(context,result)).decision,'pause');assert.equal(effects,0);
 assert.equal(Object.values(host.getState().safety.executions)[0].status,'failed');
});

test('failed proactive adapters count as tool failures and three explicit attempts lock safety',()=>{
 const host=bridgeHost();
 for(let attempt=0;attempt<3;attempt++){
  const base=proactiveContext(),context={...base,step:{...base.step,attempts:attempt}};host.authorize(context);
  assert.equal(host.bridge(context).decision,'allow');
  const final=host.bridge(afterContext(context,{status:'failed',reason:'synthetic local adapter failure'}));
  assert.equal(final.normalized_result.status,'failed');assert.equal(final.decision,attempt===2?'pause':'allow');
 }
 assert.equal(host.getState().safety.locked,true);assert.deepEqual(host.getState().ledger,[]);
});

test('registering a future birthday schedule is permitted now without executing its future transfer',async()=>{
 const host=bridgeHost({effect:()=>{}}),base=proactiveContext(),context={...base,step:{...base.step,id:'birthday.schedule',app:'calendar_demo',operation:'schedule_local_task',
  payload:{recipient_id:'partner',amount_minor:52000,currency:'CNY',source_account:'living_1608',scheduled_for:'2026-11-09T13:14:00+08:00',clock_mode:'explicit_virtual_demo'}}};
 const operation=proactiveSafetyOperation(context);assert.equal(operation.scheduledAt,null);assert.match(operation.parameters,/2026-11-09T13:14:00/);
 host.authorize(context);assert.equal(host.bridge(context).decision,'allow');
 assert.equal(host.bridge(afterContext(context,await bridgeResult(context))).decision,'allow');
 assert.equal(host.getState().balance,50000);assert.deepEqual(host.getState().ledger,[]);
 const transfer={...context,step:{...context.step,operation:'transfer',scheduled_for:context.step.payload.scheduled_for}};
 assert.equal(proactiveSafetyOperation(transfer).scheduledAt,'2026-11-09T13:14:00+08:00');
});

async function interruptedProactiveCommit(){
 const clock=createDemoClock('2026-11-02T09:00:00+08:00'),demo=createProactiveDemo({clock,safetyGate:()=>({decision:'allow',risk:'yellow',evaluation_id:'test-fixture'})});
 const plan=demo.createBirthdayPlan(PROACTIVE_DEMO_FIXTURES.birthday),node=plan.steps.find(n=>n.id==='cake.deposit');
 const context={phase:'before_execute',now:clock.now(),mode:'local_demo',plan_id:plan.id,revision:plan.revision,source:plan.source,step:{...node,attempts:0}};
 const host=bridgeHost();host.authorize(context);assert.equal(host.bridge(context).decision,'allow');
 const result=await bridgeResult(context);assert.equal(host.bridge(afterContext(context,result)).decision,'allow');
 const snapshot=demo.snapshot(),savedNode=snapshot.plans[0].steps.find(n=>n.id==='cake.deposit');savedNode.status='started';savedNode.attempts=1;
 return {host,clock,snapshot,context,result};
}

test('page-close window reconciles exact completed safety proof before recover without another adapter or effect',async()=>{
 const {host,clock,snapshot,context,result}=await interruptedProactiveCommit();
 const coreBefore=JSON.stringify(host.getState()),snapshotBefore=JSON.stringify(snapshot),balance=host.getState().balance;
 const repaired=reconcileProactiveSnapshot(snapshot,host.getState(),{policy,now:clock.now()});
 assert.equal(repaired.reconciled.length,1);assert.equal(repaired.effectsApplied,false);assert.equal(repaired.grantsCreated,0);
 assert.equal(JSON.stringify(host.getState()),coreBefore);assert.equal(JSON.stringify(snapshot),snapshotBefore);
 const node=repaired.snapshot.plans[0].steps.find(n=>n.id==='cake.deposit');assert.equal(node.status,'succeeded');assert.equal(node.receipt_id,result.receipt_id);assert.equal(node.attempts,1);
 assert.equal(repaired.snapshot.receipts.length,1);assert.equal(reconcileProactiveSnapshot(repaired.snapshot,host.getState(),{policy}).reconciled.length,0);
 const calls=[],baseAdapters=createLocalDemoAdapters(),adapters={mode:'local_demo',execute:async request=>{calls.push(request.step.id);return baseAdapters.execute(request);},reset:()=>baseAdapters.reset()};
 const recovered=createProactiveDemo({clock,adapters,snapshot:repaired.snapshot,safetyGate:()=>({decision:'allow',risk:'yellow',evaluation_id:'test-fixture'})});
 assert.equal(recovered.getPlan(context.plan_id).steps.find(n=>n.id==='cake.deposit').status,'succeeded');
 const remaining=recovered.getPlan(context.plan_id).steps.filter(n=>n.confirmation_required&&n.status!=='succeeded').map(n=>n.id);
 recovered.authorize(context.plan_id,{revision:context.revision,step_ids:remaining,confirmed:true});await recovered.run(context.plan_id);
 assert.equal(calls.includes('cake.deposit'),false);assert.equal(host.getState().balance,balance);assert.equal(host.getState().ledger.length,1);
});

test('reconciliation will not adopt a completed proof for modified payload or invalid local evidence',async()=>{
 const {host,clock,snapshot}=await interruptedProactiveCommit();
 const changed=structuredClone(snapshot);changed.plans[0].steps.find(n=>n.id==='cake.deposit').payload.amount_minor++;
 const rejected=reconcileProactiveSnapshot(changed,host.getState(),{policy,now:clock.now()});
 assert.equal(rejected.reconciled.length,0);assert.equal(rejected.skipped.length,1);assert.equal(rejected.snapshot.receipts.length,0);
 const corrupt=structuredClone(host.getState());Object.values(corrupt.safety.executions)[0].result.adapter_result.evidence.actual_external_effect=true;
 assert.equal(reconcileProactiveSnapshot(snapshot,corrupt,{policy}).reconciled.length,0);
});
