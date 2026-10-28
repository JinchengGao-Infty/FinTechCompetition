import test from 'node:test';import assert from 'node:assert/strict';
import {fresh,createTask,transition} from '../web/engine.mjs';
import {parameterFingerprint} from '../web/task-parameters.mjs';
import {taskPermission,subscriptionDetailHTML,salaryPlanRows} from '../web/task-ui.mjs';
import {scenarios} from '../web/engine.mjs';
import {executeLocalTask} from '../web/local-executor.mjs';
import {applyAgentResult} from '../web/agent-plans.mjs';
import {buildAgentFacts} from '../web/agent-tools.mjs';

test('changing subscription changes contract dates,target,permission and confirmation fingerprint together',()=>{
 const s=fresh(),t=createTask(s,'subscription');transition(s,t.id,'grant');const old=parameterFingerprint(t),revision=t.revision;
 transition(s,t.id,'edit',{subscriptionId:'cloud',subscriptionAction:'keep'});
 assert.equal(t.nextRenewalDate,'2026-11-10');assert.equal(t.rightsUntil,'2026-11-10');assert.match(t.target,/云空间/);assert.match(taskPermission(t),/保留/);assert.doesNotMatch(taskPermission(t),/取消/);
 assert.match(subscriptionDetailHTML(t,{esc:x=>x}),/2026-11-10/);assert.notEqual(parameterFingerprint(t),old);
 assert.throws(()=>transition(s,t.id,'confirm',{revision,parameters:old}),/更新/);assert.equal(s.balance,50000);
});

test('future or impossible date cannot leave a half-created executable proposal',()=>{
 for(const date of ['2026-11-03','2026-11-31']){const s=fresh(),before=JSON.stringify(s);
 const result={status:'propose',scenario:'transfer',reply:'请核对',fields:{amount_minor:200000,payee_id:'mom',source_account:'salary_0826',scheduled_date:date},mode:'create'};
 assert.throws(()=>applyAgentResult(s,result,buildAgentFacts(s),{originTurnId:date,agentRunId:'one'}),/日期/);assert.equal(JSON.stringify(s),before);}
});

test('salary distribution,confirmation and receipt all follow edited recipient and source',()=>{
 const s=fresh(),t=createTask(s,'salary');transition(s,t.id,'grant');const old=parameterFingerprint(t),revision=t.revision;
 transition(s,t.id,'edit',{amount:1800,payeeId:'dad',sourceAccount:'living_1608'});
 const rows=salaryPlanRows(t,scenarios.salary.plan);assert.ok(rows.some(([label,value])=>label==='给爸爸'&&value===1800));assert.ok(rows.every(([label])=>!label.includes('妈妈')));assert.equal(rows.find(([l])=>l==='待安排')[1],3000);
 assert.throws(()=>transition(s,t.id,'confirm',{revision,parameters:old}),/更新/);
 transition(s,t.id,'confirm',{revision:t.revision,parameters:parameterFingerprint(t)});transition(s,t.id,'verify',{verified:true});executeLocalTask(s,t.id);
 const ledger=s.ledger.filter(r=>r.taskId===t.id);assert.equal(ledger.length,1);assert.match(ledger[0].title,/爸爸/);assert.match(ledger[0].accountLabel,/1608/);assert.equal(s.balance,48200);
});
