import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChallenge} from '../web/companion-ui.mjs';
const challenge={id:'test',status:'pending',attempts:0};
test('offline password hint covers common, source review, recovery and recipient password cards only',()=>{
 for(const options of [{},{review:true},{recovery:true},{voiceDemo:true,method:'password'}]){
  const offline=renderChallenge(challenge,{esc:String,...options,offlineDemo:true});
  assert.match(offline,/演示密码：123456/);assert.doesNotMatch(offline,/value="123456"/);
  assert.doesNotMatch(renderChallenge(challenge,{esc:String,...options}),/演示密码|123456/);
 }
 assert.doesNotMatch(renderChallenge(challenge,{esc:String,offlineDemo:true,voiceDemo:true,method:'voice'}),/演示密码/);
 assert.doesNotMatch(renderChallenge({...challenge,status:'expired'},{esc:String,offlineDemo:true}),/演示密码/);
});
