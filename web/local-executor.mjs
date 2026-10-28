import {transition,applyConsequences} from './engine.mjs';
import {parameterFingerprint,validateTaskParameters} from './task-parameters.mjs';

// The local journal records actual local state transitions. It never talks to a
// bank or decides success by elapsed time. Missing/pending/failed are distinct.
export const executionKey=t=>t.id+':'+t.revision;
export function queryLocalExecution(state,taskId){
 const task=state.tasks.find(t=>t.id===taskId);if(!task)throw Error('任务不存在');
 const result=state.executions?.[executionKey(task)];
 return result?structuredClone(result):{status:'not_found',task_id:taskId,revision:task.revision};
}
export function executeLocalTask(state,taskId){
 const task=state.tasks.find(t=>t.id===taskId);if(!task)throw Error('任务不存在');
 const fingerprint=parameterFingerprint(task),key=executionKey(task);
 state.executions||={};const prior=state.executions[key];
 if(prior){if(prior.parameters!==fingerprint)throw Error('同一执行请求的参数不一致');return structuredClone(prior);}
 if(state.paused||task.status!=='executing'||!task.granted||task.approved!==task.revision||task.approvedParameters!==fingerprint)throw Error('执行授权或当前确认无效');
 validateTaskParameters(task);
 const entry={status:'pending',task_id:task.id,revision:task.revision,parameters:fingerprint,created_at:Date.now(),receipt:null};state.executions[key]=entry;
 try{
  const result=transition(state,task.id,'complete');
  if(result.status!=='done'){entry.status='needs_review';entry.reason='资金或验证条件已变化';return structuredClone(entry);}
  applyConsequences(state,result);entry.status='completed';entry.receipt=result.receipt;entry.completed_at=Date.now();
 }catch(error){entry.status='failed';entry.reason='本地规则校验未通过';throw error;}
 return structuredClone(entry);
}
export function reconcileLocalTask(state,taskId){
 const result=queryLocalExecution(state,taskId),task=state.tasks.find(t=>t.id===taskId);
 if(result.status==='completed'){
  if(result.parameters!==parameterFingerprint(task)||result.receipt!==task.receipt||!task.applied)throw Error('回执与当前任务不一致，已停止重复操作');
  task.status='done';return result;
 }
 // Read-only reconciliation never submits a missing operation or converts a
 // timer/timeout into success. A pending operation must be resolved by its owner.
 return result;
}
