// A single active operation; historical drafts/tasks never retain live controls.
const ended=new Set(['done','cancelled','blocked']);
export function rememberDraft(state){
 if(!state.agentDraft)return;
 state.agentDraftHistory??={};
 state.agentDraftHistory[state.agentDraft.id]=structuredClone(state.agentDraft);
}
export function leaveWorkspace(state,{cancel=false}={}){
 if(state.agentDraft){if(cancel)state.agentDraft.status='cancelled';rememberDraft(state);}
 state.agentDraft=null;state.agentFocus=null;state.agentWorkspaceVisible=false;
 state.agentGeneration=(state.agentGeneration||0)+1;
}
export function showDraft(state,draft){
 if(state.agentDraft?.id!==draft.id){rememberDraft(state);state.agentGeneration=(state.agentGeneration||0)+1;}
 state.agentDraft=draft;state.agentFocus=null;state.agentWorkspaceVisible=true;
 rememberDraft(state);
}
export function continueDraft(state,id,runId){
 const draft=state.agentDraft?.id===id?state.agentDraft:state.agentDraftHistory?.[id];
 if(!draft||draft.status!=='awaiting_details')throw Error('这次补充已结束，请开始新任务。');
 // Explicitly returning/submitting a visible draft adopts only that draft.
 // No old conversation, permission, confirmation or credential is restored.
 const current={...structuredClone(draft),agentRunId:runId};showDraft(state,current);return current;
}
export function finishDraft(state){
 if(state.agentDraft){state.agentDraft.status='resolved';rememberDraft(state);state.agentDraft=null;}
}
export function activeTask(state){
 if(state.agentWorkspaceVisible===false||state.agentDraft)return null;
 const task=state.tasks.find(t=>t.id===state.agentFocus);return task&&!ended.has(task.status)?task:null;
}
export function selectTask(state,id,runId){
 const task=state.tasks.find(t=>t.id===id);if(!task)throw Error('任务不存在');
 leaveWorkspace(state);state.agentFocus=id;state.agentWorkspaceVisible=!ended.has(task.status);
 if(!ended.has(task.status))task.agentRunId=runId;
 return task;
}
export function requestGate({readEpoch=()=>0}={}){
 let generation=0,current=null;
 return {
  get idle(){return current===null;},
  begin(){this.cancel();current={generation,safetyEpoch:readEpoch(),controller:new AbortController()};return current;},
  cancel(){generation++;current?.controller.abort();current=null;},
  owns(ticket){return current===ticket&&ticket.generation===generation;},
  valid(ticket){return this.owns(ticket)&&ticket.safetyEpoch===readEpoch()&&!ticket.controller.signal.aborted;},
  finish(ticket){if(this.owns(ticket))current=null;},
 };
}
