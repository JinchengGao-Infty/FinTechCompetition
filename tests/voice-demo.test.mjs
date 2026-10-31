import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSpeech,sanitizeSpeech,createVoiceDemo,createBrowserTTSAdapter,createBrowserSpeechInput,createLocalModelTTSAdapter,voiceConfirmationFingerprint} from '../web/voice-demo.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({pending=false,fails=false,identity='matched',...options}={}){
 let clock=1000,callbacks,stopped=0;
 const events=[],calls=[];
 const card={taskId:'task-520',revision:3,target:'小林',amountMinor:52000,currency:'CNY',action:'转账',parameterKey:'source=living_1608&date=2026-11-09',expiresAt:31000};
 let current={...card};
 const input={supported:true,start(value){callbacks=value;},abort(){stopped++;}};
 const tts={kind:'test-model',supported:true,cancel(){},speak(text,{signal,onStart}){calls.push(text);onStart?.({});if(fails)return Promise.reject(Error('offline'));if(!pending)return Promise.resolve();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true}));}};
 const voice=createVoiceDemo({input,tts,onEvent:event=>events.push(event),now:()=>clock,challenge:()=> '蓝鲸',getConfirmationSnapshot:()=>current,...options});
 voice.setIdentitySignal(identity);
 return {voice,events,calls,card,emit:(text,isFinal=true)=>callbacks.onResult({text,isFinal}),error:code=>callbacks.onError({code}),advance:ms=>{clock+=ms;},change:update=>{current={...current,...update};},get stopped(){return stopped;}};
}
const requests=h=>h.events.filter(event=>event.type==='voice-confirmation-request');
const enable=h=>h.voice.enable({userGesture:true});
const listen=h=>h.voice.startListening({userGesture:true});

test('only a valid own top-level speak field is selected, never reply/cards/actions',()=>{
 for(const input of ['not json','```json\n{"speak":"hello"}\n```',null,[],42,'x'.repeat(32769)])assert.equal(extractSpeech(input).ok,false);
 for(const input of [{reply:'转账成功',actions:[{speak:'执行'}],cards:[{speak:'私密'}]},{speak:null},Object.create({speak:'inherited'})])assert.equal(extractSpeech(input).speak,'');
 for(const speak of [{text:'hello'},['hello'],123,true,'x'.repeat(601)])assert.equal(extractSpeech({speak}).ok,false);
 assert.equal(extractSpeech('{"reply":"屏幕内容","speak":"我来核对一下。","actions":["ignore"]}').speak,'我来核对一下。');
});

test('card numbers, phone numbers, codes and passwords are redacted before either TTS',()=>{
 const text='卡号6222 1234 5678 1234，电话13812345678，验证码是A1B2C3。密码：秘密花园。';
 const safe=sanitizeSpeech(text);
 assert.doesNotMatch(safe,/6222|1234|138123|A1B2C3|秘密花园/);
 assert.match(safe,/号码已隐藏/);assert.match(safe,/验证信息已隐藏/);
 assert.doesNotMatch(sanitizeSpeech('卡号６２２２１２３４５６７８１２３４；验证码一二三四五六。'),/6222|一二三四五六/);
 assert.doesNotMatch(sanitizeSpeech('六二二二一二三四五六七八一二三四'),/六二二二/);
 assert.doesNotMatch(sanitizeSpeech('6222  1234·5678—1234'),/6222|5678/);
 assert.equal(sanitizeSpeech('向小林转账520元。'),'向小林转账520元。');
 assert.equal(sanitizeSpeech('<speak>你好</speak> [查看](https://example.org)'),'你好 查看');
});

test('speech requires opt-in and an actual active browser gesture when that API exists',async()=>{
 const h=harness();assert.equal((await h.voice.speak({speak:'你好'})).reason,'voice-disabled');
 assert.equal(h.voice.enable().status,'gesture-required');assert.equal(h.calls.length,0);
 const strict=harness({scope:{navigator:{userActivation:{isActive:false}}}});
 assert.equal(strict.voice.enable({userGesture:true}).status,'gesture-required');
 assert.equal(strict.voice.startListening({userGesture:true}).status,'gesture-required');
});

test('duplicate messages are suppressed, replay is explicit, distinct message ids remain distinct',async()=>{
 const h=harness();enable(h);
 assert.equal((await h.voice.speak({speak:'我来核对。'},{messageId:'one'})).status,'spoken');
 assert.equal((await h.voice.speak({speak:'我来核对。'},{messageId:'one'})).reason,'duplicate');
 await h.voice.replay();await h.voice.speak({speak:'我来核对。'},{messageId:'two'});
 assert.equal(h.calls.length,3);
 h.advance(31000);await h.voice.speak({speak:'我来核对。'},{messageId:'one'});assert.equal(h.calls.length,4);
});

