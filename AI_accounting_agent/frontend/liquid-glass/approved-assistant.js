// Final answer calibration SHA256 11c34972db1be4ad64ef75de95c18b70118e3d7c7b93ba7de034ac90e52d8486.
export function createAssistantResponseGuard(){let current=null;return {begin(requestId,mode){current={requestId,mode};return current;},accept(token){return !!token&&token===current;},cancel(token){if(token===current)current=null;}};}
// Adapter source: Stitch R2 screen 0f1d5305a55347e4a821e0280363111a.
// Native code.html SHA256 65b5ce81e5f99568b3ad039d5335383ae2a3c9f878baa409ad2553b34fd840e6.
// Native exports stay unchanged. No prototype scripts, timers or execution cards.
export function createApprovedAssistant(ctx){
 const {state,prefs={},icon=()=>'',getDisplayName=()=>'',modal}=ctx;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const modes={book:'咨询',finance:'规划',trader:'投研'};
 const presets={
  book:{greeting:'一起看看这月的钱花在哪。',placeholder:'问问收支和消费习惯',questions:['本月一共花了多少钱？','对比上月，我的支出有哪些变化？','怎样减少不必要的日常开支？']},
  finance:{greeting:'让下一步的目标更清晰。',placeholder:'聊聊你的目标和预算',questions:['我想一年存下3万元，怎么安排？','应急备用金应该准备多少？','如何平衡还贷、储蓄和日常预算？']},
  trader:{greeting:'从数据出发，看懂投资机会。',placeholder:'聊聊股票、研报和风险',questions:['读一份研报，应该先看哪些指标？','市盈率和现金流该怎样一起看？','如何评估持仓过于集中的风险？']}
 };
 const currentPreset=()=>presets[state.mode]||presets.book;
 const messages=()=>(state.chats?.[state.mode]||[]).filter(m=>!m.stale&&!m.discarded&&(ctx.shouldDisplayMessage?ctx.shouldDisplayMessage(m,state.mode):true));
 const text=m=>prefs.mask?'内容已隐藏':String(m.content||'');
 function greeting(){const name=String(getDisplayName()||'').trim();return `<div class="ap-assistant-greeting"><h2>${name?esc(name)+'，你好':'你好'}</h2><p>${currentPreset().greeting}</p></div>`;}
 const avatar=role=>`<span class="ap-assistant-avatar ap-assistant-avatar-${role}" aria-hidden="true">${role==='user'?'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M5 21v-3a7 7 0 0 1 14 0v3Z"/></svg>':'<i></i>'}</span>`;
 function messagesHTML(){return messages().map(m=>{
  const role=m.role==='user'?'user':'answer';
  const content=m.stopped?'已停止':m.failed?(m.content?text(m):'暂时无法回答'):text(m);
  return `<article class="ap-assistant-message ap-assistant-${role}" ${m.failed?'role="alert"':''}>${role==='answer'?avatar('assistant'):''}<div class="ap-assistant-bubble">${esc(content).replaceAll('\n','<br>')}</div>${role==='user'?avatar('user'):''}</article>`;
 }).join('')+(state.chatBusy?`<article class="ap-assistant-pending">${avatar('assistant')}<div class="ap-assistant-generating" role="status"><div><strong>生成中</strong><button type="button" data-action="stop-chat">取消</button></div><div class="ap-assistant-skeleton" aria-hidden="true"><span></span><span></span><span></span><div><i></i><span></span></div><div><i></i><span></span></div></div></div></article>`:'');}

 function historyHTML(){return `<section class="ap-assistant-history">${messages().length?messages().map(m=>`<article><strong>${m.role==='user'?'你':'助手'}</strong><p>${esc(m.stopped?'已停止':text(m))}</p></article>`).join(''):'<p>暂无会话记录</p>'}</section>`;}
 function suggestionsHTML(){return currentPreset().questions.map(v=>`<button type="button" data-action="ap-assistant-suggest" data-mode="${esc(state.mode)}" data-value="${esc(v)}"><span>${esc(v)}</span>${icon('next')}</button>`).join('');}
 function pageHTML(){const hasContent=!!messages().length||state.chatBusy;return `<section class="ap-assistant" data-mode="${esc(state.mode)}"><div class="ap-assistant-modes" role="tablist" aria-label="助手模式">${Object.entries(modes).map(([key,label])=>`<button type="button" role="tab" data-action="ap-assistant-mode" data-mode="${key}" aria-selected="${state.mode===key}" ${state.chatBusy?'disabled':''}>${label}</button>`).join('')}</div><div id="chat-messages" class="ap-assistant-messages" data-empty="${!hasContent}" aria-live="polite">${hasContent?messagesHTML():greeting()}</div><div class="ap-assistant-bottom"><div class="ap-assistant-suggestions" aria-label="${modes[state.mode]||modes.book}常见问题" ${hasContent?'hidden':''}>${suggestionsHTML()}</div><form id="chat-form" class="ap-assistant-composer"><input id="chat-input" aria-label="写下你的问题" placeholder="${currentPreset().placeholder}" value="${esc(state.chatDraft||'')}" autocomplete="off"><button id="chat-submit" type="submit" aria-label="发送" ${state.chatBusy?'disabled':''}>↑</button></form></div></section>`;}
 function renderMessages(root){
  if(!root)return;
  const hasContent=!!messages().length||state.chatBusy;
  root.innerHTML=hasContent?messagesHTML():greeting();
  root.dataset.empty=String(!hasContent);
  const page=root.closest?.('.ap-assistant');
  if(page){
   page.dataset.mode=state.mode;
   page.querySelectorAll('.ap-assistant-modes button').forEach(button=>{button.disabled=!!state.chatBusy;button.setAttribute('aria-selected',String(button.dataset.mode===state.mode));});
   const suggestions=page.querySelector('.ap-assistant-suggestions');
   if(suggestions){suggestions.hidden=hasContent;suggestions.innerHTML=hasContent?'':suggestionsHTML();suggestions.setAttribute('aria-label',(modes[state.mode]||modes.book)+'常见问题');}
   const input=page.querySelector('#chat-input');
   if(input)input.placeholder=currentPreset().placeholder;
  }
  // Scroll only the message viewport; never move the shared header or composer.
  if(hasContent)root.scrollTop=root.scrollHeight;
 }

 const actions={
  'ap-assistant-mode':button=>{const mode=button.dataset.mode;if(state.chatBusy||!modes[mode]||mode===state.mode)return;state.mode=mode;state.chatDraft='';state.chatContext=null;state.chatLedgerRange=null;state.chatReading=false;ctx.render?.();},
  'ap-assistant-suggest':button=>{if(state.chatBusy||button.dataset.mode!==state.mode||!currentPreset().questions.includes(button.dataset.value))return;state.chatDraft=button.dataset.value;state.chatContext=null;const input=document.querySelector('#chat-input');if(input){input.value=state.chatDraft;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}},
  'ap-assistant-history':()=>modal?.('会话历史',historyHTML())
 };
 return {pageHTML,renderMessages,historyHTML,actions};
}
