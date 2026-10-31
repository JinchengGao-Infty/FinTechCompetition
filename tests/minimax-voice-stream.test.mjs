import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinimaxVoiceStreamAdapter,estimateMinimaxCost,MINIMAX_MODEL,MINIMAX_VOICE,MINIMAX_SAMPLE_TEXT} from '../web/minimax-voice-stream.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const encode=value=>new TextEncoder().encode(value);
const PCM=new Uint8Array([0,128,255,127,0,0,1,0]);
const b64=bytes=>Buffer.from(bytes).toString('base64');
const start=id=>({type:'start',request_id:id,format:'pcm_s16le',sample_rate:32000,channels:1,model:MINIMAX_MODEL,voice:MINIMAX_VOICE});
const audio=(id,seq=0,bytes=PCM)=>({type:'audio',request_id:id,seq,audio_base64:b64(bytes)});
const end=(id,frames=1,bytes=PCM.length)=>({type:'end',request_id:id,frames,audio_bytes:bytes});
const lines=(...events)=>events.map(event=>JSON.stringify(event)+'\n').join('');

class Wire{
 constructor({ignoreCancel=false}={}){this.queue=[];this.waiting=[];this.done=false;this.cancelled=0;this.ignoreCancel=ignoreCancel;this.reads=0;}
 push(value){const chunk=typeof value==='string'?encode(value):value;if(this.waiting.length)this.waiting.shift()({done:false,value:chunk});else this.queue.push(chunk);}
 close(){this.done=true;for(const resolve of this.waiting)resolve({done:true});this.waiting=[];}
 read(){this.reads++;if(this.queue.length)return Promise.resolve({done:false,value:this.queue.shift()});if(this.done)return Promise.resolve({done:true});return new Promise(resolve=>this.waiting.push(resolve));}
 cancel(){this.cancelled++;if(!this.ignoreCancel)this.close();return Promise.resolve();}
}
class Context{
 constructor({autoEnd=true,state='running'}={}){this.autoEnd=autoEnd;this.state=state;this.currentTime=0;this.sources=[];this.destination={};this.buffers=[];}
 resume(){this.state='running';return Promise.resolve();}
 close(){this.state='closed';return Promise.resolve();}
 createBuffer(channels,length,rate){const data=new Float32Array(length),buffer={channels,length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};this.buffers.push(buffer);return buffer;}
 createBufferSource(){
  const context=this;const source={stopped:false,connect(){},disconnect(){},start(when){this.when=when;if(context.autoEnd)setImmediate(()=>this.finish());},
   stop(){this.stopped=true;},finish(){context.currentTime=Math.max(context.currentTime,(this.when||0)+(this.buffer?.duration||0));this.onended?.();}};
  this.sources.push(source);return source;
 }
}
function harness({context=new Context(),wireFactory=null,responseStatus=200,contentType='application/x-ndjson',cancelEndpoint=null,headers={},...options}={}){
 const calls=[],wires=[];let nextId=0;
 const scope={location:{href:'http://127.0.0.1:65326/#/bot'},atob:s=>Buffer.from(s,'base64').toString('binary'),crypto:{randomUUID:()=>`auto-${++nextId}`}};
 const fetchImpl=async(url,request)=>{
  calls.push({url,request});if(url.endsWith('/cancel'))return {ok:true};
  const id=JSON.parse(request.body).request_id,wire=wireFactory?wireFactory(id,calls.length):new Wire();wires.push(wire);
  if(!wireFactory){wire.push(lines(start(id),audio(id),end(id)));wire.close();}
  return {ok:responseStatus>=200&&responseStatus<300,status:responseStatus,headers:new Headers({'Content-Type':contentType}),
   body:{getReader:()=>wire},blob(){throw Error('A streaming adapter must never buffer the whole blob');}};
 };
 const adapter=createMinimaxVoiceStreamAdapter({scope,audioContext:context,fetchImpl,headers,cancelEndpoint,...options});
 return {adapter,context,calls,wires,scope};
}

test('numeric speech reaches the wire normalized before PCM streaming and replays cached audio',async()=>{
 const h=harness();const text='账户1608,11月9日16:00,¥520.00。';
 await h.adapter.speak(text,{requestId:'numbers-first'});
 assert.equal(JSON.parse(h.calls[0].request.body).speak,'账户一六零八,十一月九日下午四点,五百二十元。');
 await h.adapter.speak(text,{requestId:'numbers-replay'});assert.equal(h.calls.length,1);
 h.adapter.clearCache();await h.adapter.speak(text,{requestId:'numbers-after-reset'});assert.equal(h.calls.length,2);
});