test('malformed or missing speech cannot interrupt ongoing speech or invoke other fields',async()=>{
 const h=harness({pending:true});enable(h);
 const first=h.voice.speak({speak:'正在核对。'});
 assert.equal((await h.voice.speak({reply:'只显示文字',actions:[{type:'transfer'}]})).status,'skipped');
 assert.equal(h.voice.getState().speech,'speaking');assert.equal(h.calls.length,1);
 h.voice.cancel();assert.equal((await first).status,'cancelled');
});

test('cancel and replacement settle pending speech and late completions cannot become spoken',async()=>{
 const h=harness({pending:true});enable(h);
 const first=h.voice.speak({speak:'第一句话'}),second=h.voice.speak({speak:'第二句话'});
 assert.equal((await first).status,'cancelled');
 h.voice.cancel();assert.equal((await second).status,'cancelled');
 assert.equal(h.voice.getState().speech,'idle');assert.equal(h.events.filter(e=>e.type==='voice-speech-cancelled').length,2);
});

test('cancel settles the host promise even when an injected provider ignores AbortSignal',async()=>{
 const h=harness({tts:{kind:'ignores-signal',speak:()=>new Promise(()=>{}),cancel(){}}});enable(h);
 const pending=h.voice.speak({speak:'等待中的服务'});h.voice.cancel();
 assert.equal((await pending).status,'cancelled');h.voice.dispose();
});

test('TTS failures preserve screen text, clear duplicate state and optionally use an honest fallback',async()=>{
 const h=harness({fails:true});enable(h);const envelope={reply:'文字仍正常',speak:'请看确认卡片。'};
 assert.equal((await h.voice.speak(envelope,{messageId:'failed'})).textUnaffected,true);
 assert.equal(envelope.reply,'文字仍正常');assert.equal(h.voice.getState().speech,'idle');
 await h.voice.speak(envelope,{messageId:'failed'});assert.equal(h.calls.length,2);
 const fallbackCalls=[],f=harness({fails:true,fallbackTTS:{kind:'browser-system',speak:async text=>fallbackCalls.push(text)}});enable(f);
 assert.equal((await f.voice.speak(envelope)).status,'spoken');assert.equal(fallbackCalls.length,1);
 assert.equal(f.events.find(e=>e.type==='voice-tts-fallback').to,'browser-system');
});

test('microphone opt-in, partial transcripts and error recovery are explicit',()=>{
 const h=harness();assert.equal(h.voice.startListening().status,'gesture-required');
 assert.equal(listen(h).status,'listening');h.emit('帮我看看订阅',false);
 assert.equal(h.events.filter(e=>e.type==='voice-command').length,0);
 h.emit('帮我看看订阅');assert.equal(h.events.find(e=>e.type==='voice-command').notAuthorization,true);
 h.error('not-allowed');assert.equal(h.voice.getState().listening,false);assert.equal(h.stopped,1);
 assert.equal(h.events.find(e=>e.type==='voice-input-error').textFallback,true);
 assert.equal(h.voice.retryListening({userGesture:true}).status,'listening');h.voice.dispose();
});

test('spoken background cannot authorize and a dedicated stop phrase can interrupt playback',async()=>{
 const h=harness({pending:true});enable(h);listen(h);
 const speech=h.voice.speak({speak:'正在核对安排，请稍等。'});
 h.emit('好');h.emit('确认');assert.equal(requests(h).length,0);
 h.emit('停一下');assert.equal((await speech).status,'cancelled');
 assert.ok(h.events.some(e=>e.type==='voice-interrupted'));
 h.emit('帮我改一下');assert.equal(h.events.filter(e=>e.type==='voice-command').length,0);
 h.advance(801);h.emit('帮我改一下');assert.equal(h.events.filter(e=>e.type==='voice-command').length,1);h.voice.dispose();
});

test('playback echo after completion and duplicate recognition results are ignored',async()=>{
 const h=harness();enable(h);listen(h);await h.voice.speak({speak:'我会先核对收款人与金额。'});
 h.emit('转给小林');assert.equal(h.events.filter(e=>e.type==='voice-command').length,0);
 h.advance(801);h.emit('我会先核对收款人与金额');h.emit('转给小林');h.emit('转给小林');
 assert.equal(h.events.filter(e=>e.type==='voice-command').length,1);h.voice.dispose();
});

