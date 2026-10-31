import test from 'node:test';
import assert from 'node:assert/strict';
import {saveMiniMaxSettings,disconnectMiniMax} from '../web/minimax-settings.mjs';

test('voice key is cleared before session refresh and only sent to its separate same-origin route',async()=>{
 const input={value:'test-voice-placeholder'},form={elements:{minimaxKey:input}},calls=[];
 await saveMiniMaxSettings(form,{session:async()=>{assert.equal(input.value,'');return {csrf:'test-csrf'};},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({configured:true,verified:false})};}});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/voice/config');assert.equal(calls[0].options.headers['X-CSRF-Token'],'test-csrf');assert.deepEqual(JSON.parse(calls[0].options.body),{key:'test-voice-placeholder',consent:true});assert.equal(input.value,'');
});
test('failed session refresh clears input and releases the submit guard without sending credentials',async()=>{
 const input={value:'test-voice-placeholder'},form={elements:{minimaxKey:input}};let calls=0;
 await assert.rejects(saveMiniMaxSettings(form,{session:async()=>{throw Error('expired');},fetchImpl:async()=>calls++}),/expired/);assert.equal(input.value,'');assert.equal(calls,0);
 input.value='test-voice-placeholder';await saveMiniMaxSettings(form,{session:async()=>({csrf:'new'}),fetchImpl:async()=>({ok:true,json:async()=>({configured:true})})});
});
test('disconnect sends no key or dialogue-model settings',async()=>{
 let request;await disconnectMiniMax({session:async()=>({csrf:'test'}),fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({configured:false})};}});
 assert.equal(request.url,'/api/voice/config');assert.deepEqual(JSON.parse(request.options.body),{disconnect:true});
});