test('first PCM source is scheduled before the network reaches end or EOF',async()=>{
 const wire=new Wire(),context=new Context({autoEnd:false}),h=harness({context,wireFactory:()=>wire}),started=[];
 let resolved=false;const promise=h.adapter.speak('请核对一下。',{requestId:'first',onStart:value=>started.push(value)}).then(value=>{resolved=true;return value;});
 await tick();wire.push(lines(start('first'),audio('first')));await tick();
 assert.equal(context.sources.length,1);assert.equal(resolved,false);assert.equal(started.length,1);
 assert.equal(started[0].phase,'scheduled');assert.equal(started[0].engine,'minimax-speech-2.8-turbo');
 assert.equal(context.buffers[0].sampleRate,32000);assert.equal(context.buffers[0].getChannelData(0)[0],-1);
 assert.equal(context.buffers[0].getChannelData(0)[1],32767/32768);
 wire.push(lines(end('first')));wire.close();await tick();assert.equal(resolved,false);
 context.sources[0].finish();assert.equal((await promise).status,'spoken');
});

test('the promise waits until every queued source ends, preserving one continuous timeline',async()=>{
 const context=new Context({autoEnd:false}),wire=new Wire(),h=harness({context,wireFactory:()=>wire});
 let finished=false;const pending=h.adapter.speak('我来整理安排。',{requestId:'timeline'}).then(v=>{finished=true;return v;});
 await tick();wire.push(lines(start('timeline'),audio('timeline',0),audio('timeline',1),end('timeline',2,PCM.length*2)));wire.close();await tick();
 assert.equal(context.sources.length,2);assert.ok(context.sources[1].when>=context.sources[0].when+context.buffers[0].duration);
 context.sources[0].finish();await tick();assert.equal(finished,false);context.sources[1].finish();await pending;assert.equal(finished,true);
});

test('async CSRF refresh is awaited and the local body contains only id plus masked speak',async()=>{
 const order=[],h=harness({headers:async()=>{order.push('csrf');await tick();return {'X-CSRF-Token':'fresh'};}});
 await h.adapter.speak({reply:'not spoken',speak:'卡号6222 1234 5678 9999，验证码123456。请核对。',actions:[{type:'transfer'}]},{requestId:'masked'});
 assert.deepEqual(order,['csrf']);assert.equal(h.calls[0].request.headers['X-CSRF-Token'],'fresh');
 const body=JSON.parse(h.calls[0].request.body);assert.deepEqual(Object.keys(body).sort(),['request_id','speak','voice_id']);
 assert.doesNotMatch(body.speak,/6222|9999|123456|transfer|not spoken/);
});

test('fixed sample uses the same local stream and estimates never masquerade as balance',async()=>{
 const h=harness();await h.adapter.sample({requestId:'sample'});
 assert.equal(JSON.parse(h.calls[0].request.body).speak,MINIMAX_SAMPLE_TEXT.normalize('NFKC'));
 assert.deepEqual(estimateMinimaxCost('你好A🙂'),{billable_characters_estimate:6,cny_estimate:.0012,cny_per_10000:2,is_estimate:true});
});

test('duplicate request ids do not send new requests and changed content cannot reuse an id',async()=>{
 const h=harness();await h.adapter.speak('你好',{requestId:'same'});
 assert.equal((await h.adapter.speak('你好',{requestId:'same'})).reason,'duplicate_request');
 await assert.rejects(h.adapter.speak('改了',{requestId:'same'}),{code:'request_id_conflict'});assert.equal(h.calls.length,1);
});

test('completed identical speech replays its RAM audio without a second provider request',async()=>{
 const h=harness();await h.adapter.speak('再核对一下。',{requestId:'cache'});const played=h.context.sources.length;
 const replay=await h.adapter.speak('再核对一下。');assert.equal(replay.cached,true);
 assert.equal(h.calls.length,1);assert.equal(h.context.sources.length,played+1);
 h.adapter.clearCache();await h.adapter.speak('再核对一下。',{requestId:'explicit-new'});assert.equal(h.calls.length,2);
});

