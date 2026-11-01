import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {createCompanionController} from '../web/companion-controller.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('missing, failed or stalled TTS never prevents text commit or following turns',async()=>{
 for(const mode of ['missing','failure','stalled']){
  let state=fresh();
  const tts={kind:'test',prepare(){},cancel(){},speak(){if(mode==='missing')throw Error('not connected');if(mode==='failure')return Promise.reject(Error('timeout'));return new Promise(()=>{});}};
  const controller=createCompanionController({getState:()=>state,commit:next=>state=next,esc:String,voiceTTS:tts,voiceScope:{}});
  controller.prepareReplyVoice(true);
  controller.setPending(true);controller.append('第一条文字');controller.setPending(false);
  await tick();
  controller.setPending(true);controller.append('下一条文字');controller.setPending(false);
  assert.deepEqual(state.messages.slice(-2).map(m=>m.text),['第一条文字','下一条文字']);
  controller.dispose();
 }
});
function setup(){let state=fresh(),inputOptions;const speech=[],events=[],transcripts=[];let prepared=0,disposed=0;const tts={kind:'test',prepare(){prepared++;},cancel(){},dispose(){disposed++;},async speak(text,{onStart}){speech.push(text);onStart?.({firstAudioMs:5});}};
 const controller=createCompanionController({getState:()=>state,commit:next=>state=next,esc:String,voiceTTS:tts,voiceScope:{},voiceInput:{supported:true,start(opts){inputOptions=opts;return {status:'listening'};},abort(){}},onVoiceEvent:e=>events.push(e),onVoiceText:(text,options)=>transcripts.push({text,options})});
 return {controller,speech,events,transcripts,prepared:()=>prepared,disposed:()=>disposed,input:()=>inputOptions};}
test('text user gesture enables Bot reply, not only settings preview; duplicate reply stays silent',async()=>{const h=setup();assert.equal(h.controller.prepareReplyVoice(false).status,'gesture-required');h.controller.prepareReplyVoice(true);assert.equal(h.prepared(),1);h.controller.notifyEnvelope({speak:'你好，我在。'},{messageId:'one'});await tick();assert.deepEqual(h.speech,['你好,我在。']);h.controller.notifyEnvelope({speak:'你好，我在。'},{messageId:'one'});await tick();assert.equal(h.speech.length,1);assert.match(h.controller.renderReplay('one'),/重听/);assert.equal(h.controller.renderReplay('other'),'');h.controller.dispose();assert.equal(h.disposed(),1);});
test('microphone stop forwards transcript once; cancelling input never forwards transcript',async()=>{const h=setup();await h.controller.handleAction('voice-toggle',{}, {isTrusted:true});const input=h.input();assert.ok(input);input.onResult({text:'你好呀',isFinal:true});await h.controller.stopVoiceInput();assert.equal(h.transcripts.filter(x=>!x.options.interim).length,1);assert.equal(h.transcripts.at(-1).text,'你好呀');await h.controller.handleAction('voice-toggle',{}, {isTrusted:true});h.input().onResult({text:'不应发送',isFinal:true});await h.controller.stopVoiceInput({cancel:true});assert.equal(h.transcripts.filter(x=>!x.options.interim).length,1);h.controller.dispose();});
