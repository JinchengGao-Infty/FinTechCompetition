// One bounded attempt. Never retries or executes model actions.
export function createAgentDeadline(controller,{timeoutMs=35000,slowAfterMs=5000,onSlow=()=>{}}={}){
 let expired=false,finished=false;
 const timeoutError=()=>Object.assign(new Error('模型回复超时，本次没有创建新任务。请稍后手动重试。'),{name:'AgentTimeoutError',code:'agent_timeout'});
 const abortError=()=>expired?timeoutError():new DOMException('Stopped','AbortError');
 const slow=setTimeout(()=>{if(!finished&&!controller.signal.aborted)onSlow();},slowAfterMs);
 const timer=setTimeout(()=>{if(!finished){expired=true;controller.abort();}},timeoutMs);
 return {get timedOut(){return expired;},
  wait(operation){if(controller.signal.aborted)return Promise.reject(abortError());return new Promise((resolve,reject)=>{
   let settled=false;const end=(error,value)=>{if(settled)return;settled=true;controller.signal.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   const abort=()=>end(abortError());controller.signal.addEventListener('abort',abort,{once:true});
   try{Promise.resolve(typeof operation==='function'?operation():operation).then(value=>end(null,value),error=>end(error));}catch(error){end(error);}
   if(controller.signal.aborted)abort();
  });},
  finish(){finished=true;clearTimeout(timer);clearTimeout(slow);}
 };
}
