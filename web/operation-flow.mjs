import {revokeTaskSafety} from './task-safety.mjs';
import {transition,needsIdentity} from './engine.mjs';
import {parameterFingerprint} from './task-parameters.mjs';
import {leaveWorkspace} from './agent-workspace.mjs';

export function resetBotPresentation(state){
 if(state.messages?.length){state.conversationArchives??=[];state.conversationArchives.push({at:Date.now(),messages:state.messages});state.conversationArchives=state.conversationArchives.slice(-5);}
 leaveWorkspace(state,{cancel:true});state.messages=[];state.agentLastReceipt=null;
 for(const t of state.tasks||[]){
  if(t.agentOrigin&&['permission','review','verify','paused'].includes(t.status)&&(t.granted||t.approved||t.status==='verify')){
   revokeTaskSafety(state,t,'page_reloaded');t.status=t.status==='paused'?'paused':'permission';t.granted=false;t.approved=null;t.approvedParameters=null;t.verifiedRevision=null;t.revision++;
   t.logs.push({text:'刷新已结束临时确认，请重新核对',at:Date.now()});
  }
 }
 return state;
}
export function shouldResetBot(type,hash){return type==='reload'&&/^#\/bot(?:\/|$)/.test(hash);}

// Older saved tasks predate view provenance. Return to their business area,
// while keeping an explicitly recorded in-app source when one is available.
export function operationOrigin(task){
 const origin=task?.uiOrigin;
 if(origin&&/^#\/(?:today|bot(?:\/tasks)?|finance(?:\/(?:capture|entry))?|investment|me(?:\/[a-z-]+)?)$/.test(origin.route||'')){
  return {route:origin.route,financial:['overview','ledger','charts','budget'].includes(origin.financial)?origin.financial:'overview',investment:['holdings','research','wealth'].includes(origin.investment)?origin.investment:'holdings',scroll:Number.isFinite(origin.scroll)?Math.max(0,origin.scroll):0};
 }
 if(task?.agentOrigin)return {route:'#/bot',financial:'overview',investment:'holdings',scroll:0};
 if(['investment','redemption'].includes(task?.kind))return {route:'#/investment',financial:'overview',investment:'wealth',scroll:0};
 if(task?.kind==='card')return {route:'#/finance',financial:'overview',investment:'holdings',scroll:0};
 if(['transfer','refund'].includes(task?.kind))return {route:'#/finance',financial:'ledger',investment:'holdings',scroll:0};
 return {route:'#/today',financial:'overview',investment:'holdings',scroll:0};
}

// One explicit consent carries permission + exact parameter confirmation.
// Important operations still stop at verify for a separate identity gesture.
// Validate on a clone so an error cannot leave behind half-granted permission.
export function authorizeOperation(state,id,payload){
 const current=state.tasks.find(t=>t.id===id);if(!current)throw Error('任务不存在');
 if(['done','executing','unknown'].includes(current.status))return current;
 if(!['permission','review','verify'].includes(current.status))throw Error('当前任务不能执行');
 if(payload.revision!==current.revision||payload.parameters!==parameterFingerprint(current))throw Error('安排已变化，请核对当前参数');
 const next=structuredClone(state);let t=next.tasks.find(x=>x.id===id);
 try{if(t.status==='permission')t=transition(next,id,'grant');
 if(t.status==='review')t=transition(next,id,'confirm',{revision:payload.revision,parameters:payload.parameters,source:payload.source||{kind:'user',method:'click'}});
 Object.assign(state,next);return state.tasks.find(x=>x.id===id);}catch(error){if(next.safety)state.safety=next.safety;throw error;}
}
export const confirmationLabel=(state,t)=>{
 const verb={transfer:'转账',investment:'申购',redemption:'赎回',subscription:'安排',planning:'调整',card:'保护',refund:'核实'}[t.kind]||'操作';
 return (needsIdentity(state,t)?'授权并核对':'授权并确认')+verb;
};
