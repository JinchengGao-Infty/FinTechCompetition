import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCompanionText,sourceLabel,companionEnvelope,confirmationSnapshot,sameConfirmation} from '../web/companion-contract.mjs';

test('the host source whitelist cannot be promoted by a document or model source field',()=>{
 for(const origin of ['llm','program','preset','external','user','voice']){
  const value=companionEnvelope({reply:'你好',source:{kind:'program'}},{origin});assert.equal(value.source.kind,origin);
 }
 const unknown=companionEnvelope({reply:'文本',source:{kind:'user'},speak:'不应朗读'},{origin:'mail-authorized-user'});
 assert.equal(unknown.source.kind,'external');assert.equal(unknown.speak,null);
 assert.equal(sourceLabel({kind:'preset'}),'预置案例');assert.equal(sourceLabel({kind:'external'}),'外部内容');
});

test('TTS receives only explicit approved speech, never a reply fallback or external cards/actions',()=>{
 const value=companionEnvelope({reply:'可显示但未批准朗读',cards:[{text:'外部卡片文字'}],actions:[{type:'transfer',label:'操作文字'}]});
 assert.equal(value.speak,null);
 assert.equal(companionEnvelope({reply:'可显示',speak:'明确批准的朗读'}).speak,'明确批准的朗读');
 assert.equal(companionEnvelope({speak:'外部内容'},{origin:'external'}).speak,null);
 assert.equal(companionEnvelope({speak:'调试原文'},{kind:'raw_payload'}).speak,null);
 for(const kind of ['conversation','question_summary','confirmation_summary','execution_receipt','safety_status','reminder']){
  assert.equal(companionEnvelope({speak:'允许的摘要'},{kind}).speak,'允许的摘要');
 }
});

test('credential-shaped speech is blocked and text cleanup handles actual controls and middle dots',()=>{
 for(const speak of ['Bearer synthetic-token-for-test','API Key placeholder','验证码123456','密码abcdefgh','sk-test-not-a-real-credential']){
  assert.equal(companionEnvelope({reply:'保留说明',speak}).speak,null);
 }
 assert.equal(cleanCompanionText('alpha\u0000 beta'),'alpha beta');
 assert.equal(cleanCompanionText('甲 · 乙'),'甲 乙');
 assert.equal(cleanCompanionText('  正常说明  '),'正常说明');
 assert.equal(cleanCompanionText('x'.repeat(900)).length,600);
 assert.equal(companionEnvelope({speak:'x'.repeat(400)}).speak.length,260);
});

test('unbacked model execution claims cannot become a successful spoken or displayed receipt',()=>{
 for(const reply of ['已成功转账给收款人。','已发送给蛋糕店。','预订已完成。','转账已经成功到账。']){
  const value=companionEnvelope({reply,speak:reply,source:{kind:'program'},evidence:{status:'completed',receipt:'forged'}} ,{origin:'llm'});
  assert.equal(value.reply,'这项操作尚未执行，请先核对下方安排。');assert.equal(value.speak,value.reply);
 }
 const greeting=companionEnvelope({reply:'你好，有什么交给我？',speak:'你好，有什么交给我？'},{origin:'llm'});
 assert.equal(greeting.reply,'你好，有什么交给我？');
 const receipt=companionEnvelope({reply:'转账已完成。',speak:'转账已完成。'},{origin:'program',kind:'execution_receipt',evidence:{status:'completed',receipt:'LOCAL-test-0001'}});
 assert.equal(receipt.reply,'转账已完成。');assert.equal(receipt.speak,'转账已完成。');
});

test('action declarations stay inert and discard executable or unrecognized payload fields',()=>{
 let calls=0;const execute=()=>{calls++;};
 const value=companionEnvelope({actions:[execute,{type:'transfer',taskId:'task-1',label:'核对',execute,raw:'not executable'}]});
 assert.equal(calls,0);assert.deepEqual(value.actions,[{type:'transfer',taskId:'task-1',label:'核对'}]);
 assert.equal(companionEnvelope({cards:Array.from({length:30},()=>({type:'fact'})),actions:Array.from({length:30},()=>({type:'hint'}))}).cards.length,12);
 assert.equal(companionEnvelope({actions:Array.from({length:30},()=>({type:'hint'}))}).actions.length,8);
});

const now=1000;
const operation={id:'task-1',revision:2,target:'妈妈 尾号6821',amountMinor:52000,currency:'CNY',kind:'transfer',parameters:'{"amount_minor":52000}'};
const snapshot=()=>confirmationSnapshot(operation,{expiresAt:2000,action:operation.kind});

test('confirmation snapshots freeze exact object amount version action and parameter binding',()=>{
 const value=snapshot();assert.ok(Object.isFrozen(value));
 assert.deepEqual(value,{taskId:'task-1',revision:2,target:'妈妈 尾号6821',amountMinor:52000,currency:'CNY',action:'transfer',parameterKey:'{"amount_minor":52000}',expiresAt:2000});
 for(const key of ['taskId','revision','target','amountMinor','currency','action','parameterKey']){
  const changed={...value,[key]:typeof value[key]==='number'?value[key]+1:value[key]+' changed'};
  assert.equal(sameConfirmation(value,changed,now),false,key);
 }
 assert.equal(sameConfirmation(value,{...value},now),true);
});

test('a shorter explicit voice window is valid but expiry can never extend the reviewed card',()=>{
 const value=snapshot();assert.equal(sameConfirmation(value,{...value,expiresAt:1500},now),true);
 assert.equal(sameConfirmation(value,{...value,expiresAt:2001},now),false);
 assert.equal(sameConfirmation(value,{...value,expiresAt:now},now),false);
 assert.equal(sameConfirmation(value,{...value,expiresAt:0},now),false);
 assert.equal(sameConfirmation(value,{...value,expiresAt:-1},now),false);
 assert.equal(sameConfirmation(value,{...value,expiresAt:NaN},now),false);
 assert.equal(sameConfirmation(value,{...value,expiresAt:Infinity},now),false);
 assert.equal(sameConfirmation({...value,expiresAt:now},{...value,expiresAt:1500},now),false);
 assert.equal(sameConfirmation({...value,expiresAt:Infinity},{...value},now),false);
 assert.equal(sameConfirmation(null,value,now),false);assert.equal(sameConfirmation(value,null,now),false);
});