test('in-flight duplicate clicks do not cancel or duplicate the first billed request',async()=>{
 const wire=new Wire(),h=harness({wireFactory:()=>wire});const first=h.adapter.speak('你好',{requestId:'inflight'});
 await tick();assert.equal((await h.adapter.speak('你好',{requestId:'inflight'})).status,'skipped');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].request.signal.aborted,false);
 wire.push(lines(start('inflight'),audio('inflight'),end('inflight')));wire.close();await first;
});

test('same-tick duplicate ids and text are reserved before asynchronous CSRF or audio preparation',async()=>{
 const wire=new Wire(),h=harness({headers:async()=>{await tick();return {};},wireFactory:()=>wire});
 const first=h.adapter.speak('你好',{requestId:'instant'});
 assert.equal((await h.adapter.speak('你好',{requestId:'instant'})).status,'skipped');
 assert.equal((await h.adapter.speak('你好')).reason,'duplicate_text');
 await tick();await tick();assert.equal(h.calls.length,1);
 wire.push(lines(start('instant'),audio('instant'),end('instant')));wire.close();await first;
});

test('JSON envelopes select speak only and malformed or missing speak never invokes the provider',async()=>{
 const h=harness();
 for(const input of ['{"reply":"private"}', '{"speak":', {reply:'private'}, {speak:42}])await assert.rejects(h.adapter.speak(input));
 assert.equal(h.calls.length,0);
 await h.adapter.speak('{"reply":"private","speak":"你好","actions":["transfer"]}',{requestId:'json'});
 assert.equal(JSON.parse(h.calls[0].request.body).speak,'你好');
});

test('Abort immediately stops scheduled sources, cancels the local stream and sends a cancel event',async()=>{
 const wire=new Wire(),context=new Context({autoEnd:false}),h=harness({context,wireFactory:()=>wire,cancelEndpoint:'/api/voice/minimax/cancel'}),controller=new AbortController();
 const promise=h.adapter.speak('你好',{requestId:'abort',signal:controller.signal});const rejected=assert.rejects(promise,{name:'AbortError'});
 await tick();wire.push(lines(start('abort'),audio('abort')));await tick();controller.abort();await rejected;await tick();
 assert.equal(context.sources[0].stopped,true);assert.equal(h.calls[0].request.signal.aborted,true);assert.ok(wire.cancelled);
 const cancellation=h.calls.find(c=>c.url.endsWith('/cancel'));assert.deepEqual(JSON.parse(cancellation.request.body),{request_id:'abort'});
});

test('late chunks from a cancelled generation cannot become audio after replacement',async()=>{
 const firstWire=new Wire({ignoreCancel:true}),h=harness({wireFactory:(id)=>{
  if(id==='old')return firstWire;const next=new Wire();next.push(lines(start(id),audio(id),end(id)));next.close();return next;
 }});
 const old=h.adapter.speak('旧回复',{requestId:'old'});const oldRejected=assert.rejects(old,{name:'AbortError'});await tick();
 await h.adapter.speak('新回复',{requestId:'new'});await oldRejected;firstWire.push(lines(start('old'),audio('old'),end('old')));firstWire.close();await tick();
 assert.equal(h.context.sources.length,1);
});

test('pre-abort, unsupported playback and rejected resume never send a billed request',async()=>{
 const cancelled=new AbortController();cancelled.abort();const h=harness();
 await assert.rejects(h.adapter.speak('你好',{signal:cancelled.signal}),{name:'AbortError'});assert.equal(h.calls.length,0);
 const context=new Context({state:'suspended'});context.resume=async()=>{throw Error('gesture required');};const blocked=harness({context});
 await assert.rejects(blocked.adapter.speak('你好'));assert.equal(blocked.calls.length,0);
 const unsupported=createMinimaxVoiceStreamAdapter({scope:{location:{href:'http://127.0.0.1/'}},fetchImpl:()=>{throw Error('must not call');}});
 await assert.rejects(unsupported.speak('你好'),{code:'audio_unsupported'});
});

test('provider keys and remote targets are rejected in browser configuration',async()=>{
 assert.throws(()=>createMinimaxVoiceStreamAdapter({endpoint:'https://api.minimax.cn/v1/t2a_v2'}),/same-origin/);
 const h=harness({headers:{Authorization:'Bearer test-not-a-real-key'}});
 await assert.rejects(h.adapter.speak('你好'),{code:'provider_key_in_browser'});assert.equal(h.calls.length,0);
});