test('confirmation produces only a one-use bound request, never an execution',()=>{
 const h=harness();listen(h);const armed=h.voice.armConfirmation(h.card,{userGesture:true});
 assert.equal(armed.status,'armed');assert.equal(armed.phrase,'确认向小林转账520元，确认词蓝鲸');
 h.emit('好');assert.equal(requests(h).length,0);h.emit(armed.phrase);
 const [event]=requests(h);assert.equal(event.card.taskId,h.card.taskId);assert.equal(event.card.revision,3);
 assert.equal(event.card.amountMinor,52000);assert.equal(event.card.parameterKey,h.card.parameterKey);
 assert.equal(event.requiresCoreVerification,true);assert.equal(event.identity.verified,false);assert.equal(event.identity.source,'demo');
 assert.equal(event.fingerprint,voiceConfirmationFingerprint(h.card));
 h.advance(1600);h.emit(armed.phrase);assert.equal(requests(h).length,1);h.voice.dispose();
});

test('Chinese number transcription can confirm the same specific amount',()=>{
 const h=harness();listen(h);h.voice.armConfirmation(h.card,{userGesture:true});
 h.emit('确认向小林转账五百二十元，确认词蓝鲸');assert.equal(requests(h).length,1);h.voice.dispose();
});

test('one opted-in microphone session can arm later cards hands-free but a disabled session cannot',()=>{
 const h=harness();assert.equal(h.voice.armConfirmation(h.card).status,'gesture-required');
 listen(h);const armed=h.voice.armConfirmation(h.card);assert.equal(armed.status,'armed');
 h.emit(armed.phrase);assert.equal(requests(h).length,1);h.voice.stopListening();
 assert.equal(h.voice.armConfirmation(h.card).status,'gesture-required');h.voice.dispose();
});

test('unknown or mismatched identity never emits a confirmation request',()=>{
 for(const identity of ['unknown','mismatched']){
  const h=harness({identity});listen(h);const armed=h.voice.armConfirmation(h.card,{userGesture:true});h.emit(armed.phrase);
  assert.equal(requests(h).length,0);assert.ok(h.events.some(e=>e.type==='voice-confirmation-rejected'&&e.reason.startsWith('identity-')));h.voice.dispose();
 }
});

test('target, amount, parameter version, source and schedule changes invalidate a confirmation',()=>{
 for(const update of [{target:'陌生人'},{amountMinor:53000},{revision:4},{parameterKey:'source=other&date=2026-11-10'},{expiresAt:999}]){
  const h=harness();listen(h);const armed=h.voice.armConfirmation(h.card,{userGesture:true});h.change(update);h.emit(armed.phrase);
  assert.equal(requests(h).length,0);assert.ok(h.events.some(e=>e.reason==='parameters-changed'));h.voice.dispose();
 }
});

test('confirmation has a bounded window, rejects old cards and requires the core snapshot callback',()=>{
 const h=harness();listen(h);const armed=h.voice.armConfirmation({...h.card,expiresAt:1000000},{userGesture:true});
 assert.equal(armed.expiresAt,h.card.expiresAt);h.advance(30001);h.emit(armed.phrase);assert.equal(requests(h).length,0);assert.ok(h.events.some(e=>e.reason==='expired'));
 assert.equal(h.voice.armConfirmation(h.card,{userGesture:true}).reason,'expired');h.voice.dispose();
 const noCore=createVoiceDemo({challenge:()=> '蓝鲸'});assert.equal(noCore.armConfirmation({...h.card,expiresAt:Date.now()+1000},{userGesture:true}).reason,'core-snapshot-required');
});

test('text demo, identity changes, new response, microphone stop and disposal invalidate voice confirmation',async()=>{
 for(const action of ['text','identity','stop','dispose','speech']){
  const h=harness();listen(h);const armed=h.voice.armConfirmation(h.card,{userGesture:true});
  if(action==='text')h.voice.submitText(armed.phrase);
  if(action==='identity')h.voice.setIdentitySignal('mismatched');
  if(action==='stop')h.voice.stopListening();
  if(action==='dispose')h.voice.dispose();
  if(action==='speech')await h.voice.speak({speak:'安排需要重新核对。'});
  assert.equal(h.voice.getState().confirmation,null);assert.equal(requests(h).length,0);h.voice.dispose();
 }
});

test('typed fallback works without microphone and never masquerades as microphone authorization',()=>{
 const h=harness({input:{supported:false}});assert.equal(listen(h).status,'unavailable');
 assert.equal(h.voice.submitText('帮我查看订阅').status,'submitted');
 const event=h.events.find(e=>e.type==='voice-command');assert.equal(event.source,'text-demo');assert.equal(event.notAuthorization,true);
 h.voice.dispose();assert.equal(h.voice.submitText('late').status,'skipped');
});

test('host event errors cannot break speech cancellation or disposal',async()=>{
 const h=harness({pending:true,onEvent:()=>{throw Error('UI render failed');}});enable(h);
 const speech=h.voice.speak({speak:'你好'});h.voice.dispose();assert.equal((await speech).status,'cancelled');
 assert.equal((await h.voice.speak({speak:'late'})).status,'disposed');
});

