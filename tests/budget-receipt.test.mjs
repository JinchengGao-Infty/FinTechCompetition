import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,createTask,transition,applyConsequences} from '../web/engine.mjs';
import {applyAgentResult} from '../web/agent-plans.mjs';
import {buildAgentFacts,completedTaskFacts,questionResult} from '../web/agent-tools.mjs';
import {parameterFingerprint} from '../web/task-parameters.mjs';
import {taskReviewHTML} from '../web/task-ui.mjs';
import {renderAgentCard} from '../web/agent-cards.mjs';
import {executeLocalTask,queryLocalExecution,reconcileLocalTask,executionKey} from '../web/local-executor.mjs';
import {encodeAppState,decodeAppState} from '../web/state-storage.mjs';
import {budgetReceiptFacts,validBudgetResult} from '../web/budget-result.mjs';

const source={kind:'user',method:'click'},esc=String,money=n=>'¥'+Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const read=t=>parameterFingerprint(t);
function ready(state,task){transition(state,task.id,'grant');transition(state,task.id,'confirm',{source,revision:task.revision,parameters:read(task)});assert.equal(task.status,'executing');return task;}
function modelTask(state,delta,turn){const out=applyAgentResult(state,{status:'propose',scenario:'budget_link',reply:'请核对本次旅行预算调增。',mode:'create',context_action:'new',fields:{purpose:'travel',amount_minor:delta},missing:[]},buildAgentFacts(state),{originTurnId:turn,userText:'旅行预算调增',agentRunId:'budget-regression'});return state.tasks.find(t=>t.id===out.taskId);}
function receiptCard(state,t){return renderAgentCard({type:'task_receipt',data:{title:t.title,target:t.target,amount:t.amount,receipt:t.receipt}},{state,esc,money});}
function immutableResult(state,t){return budgetReceiptFacts(state,t,{parameters:read(t)});}

// These are the independently observed failure pairs, not just a UI string test.
test('legacy travel task applies 3000+2000 once and its completed card remains 5000, never 7000',()=>{
 const state=fresh(),ledger=structuredClone(state.ledger),cash=state.balance,t=createTask(state,'travel');
 assert.match(taskReviewHTML(t,{state,esc}),/¥5,000\.00/);ready(state,t);
 const entry=executeLocalTask(state,t.id);
 assert.equal(state.travelBudget,5000);assert.equal(state.nextMonthReminder,2000);assert.equal(entry.status,'completed');
 assert.deepEqual([entry.budget_result.before_minor,entry.budget_result.delta_minor,entry.budget_result.after_minor],[300000,200000,500000]);
 const html=taskReviewHTML(t,{state,esc});assert.match(html,/调整前预算/);assert.match(html,/¥3,000\.00/);assert.match(html,/¥5,000\.00/);assert.doesNotMatch(html,/¥7,000\.00/);
 assert.equal(buildAgentFacts(state).queries.available_cash.travel_plan_minor,500000);assert.equal(state.balance,cash);assert.deepEqual(state.ledger,ledger);
});

test('free-model budget task applies 5000+600 to 5600 while receipt never recomputes 6200',()=>{
 const state=fresh();state.travelBudget=5000;const t=ready(state,modelTask(state,60000,'new-free-budget'));
 const beforeLedger=structuredClone(state.ledger),cash=state.balance,result=executeLocalTask(state,t.id),facts=completedTaskFacts(state).find(e=>e.task_id===t.id);
 assert.equal(state.travelBudget,5600);assert.equal(result.budget_result.before_minor,500000);assert.equal(facts.budget_result.after_minor,560000);
 assert.match(taskReviewHTML(t,{state,esc}),/¥5,600\.00/);assert.doesNotMatch(taskReviewHTML(t,{state,esc}),/¥6,200\.00/);
 assert.match(receiptCard(state,t),/¥5,600\.00/);assert.doesNotMatch(receiptCard(state,t),/¥6,200\.00/);
 assert.equal(buildAgentFacts(state).queries.available_cash.travel_plan_minor,560000);assert.equal(state.balance,cash);assert.deepEqual(state.ledger,beforeLedger);
});

test('direct state-machine completion atomically records and applies the planning effect without a second external call',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));transition(state,t.id,'complete');
 assert.equal(t.status,'done');assert.equal(t.consequencesApplied,true);assert.equal(state.travelBudget,5000);assert.equal(immutableResult(state,t).after_minor,500000);
 applyConsequences(state,t);assert.equal(state.travelBudget,5000);
});

test('completed before/after facts survive later budget changes and readonly explanation selects the same bound receipt',()=>{
 const state=fresh(),first=ready(state,createTask(state,'travel'));executeLocalTask(state,first.id);
 const second=ready(state,modelTask(state,60000,'later'));executeLocalTask(state,second.id);assert.equal(state.travelBudget,5600);
 assert.deepEqual([immutableResult(state,first).before_minor,immutableResult(state,first).after_minor],[300000,500000]);
 state.agentFocus=first.id;const data=questionResult(buildAgentFacts(state),'recent_task',{purpose:'travel'});assert.equal(data.entry.receipt,first.receipt);assert.equal(data.entry.budget_result.after_minor,500000);
 const explanation=renderAgentCard({type:'fact',data},{state,esc,money});assert.match(explanation,/¥5,000\.00/);assert.doesNotMatch(explanation,/¥7,000\.00|¥5,600\.00/);
 assert.match(taskReviewHTML(first,{state,esc}),/¥5,000\.00/);assert.doesNotMatch(taskReviewHTML(first,{state,esc}),/¥7,600\.00/);
});

