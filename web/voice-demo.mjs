import {normalizeSpeechNumbers,SPEECH_NUMBER_VERSION} from './speech-numbers.mjs';
// Voice is an input/output adapter. Only the host's current task gate may authorize actions.
export const VOICE_RESPONSE_SCHEMA=Object.freeze({
 type:'object',required:['reply'],properties:{reply:{type:'string'},speak:{type:['string','null'],maxLength:600},cards:{type:'array'},actions:{type:'array'}}
});
const MAX_SPEECH=600,MAX_ENVELOPE=32768;
const abortError=()=>Object.assign(new Error('Voice operation cancelled'),{name:'AbortError'});
const normalize=text=>String(text).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

export function sanitizeSpeech(value){
 if(typeof value!=='string')return '';
 return value.normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,' ')
  .replace(/<[^>]*>/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1')
  .replace(/https?:\/\/\S+/gi,'链接已隐藏')
  .replace(/(?:验证码|校验码|动态码|短信码|安全码|密码|口令|PIN|OTP|CVV|CVC|password|verification\s*code)\s*(?:是|为|is)?\s*[:：=]?[^，。！？；\n,;!?]{0,80}/gi,'验证信息已隐藏')
  .replace(/\d(?:[\s·•.,‐‑‒–—-]*\d){9,23}/g,'号码已隐藏')
  .replace(/[零〇一二三四五六七八九幺](?:[\s·•.,‐‑‒–—-]*[零〇一二三四五六七八九幺]){9,23}/g,'号码已隐藏')
  .replace(/\s+/g,' ').trim().slice(0,MAX_SPEECH);
}

// Select exactly one top-level field; reply/cards/actions are never a speech or execution fallback.
export function extractSpeech(envelope,{fields=[]}={}){
 let value=envelope;
 if(typeof value==='string'){
  if(value.length>MAX_ENVELOPE)return {ok:false,speak:'',reason:'envelope-too-large'};
  try{value=JSON.parse(value);}catch{return {ok:false,speak:'',reason:'invalid-json'};}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false,speak:'',reason:'invalid-envelope'};
 if(!own(value,'speak')||value.speak===null||value.speak==='')return {ok:true,speak:'',reason:'no-speak'};
 if(typeof value.speak!=='string'||value.speak.length>MAX_SPEECH)return {ok:false,speak:'',reason:'invalid-speak'};
 const normalized=normalizeSpeechNumbers(value.speak,{fields});
 if(normalized.length>MAX_SPEECH)return {ok:false,speak:'',reason:'normalized-speak-too-long'};
 const speak=sanitizeSpeech(normalized);
 return {ok:true,speak,redacted:speak!==value.speak,reason:speak?'ready':'no-speak'};
}

export function createBrowserTTSAdapter({scope=globalThis,lang='zh-CN',rate=1.08,voiceName}={}){
 const synth=scope.speechSynthesis,Utterance=scope.SpeechSynthesisUtterance;
 let active=null;
 return {
  kind:'browser-system',supported:!!(synth&&Utterance),
  cancel(){active?.();},
  speak(text,{signal,onStart}={}){
   if(!synth||!Utterance)return Promise.reject(new Error('Browser TTS unavailable'));
   if(signal?.aborted)return Promise.reject(abortError());
   return new Promise((resolve,reject)=>{
    const utterance=new Utterance(text);utterance.lang=lang;utterance.rate=rate;
    const voices=synth.getVoices?.()||[];
    utterance.voice=voices.find(v=>voiceName&&v.name===voiceName)||voices.find(v=>v.lang?.toLowerCase().startsWith('zh'))||null;
    let settled=false,timer;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(active===cancel)active=null;utterance.onstart=utterance.onend=utterance.onerror=null;error?reject(error):resolve();};
    const cancel=()=>{synth.cancel();finish(abortError());};active=cancel;
    signal?.addEventListener('abort',cancel,{once:true});
    utterance.onstart=()=>onStart?.({engine:'browser-system'});
    utterance.onend=()=>finish();utterance.onerror=event=>finish(new Error(event.error||'Browser TTS failed'));
    timer=setTimeout(()=>{synth.cancel();finish(new Error('Browser TTS timeout'));},45000);
    try{synth.speak(utterance);}catch(error){finish(error);}
   });
  }
 };
}

