import {createApprovedRisk} from './baseline/approved-risk.js';

export function riskSummary(p,{esc,money}){
 const amount=n=>n===null?'—':money(n/100),buffer=p.bufferMonths===null?'—':p.bufferMonths.toFixed(1)+'个月';
 return `<div class="risk-profile-result"><div class="risk-level-hero"><small>风险承受建议</small><strong>${esc(p.label)}</strong><p>${p.ready?'依据本机收支与持仓':'资料不足，暂不给出等级'}</p></div><div class="risk-key-facts"><span>现金缓冲<strong>${buffer}</strong></span><span>完整账期<strong>${p.months}个月</strong></span></div><details class="risk-evidence"><summary>分析依据</summary><dl class="risk-profile-facts"><div><dt>月均收入</dt><dd>${amount(p.incomeMinor)}</dd></div><div><dt>月均支出</dt><dd>${amount(p.expenseMinor)}</dd></div><div><dt>已知卡账单</dt><dd>${amount(p.knownDebtMinor)}</dd></div><div><dt>月均净结余</dt><dd>${amount(p.surplusMinor)}</dd></div>${p.concentration!==null?`<div><dt>最大单一持仓</dt><dd>${(p.concentration*100).toFixed(1)}%</dd></div>`:''}</dl><p>${!p.ready?'收支月份、收入或现金资料不足。':p.surplusMinor<=0?'历史结余不足，应优先保留现金。':p.bufferMonths<3?'现金缓冲较少，优先保持资金灵活。':p.concentration>.6?'现金与结余有缓冲，但单一持仓集中。':'结合现金缓冲和历史结余给出初步承受范围。'}</p><p>完成 ${p.behaviour.completed} 项，取消 ${p.behaviour.cancelled} 项，证券买卖 ${p.behaviour.paperTrades} 次。操作记录不等于投资偏好。</p></details><p class="risk-profile-limit">偏好及其他负债未确认。初步建议，不保证收益。</p><small class="risk-snapshot">演示账期 ${esc(p.period?.join(' 至 ')||'待完善')}<br>演示快照 ${esc(p.asOf)}</small><button type="button" class="primary full" data-action="close-sheet">完成</button></div>`;
}
export function createRiskExperience({modal,closeSheet,profile,prepare,onClose,esc,money,reduced=()=>false}){
 let generation=0,view=null,controller=null,focus=null,blocked=[],timer=null,resolveWait=null;
 const dispose=()=>{generation++;clearTimeout(timer);resolveWait?.();resolveWait=null;controller?.dispose();controller=null;view?.remove();view=null;for(const [el,inert] of blocked)el.inert=inert;blocked=[];if(focus?.isConnected)focus.focus({preventScroll:true});focus=null;};
 async function open(){
  dispose();closeSheet();const current=generation;
  controller=createApprovedRisk({prefs:{reduceMotion:reduced()}});
  focus=document.activeElement;
  blocked=[...document.querySelectorAll('#app,#overlay')].map(el=>[el,el.inert]);for(const [el] of blocked)el.inert=true;
  view=document.createElement('div');view.id='investment-risk-view';view.setAttribute('role','dialog');view.setAttribute('aria-modal','true');view.setAttribute('aria-label','风险分析');
  view.innerHTML=controller.html({status:'pending'});document.body.append(view);
  const finish=()=>{dispose();onClose?.();};
  const result=()=>{const p=profile();dispose();modal('风险分析',riskSummary(p,{esc,money}));};
  controller.mount(view.querySelector('.ap-risk'),{status:'pending',onCancel:finish,onBack:finish,onResult:result});
  view.querySelector('button').focus();
  view.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish();}if(e.key==='Tab'){const buttons=[...view.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  // User-requested four-second presentation; local data never leaves the device.
  const duration=new Promise(resolve=>{resolveWait=resolve;timer=setTimeout(resolve,4000);});
  try{await Promise.all([prepare?.(),duration]);if(current!==generation)return;clearTimeout(timer);resolveWait=null;result();}catch{if(current===generation){clearTimeout(timer);resolveWait=null;controller.setState({status:'error'});}}

 }
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(view)view.hidden=document.hidden;});
 if(typeof window!=='undefined')window.addEventListener('hashchange',dispose);
 return {open,dispose};
}