test('compact refresh, duplicate execution, reconciliation and consequence calls preserve the exact two adjustments',()=>{
 let state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);const id=t.id;
 const next=ready(state,modelTask(state,60000,'followup'));executeLocalTask(state,next.id);const secondId=next.id,ledger=structuredClone(state.ledger);
 state=decodeAppState(encodeAppState(state));
 for(const taskId of [id,secondId]){const task=state.tasks.find(t=>t.id===taskId);assert.equal(executeLocalTask(state,taskId).status,'completed');assert.equal(reconcileLocalTask(state,taskId).receipt,task.receipt);applyConsequences(state,task);}
 assert.equal(state.travelBudget,5600);assert.deepEqual(state.ledger,ledger);assert.equal(immutableResult(state,state.tasks.find(t=>t.id===id)).after_minor,500000);assert.equal(immutableResult(state,state.tasks.find(t=>t.id===secondId)).after_minor,560000);
});

test('execution snapshot captures the actual latest base at submit, and preserves cent precision',()=>{
 const state=fresh();state.travelBudget=4321.15;const t=ready(state,modelTask(state,12345,'cent-precision'));state.travelBudget=4500.25;
 const entry=executeLocalTask(state,t.id);assert.equal(entry.budget_result.before_minor,450025);assert.equal(entry.budget_result.after_minor,462370);assert.equal(state.travelBudget,4623.7);
});

test('editing before confirmation binds only the final delta and no abandoned preview becomes an execution fact',()=>{
 const state=fresh(),t=createTask(state,'travel');const old=read(t);transition(state,t.id,'grant');transition(state,t.id,'edit',{amount:600});assert.throws(()=>transition(state,t.id,'confirm',{source,revision:1,parameters:old}));
 assert.equal(immutableResult(state,t),null);transition(state,t.id,'confirm',{source,revision:t.revision,parameters:read(t)});const entry=executeLocalTask(state,t.id);
 assert.deepEqual([entry.budget_result.before_minor,entry.budget_result.delta_minor,entry.budget_result.after_minor],[300000,60000,360000]);
});

test('snapshot readers return detached immutable facts; mutating a queried journal does not alter completed truth',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);const budget=immutableResult(state,t),queried=queryLocalExecution(state,t.id);
 assert.throws(()=>{budget.after_minor=700000;},TypeError);queried.budget_result.after_minor=700000;assert.equal(immutableResult(state,t).after_minor,500000);assert.equal(state.executions[executionKey(t)].budget_result.after_minor,500000);
});

test('a tampered journal snapshot is rejected and cannot add a second budget increment',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);state.executions[executionKey(t)].budget_result.after_minor=700000;
 assert.throws(()=>reconcileLocalTask(state,t.id),/快照不一致/);assert.equal(state.travelBudget,5000);
});

test('old completed saves without a captured before/after result do not guess or reapply their delta',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);delete state.safety.executions[t.id+':'+t.revision].result.budget_result;delete state.executions[executionKey(t)].budget_result;delete t.consequencesApplied;
 state.travelBudget=5600;applyConsequences(state,t);assert.equal(state.travelBudget,5600);assert.equal(immutableResult(state,t),null);
 const html=taskReviewHTML(t,{state,esc});assert.match(html,/历史快照未保留/);assert.doesNotMatch(html,/¥7,600\.00|¥5,600\.00/);
 assert.equal(completedTaskFacts(state).find(e=>e.task_id===t.id).budget_result,null);
});

test('missing local applied marker never authorizes reconstructing a second increment from after facts',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);delete t.consequencesApplied;
 assert.throws(()=>applyConsequences(state,t),/不能重复调增/);assert.equal(state.travelBudget,5000);
});

test('invalid base fails before acquiring execution proof or mutating budget',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));state.travelBudget=Number.NaN;
 assert.throws(()=>executeLocalTask(state,t.id),/预算金额无法核对/);assert.equal(state.safety.executions[t.id+':'+t.revision],undefined);assert.equal(t.applied,false);assert.equal(t.receipt,null);
});

test('a changed task binding, receipt or forged arithmetic cannot be exposed as the original budget receipt',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);const record=immutableResult(state,t);
 for(const patch of [{after_minor:700000},{before_minor:400000},{delta_minor:300000},{receipt:'FP-wrong'},{revision:99},{parameters:'wrong'},{extra:'ignored'}])assert.equal(validBudgetResult({...record,...patch},t,read(t)),false);
 t.receipt='FP-wrong';assert.equal(immutableResult(state,t),null);
});


test('semantic journal snapshots survive JSON key order changes while missing receipts and getters are invalid',()=>{
 const state=fresh(),t=ready(state,createTask(state,'travel'));executeLocalTask(state,t.id);const record=immutableResult(state,t);
 state.executions[executionKey(t)].budget_result=Object.fromEntries(Object.entries(record).reverse());assert.equal(reconcileLocalTask(state,t.id).status,'completed');assert.equal(state.travelBudget,5000);
 const empty={...record,receipt:null};assert.equal(validBudgetResult(empty,{...t,receipt:null},read(t)),false);
 let calls=0;const getter={...record};Object.defineProperty(getter,'before_minor',{get(){calls++;return 300000;},enumerable:true});assert.equal(validBudgetResult(getter,t,read(t)),false);assert.equal(calls,0);
});