function localEndpoint(endpoint,scope){
 const base=scope.location?.href||'http://127.0.0.1/';
 const url=new URL(endpoint,base),same=scope.location?.origin===url.origin;
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(!same&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new TypeError('Voice endpoint must be same-origin or loopback');
 return url;
}

// Optional local model transport. It contains no provider credentials and cannot call arbitrary hosts.
export function createLocalModelTTSAdapter({endpoint='http://127.0.0.1:65323/tts',healthEndpoint,scope=globalThis,fetchImpl=scope.fetch?.bind(scope),AudioCtor=scope.Audio,URLImpl=scope.URL,requestTimeoutMs=12000}={}){
 const url=localEndpoint(endpoint,scope),health=localEndpoint(healthEndpoint||new URL('health',url).href,scope);
 let token=null,active=null,engine='sherpa-onnx-kokoro';
 async function probe({signal}={}){
  if(!fetchImpl)throw new Error('Local voice transport unavailable');
  const response=await fetchImpl(health.href,{signal,cache:'no-store',credentials:'omit'});
  if(!response.ok)throw new Error('Local voice service unavailable');
  const info=await response.json();
  if(info.ready!==true||!['sherpa-onnx-kokoro','sherpa-onnx-vits','sherpa-onnx-matcha'].includes(info.engine)||typeof info.session!=='string')throw new Error('Local voice model not ready');
  token=info.session;engine=info.engine;
  return {ready:true,engine:info.engine,model:info.model,loadMs:info.load_ms,voice:info.voice||null};
 }
 return {
  kind:'local-model',supported:!!(fetchImpl&&AudioCtor&&URLImpl?.createObjectURL),probe,
  cancel(){active?.();},
  async speak(text,{signal,onStart}={}){
   if(!fetchImpl||!AudioCtor||!URLImpl?.createObjectURL)throw new Error('Local voice playback unavailable');
   const controller=new AbortController();let audio,objectURL,rejectPlayback,timedOut=false;
   const cancel=()=>{controller.abort();audio?.pause();rejectPlayback?.(abortError());};
   if(signal?.aborted)throw abortError();
   signal?.addEventListener('abort',cancel,{once:true});active=cancel;
   const timer=setTimeout(()=>{timedOut=true;cancel();},requestTimeoutMs);
   try{
    if(!token)await probe({signal:controller.signal});
    const response=await fetchImpl(url.href,{method:'POST',credentials:'omit',signal:controller.signal,
     headers:{'Content-Type':'application/json','X-Voice-Session':token},body:JSON.stringify({speak:text})});
    if(!response.ok){if(response.status===403)token=null;throw new Error('Local voice synthesis failed');}
    if(!/^audio\/(wav|x-wav)(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('Invalid local voice audio');
    const blob=await response.blob();
    if(blob.size<44||blob.size>6*1024*1024)throw new Error('Invalid local voice audio size');
    if(controller.signal.aborted)throw abortError();
    clearTimeout(timer);objectURL=URLImpl.createObjectURL(blob);audio=new AudioCtor(objectURL);
    await new Promise((resolve,reject)=>{
     rejectPlayback=reject;
     audio.onended=()=>resolve();audio.onerror=()=>reject(new Error('Local voice playback failed'));
     const playbackTimer=setTimeout(()=>reject(new Error('Local voice playback timeout')),45000);
     const clear=()=>clearTimeout(playbackTimer);
     const resolveEnded=audio.onended,rejectError=audio.onerror;
     audio.onended=()=>{clear();resolveEnded();};audio.onerror=()=>{clear();rejectError();};
     rejectPlayback=error=>{clear();reject(error);};
     try{Promise.resolve(audio.play()).then(()=>{if(controller.signal.aborted){rejectPlayback(abortError());return;}onStart?.({engine,firstAudioMs:Number(response.headers.get('X-Voice-First-Audio-Ms'))||null});},rejectPlayback);}catch(error){rejectPlayback(error);}
    });
   }catch(error){if(timedOut&&!signal?.aborted)throw new Error('Local voice request timeout');throw error;}finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(active===cancel)active=null;
    if(audio){audio.pause();audio.onended=audio.onerror=null;audio.removeAttribute?.('src');audio.load?.();}
    if(objectURL)URLImpl.revokeObjectURL(objectURL);
   }
  }
 };
}

// Web Speech recognition may use the browser vendor's online service; the UI must say so before opt-in.
export function createBrowserSpeechInput({scope=globalThis,lang='zh-CN'}={}){
 const Recognition=scope.SpeechRecognition||scope.webkitSpeechRecognition;let current=null;
 return {
  kind:'browser-recognition',supported:!!Recognition,
  start({onResult,onError,onEnd}={}){
   if(!Recognition)throw new Error('Speech recognition unavailable');
   current?.abort();const recognition=new Recognition();current=recognition;
   recognition.lang=lang;recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
   recognition.onresult=event=>{
    if(current!==recognition)return;
    for(let i=event.resultIndex;i<event.results.length;i++){
     const result=event.results[i];onResult?.({text:result[0].transcript,isFinal:result.isFinal,confidence:result[0].confidence});
    }
   };
   recognition.onerror=event=>{if(current===recognition)onError?.({code:event.error||'recognition-failed'});};
   recognition.onend=()=>{if(current===recognition){current=null;onEnd?.();}};
   try{recognition.start();}catch(error){current=null;throw error;}
  },
  stop(){const recognition=current;current=null;if(recognition){recognition.onresult=recognition.onerror=recognition.onend=null;recognition.stop();}},
  abort(){const recognition=current;current=null;if(recognition){recognition.onresult=recognition.onerror=recognition.onend=null;recognition.abort();}}
 };
}

const CARD_KEYS=['taskId','revision','target','amountMinor','currency','action','parameterKey'];
export function voiceConfirmationFingerprint(card){
 if(!card||typeof card!=='object'||typeof card.taskId!=='string'||!card.taskId||card.taskId.length>120||!Number.isSafeInteger(card.revision)||card.revision<0||typeof card.target!=='string'||!card.target.trim()||card.target.length>80||!Number.isSafeInteger(card.amountMinor)||card.amountMinor<0||card.currency!=='CNY'||typeof card.action!=='string'||!card.action.trim()||card.action.length>30||typeof card.parameterKey!=='string'||!card.parameterKey||card.parameterKey.length>4096)throw new TypeError('Invalid core confirmation card');
 return JSON.stringify(CARD_KEYS.map(key=>card[key]));
}
const CHALLENGE_WORDS=['蓝鲸','银杏','星河','山茶','白鹭','云杉','海棠','春山','月光','青竹','松果','飞鸟'];
function defaultChallenge(scope){
 if(!scope.crypto?.getRandomValues)throw new Error('Secure challenge unavailable');
 const values=scope.crypto.getRandomValues(new Uint32Array(2));
 return CHALLENGE_WORDS[values[0]%CHALLENGE_WORDS.length]+CHALLENGE_WORDS[values[1]%CHALLENGE_WORDS.length];
}
const CN_DIGITS='零一二三四五六七八九';
function chineseInteger(value){
 if(!value)return '零';
 if(value>=10000){const rest=value%10000;return chineseInteger(Math.floor(value/10000))+'万'+(rest?(rest<1000?'零':'')+chineseInteger(rest):'');}
 let output='',zero=false;
 for(const [unit,label] of [[1000,'千'],[100,'百'],[10,'十'],[1,'']]){
  const digit=Math.floor(value/unit);value%=unit;
  if(digit){if(zero)output+='零';output+=(digit===1&&unit===10&&!output?'':CN_DIGITS[digit])+label;zero=false;}else if(output&&value)zero=true;
 }
 return output;
}
function chineseAmount(minor){
 const whole=Math.floor(minor/100),cents=minor%100;
 return chineseInteger(whole)+(cents?'点'+CN_DIGITS[Math.floor(cents/10)]+(cents%10?CN_DIGITS[cents%10]: ''):'');
}

export function createVoiceDemo({scope=globalThis,tts=createBrowserTTSAdapter({scope}),fallbackTTS=null,input=createBrowserSpeechInput({scope}),onEvent=()=>{},now=()=>Date.now(),getConfirmationSnapshot,getSpeechFields=()=>[],challenge=()=>defaultChallenge(scope),echoGuardMs=800,duplicateWindowMs=30000}={}){
 let disposed=false,enabled=false,listening=false,wanted=false,recognitionSession=0,restarts=0,restartTimer=null;
 let generation=0,active=null,speechState='idle',echoUntil=0,echoReferenceUntil=0,lastSpoken='',lastEnvelope=null,confirmation=null;
 let identity={status:'unknown',source:'demo',verified:false};const spoken=new Map(),transcripts=new Map();
 const emit=(type,data={})=>{try{onEvent({type,at:now(),...data});}catch{/* UI observers cannot break voice cleanup. */}};
 const gesture=value=>value===true&&(!scope.navigator?.userActivation||scope.navigator.userActivation.isActive===true);
 const state=()=>({enabled,listening,speech:speechState,inputSupported:input?.supported!==false,ttsKind:tts?.kind||'custom',identity:{...identity},confirmation:confirmation?{...confirmation.card,phrase:confirmation.phrase,expiresAt:confirmation.expiresAt}:null});
 const disarm=(reason='cancelled')=>{if(confirmation){confirmation=null;emit('voice-confirmation-cleared',{reason});}};
 const cancel=(reason='user-interruption')=>{
  if(active){generation++;const previous=active;active=null;previous.abort();tts?.cancel?.();fallbackTTS?.cancel?.();speechState='idle';echoUntil=now()+echoGuardMs;echoReferenceUntil=now()+5000;emit('voice-speech-cancelled',{reason});}
 };
 function stopListening(){wanted=false;listening=false;recognitionSession++;clearTimeout(restartTimer);restartTimer=null;input?.abort?.();disarm('microphone-stopped');emit('voice-input-state',{listening:false});}
 function acceptResult(result,session){
  if(disposed||!listening||session!==recognitionSession||typeof result?.text!=='string')return;
  const text=result.text.trim().slice(0,2000);if(!text)return;
  if(!result.isFinal){emit('voice-interim',{text:sanitizeSpeech(text)});return;}
  const normalized=normalize(text);
  if(speechState!=='idle'){
   if(/^(?:停一下|停止播报|打断一下|先等等|stop)$/.test(normalized)){cancel('voice-interruption');emit('voice-interrupted');}
   else emit('voice-input-ignored',{reason:'playback-active'});
   return;
  }
  if(now()<echoUntil||(now()<echoReferenceUntil&&normalized.length>=8&&lastSpoken&&normalize(lastSpoken).includes(normalized))){emit('voice-input-ignored',{reason:'echo-guard'});return;}
  const seenAt=transcripts.get(normalized);if(seenAt!==undefined&&now()-seenAt<1500){emit('voice-input-ignored',{reason:'duplicate-transcript'});return;}
  transcripts.set(normalized,now());if(transcripts.size>50)transcripts.delete(transcripts.keys().next().value);
  if(confirmation){
   const pending=confirmation;
   if(now()>=pending.expiresAt){disarm('expired');emit('voice-confirmation-rejected',{reason:'expired'});return;}
   if(/^(?:取消|不确认|暂不授权|先等等)$/.test(normalized)){disarm('declined');return;}
   if(!pending.phrases.includes(normalized)){emit('voice-confirmation-rejected',{reason:'phrase-mismatch'});return;}
   if(identity.status!=='matched'){emit('voice-confirmation-rejected',{reason:identity.status==='mismatched'?'identity-mismatch':'identity-unknown'});return;}
   let current;
   try{current=getConfirmationSnapshot(pending.card.taskId);if(voiceConfirmationFingerprint(current)!==pending.fingerprint||!Number.isFinite(current.expiresAt)||current.expiresAt<=now())throw new Error('changed');}
   catch{disarm('parameters-changed');emit('voice-confirmation-rejected',{reason:'parameters-changed'});return;}
   confirmation=null;
   emit('voice-confirmation-request',{card:{...pending.card},fingerprint:pending.fingerprint,issuedAt:pending.issuedAt,expiresAt:pending.expiresAt,identity:{...identity},source:'microphone',requiresCoreVerification:true});
   return;
  }
  emit('voice-command',{text,source:'microphone',notAuthorization:true});
 }
 function beginListening(){
  const session=++recognitionSession;listening=true;
  try{
   input.start({onResult:result=>acceptResult(result,session),onError:error=>{
    if(session!==recognitionSession)return;
    wanted=false;listening=false;recognitionSession++;input.abort?.();disarm('recognition-error');
    emit('voice-input-error',{code:error?.code||'recognition-failed',textFallback:true});
   },onEnd:()=>{
    if(session!==recognitionSession)return;listening=false;
    if(wanted&&!disposed&&restarts++<3)restartTimer=setTimeout(beginListening,250);
    else{wanted=false;disarm('recognition-ended');emit('voice-input-state',{listening:false,textFallback:true});}
   }});
   emit('voice-input-state',{listening:true});return {status:'listening'};
  }catch{listening=false;wanted=false;emit('voice-input-error',{code:'start-failed',textFallback:true});return {status:'unavailable'};}
 }
 async function speak(envelope,{messageId,force=false}={}){
  if(disposed)return {status:'disposed'};
  const extracted=extractSpeech(envelope,{fields:getSpeechFields()});
  if(!extracted.ok){emit('voice-speech-skipped',{reason:extracted.reason});return {status:'skipped',reason:extracted.reason};}
  if(!extracted.speak)return {status:'skipped',reason:'no-speak'};
  const key=SPEECH_NUMBER_VERSION+'|'+(typeof messageId==='string'&&messageId?messageId:extracted.speak)+'|'+extracted.speak,last=spoken.get(key);
  if(!force&&last!==undefined&&now()-last<duplicateWindowMs)return {status:'skipped',reason:'duplicate'};
  if(!enabled)return {status:'skipped',reason:'voice-disabled'};
  cancel('replaced');disarm('new-response');
  const current=++generation,controller=new AbortController();active=controller;speechState='preparing';lastSpoken=extracted.speak;
  lastEnvelope={speak:extracted.speak};spoken.set(key,now());if(spoken.size>100)spoken.delete(spoken.keys().next().value);
  emit('voice-speech-state',{state:'preparing',redacted:extracted.redacted,engine:tts?.kind||'custom'});
  const run=async adapter=>{
   if(!adapter||adapter.supported===false)throw new Error('TTS unavailable');
   const operation=adapter.speak(extracted.speak,{signal:controller.signal,onStart:metrics=>{if(current===generation&&!controller.signal.aborted){speechState='speaking';emit('voice-speech-state',{state:'speaking',engine:adapter.kind||'custom',...metrics});}}});
   await new Promise((resolve,reject)=>{
    const abort=()=>{controller.signal.removeEventListener('abort',abort);reject(abortError());};
    controller.signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(operation).then(value=>{controller.signal.removeEventListener('abort',abort);resolve(value);},error=>{controller.signal.removeEventListener('abort',abort);reject(error);});
    if(controller.signal.aborted)abort();
   });
  };
  try{
   try{await run(tts);}catch(error){if(controller.signal.aborted||error.name==='AbortError')throw error;if(!fallbackTTS)throw error;emit('voice-tts-fallback',{from:tts?.kind,to:fallbackTTS.kind});await run(fallbackTTS);}
   if(current!==generation||controller.signal.aborted)return {status:'cancelled'};
   emit('voice-speech-state',{state:'completed'});return {status:'spoken'};
  }catch(error){
   if(controller.signal.aborted||current!==generation)return {status:'cancelled'};
   spoken.delete(key);emit('voice-tts-error',{code:'tts-unavailable',textUnaffected:true});return {status:'unavailable',textUnaffected:true};
  }finally{if(current===generation){active=null;speechState='idle';echoUntil=now()+echoGuardMs;echoReferenceUntil=now()+5000;}}
 }
 return {
  getState:state,
  enable({userGesture=false}={}){if(disposed)return {status:'disposed'};if(!gesture(userGesture))return {status:'gesture-required'};enabled=true;emit('voice-enabled');return {status:'enabled'};},
  disable(){enabled=false;cancel('voice-disabled');stopListening();emit('voice-disabled');},
  prepare(){return tts?.prepare?.();},
  speak,
  replay(){return lastEnvelope?speak(lastEnvelope,{force:true}):Promise.resolve({status:'skipped',reason:'no-previous-speech'});},
  cancel,
  interrupt({listen=false,userGesture=false}={}){cancel();disarm('interrupted');if(listen)return this.startListening({userGesture});return {status:'interrupted'};},
  startListening({userGesture=false}={}){
   if(disposed)return {status:'disposed'};if(!gesture(userGesture))return {status:'gesture-required'};
   if(!input||input.supported===false){emit('voice-input-error',{code:'unsupported',textFallback:true});return {status:'unavailable'};}
   enabled=true;wanted=true;restarts=0;if(listening)return {status:'listening'};return beginListening();
  },
  stopListening,
  retryListening(options){stopListening();return this.startListening(options);},
  submitText(text){if(disposed||typeof text!=='string'||!text.trim())return {status:'skipped'};cancel('text-input');disarm('text-input');emit('voice-command',{text:text.trim().slice(0,2000),source:'text-demo',notAuthorization:true});return {status:'submitted'};},
  setIdentitySignal(status){if(!['matched','mismatched','unknown'].includes(status))throw new TypeError('Unknown identity signal');identity={status,source:'demo',verified:false};if(status!=='matched')disarm('identity-changed');emit('voice-identity-signal',{...identity});return {...identity};},
  armConfirmation(card,{userGesture=false}={}){
   if(disposed)return {status:'disposed'};
   if(!gesture(userGesture)&&!(enabled&&wanted&&listening))return {status:'gesture-required'};
   if(typeof getConfirmationSnapshot!=='function')return {status:'blocked',reason:'core-snapshot-required'};
   const fingerprint=voiceConfirmationFingerprint(card),issuedAt=now();
   if(!Number.isFinite(card.expiresAt)||card.expiresAt<=issuedAt)return {status:'blocked',reason:'expired'};
   let current;try{current=getConfirmationSnapshot(card.taskId);if(voiceConfirmationFingerprint(current)!==fingerprint||!Number.isFinite(current.expiresAt)||current.expiresAt<=issuedAt)throw new Error('changed');}catch{return {status:'blocked',reason:'parameters-changed'};}
   cancel('confirmation-armed');disarm('replaced');
   const word=String(challenge()).normalize('NFKC');if(!/^[\p{L}\p{N}]{2,12}$/u.test(word))throw new TypeError('Invalid confirmation challenge');
   const amount=Number((card.amountMinor/100).toFixed(2)).toString(),prefix=`确认向${card.target}${card.action}`;
   const phrase=`${prefix}${amount}元，确认词${word}`;
   const snapshot=Object.fromEntries(CARD_KEYS.map(key=>[key,card[key]]));
   confirmation={card:Object.freeze(snapshot),fingerprint,phrase,phrases:[normalize(phrase),normalize(`${prefix}${chineseAmount(card.amountMinor)}元，确认词${word}`)],issuedAt,expiresAt:Math.min(card.expiresAt,current.expiresAt,issuedAt+45000)};
   emit('voice-confirmation-armed',{...state().confirmation,requiresCoreVerification:true});return {status:'armed',...state().confirmation};
  },
  disarmConfirmation:disarm,
  dispose(){if(disposed)return;cancel('disposed');stopListening();tts?.dispose?.();fallbackTTS?.dispose?.();enabled=false;disposed=true;emit('voice-disposed');}
 };
}
