// A completed budget adjustment is an execution fact, never current balance + delta.
// Pure helpers accept the already-bound parameter fingerprint from their caller.
const RESULT_KEYS=['version','kind','task_id','revision','parameters','receipt','before_minor','delta_minor','after_minor','currency'];
const minor=value=>{const n=Math.round(Number(value)*100);if(!Number.isFinite(value)||!Number.isSafeInteger(n)||n<0||Math.abs(n-Number(value)*100)>.000001)throw Error('预算金额无法核对');return n;};
const freeze=value=>Object.freeze(structuredClone(value));
export function budgetPreview(state,task){
 const before_minor=minor(state.travelBudget??3000),delta_minor=minor(task.amount),after_minor=before_minor+delta_minor;
 if(delta_minor<=0||!Number.isSafeInteger(after_minor))throw Error('预算金额无法核对');
 return freeze({before_minor,delta_minor,after_minor,currency:'CNY'});
}
export function captureBudgetResult(state,task,{parameters,receipt}={}){
 if(task.kind!=='planning'||typeof parameters!=='string'||!parameters||typeof receipt!=='string'||!receipt||!Number.isSafeInteger(task.revision)||task.revision<1)throw Error('预算执行快照无法核对');
 return freeze({version:1,kind:'travel_budget_adjustment',task_id:task.id,revision:task.revision,parameters,receipt,...budgetPreview(state,task)});
}
export function validBudgetResult(value,task,parameters){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))||Object.keys(value).length!==RESULT_KEYS.length||Object.keys(value).some(k=>!RESULT_KEYS.includes(k)))return false;
 return typeof parameters==='string'&&!!parameters&&typeof task.receipt==='string'&&!!task.receipt&&value.version===1&&value.kind==='travel_budget_adjustment'&&value.task_id===task.id&&value.revision===task.revision&&value.parameters===parameters&&value.receipt===task.receipt&&value.currency==='CNY'&&
  Number.isSafeInteger(value.before_minor)&&value.before_minor>=0&&Number.isSafeInteger(value.delta_minor)&&value.delta_minor>0&&value.delta_minor===Math.round(task.amount*100)&&
  Number.isSafeInteger(value.after_minor)&&value.after_minor===value.before_minor+value.delta_minor;
}
export function budgetReceiptFacts(state,task,{parameters}={}){
 if(task?.kind!=='planning'||task.status!=='done'||task.applied!==true)return null;
 const proof=state.safety?.executions?.[task.id+':'+task.revision];
 if(proof?.status!=='completed'||proof.operationId!==task.id||proof.snapshot?.revision!==task.revision||proof.snapshot?.kind!=='budget_update'||proof.snapshot?.parameters!==parameters||proof.result?.status!=='completed'||proof.result?.source!=='local_adapter'||proof.result?.external!==false||proof.result?.receipt!==task.receipt||proof.result?.taskId!==task.id||proof.result?.revision!==task.revision)return null;
 const result=proof.result.budget_result;
 return validBudgetResult(result,task,parameters)?freeze(result):null;
}
export function applyBudgetResult(state,task,{parameters}={}){
 const result=budgetReceiptFacts(state,task,{parameters});
 // Old completed saves have no immutable before/after fact. Never reconstruct
 // their base from today's budget and never reapply their already-receipted delta.
 if(!result)return false;
 if(minor(state.travelBudget??3000)!==result.before_minor)throw Error('预算已变化，请先核对原执行记录，不能重复调增');
 state.travelBudget=result.after_minor/100;state.nextMonthReminder=result.delta_minor/100;
 return true;
}