test('browser recognition abort discards old callbacks and never captures on construction',()=>{
 const instances=[];
 class Recognition{constructor(){instances.push(this);}start(){this.started=true;}abort(){this.aborted=true;}stop(){this.stopped=true;}}
 const adapter=createBrowserSpeechInput({scope:{SpeechRecognition:Recognition}}),results=[];
 assert.equal(instances.length,0);adapter.start({onResult:r=>results.push(r)});
 const first=instances[0],callback=first.onresult;assert.equal(first.lang,'zh-CN');assert.equal(first.continuous,true);
 adapter.abort();assert.equal(first.aborted,true);
 callback({resultIndex:0,results:[Object.assign([{transcript:'旧结果',confidence:.9}],{isFinal:true})]});assert.equal(results.length,0);
});

test('browser system TTS reports its true engine and abort settles the promise',async()=>{
 let utterance,cancels=0;
 const scope={SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{name:'中文',lang:'zh-CN'}],speak:u=>{utterance=u;u.onstart?.();},cancel:()=>cancels++}};
 const adapter=createBrowserTTSAdapter({scope}),controller=new AbortController(),starts=[];
 const speech=adapter.speak('你好',{signal:controller.signal,onStart:m=>starts.push(m)});
 assert.equal(utterance.voice.name,'中文');assert.equal(starts[0].engine,'browser-system');
 controller.abort();await assert.rejects(speech,{name:'AbortError'});assert.equal(cancels,1);
});

test('local model adapter only uses same-origin/loopback, handshakes and posts speak alone',async()=>{
 assert.throws(()=>createLocalModelTTSAdapter({endpoint:'https://untrusted.example/tts'}),/same-origin or loopback/);
 assert.throws(()=>createLocalModelTTSAdapter({endpoint:'http://demo-user:demo-password@127.0.0.1/tts'}),/same-origin or loopback/);
 const calls=[],revoked=[];let paused=0;
 class Audio{play(){setImmediate(()=>this.onended?.());return Promise.resolve();}pause(){paused++;}}
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.endsWith('/health')?{ok:true,json:async()=>({ready:true,engine:'sherpa-onnx-vits',session:'ephemeral-session',model:'small-chinese'})}:{ok:true,headers:new Headers({'Content-Type':'audio/wav','X-Voice-First-Audio-Ms':'152.6'}),blob:async()=>new Blob([new Uint8Array(64)])};};
 const starts=[],adapter=createLocalModelTTSAdapter({fetchImpl,AudioCtor:Audio,URLImpl:{createObjectURL:()=> 'blob:one',revokeObjectURL:u=>revoked.push(u)}});
 await adapter.speak('请核对。',{onStart:m=>starts.push(m)});
 assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),{speak:'请核对。'});
 assert.equal(calls[1].options.headers['X-Voice-Session'],'ephemeral-session');assert.equal(starts[0].firstAudioMs,152.6);
 assert.deepEqual(revoked,['blob:one']);assert.ok(paused>0);
});

test('local model network cancellation cannot create or play late audio',async()=>{
 let pendingSignal,plays=0;
 const fetchImpl=(url,options)=>url.endsWith('/health')?Promise.resolve({ok:true,json:async()=>({ready:true,engine:'sherpa-onnx-vits',session:'test'})}):new Promise((resolve,reject)=>{pendingSignal=options.signal;options.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})));});
 const adapter=createLocalModelTTSAdapter({fetchImpl,AudioCtor:class{play(){plays++;}},URLImpl:{createObjectURL(){throw Error('late');}}}),controller=new AbortController();
 const promise=adapter.speak('你好',{signal:controller.signal});await tick();assert.ok(pendingSignal);controller.abort();
 await assert.rejects(promise,{name:'AbortError'});assert.equal(plays,0);
});

test('local request timeout remains a recoverable failure rather than a user cancellation',async()=>{
 const fetchImpl=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'}))));
 const adapter=createLocalModelTTSAdapter({fetchImpl,AudioCtor:class{},URLImpl:{createObjectURL(){}},requestTimeoutMs:10});
 await assert.rejects(adapter.speak('你好'),/request timeout/);
});

test('Kokoro female profile is reported by the actual local handshake without executing response fields',async()=>{
 const voice={speaker_id:3,name:'zf_001',gender:'female',language:'zh-CN',precision:'fp32'};
 const adapter=createLocalModelTTSAdapter({fetchImpl:async()=>({ok:true,json:async()=>({ready:true,engine:'sherpa-onnx-kokoro',model:'kokoro-multi-lang-v1_1',session:'local-test',voice,actions:[{type:'transfer'}]})})});
 const profile=await adapter.probe();assert.equal(profile.engine,'sherpa-onnx-kokoro');
 assert.deepEqual(profile.voice,voice);assert.equal(profile.actions,undefined);
});
