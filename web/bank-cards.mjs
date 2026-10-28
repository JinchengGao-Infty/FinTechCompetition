// R7 rc2: vertical stack adapted from actual Stitch screen
// cfabf0e622c94fdb803bbf33f8abd14c. Data/events are our local adapter;
// invented issuers/yields/products in the generated preview are not used.
export const DEMO_BANK_CARDS=Object.freeze([
 Object.freeze({id:'salary',name:'工资卡',tail:'0826',type:'借记卡',purpose:'工资入账'}),
 Object.freeze({id:'living',name:'生活卡',tail:'1608',type:'借记卡',purpose:'日常支出'}),
 Object.freeze({id:'credit',name:'信用卡',tail:'0921',type:'信用卡',purpose:'本期账单',dueMinor:128000,limitMinor:2000000,dueDate:'2026-11-18'})
]);
export function bankCardState(state,id){
 const card=DEMO_BANK_CARDS.find(c=>c.id===id);if(!card)throw Error('卡片不存在');
 const saved=state.bankCards?.[id]||{};
 return {...card,paused:id==='living'?!!state.cardLocked:!!saved.paused,reminder:saved.reminder!==false};
}
export function setCardPaused(state,id,paused,{expected}={}){
 const current=bankCardState(state,id);if(typeof paused!=='boolean')throw Error('卡片状态无效');
 if(current.paused===paused)return current;
 if(expected!==undefined&&current.paused!==expected)throw Error('卡片状态已变化，请重新核对');
 state.bankCards||={};state.bankCards[id]||={};
 if(id==='living')state.cardLocked=paused;else state.bankCards[id].paused=paused;
 return bankCardState(state,id);
}
export function setCardReminder(state,id,value){if(id!=='credit'||typeof value!=='boolean')throw Error('提醒设置无效');state.bankCards||={};state.bankCards[id]||={};state.bankCards[id].reminder=value;return bankCardState(state,id);}

const CHIP='<svg viewBox="0 0 30 24" fill="none" aria-hidden="true"><rect x="1" y="1" width="28" height="22" rx="5"/><path d="M10 1v22M20 1v22M1 8h9m10 0h9M1 16h9m10 0h9M10 12h10"/></svg>';
export function createBankCards({getState,save,esc,money,icon,onLedger}){
 let selected='salary',expanded=false,pending=null;
 const amount=n=>money(n/100),card=()=>bankCardState(getState(),selected);
 function details(){const c=card();return `<div class="bank-card-details" id="bank-card-details"><dl>${c.type==='信用卡'?`<div><dt>本期待还</dt><dd class="money">${amount(c.dueMinor)}</dd></div><div><dt>还款日</dt><dd>11月18日</dd></div><div><dt>信用额度</dt><dd class="money">${amount(c.limitMinor)}</dd></div>`:`<div><dt>用途</dt><dd>${esc(c.purpose)}</dd></div>`}<div><dt>卡片消费</dt><dd>${c.paused?'已暂停':'使用中'}</dd></div></dl>${c.type==='信用卡'?`<div class="bank-card-reminder"><span>还款提醒</span><button type="button" role="switch" aria-checked="${c.reminder}" aria-label="还款提醒" data-action="bank-card-reminder" class="toggle ${c.reminder?'on':''}"></button></div>`:''}${pending?`<div class="bank-card-confirm"><p>${pending.paused?'暂停':'恢复'}${esc(c.name)}的卡片消费？</p><div><button type="button" class="ap-w-button ap-w-primary" data-action="bank-card-confirm" data-card="${c.id}" data-version="${pending.id}">确认${pending.paused?'暂停':'恢复'}</button><button type="button" class="ap-w-button" data-action="bank-card-cancel">取消</button></div></div>`:`<div class="bank-card-actions"><button type="button" class="ap-w-button" data-action="bank-card-pause">${c.paused?'恢复卡片消费':'暂停卡片消费'}</button><button type="button" class="ap-w-button" data-action="bank-card-ledger">查看明细</button></div>`}</div>`;}
 function html(){const c=card(),order=[...DEMO_BANK_CARDS.filter(row=>row.id!==selected),c];
  const candles='<svg class="bank-candle-texture" viewBox="0 0 320 200" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M90 162v-40m25 24V99m25 36V84m25 35V65m25 42V43m25 49V28m25 56V15"/><path stroke-width="6" d="M90 151v-18m25 2v-24m25 11V96m25 12V78m25 17V56m25 24V42m25 29V29"/></g></svg>';
  return `<section class="bank-cards" aria-labelledby="bank-cards-title"><div class="bank-cards-heading"><h2 id="bank-cards-title">银行卡</h2><span>${DEMO_BANK_CARDS.length}张</span></div><div class="bank-wallet-stack" role="group" aria-label="选择银行卡">${order.map((row,i)=>{const front=i===2;return `<div class="bank-wallet-layer" style="--stack-index:${i}"><div class="bank-card-face bank-card-${row.id}${front?' is-front':''}" data-card="${row.id}">${front?`<canvas class="bank-metal-canvas" aria-hidden="true"></canvas>${candles}<button type="button" class="bank-card-foreground" data-action="bank-card-details" data-card="${row.id}" aria-expanded="${expanded}" aria-controls="bank-card-details" aria-label="${expanded?'收起':'展开'}${row.name} 尾号${row.tail}详情"><span class="bank-card-top"><span>${icon('card')}<strong>${esc(row.name)}</strong>${row.type===row.name?'':`<small>${row.type}</small>`}</span><i class="bank-chip">${CHIP}</i></span><span class="bank-card-digits">•••• •••• •••• <strong>${row.tail}</strong></span><span class="bank-card-bottom"><span>${row.paused?'已暂停':'使用中'}${icon(expanded?'down':'next')}</span><b class="bank-network">${row.id==='salary'?'VISA':esc(row.type)}</b></span></button>`:`<button type="button" class="bank-card-tab" data-action="bank-card-select" data-card="${row.id}" aria-label="${row.name} 尾号${row.tail}"><strong>${esc(row.name)}</strong><span>•••• ${row.tail}</span>${icon('down')}</button>`}</div></div>`;}).join('')}</div>${expanded?details():'<div id="bank-card-details" hidden></div>'}</section>`;
 }
 function paint(){const el=document.querySelector('.bank-cards');if(!el)return;const active=el.contains(document.activeElement)?document.activeElement.dataset:null;const old=active?{...active}:null;el.outerHTML=html();if(old){const buttons=[...document.querySelectorAll('.bank-cards button')],next=buttons.find(b=>b.dataset.action===old.action&&(!old.card||b.dataset.card===old.card))||document.querySelector('.bank-card-foreground');next?.focus({preventScroll:true});}}
 return {html,actions:{
  'bank-card-select':el=>{if(!DEMO_BANK_CARDS.some(c=>c.id===el.dataset.card))return;selected=el.dataset.card;expanded=true;pending=null;paint();},
  'bank-card-details':()=>{expanded=!expanded;pending=null;paint();},
  'bank-card-pause':()=>{const c=card();pending={id:crypto.randomUUID(),card:c.id,expected:c.paused,paused:!c.paused};paint();},
  'bank-card-cancel':()=>{pending=null;paint();},
  'bank-card-confirm':el=>{if(!pending||pending.id!==el.dataset.version||pending.card!==selected||el.dataset.card!==selected)return;setCardPaused(getState(),selected,pending.paused,{expected:pending.expected});save();pending=null;paint();},
  'bank-card-reminder':()=>{const c=card();setCardReminder(getState(),selected,!c.reminder);save();paint();},
  'bank-card-ledger':()=>onLedger(card())
 }};
}
