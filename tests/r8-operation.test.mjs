import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,createTask,transition} from '../web/engine.mjs';
import {authorizeOperation,resetBotPresentation,shouldResetBot,operationOrigin} from '../web/operation-flow.mjs';
import {parameterFingerprint,CONTACTS} from '../web/task-parameters.mjs';
import {executeLocalTask} from '../web/local-executor.mjs';
import {stableCategories} from '../web/category-order.mjs';
import {createViewNavigation} from '../web/view-navigation.mjs';
const payload=t=>({revision:t.revision,parameters:parameterFingerprint(t)});
test('one consent grants and confirms ordinary tasks without bypassing strong verification',()=>{
 const s=fresh(),a=createTask(s,'travel');const t=authorizeOperation(s,a.id,payload(a));assert.equal(t.status,'executing');
 const b=createTask(s,'salary',{reuse:false});const strong=authorizeOperation(s,b.id,payload(b));assert.equal(strong.status,'verify');assert.equal(strong.verifiedRevision,undefined);
 assert.throws(()=>executeLocalTask(s,b.id));assert.equal(s.balance,50000);
 transition(s,b.id,'verify',{verified:true});executeLocalTask(s,b.id);assert.equal(s.balance,48000);
});
test('changed payee/amount invalidates a combined confirmation with no half grant',()=>{
 const s=fresh(),t=createTask(s,'salary');const old=payload(t);transition(s,t.id,'edit',{amount:'1800',payeeId:CONTACTS[1].id});
 assert.throws(()=>authorizeOperation(s,t.id,old),/变化/);assert.equal(s.tasks[0].granted,false);assert.equal(s.balance,50000);
});
test('risk-blocked/cancelled and repeated submissions cannot execute twice',()=>{
 const s=fresh(),t=createTask(s,'travel');authorizeOperation(s,t.id,payload(t));executeLocalTask(s,t.id);const amount=s.travelBudget;
 authorizeOperation(s,t.id,payload(s.tasks[0]));assert.equal(s.travelBudget,amount);
 const b=createTask(s,'risk_transfer',{reuse:false});b.status='blocked';assert.throws(()=>authorizeOperation(s,b.id,payload(b)));
});
test('Bot reload clears only presentation and draft, retaining task receipts and balances',()=>{
 const s=fresh(),t=createTask(s,'travel');authorizeOperation(s,t.id,payload(t));executeLocalTask(s,t.id);
 s.messages=[{role:'user',text:'旅行'}];s.agentDraft={id:'draft',status:'awaiting_details',fields:{},missing:['amount_minor']};s.agentFocus=t.id;s.agentWorkspaceVisible=true;
 const before={balance:s.balance,receipt:s.tasks[0].receipt,budget:s.travelBudget};resetBotPresentation(s);
 assert.deepEqual(s.messages,[]);assert.equal(s.agentDraft,null);assert.equal(s.agentFocus,null);assert.equal(s.agentWorkspaceVisible,false);
 assert.equal(s.conversationArchives.length,1);assert.equal(s.agentDraftHistory.draft.status,'cancelled');assert.deepEqual({balance:s.balance,receipt:s.tasks[0].receipt,budget:s.travelBudget},before);
 assert.equal(shouldResetBot('reload','#/bot'),true);assert.equal(shouldResetBot('reload','#/bot/tasks'),true);assert.equal(shouldResetBot('navigate','#/bot'),false);assert.equal(shouldResetBot('reload','#/finance'),false);
});
test('category priority is stable across newest-transfer insertion',()=>{
 const a=stableCategories(['证券本金','其他','餐饮']),b=stableCategories(['人情往来','证券本金','其他','餐饮']);
 assert.deepEqual(a.slice(0,4),['餐饮','出行','购物','生活缴费']);assert.deepEqual(a,b);
});
test('reload invalidates an unfinished agent approval without deleting its history',()=>{
 const s=fresh(),t=createTask(s,'salary',{originTurnId:'ui-test'});authorizeOperation(s,t.id,payload(t));
 const id=t.id,oldRevision=s.tasks.find(x=>x.id===id).revision;
 resetBotPresentation(s);const restored=s.tasks.find(x=>x.id===id);
 assert.equal(restored.status,'permission');assert.equal(restored.granted,false);assert.equal(restored.approved,null);
 assert.equal(restored.revision,oldRevision+1);assert.equal(s.balance,50000);
});
function fakeWindow(){const list=[],listeners={};let i=-1;const win={location:{hash:'#/investment',href:'http://127.0.0.1/#/investment'},scrollY:132,requestAnimationFrame:fn=>fn(),scrollTo(x,y){this.scrollY=y;},addEventListener(n,fn){(listeners[n]??=[]).push(fn);},removeEventListener(){}};
 const set=url=>{win.location.hash=url.includes('#')?'#'+url.split('#')[1]:url;win.location.href='http://127.0.0.1/'+win.location.hash;};
 win.history={state:null,replaceState(s,x,url){this.state=s;if(i<0){i=0;list[0]={s,url};}else list[i]={s,url};set(url);},pushState(s,x,url){list.splice(i+1);list.push({s,url});i++;this.state=s;set(url);},back(){if(i>0){const v=list[--i];this.state=v.s;set(v.url);for(const fn of listeners.popstate||[])fn();}},forward(){if(i+1<list.length){const v=list[++i];this.state=v.s;set(v.url);for(const fn of listeners.popstate||[])fn();}}};return win;}
