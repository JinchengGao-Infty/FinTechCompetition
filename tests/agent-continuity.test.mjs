import test from 'node:test';import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {buildAgentFacts} from '../web/agent-tools.mjs';
import {applyAgentResult} from '../web/agent-plans.mjs';
import {draftWithInputs,renderAgentCard,renderActiveDraft} from '../web/agent-cards.mjs';
import {leaveWorkspace,continueDraft,activeTask,requestGate} from '../web/agent-workspace.mjs';
import {createTask,transition} from '../web/engine.mjs';
import {parameterFingerprint} from '../web/task-parameters.mjs';
import {executeLocalTask} from '../web/local-executor.mjs';
const clarify=(scenario,fields={},missing=['purpose','amount_minor'],action='new')=>({status:'clarify',scenario,fields,missing,reply:'请补充',context_action:action});
const apply=(s,result,id)=>applyAgentResult(s,result,buildAgentFacts(s),{originTurnId:id,agentRunId:'run'});
const esc=x=>String(x).replaceAll('"','&quot;');

test('new task archives A and uses a distinct B draft without inheriting A fields or permissions',()=>{
 const s=fresh();apply(s,clarify('ambiguous'),'A');const a=s.agentDraft.id;
 s.agentDraft=draftWithInputs(s.agentDraft,{purpose:'travel',amount_minor:'1200'});
 apply(s,clarify('subscription',{subscription_id:'video'},['subscription_action']),'B');
 const b=s.agentDraft.id;assert.notEqual(a,b);assert.equal(s.agentDraft.fields.amount_minor,undefined);assert.equal(s.agentFocus,null);
 assert.equal(s.agentDraftHistory[a].fields.amount_minor,120000);
 continueDraft(s,a,'reloaded-run');assert.equal(s.agentDraft.id,a);assert.equal(s.agentDraft.fields.amount_minor,120000);assert.equal(s.agentDraft.agentRunId,'reloaded-run');
 assert.equal(s.agentDraftHistory[b].fields.subscription_id,'video');assert.equal(s.balance,50000);assert.equal(s.tasks.length,0);
});

test('refresh keeps draft values but only explicit continuation adopts it into current request run',()=>{
 let s=fresh();apply(s,clarify('ambiguous'),'A');s.agentDraft=draftWithInputs(s.agentDraft,{purpose:'travel',amount_minor:'1200.50'});
 s=JSON.parse(JSON.stringify(s));const id=s.agentDraft.id;
 assert.equal(s.agentDraft.agentRunId,'run');continueDraft(s,id,'after-refresh');
 assert.equal(s.agentDraft.fields.amount_minor,120050);assert.equal(s.agentDraft.agentRunId,'after-refresh');
 const out=applyAgentResult(s,{status:'propose',scenario:'budget_link',mode:'create',fields:{purpose:'travel',amount_minor:120050},reply:'请核对',context_action:'continue'},buildAgentFacts(s),{originTurnId:'submit',agentRunId:'after-refresh'});
 assert.ok(out.taskId);assert.equal(s.tasks[0].granted,false);assert.equal(s.tasks[0].status,'permission');assert.equal(s.balance,50000);
});

test('history has no live forms and cancelling a draft makes its old control inert',()=>{
 const s=fresh();const out=apply(s,clarify('ambiguous'),'A');const id=s.agentDraft.id;
 const history=renderAgentCard(out.card,{state:s,esc,money:x=>x});assert.doesNotMatch(history,/<form/);
 assert.equal((renderActiveDraft(s.agentDraft,{esc}).match(/id="agent-clarification-form"/g)||[]).length,1);
 leaveWorkspace(s,{cancel:true});assert.equal(s.agentDraft,null);assert.throws(()=>continueDraft(s,id,'new'),/结束/);
 assert.equal(renderAgentCard(out.card,{state:s,esc,money:x=>x}),'');
});

test('completed tasks and leaving for a new task cannot remain as active bottom cards',()=>{
 const s=fresh();s.tasks=[{id:'old',status:'done'}];s.agentFocus='old';s.agentWorkspaceVisible=true;assert.equal(activeTask(s),null);
 s.tasks[0].status='review';assert.equal(activeTask(s)?.id,'old');leaveWorkspace(s);assert.equal(activeTask(s),null);assert.equal(s.tasks.length,1);
});

test('late A response and A failure cannot affect B after cancellation or workspace switch',async()=>{
 const gate=requestGate(),writes=[];let resolveA,resolveB;
 const a=gate.begin();const pa=new Promise(r=>resolveA=r).then(()=>{if(gate.valid(a))writes.push('A');});
 gate.cancel();const b=gate.begin();const pb=new Promise(r=>resolveB=r).then(()=>{if(gate.valid(b))writes.push('B');});
 resolveB();await pb;resolveA();await pa;
 assert.deepEqual(writes,['B']);assert.equal(a.controller.signal.aborted,true);assert.equal(gate.owns(a),false);assert.equal(gate.owns(b),true);
 gate.finish(a);assert.equal(gate.owns(b),true);gate.cancel();assert.equal(gate.valid(b),false);
});

test('completed task then hi then readonly explanation references bound receipt without recreating task',()=>{
 const s=fresh(),task=createTask(s,'travel',{reuse:false});task.amount=1200;
 transition(s,task.id,'grant');transition(s,task.id,'confirm',{revision:task.revision,parameters:parameterFingerprint(task)});executeLocalTask(s,task.id);
 const count=s.tasks.length,ledger=structuredClone(s.ledger),cash=s.balance,travel=s.travelBudget,receipt=task.receipt;
 apply(s,{status:'answer',scenario:'other',reply:'你好',fields:{}},'hi');leaveWorkspace(s);
 const out=apply(s,{status:'answer',scenario:'question',query:'recent_task',fields:{purpose:'travel'},reply:'请看已完成的安排。',mode:'none',context_action:'none'},'explain');
 assert.equal(out.card.data.entry.receipt,receipt);assert.equal(out.card.data.entry.amount_minor,120000);assert.equal(out.card.data.entry.kind,'planning');
 assert.equal(s.tasks.length,count);assert.equal(s.balance,cash);assert.equal(s.travelBudget,travel);assert.deepEqual(s.ledger,ledger);assert.equal(activeTask(s),null);
 s.tasks.find(t=>t.id===task.id).receipt='mismatch';assert.equal(buildAgentFacts(s).queries.recent_task.entries.length,0);assert.equal(out.card.data.entry.receipt,receipt);
});
