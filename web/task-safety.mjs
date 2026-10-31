import {parameterFingerprint,taskParameters} from './task-parameters.mjs';
import {ensureSafety,classifyOperation,authorizeSafety,beginChallenge,verifyChallenge,validateGrant,acquireExecution,commitExecution,revokeOperation} from './safety-policy.mjs';

export function safetyNow(state){const n=state.demoClock?.now??state.demoClock?.iso;return typeof n==='string'?Date.parse(n):Number.isFinite(n)?n:Date.now();}
export function taskOperation(state,task){
 const p=taskParameters(task),parameters=parameterFingerprint(task),kind=task.kind==='refund'?'query':task.kind==='planning'?'budget_update':task.kind;
 return {id:task.id,revision:task.revision,kind,target:task.target||'',amountMinor:p.amount_minor,currency:p.currency,parameters,parameterKey:parameters,
  scope:{taskId:task.id,action:kind,sourceAccount:p.source_account,payeeId:p.payee_id,scope:p.scope},scheduledAt:null,
  riskFlags:[...(task.riskFlags||[])],source:{kind:task.proposalSource||(task.agentOrigin?'llm':'program')}};
}
export function classifyTask(state,task){return classifyOperation(state,taskOperation(state,task),{now:safetyNow(state)});}
export function confirmTaskSafety(state,task,source){
 const operation=taskOperation(state,task),now=safetyNow(state),grant=authorizeSafety(state,operation,{source,now});
 task.safetyGrantId=grant.grantId;task.safetyLevel=grant.level;task.confirmationExpiresAt=grant.expiresAt;
 if(grant.status==='verification_required')task.safetyChallengeId=beginChallenge(state,operation,{grantId:grant.grantId,now}).id;
 else task.safetyChallengeId=null;
 return grant;
}
export function verifyTaskSafety(state,task,payload){
 const now=safetyNow(state),operation=taskOperation(state,task);
 if(typeof payload.challengeId!=='string'||payload.challengeId!==task.safetyChallengeId||typeof payload.code!=='string')throw Error('请完成独立身份验证，普通确认不能代替。');
 const result=verifyChallenge(state,{challengeId:payload.challengeId,code:payload.code,source:payload.source,now});
 if(!result.ok)throw Error(state.safety.locked?'连续验证失败，安全保护已开启。':'验证码不匹配，请重新输入。');
 return validateGrant(state,operation,{grantId:task.safetyGrantId,challengeId:payload.challengeId,now});
}
export function assertTaskSafety(state,task){return validateGrant(state,taskOperation(state,task),{grantId:task.safetyGrantId,now:safetyNow(state)});}
export function promoteTaskChallenge(state,task){const c=beginChallenge(state,taskOperation(state,task),{grantId:task.safetyGrantId,now:safetyNow(state)});task.safetyChallengeId=c.id;task.safetyLevel='red';return c;}
export function acquireTaskExecution(state,task){return acquireExecution(state,taskOperation(state,task),{grantId:task.safetyGrantId,executionId:task.id+':'+task.revision,now:safetyNow(state),epoch:ensureSafety(state).epoch});}
export function commitTaskExecution(state,task,permit,receipt,{budgetResult}={}){return commitExecution(state,permit,{status:'completed',receipt,source:'local_adapter',external:false,taskId:task.id,revision:task.revision,...(task.kind==='planning'&&budgetResult?{budget_result:structuredClone(budgetResult)}:{})},{now:safetyNow(state)});}
export function revokeTaskSafety(state,task,reason='task_changed'){
 revokeOperation(state,task.id,{reason,now:safetyNow(state)});task.safetyGrantId=null;task.safetyChallengeId=null;task.confirmationExpiresAt=safetyNow(state)+300000;
}