test('business operation back restores the exact source tab and scroll',()=>{
 const win=fakeWindow();let view={financial:'overview',investment:'wealth'},renders=0;
 const nav=createViewNavigation({win,read:()=>view,apply:v=>view=v,render:()=>renders++,clearOverlay(){},restoreOverlay(){}});
 const origin=nav.snapshot();nav.go('#/operation/abc',{kind:'operation',returnTo:origin});assert.equal(win.location.hash,'#/operation/abc');
 nav.back(origin);assert.equal(win.location.hash,'#/investment');assert.equal(view.investment,'wealth');assert.equal(win.scrollY,132);assert.ok(renders>=2);
});
test('consuming a product sheet replaces it with operation, back does not enter Bot',()=>{
 const win=fakeWindow();let view={financial:'overview',investment:'wealth'};const nav=createViewNavigation({win,read:()=>view,apply:v=>view=v,render(){},clearOverlay(){},restoreOverlay(){}});
 nav.openOverlay({title:'详情',body:'x'});nav.dismissOverlay({consume:true});const origin=nav.snapshot();nav.go('#/operation/abc',{kind:'operation',returnTo:origin});nav.back(origin);
 assert.equal(win.location.hash,'#/investment');assert.equal(nav.current().overlay,undefined);assert.equal(view.investment,'wealth');
});
test('closing a sheet retains its original DOM so opener focus can survive',()=>{
 const win=fakeWindow();let view={financial:'overview',investment:'wealth'},renders=0;
 const nav=createViewNavigation({win,read:()=>view,apply:v=>view=v,render:()=>renders++,clearOverlay(){},restoreOverlay(){}});
 nav.openOverlay({title:'比较',body:'x'});nav.dismissOverlay();
 assert.equal(win.location.hash,'#/investment');assert.equal(renders,0);assert.equal(nav.current().overlay,undefined);
});
test('nested capture detail returns one level at a time',()=>{
 const win=fakeWindow();let view={financial:'ledger',investment:'holdings'};
 const nav=createViewNavigation({win,read:()=>view,apply:v=>view=v,render(){},clearOverlay(){},restoreOverlay(){}});
 nav.go('#/finance',{financial:'ledger'});nav.go('#/finance/capture',{kind:'detail',returnTo:nav.snapshot()});
 nav.go('#/finance/entry',{kind:'detail',returnTo:nav.snapshot()});nav.back();assert.equal(win.location.hash,'#/finance/capture');
 nav.back();assert.equal(win.location.hash,'#/finance');assert.equal(view.financial,'ledger');
});

 test('legacy business deep links infer a safe source without routing into Bot',()=>{
 for(const kind of ['investment','redemption'])assert.equal(operationOrigin({kind}).investment,'wealth');
 assert.equal(operationOrigin({kind:'investment'}).route,'#/investment');
 assert.equal(operationOrigin({kind:'card'}).financial,'overview');
 assert.equal(operationOrigin({kind:'transfer'}).financial,'ledger');
 assert.equal(operationOrigin({agentOrigin:true,kind:'investment'}).route,'#/bot');
 assert.equal(operationOrigin({kind:'investment',uiOrigin:{route:'https://example.com'}}).route,'#/investment');
 assert.equal(operationOrigin(null).route,'#/today');
});
 test('recorded source and refreshed business operations preserve their original view',()=>{
 const origin={route:'#/finance',financial:'ledger',investment:'research',scroll:321};
 assert.deepEqual(operationOrigin({kind:'investment',uiOrigin:origin}),origin);
 const win=fakeWindow();let view={financial:'overview',investment:'holdings'};
 win.location.hash='#/operation/legacy';win.location.href='http://127.0.0.1/#/operation/legacy';
 const nav=createViewNavigation({win,read:()=>view,apply:v=>view=v,render(){},clearOverlay(){},restoreOverlay(){}});
 nav.back(operationOrigin({kind:'investment'}));
 assert.equal(win.location.hash,'#/investment');assert.equal(view.investment,'wealth');
});
