// Local data maintenance uses the same lock/epoch as transactions. This ticket
// grants no financial authority and must never substitute for a policy grant.
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
function guard(state){if(state.safety?.locked)fail('locked','安全保护已开启，请先完成恢复验证。');if(state.paused)fail('paused','写操作已暂停，请先继续并重新核对。');return state.safety?.epoch??0;}
export function prepareLocalWrite(state,{kind,id,parameters={}}={}){const epoch=guard(state);if(!kind||!id)fail('invalid_write','请先核对这次操作。');return Object.freeze({epoch,kind,id,parameterKey:canonical(parameters)});}
export function assertLocalWrite(state,ticket,{parameters}={}){const epoch=guard(state);if(!ticket||ticket.epoch!==epoch)fail('stale_write','安全状态已变化，请重新打开并核对。');if(parameters!==undefined&&ticket.parameterKey!==canonical(parameters))fail('stale_binding','参数已变化，请重新核对。');return true;}
