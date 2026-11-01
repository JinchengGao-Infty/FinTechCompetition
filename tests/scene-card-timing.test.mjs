import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import * as policy from '../web/safety-policy.mjs';
import {createCompanionController} from '../web/companion-controller.mjs';
import {offlineResult,OFFLINE_PROMPTS} from '../web/offline-demo.mjs';
import {recipientOperation} from '../web/recipient-review.mjs';
import {getRiskSource} from '../web/risk-sources.mjs';
const USER={kind:'user',method:'click'};
async function fixture(run){
 const oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),oldFetch=globalThis.fetch,oldForm=globalThis.FormData;
 let state=fresh(),c,network=0,inlinePaints=0;const errors=[];
 Object.defineProperty(globalThis,'location',{value:{href:'http://127.0.0.1:63939/?offline=1&session=timing-test'},configurable:true});
 globalThis.fetch=async()=>{network++;throw Error('No external IO');};
 globalThis.FormData=class{constructor(f){this.fields=f.fields;}get(k){return this.fields[k];}};
 try{
  c=createCompanionController({getState:()=>state,commit:n=>{state=structuredClone(n);},esc:String,repaint(){},onInlineUpdated(){inlinePaints++;},disableSpeech:true,onError:m=>errors.push(m)});
  const h={c,errors,get inlinePaints(){return inlinePaints;},get state(){return state;},update(fn){fn(state);},action:(name,data={})=>c.handleAction(name,{dataset:data},{isTrusted:true}),
   input(text){return c.applyModelResult(offlineResult({text,run_companion:c.modelContext()}).result);},
   challenge(){return Object.values(state.safety.challenges).findLast(x=>x.status==='pending');},
   password(code,id){return c.handleSubmit({target:{id:'safety-challenge-form',dataset:{challenge:id||h.challenge().id},fields:{challengeCode:code}},preventDefault(){}});}};
  await run(h);assert.equal(network,0);
 }finally{c?.dispose();globalThis.fetch=oldFetch;globalThis.FormData=oldForm;if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else delete globalThis.location;}
}
async function start(h){h.input(OFFLINE_PROMPTS.recipient);await h.action('recipient-confirm');return h.challenge().id;}

