import {extractSpeech} from './voice-demo.mjs';

export const MINIMAX_MODEL='speech-2.8-turbo';
export const MINIMAX_VOICE='Chinese (Mandarin)_Warm_Bestie';
export const MINIMAX_SAMPLE_TEXT='好，我先帮你整理安排。涉及付款的地方，等你确认后我再继续。';
export const MINIMAX_VOICES=[MINIMAX_VOICE,'Chinese (Mandarin)_Warm_Girl','Chinese (Mandarin)_Sweet_Lady','Chinese (Mandarin)_Mature_Woman'];
const SAMPLE_RATE=32000,MAX_AUDIO=8*1024*1024;
const abortError=()=>Object.assign(new Error('播报已取消。'),{name:'AbortError'});
export class MinimaxStreamError extends Error{
 constructor(code,message='语音暂不可用，文字回复仍可查看。'){super(message);this.name='MinimaxStreamError';this.code=code;this.textUnaffected=true;}
}
export function estimateMinimaxCost(text){
 if(typeof text!=='string')throw new TypeError('text must be a string');
 let count=0;for(const character of text){const n=character.codePointAt(0);count+=(n>=0x3400&&n<=0x4dbf)||(n>=0x4e00&&n<=0x9fff)||(n>=0xf900&&n<=0xfaff)||(n>=0x20000&&n<=0x323af)?2:1;}
 return {billable_characters_estimate:count,cny_estimate:Math.round(count*2/10000*1e6)/1e6,cny_per_10000:2,is_estimate:true};
}
function localRoute(value,scope){
 const base=scope.location?.href||'http://127.0.0.1/';const url=new URL(value,base);
 if(!['http:','https:'].includes(url.protocol)||url.origin!==new URL(base).origin||url.username||url.password||url.hash)throw new TypeError('MiniMax browser transport must use the local same-origin host');
 return url.href;
}
function pcmBytes(value,scope){
 if(typeof value!=='string'||!value||value.length>256*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new MinimaxStreamError('invalid_audio');
 let binary;try{binary=scope.atob(value);}catch{throw new MinimaxStreamError('invalid_audio');}
 if(!binary.length||binary.length%2)throw new MinimaxStreamError('incomplete_audio');
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

// No provider key is accepted here. The host owns credentials, CSRF, user consent and authorization.
export function createMinimaxVoiceStreamAdapter({scope=globalThis,endpoint='/api/voice/minimax/stream',cancelEndpoint='/api/voice/minimax/cancel',
 model=MINIMAX_MODEL,voiceId=MINIMAX_VOICE,fetchImpl=scope.fetch?.bind(scope),headers={},AudioContextCtor=scope.AudioContext||scope.webkitAudioContext,audioContext=null,
 now=()=>scope.performance?.now?.()??Date.now(),requestTimeoutMs=20000,totalTimeoutMs=90000,maxQueuedSeconds=12,
 makeRequestId=()=>scope.crypto?.randomUUID?.()??globalThis.crypto?.randomUUID?.(),duplicateWindowMs=30000,maxRequests=1024}={}){
 if(!['speech-2.8-turbo','speech-2.8-hd'].includes(model)||model==='speech-2.8-hd'&&voiceId!==MINIMAX_VOICE)throw new TypeError('Unsupported voice protocol');
 if(!MINIMAX_VOICES.includes(voiceId))throw new TypeError('Unsupported voice');
 const route=localRoute(endpoint,scope),cancelRoute=cancelEndpoint?localRoute(cancelEndpoint,scope):null;
 let context=audioContext,ownedContext=!audioContext,active=null,generation=0,disposed=false,cache=null;
 const used=new Map(),recent=new Map();
 const current=job=>active===job&&!job.controller.signal.aborted&&job.generation===generation;
 async function requestHeaders(){
  const supplied=typeof headers==='function'?await headers():headers;
  const result={'Content-Type':'application/json',Accept:'application/x-ndjson'};
  for(const [key,value] of Object.entries(supplied||{})){
   if(/^(?:authorization|proxy-authorization|x-api-key|api-key)$/i.test(key))throw new MinimaxStreamError('provider_key_in_browser');
   result[key]=String(value);
  }
  return result;
 }
 function cleanup(job){
  for(const source of job.sources){source.onended=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
  job.sources.clear();for(const wake of job.waiters)wake();job.waiters.clear();
  try{job.reader?.cancel()?.catch?.(()=>{});}catch{}
 }
 function notifyCancel(job){
  if(!cancelRoute||!job.networkStarted||job.cancelSent)return;job.cancelSent=true;
  requestHeaders().then(h=>fetchImpl(cancelRoute,{method:'POST',credentials:'same-origin',headers:h,keepalive:true,
   body:JSON.stringify({request_id:job.requestId})})).catch(()=>{});
 }
 function stop(job,notify=true){
  if(!job)return;job.controller.abort();cleanup(job);if(notify)notifyCancel(job);
  if(active===job){active=null;generation++;}
 }
 async function guarded(job,operation,timeout=requestTimeoutMs){
  if(!current(job))throw abortError();
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);job.controller.signal.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   const abort=()=>finish(abortError());
   const timer=setTimeout(()=>finish(new MinimaxStreamError('stream_timeout','语音连接超时，请手动重试。')),timeout);
   job.controller.signal.addEventListener('abort',abort,{once:true});
   Promise.resolve(operation).then(value=>finish(null,value),error=>finish(error));
   if(job.controller.signal.aborted)abort();
  });
 }
 function waitForPlayback(job){
  return (async()=>{while(current(job)&&job.sources.size)await guarded(job,new Promise(resolve=>job.waiters.add(resolve)),Math.max(1000,totalTimeoutMs-(now()-job.started)));})();
 }
 async function prepare(){
  if(disposed)throw new MinimaxStreamError('disposed');
  if(!context){if(!AudioContextCtor)throw new MinimaxStreamError('audio_unsupported');context=new AudioContextCtor({latencyHint:'interactive'});}
  if(context.state==='closed')throw new MinimaxStreamError('audio_unavailable');
  if(context.state==='suspended')await context.resume();
  if(context.state&&context.state!=='running')throw new MinimaxStreamError('audio_gesture_required','请点击麦克风或试听按钮启用语音播放。');
  return {status:'ready'};
 }
 async function schedule(job,bytes,onStart){
  while(current(job)&&job.nextTime-context.currentTime>maxQueuedSeconds){
   await guarded(job,new Promise(resolve=>{const timer=setTimeout(()=>{job.waiters.delete(wake);resolve();},50);const wake=()=>{clearTimeout(timer);resolve();};job.waiters.add(wake);}),requestTimeoutMs);
  }
  if(!current(job))throw abortError();
  const pcm=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),buffer=context.createBuffer(1,bytes.length/2,SAMPLE_RATE);
  const channel=buffer.getChannelData(0);for(let i=0;i<channel.length;i++)channel[i]=pcm.getInt16(i*2,true)/32768;
  const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);job.sources.add(source);
  source.onended=()=>{job.sources.delete(source);try{source.disconnect();}catch{}for(const wake of job.waiters)wake();job.waiters.clear();};
  const when=Math.max(job.nextTime,context.currentTime+0.025);job.nextTime=when+channel.length/SAMPLE_RATE;
  source.start(when);
  if(!job.didStart){job.didStart=true;try{onStart?.({engine:'minimax-'+model,voice:voiceId,
   firstAudioMs:Math.round((now()-job.started)*100)/100,phase:'scheduled',playbackScheduled:true});}catch{}}
 }
 return {
  kind:'minimax-stream',supported:!!(fetchImpl&&(audioContext||AudioContextCtor)&&scope.atob),prepare,
  cancel(){stop(active);},
  async speak(input,{signal,onStart,requestId}={}){
   if(disposed)throw new MinimaxStreamError('disposed');if(signal?.aborted)throw abortError();
   if(!(audioContext||AudioContextCtor))throw new MinimaxStreamError('audio_unsupported');
   if(!fetchImpl||!scope.atob)throw new MinimaxStreamError('stream_unsupported');
   const envelope=typeof input==='string'&&!/^[\s]*[\[{]/.test(input)?{speak:input}:input;
   const selected=extractSpeech(envelope);
   if(!selected.ok||!selected.speak)throw new MinimaxStreamError('invalid_speak');
   const text=selected.speak;
   if(requestId!==undefined&&(typeof requestId!=='string'||! /^[A-Za-z0-9_.:-]{1,128}$/.test(requestId)))throw new MinimaxStreamError('invalid_request_id');
   if(requestId&&used.has(requestId)){
    if(used.get(requestId)!==text)throw new MinimaxStreamError('request_id_conflict');
    return {status:'skipped',reason:'duplicate_request'};
   }
   const cached=cache?.text===text?cache:null;
   if(!requestId&&active?.text===text)return {status:'skipped',reason:'duplicate_text'};
   if(!requestId&&!cached&&recent.has(text)&&now()-recent.get(text)<duplicateWindowMs)return {status:'skipped',reason:'duplicate_text'};
   if(used.size>=maxRequests)throw new MinimaxStreamError('request_history_full');
   requestId=requestId||makeRequestId();if(typeof requestId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId))throw new MinimaxStreamError('invalid_request_id');
   if(used.has(requestId))throw new MinimaxStreamError('request_id_conflict');
   used.set(requestId,text);
   stop(active);
   const job={requestId,text,generation:++generation,controller:new AbortController(),sources:new Set(),waiters:new Set(),reader:null,
    networkStarted:false,cancelSent:false,nextTime:0,didStart:false,started:now()};active=job;
   const abort=()=>stop(job);signal?.addEventListener('abort',abort,{once:true});
   let totalTimer;
   try{
    await guarded(job,prepare());
    if(cached){
     for(const bytes of cached.chunks)await schedule(job,bytes,onStart);
     await waitForPlayback(job);if(!current(job))throw abortError();
     return {status:'spoken',requestId,cached:true};
    }
    const localHeaders=await guarded(job,requestHeaders());
    if(!current(job))throw abortError();
    recent.set(text,now());if(recent.size>100)recent.delete(recent.keys().next().value);
    totalTimer=setTimeout(()=>{job.timedOut=true;stop(job);},totalTimeoutMs);job.networkStarted=true;
    const response=await guarded(job,fetchImpl(route,{method:'POST',credentials:'same-origin',headers:localHeaders,
     signal:job.controller.signal,body:JSON.stringify({request_id:requestId,speak:text,...(model==='speech-2.8-turbo'?{voice_id:voiceId}:{})})}));
    if(!response.ok)throw new MinimaxStreamError(`http_${Number(response.status)||0}`);
    if(!/^application\/(?:x-ndjson|ndjson)(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new MinimaxStreamError('invalid_content_type');
    if(!response.body?.getReader)throw new MinimaxStreamError('stream_unsupported');job.reader=response.body.getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true}),received=[];let pending='',started=false,ended=false,frames=0,audioBytes=0,wireBytes=0;
    async function line(value){
     if(!value.trim())return;if(ended)throw new MinimaxStreamError('trailing_event');
     let event;try{event=JSON.parse(value);}catch{throw new MinimaxStreamError('invalid_json');}
     if(!event||typeof event!=='object'||Array.isArray(event)||event.request_id!==requestId)throw new MinimaxStreamError('invalid_event');
     if(event.type==='error')throw new MinimaxStreamError(typeof event.code==='string'&&/^[a-z_]{1,64}$/.test(event.code)?event.code:'provider_error');
     if(event.type==='start'){
      if(started||event.format!=='pcm_s16le'||event.sample_rate!==SAMPLE_RATE||event.channels!==1||event.model!==model||event.voice!==voiceId)throw new MinimaxStreamError('invalid_audio_format');
      started=true;return;
     }
     if(!started)throw new MinimaxStreamError('missing_start');
     if(event.type==='audio'){
      if(event.seq!==frames||frames>=4096)throw new MinimaxStreamError('audio_sequence');
      const bytes=pcmBytes(event.audio_base64,scope);audioBytes+=bytes.length;if(audioBytes>MAX_AUDIO)throw new MinimaxStreamError('audio_too_large');
      frames++;received.push(bytes);await schedule(job,bytes,onStart);return;
     }
     if(event.type==='end'){
      if(!frames||event.frames!==frames||event.audio_bytes!==audioBytes)throw new MinimaxStreamError('incomplete_audio');
      ended=true;return;
     }
     throw new MinimaxStreamError('unknown_event');
    }
    while(true){
     const part=await guarded(job,job.reader.read());if(!current(job))throw abortError();
     if(part.value){wireBytes+=part.value.byteLength;if(wireBytes>16*1024*1024)throw new MinimaxStreamError('stream_too_large');}
     try{pending+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});}catch{throw new MinimaxStreamError('invalid_utf8');}
     if(pending.length>512*1024)throw new MinimaxStreamError('event_too_large');
     while(pending.includes('\n')){const index=pending.indexOf('\n'),value=pending.slice(0,index).replace(/\r$/,'');pending=pending.slice(index+1);await line(value);}
     if(part.done){if(pending.trim())await line(pending);break;}
    }
    if(!ended)throw new MinimaxStreamError('truncated_stream');
    cache={text,chunks:received};
    await waitForPlayback(job);if(!current(job))throw abortError();
    return {status:'spoken',requestId,frames,audioBytes};
   }catch(error){
    const cancelled=job.controller.signal.aborted||!current(job);stop(job);
    if(job.timedOut)throw new MinimaxStreamError('stream_timeout','语音连接超时，请手动重试。');
    if(cancelled||error?.name==='AbortError')throw abortError();
    if(error instanceof MinimaxStreamError)throw error;
    throw new MinimaxStreamError('transport_error');
   }finally{
    clearTimeout(totalTimer);signal?.removeEventListener('abort',abort);
    cleanup(job);if(active===job)active=null;
   }
  },
  sample(options={}){return this.speak(MINIMAX_SAMPLE_TEXT,options);},
  clearCache(){cache=null;},
  dispose(){if(disposed)return;stop(active);disposed=true;cache=null;used.clear();recent.clear();if(context&&ownedContext)try{context.close()?.catch?.(()=>{});}catch{}}
 };
}
