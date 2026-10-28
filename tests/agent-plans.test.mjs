import test from 'node:test';import assert from 'node:assert/strict';
import {fresh,transition} from '../web/engine.mjs';import {buildAgentFacts,QUESTION_CATALOG} from '../web/agent-tools.mjs';
import {applyAgentResult} from '../web/agent-plans.mjs';
import {parameterFingerprint} from '../web/task-parameters.mjs';
import {executeLocalTask} from '../web/local-executor.mjs';
import {draftWithInputs,renderAgentCard,renderActiveDraft} from '../web/agent-cards.mjs';
const proposal=fields=>({status:'propose',scenario:'transfer',reply:'已整理转账方案，请核对。',query:null,fields,missing:[],mode:'create',task_id:null});
const transferFields={amount_minor:200000,payee_id:'mom',source_account:'salary_0826',currency:'CNY',scheduled_date:'2026-11-02',purpose:'family'};

test('existing unrecognized-card entry clarifies transaction before scoped permission and local protection',()=>{
 const s=fresh(),n=s.ledger.length;const context={originTurnId:'card-clarify',agentRunId:'card-run'};
 const out=applyAgentResult(s,{status:'clarify',scenario:'card_review',reply:'请选择要核对的交易',missing:['transaction_ref'],fields:{}},buildAgentFacts(s),context);
 assert.equal(s.tasks.length,0);assert.equal(out.card.type,'clarification');
 const next=applyAgentResult(s,{status:'propose',scenario:'card_review',reply:'请核对保护方案',mode:'create',fields:{transaction_ref:'unrecognized_1299'}},buildAgentFacts(s),{...context,originTurnId:'card-selected'});
 const t=s.tasks.find(t=>t.id===next.taskId);assert.equal(t.kind,'card');assert.equal(t.sourceAccount,'living_1608');assert.equal(t.granted,false);
 transition(s,t.id,'grant');transition(s,t.id,'confirm',{revision:t.revision,parameters:parameterFingerprint(t)});assert.equal(t.status,'verify');transition(s,t.id,'verify',{verified:true});executeLocalTask(s,t.id);
 assert.equal(s.cardLocked,true);assert.equal(s.balance,50000);assert.equal(s.ledger.length,n);
});

test('new ambiguous request asks purpose and amount before a family-only recipient',()=>{
 const s=fresh();applyAgentResult(s,{status:'clarify',scenario:'ambiguous',reply:'请补充',fields:{},missing:['payee_id','amount_minor','purpose']},buildAgentFacts(s),{originTurnId:'ambiguous-first',agentRunId:'draft-run'});
 assert.deepEqual(s.agentDraft.missing,['purpose','amount_minor']);assert.equal(s.tasks.length,0);
});

test('selected purpose and typed amount survive readonly interruption and draft serialization',()=>{
 const s=fresh();applyAgentResult(s,{status:'clarify',scenario:'ambiguous',reply:'请补充',fields:{},missing:['purpose','amount_minor']},buildAgentFacts(s),{originTurnId:'draft-one',agentRunId:'draft-run'});
 s.agentDraft=draftWithInputs(s.agentDraft,{purpose:'travel',amount_minor:'1200.50',api_key:'unit-unused-not-a-credential'});
 const original=structuredClone(s.agentDraft);applyAgentResult(s,{status:'answer',scenario:'question',query:'dining_month',reply:'请看卡片'},buildAgentFacts(s),{originTurnId:'read-during-draft',agentRunId:'draft-run'});
 assert.deepEqual(s.agentDraft,original);assert.equal(s.agentDraft.fields.amount_minor,120050);assert.equal(s.agentDraft.fields.purpose,'travel');assert.equal(s.agentDraft.uiValues.api_key,undefined);
 const copied=JSON.parse(JSON.stringify(s));const html=renderActiveDraft(copied.agentDraft,{esc:x=>String(x)});
 assert.match(html,/value="travel" selected/);assert.match(html,/value="1200.50"/);assert.equal(s.balance,50000);assert.equal(s.tasks.length,0);
});
test('live result controller creates explicit payee proposal without executing, and retries are idempotent',()=>{const s=fresh(),f=buildAgentFacts(s),ctx={originTurnId:'one',userText:'今天从工资账户给妈妈转两千',agentRunId:'run'};const a=applyAgentResult(s,proposal(transferFields),f,ctx),b=applyAgentResult(s,proposal(transferFields),f,ctx);assert.equal(a.taskId,b.taskId);assert.equal(s.tasks.length,1);assert.equal(s.tasks[0].payeeId,'mom');assert.equal(s.tasks[0].granted,false);assert.equal(s.balance,50000)});
test('missing payee does not fall back to mother; new run never merges old private draft',()=>{const s=fresh();s.agentDraft={agentRunId:'old',fields:{payee_id:'dad'},id:'old'};const out=applyAgentResult(s,proposal({amount_minor:200000}),buildAgentFacts(s),{originTurnId:'two',agentRunId:'new'});assert.equal(s.tasks.length,0);assert.equal(out.card.type,'clarification');assert.ok(s.agentDraft.missing.includes('payee_id'));assert.equal(s.agentDraft.fields.payee_id,undefined)});
test('unverified safety account cannot become executable even when model claims proposal',()=>{const s=fresh(),out=applyAgentResult(s,proposal({...transferFields,payee_id:'unknown'}),buildAgentFacts(s),{originTurnId:'risk',userText:'转去安全账户',agentRunId:'run'});const t=s.tasks.find(t=>t.id===out.taskId);assert.equal(t.status,'blocked');assert.throws(()=>transition(s,t.id,'grant'));assert.equal(s.balance,50000)});
test('all ten model-selected queries return local immutable facts, not hard-coded language replies',()=>{const s=fresh(),f=buildAgentFacts(s);for(const q of QUESTION_CATALOG){const out=applyAgentResult(s,{status:'answer',scenario:'question',reply:'查询结果见数据卡。',query:q.id,fields:{}},f,{originTurnId:q.id,agentRunId:'run'});assert.equal(out.card.data.snapshot_id,f.snapshot_id);assert.equal(out.card.data.query,q.id);assert.equal(s.tasks.length,0)}const out=applyAgentResult(s,{status:'answer',scenario:'question',reply:'查看餐饮卡片。',query:'dining_month'},f,{originTurnId:'dining',agentRunId:'run'});s.ledger[0].amountMinor=1;assert.equal(out.card.data.amount_minor,187300)});
test('malformed proposals roll back instead of leaving a task, and read-only interruption preserves draft',()=>{const s=fresh(),f=buildAgentFacts(s);assert.throws(()=>applyAgentResult(s,proposal({...transferFields,amount_minor:-1}),f,{originTurnId:'bad',agentRunId:'run'}));assert.equal(s.tasks.length,0);applyAgentResult(s,{status:'clarify',scenario:'ambiguous',reply:'用途和金额是什么？',fields:{},missing:['purpose','amount_minor']},f,{originTurnId:'draft',agentRunId:'run'});const id=s.agentDraft.id;applyAgentResult(s,{status:'answer',scenario:'question',reply:'查看餐饮卡片。',query:'dining_month'},f,{originTurnId:'aside',agentRunId:'run'});assert.equal(s.agentDraft.id,id)});
