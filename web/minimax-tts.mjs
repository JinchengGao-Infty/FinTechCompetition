// Same-origin configuration gate. No provider credentials enter this module.
import {createMinimaxVoiceStreamAdapter,MINIMAX_VOICE} from './minimax-voice-stream.mjs';
export function createConfiguredMiniMax({headers,fetchImpl=fetch,AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext,adapterFactory=createMinimaxVoiceStreamAdapter}={}){
 const adapters=new Map();let generation=0,connection=null,context=null,disposed=false;
 const get=(voice,model='speech-2.8-turbo')=>{const id=model+'|'+voice;if(!adapters.has(id))adapters.set(id,adapterFactory({headers,model,voiceId:voice,audioContext:context}));return adapters.get(id);};
 const stop=()=>{generation++;for(const a of adapters.values())a.cancel();};
 const clear=()=>{stop();for(const a of adapters.values())a.clearCache?.();connection=null;};
 return {kind:'minimax',supported:true,
  prepare(){if(disposed)return Promise.reject(Error('Voice disposed'));if(!context&&AudioContextCtor)context=new AudioContextCtor({latencyHint:'interactive'});return get(MINIMAX_VOICE).prepare?.();},
  async speak(text,options={}){
   if(disposed)throw Error('Voice disposed');const current=++generation;
   const response=await fetchImpl('/api/voice/config',{credentials:'same-origin',signal:options.signal});
   const status=response.ok?await response.json():null;
   if(current!==generation||options.signal?.aborted)throw new DOMException('Stopped','AbortError');
   if(!status?.configured){clear();throw Error('请先连接MiniMax语音。');}
   if(connection!==status.generation){for(const a of adapters.values()){a.cancel();a.clearCache?.();}connection=status.generation;}
   const a=get(options.voiceId||status.voice||MINIMAX_VOICE,status.model||'speech-2.8-turbo');
   for(const other of adapters.values())if(other!==a)other.cancel();
   return a.speak(text,options);
  },
  cancel:stop,clearCache:clear,
  dispose(){if(disposed)return;clear();disposed=true;for(const a of adapters.values())a.dispose?.();adapters.clear();context?.close?.().catch?.(()=>{});context=null;}
 };
}