test('reported-recipient bubble and card use reviewed risk wording without implying verification can release it',()=>fixture(async h=>{
 const before=h.state.balance;
 const result=h.c.applyModelResult({scenario:'security_case',status:'propose',mode:'create',context_action:'new',reply:'这个收款卡号在本地演示记录中有多条举报，请决定是否继续。',speak:'核对后可以继续。',fields:{case_id:'reported_scam',recipient_name:'闲鱼卖家',recipient_card_number:'0000000000008891',amount_minor:200000,source_account:'living_1608'},missing:[],cards:[{type:'security_notice'}],actions:[{type:'show_security_case'}]});
 assert.match(result.text,/该收款人被多人标记为信用不佳/);assert.equal(result.speak,result.text);
 assert.doesNotMatch(result.text,/本地演示记录|决定是否继续/);assert.match(result.text,/已停止转账/);
 assert.match(h.c.render(),/该收款人被多人标记为信用不佳/);assert.doesNotMatch(h.c.render(),/recipient-voice-verify|safety-challenge-form/);
 assert.equal(h.state.balance,before);
}));
test('scene one: methods appear only after confirmation; simulated proof executes once, not on selection',()=>fixture(async h=>{
 const before=h.state.balance;h.input(OFFLINE_PROMPTS.recipient);assert.doesNotMatch(h.c.render(),/recipient-voice-verify|验证成功/);
 await h.action('recipient-confirm');const id=h.challenge().id;
 assert.equal((h.c.render().match(/id="safety-challenge-form"/g)||[]).length,1);assert.doesNotMatch(h.c.render(),/data-action="recipient-edit"/);
 const paints=h.inlinePaints;await h.action('recipient-verification-method',{challenge:id,method:'voice'});assert.equal(h.state.balance,before);assert.ok(h.inlinePaints>paints,'method switch must repaint the inline card, not just microphone');
 const pending=h.action('recipient-voice-verify',{challenge:id});assert.match(h.c.render(),/正在识别/);assert.equal(h.state.balance,before);
 await h.action('recipient-voice-verify',{challenge:id});await pending;
 assert.equal(h.errors.length,0);assert.equal(h.state.balance,before-300);assert.match(h.c.render(),/转账成功/);assert.doesNotMatch(h.c.render(),/safety-challenge-form|开始识别|需密码/);
 const proof=Object.values(h.state.safety.grants).find(g=>g.verification?.method==='local-demo-voice');assert.equal(proof.verification.simulated,true);
 assert.equal(h.state.ledger.filter(x=>x.taskId===h.state.companion.recipient.id).length,1);
 assert.equal(h.state.companion.planPresentations[h.state.companion.recipient.id].collapse,true);
}));
test('cancel and reset during animation invalidate delayed success; next scene remains usable',()=>fixture(async h=>{
 for(const reset of [false,true]){
  const id=await start(h),before=h.state.balance;await h.action('recipient-verification-method',{challenge:id,method:'voice'});
  const pending=h.action('recipient-voice-verify',{challenge:id});
  if(reset)h.c.resetConversation();else await h.action('safety-challenge-cancel',{challenge:id});
  await pending;assert.equal(h.state.balance,before);assert.doesNotMatch(h.c.render(),/验证成功|正在识别/);
  if(!reset){assert.equal(h.state.companion.recipient.status,'review');await h.action('recipient-cancel');assert.equal(h.state.messages.at(-1).text,'已取消转账，钱没有转出。');}
 }
 h.input(OFFLINE_PROMPTS.savings);assert.match(h.c.render(),/为一个目标攒钱/);assert.doesNotMatch(h.c.render(),/身份验证/);
}));
test('three password failures freeze both methods; high-risk seller has no voice authorization',()=>fixture(async h=>{
 const id=await start(h),before=h.state.balance;await h.password('000000');await h.password('000000');await h.password('000000');
 assert.equal(h.state.safety.locked,true);assert.match(h.c.render(),/账户已冻结10分钟/);assert.doesNotMatch(h.c.render(),/声纹|恢复|<input/);
 await assert.rejects(h.action('recipient-verification-method',{challenge:id,method:'voice'}));assert.equal(h.state.balance,before);
 h.c.resetConversation();h.input(OFFLINE_PROMPTS.seller);assert.equal(h.state.safety.locked,true);assert.doesNotMatch(h.c.render(),/recipient-voice-verify|recipient-confirm/);assert.equal((h.c.render().match(/<section/g)||[]).length,1);
 await h.action('recipient-cancel');assert.match(h.c.render(),/已取消转账/);assert.doesNotMatch(h.c.render(),/安全保护已开启|验证后恢复/);assert.equal(h.state.safety.locked,true,'cancel does not erase risk lock');
 h.c.resetConversation();assert.equal(h.state.safety.locked,false);assert.doesNotMatch(h.c.render(),/已冻结|密码验证/);
}));
test('expired or revised transaction cannot obtain simulated proof and expired card can be confirmed again',()=>fixture(async h=>{
 const id=await start(h),r=h.state.companion.recipient,op=recipientOperation(r.review,{id:r.id,revision:r.revision,expiresAt:r.expiresAt});
 assert.throws(()=>policy.verifyDemoVoiceChallenge(h.state,{...op,amountMinor:op.amountMinor+1},{challengeId:id,source:USER,now:h.c.now()}));
 h.c.clock.advance(91000);h.c.sync();assert.equal(h.state.companion.recipient.status,'review');assert.doesNotMatch(h.c.render(),/id="safety-challenge-form"/);
 await h.action('recipient-confirm');assert.notEqual(h.challenge().id,id);assert.match(h.c.render(),/身份验证/);
}));
test('bill injection shows verification, then decision, then cancellation only; password never sends data',()=>fixture(async h=>{
 const source=getRiskSource('injection_email');h.update(s=>{s.companion.pendingEvent={type:'injection_email',fixture_id:source.source_id,event_id:'test-mail'};s.messages.push({id:'mail',eventId:'test-mail',role:'assistant',eventCard:{type:'injection_email'}});});
 h.c.inspectExternalSource('injection_email');assert.match(h.c.render(),/先确认是你本人/);assert.doesNotMatch(h.c.render(),/data-source-review="cancelled"|放弃处理<\/button>/);
 await h.action('source-review-verify');assert.doesNotMatch(h.c.render(),/data-source-review="verify"|声纹/);await h.password('123456');
 assert.match(h.c.render(),/data-source-review="decision"/);assert.doesNotMatch(h.c.render(),/safety-challenge-form|data-source-review="cancelled"/);
 const rows=h.state.ledger.length;await h.action('source-review-cancel');assert.match(h.c.render(),/没有回复邮件，也没有发送任何信息/);assert.doesNotMatch(h.c.render(),/data-source-review="decision"|safety-challenge-form/);assert.equal(h.state.ledger.length,rows);
 assert.equal(h.state.companion.planPresentations[h.state.messages.find(m=>m.id==='mail').planId].collapse,true);
}));
test('scene five saves only at explicit confirmation and folds completion; stale double click cannot recreate',()=>fixture(async h=>{
 h.input(OFFLINE_PROMPTS.savings);for(const value of ['save','旅行','60000','2000'])await h.action('wealth-choice',{revision:String(h.state.wealthGuide.revision),value});
 assert.equal(h.state.wealthGuide.stage,'saving_confirm');const before=h.state.balance,revision=String(h.state.wealthGuide.revision);
 await h.action('wealth-save',{revision});assert.equal(h.state.balance,before);assert.equal(h.state.wealthGuide.stage,'done');assert.equal(h.state.companion.planPresentations[h.state.wealthGuide.id].collapse,true);
 const snapshot=JSON.stringify(h.state.savingsJars);await h.action('wealth-save',{revision});assert.equal(JSON.stringify(h.state.savingsJars),snapshot);assert.doesNotMatch(h.c.render(),/data-action="wealth-save"/);
}));