test('malformed JSON, missing terminal frame, wrong ids, codec and sequence fail safely',async()=>{
 const cases=[id=>'{"type":',id=>lines(start(id),audio(id)),id=>lines(start('wrong'),audio(id),end(id)),
  id=>lines({...start(id),sample_rate:24000},audio(id),end(id)),id=>lines(audio(id),end(id)),
  id=>lines(start(id),audio(id,1),end(id)),id=>lines(start(id),audio(id),end(id,2,100)),
  id=>lines(start(id),{...audio(id),audio_base64:'?bad?'},end(id)),
  id=>lines(start(id),audio(id,0,new Uint8Array([1])),end(id,1,1)),
  id=>lines(start(id),audio(id),end(id),audio(id,1))];
 for(const [index,build] of cases.entries()){
  const h=harness({wireFactory:id=>{const wire=new Wire();wire.push(build(id));wire.close();return wire;}});
  await assert.rejects(h.adapter.speak('你好',{requestId:`bad-${index}`}));
  assert.ok(h.context.sources.every(source=>source.stopped));
 }
});

test('NDJSON can span bytes and EOF accepts only a complete final JSON event',async()=>{
 const h=harness({wireFactory:id=>{const wire=new Wire(),body=encode(lines(start(id),audio(id))+JSON.stringify(end(id)));
  for(let index=0;index<body.length;index+=3)wire.push(body.slice(index,index+3));wire.close();return wire;}});
 assert.equal((await h.adapter.speak('你好',{requestId:'split'})).status,'spoken');
});

test('upstream errors never echo response messages or retry a reserved id',async()=>{
 const h=harness({wireFactory:id=>{const wire=new Wire();wire.push(lines({type:'error',request_id:id,code:'invalid_key',message:'private secret'}));wire.close();return wire;}});
 await assert.rejects(h.adapter.speak('你好',{requestId:'error'}),error=>error.code==='invalid_key'&&!error.message.includes('private secret'));
 assert.equal((await h.adapter.speak('你好',{requestId:'error'})).status,'skipped');assert.equal(h.calls.length,1);
});

test('HTTP errors and wrong content types do not start playback or retry',async()=>{
 for(const options of [{responseStatus:401},{contentType:'audio/wav'}]){
  const h=harness(options);await assert.rejects(h.adapter.speak('你好',{requestId:'http'}));
  assert.equal(h.calls.length,1);assert.equal(h.context.sources.length,0);
 }
});

test('blocked read times out and aborts without falsely reporting spoken',async()=>{
 const h=harness({requestTimeoutMs:15,wireFactory:()=>new Wire()});
 await assert.rejects(h.adapter.speak('你好',{requestId:'timeout'}),{code:'stream_timeout'});
 assert.equal(h.calls[0].request.signal.aborted,true);assert.equal(h.context.sources.length,0);
});

test('disposal clears replay cache, cancels work and prevents future synthesis',async()=>{
 const h=harness();await h.adapter.speak('你好',{requestId:'before-dispose'});h.adapter.dispose();
 await assert.rejects(h.adapter.speak('你好'),{code:'disposed'});assert.equal(h.calls.length,1);
});

test('preview voice stays explicit and cannot use unlisted voices',async()=>{
 const voice='Chinese (Mandarin)_Warm_Girl';const h=harness({voiceId:voice,wireFactory:id=>{const w=new Wire();w.push(lines({...start(id),voice},audio(id),end(id)));w.close();return w;}});
 await h.adapter.speak('你好',{requestId:'preview-girl'});assert.equal(JSON.parse(h.calls[0].request.body).voice_id,voice);
 assert.throws(()=>harness({voiceId:'clone-arbitrary'}),/Unsupported voice/);
});

test('existing HD service remains usable for its unchanged voice without a new protocol field',async()=>{const h=harness({model:'speech-2.8-hd',wireFactory:id=>{const w=new Wire();w.push(lines({...start(id),model:'speech-2.8-hd'},audio(id),end(id)));w.close();return w;}});await h.adapter.speak('你好',{requestId:'legacy-preserved'});assert.deepEqual(Object.keys(JSON.parse(h.calls[0].request.body)).sort(),['request_id','speak']);assert.throws(()=>harness({model:'speech-2.8-hd',voiceId:'Chinese (Mandarin)_Warm_Girl'}),/Unsupported voice protocol/);});
