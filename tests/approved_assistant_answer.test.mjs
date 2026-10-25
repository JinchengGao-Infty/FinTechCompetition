import test from 'node:test';import assert from 'node:assert/strict';import {createApprovedAssistant,createAssistantResponseGuard} from '../AI_accounting_agent/frontend/liquid-glass/approved-assistant.js';
test('real user/answer avatars, escaped content, no executable cards or canned answer',()=>{const state={mode:'finance',chats:{finance:[{role:'user',content:'<问题>'},{role:'assistant',content:'真实响应',action_draft:{kind:'transfer'}}]}};const a=createApprovedAssistant({state}),root={innerHTML:'',dataset:{}};a.renderMessages(root);assert(root.innerHTML.includes('ap-assistant-avatar-user'));assert(root.innerHTML.includes('ap-assistant-avatar-assistant'));assert(root.innerHTML.includes('&lt;问题&gt;'));assert(root.innerHTML.includes('真实响应'));assert(!root.innerHTML.includes('transfer'));assert(!root.innerHTML.includes('讨论我的目标'));});
test('busy only skeleton/cancel; stopped/error and stale filtering are real states',()=>{const state={mode:'book',chatBusy:true,chats:{book:[]}},a=createApprovedAssistant({state}),root={innerHTML:'',dataset:{}};a.renderMessages(root);assert(root.innerHTML.includes('ap-assistant-skeleton'));assert(root.innerHTML.includes('stop-chat'));assert(!/id="chat-input"[^>]*disabled/.test(a.pageHTML()));state.chatBusy=false;state.chats.book=[{role:'assistant',content:'late',stale:true},{role:'assistant',stopped:true},{role:'assistant',failed:true,content:'连接失败'}];a.renderMessages(root);assert(!root.innerHTML.includes('late'));assert(!root.innerHTML.includes('ap-assistant-skeleton'));assert(root.innerHTML.includes('已停止'));assert(root.innerHTML.includes('role="alert"'));});
test('response guard rejects old/cancelled/mode-replaced response tokens',()=>{const g=createAssistantResponseGuard(),old=g.begin('a','book'),next=g.begin('b','finance');assert(!g.accept(old));assert(g.accept(next));g.cancel(old);assert(g.accept(next));g.cancel(next);assert(!g.accept(next));});

test('all three real modes have distinct greetings, placeholders and three useful presets',()=>{
 const state={mode:'book',chats:{book:[],finance:[],trader:[]},chatBusy:false};
 const app=createApprovedAssistant({state,getDisplayName:()=>'<小林>'});
 const greetings=[],placeholders=[],questions=[];
 for(const [mode,label] of [['book','咨询'],['finance','规划'],['trader','投研']]){
  state.mode=mode;const html=app.pageHTML();
  assert.match(html,new RegExp(`data-mode="${mode}" aria-selected="true"`));
  assert(html.includes(`aria-label="${label}常见问题"`));
  assert(html.includes('&lt;小林&gt;，你好'));assert(!html.includes('David'));
  greetings.push(html.match(/ap-assistant-greeting"><h2>[^<]*<\/h2><p>([^<]+)/)[1]);
  placeholders.push(html.match(/placeholder="([^"]+)"/)[1]);
  const values=[...html.matchAll(/data-action="ap-assistant-suggest" data-mode="([^"]+)" data-value="([^"]+)"/g)];
  assert.equal(values.length,3);assert(values.every(value=>value[1]===mode));questions.push(...values.map(value=>value[2]));
  assert(!html.includes('ap-assistant-answer'));assert(!html.includes('ap-assistant-skeleton'));
 }
 assert.equal(new Set(greetings).size,3);assert.equal(new Set(placeholders).size,3);assert.equal(new Set(questions).size,9);
 assert(questions.includes('本月一共花了多少钱？'));
 assert(questions.some(question=>question.includes('存下3万元')));
 assert(questions.some(question=>question.includes('市盈率')));
});

test('mode switches reset context, preserve owned chats and block active or stale actions',()=>{
 const chats={book:[{role:'user',content:'咨询记录'}],finance:[{role:'assistant',content:'规划记录'}],trader:[{role:'user',content:'投研记录'}]};
 const state={mode:'book',chats,chatBusy:false,chatDraft:'旧输入',chatContext:{stock:'old'},chatLedgerRange:{start:'old'},chatReading:true};let renders=0;
 const app=createApprovedAssistant({state,render:()=>renders++});
 app.actions['ap-assistant-mode']({dataset:{mode:'finance'}});
 assert.equal(state.mode,'finance');assert.equal(renders,1);assert.equal(state.chatDraft,'');assert.equal(state.chatContext,null);assert.equal(state.chatLedgerRange,null);assert.equal(state.chatReading,false);assert.equal(state.chats,chats);
 const root={innerHTML:'',dataset:{}};app.renderMessages(root);
 assert(root.innerHTML.includes('规划记录'));assert(!root.innerHTML.includes('咨询记录'));assert(!root.innerHTML.includes('投研记录'));
 state.chatBusy=true;app.actions['ap-assistant-mode']({dataset:{mode:'trader'}});
 assert.equal(state.mode,'finance');assert.equal(renders,1);
 state.chatBusy=false;app.actions['ap-assistant-suggest']({dataset:{mode:'book',value:'本月一共花了多少钱？'}});
 assert.equal(state.chatDraft,'');app.actions['ap-assistant-mode']({dataset:{mode:'unknown'}});assert.equal(state.mode,'finance');
 app.actions['ap-assistant-mode']({dataset:{mode:'trader'}});app.renderMessages(root);
 assert(root.innerHTML.includes('投研记录'));assert(!root.innerHTML.includes('规划记录'));assert.equal(renders,2);
});

test('busy completion unlocks tabs and clears skeleton without leaving greeting residue',()=>{
 const state={mode:'book',chats:{book:[]},chatBusy:true};const app=createApprovedAssistant({state});
 const tabs=['book','finance','trader'].map(mode=>({dataset:{mode},disabled:false,attributes:{},setAttribute(key,value){this.attributes[key]=value;}}));
 const suggestions={hidden:false,innerHTML:'old',setAttribute(){}};const input={placeholder:''};
 const page={dataset:{},querySelectorAll:()=>tabs,querySelector:selector=>selector==='.ap-assistant-suggestions'?suggestions:selector==='#chat-input'?input:null};
 const root={innerHTML:'',dataset:{},closest:()=>page,scrollHeight:100};
 app.renderMessages(root);assert(tabs.every(tab=>tab.disabled));assert(suggestions.hidden);assert(root.innerHTML.includes('ap-assistant-skeleton'));
 state.chatBusy=false;app.renderMessages(root);
 assert(tabs.every(tab=>!tab.disabled));assert.equal(tabs[0].attributes['aria-selected'],'true');assert.equal(tabs[1].attributes['aria-selected'],'false');
 assert.equal(root.dataset.empty,'true');assert(root.innerHTML.includes('ap-assistant-greeting'));assert(!root.innerHTML.includes('ap-assistant-skeleton'));assert(!root.innerHTML.includes('greeting-exit'));
 assert(!suggestions.hidden);assert.equal((suggestions.innerHTML.match(/ap-assistant-suggest/g)||[]).length,3);assert.equal(input.placeholder,'问问收支和消费习惯');
 state.chats.book.push({role:'assistant',content:'真实响应'});app.renderMessages(root);
 assert.equal(root.dataset.empty,'false');assert(suggestions.hidden);assert(!root.innerHTML.includes('ap-assistant-greeting'));assert(root.innerHTML.includes('真实响应'));
});
