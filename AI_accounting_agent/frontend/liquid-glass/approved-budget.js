import {categoryIconKey} from './category-icons.js';

// Calibrated Stitch derivative: handoff-next/pages/budget.html,
// SHA256 cddacc253807c5f142affa3cabce9624b9b13600522e0caf78722e20ea2315b0.
// Glass illustration and unset arc retain that source. Values use the same
// analysis DTO as overview/trends; only the separate budget configuration writes.
const EXPENSE_CATEGORIES=['餐饮','出行','购物','生活缴费','娱乐','住房','医疗健康','教育学习','保险','人情往来','旅行','其他'];
const ARC='M24 128 C-5 72 30 18 80 18 C130 18 165 72 136 128';
const TARGET='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="13" r="9"/><circle cx="11" cy="13" r="5"/><circle cx="11" cy="13" r="1"/><path d="m12 12 8-8m-1-2v3h3"/></svg>';
const GLASS_DOCUMENT=`<svg fill="none" viewBox="0 0 145 165" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient gradientUnits="userSpaceOnUse" id="ap-b-plate" x1="10" x2="135" y1="130" y2="130"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#D7E6FF" stop-opacity=".3"/><stop offset="1" stop-color="#A5C7FF" stop-opacity=".75"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="ap-b-sheet" x1="45" x2="115" y1="20" y2="135"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#EAF2FF" stop-opacity=".75"/><stop offset="1" stop-color="#C7DDFF" stop-opacity=".5"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="ap-b-back" x1="75" x2="130" y1="35" y2="120"><stop stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#B2D0FF" stop-opacity=".35"/></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="ap-b-disc" x1="90" x2="140" y1="75" y2="125"><stop stop-color="#fff" stop-opacity=".98"/><stop offset="1" stop-color="#B7D4FF" stop-opacity=".7"/></linearGradient><filter id="ap-b-glow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" flood-color="#4F7DE8" flood-opacity=".18" stdDeviation="6"/></filter></defs><ellipse cx="78" cy="132" rx="55" ry="15" fill="url(#ap-b-plate)" stroke="#fff" stroke-width=".75"/><rect x="70" y="38" width="48" height="74" rx="8" fill="url(#ap-b-back)" stroke="rgba(255,255,255,.85)" stroke-width=".75" transform="rotate(10 70 38)"/><g filter="url(#ap-b-glow)"><rect x="36" y="24" width="62" height="88" rx="10" fill="url(#ap-b-sheet)" stroke="#fff"/><rect x="46" y="38" width="34" height="4" rx="2" fill="#ADC9F7" fill-opacity=".8"/><rect x="46" y="47" width="22" height="3.5" rx="1.75" fill="#C5DAFC" fill-opacity=".8"/><rect x="52" y="70" width="4" height="18" rx="2" fill="#99BCF6"/><rect x="60" y="62" width="4" height="26" rx="2" fill="#75A4F5"/><rect x="68" y="56" width="4" height="32" rx="2" fill="#5A90F5"/></g><g filter="url(#ap-b-glow)" transform="translate(10 8)"><circle cx="106" cy="94" r="18" fill="url(#ap-b-disc)" stroke="#fff" stroke-width="1.2"/><circle cx="106" cy="94" r="12" stroke="#3772FF" stroke-dasharray="5 2.5" stroke-width="1.6"/><circle cx="106" cy="94" r="6" stroke="#2563EB" stroke-width="1.6"/><circle cx="106" cy="94" r="2.2" fill="#1D4ED8"/><path d="m116 84-6 6" stroke="#2563EB" stroke-linecap="round" stroke-width="1.6"/></g></svg>`;

export function budgetMinor(value){
 const text=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('金额最多保留两位小数');
 const [whole,fraction='']=text.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor))throw new Error('金额超出可保存范围');
 return minor;
}
export function budgetPayload(values,revision,requestId){
 const total_minor=budgetMinor(values.total);
 if(total_minor<=0)throw new Error('总预算须大于零');
 const categories=(values.categories||[]).filter(row=>String(row.value??'').trim()!=='').map(row=>({category:row.category,limit_minor:budgetMinor(row.value)}));
 if(new Set(categories.map(row=>row.category)).size!==categories.length)throw new Error('分类不能重复');
 if(categories.reduce((n,row)=>n+row.limit_minor,0)>total_minor)throw new Error('分类预算合计不能超过总预算');
 if(!Number.isSafeInteger(revision)||revision<0)throw new Error('请重新读取预算');
 return {total_minor,categories,expected_revision:revision,request_id:requestId};
}
export function budgetModel(d,budget){
 const month=d?.period?.start_date?.slice(0,7)||'';
 const ready=Boolean(budget&&budget.month===month&&['set','unset'].includes(budget.status));
 const configured=ready&&budget.status==='set'&&Number.isSafeInteger(budget.total_minor)&&budget.total_minor>0;
 const spent=Number.isSafeInteger(d?.totals?.gross_expense_minor)?d.totals.gross_expense_minor:0;
 const byCategory=new Map((d?.expense_categories||[]).map(row=>[row.category,row.amount_minor]));
 const limits=new Map(configured?(budget.categories||[]).map(row=>[row.category,row.limit_minor]):[]);
 const names=[...new Set([...byCategory.keys(),...limits.keys()])];
 return {month,ready,configured,spent,total:configured?budget.total_minor:null,remaining:configured?budget.total_minor-spent:null,ratio:configured?Math.max(0,Math.min(1,spent/budget.total_minor)):null,categories:names.map(category=>({category,spent:byCategory.get(category)||0,limit:limits.has(category)?limits.get(category):null}))};
}

export function createApprovedBudget(ctx){
 const {state,prefs,money,esc,icon,finance,modal,closeSheet,render,storage}=ctx;
 const cash=minor=>prefs.mask?'••••':money(Number.isSafeInteger(minor)?minor/100:NaN,'CNY');
 const amount=minor=>Number.isSafeInteger(minor)?(minor/100).toFixed(2):'';
 const button=(label,action,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
 const id=()=>globalThis.crypto?.randomUUID?.()||`budget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 let current=null,busy=false,attempt=storage?.get?.('finpilot-budget-pending-v1',null)||null;
 // An outstanding request is kept immutable, including across a page reload.
 if(attempt&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(attempt.month)||typeof attempt.payload?.request_id!=='string'||!Number.isSafeInteger(attempt.payload?.total_minor)))attempt=null;
 const remember=value=>{attempt=value;storage?.set?.('finpilot-budget-pending-v1',value);};
 const endpoint=month=>'/budget?'+new URLSearchParams({month});
 const sheetCurrent=token=>token===undefined||ctx.getSheetGeneration?.()===token;
 function setContext(d,budget){current={d,budget,model:budgetModel(d,budget)};}
 function tabs(){return `<div class="ap-o-tabs" role="tablist" aria-label="图表视图">${[['composition','概览'],['trend','趋势'],['budget','预算']].map(([value,label])=>`<button type="button" role="tab" data-action="pa-tab" data-value="${value}" aria-selected="${value==='budget'}">${label}</button>`).join('')}</div>`;}
 function html(d,budget,{loading=false,error=null}={}){
  setContext(d,budget);const m=current.model;
  const unavailable=loading||!m.ready;
  const gaugeText=error?'暂不可用':loading||!m.ready?'读取中':m.configured?(m.remaining<0?'超出预算':'剩余预算'):'未设置';
  const gauge=`<div class="ap-b-gauge" role="img" aria-label="${esc(prefs.mask?'金额已隐藏':m.configured?`${gaugeText} ${cash(Math.abs(m.remaining))}`:gaugeText)}"><svg viewBox="0 0 160 160" aria-hidden="true"><path d="${ARC}" pathLength="100" class="ap-b-arc"/>${m.configured&&!prefs.mask?`<path d="${ARC}" pathLength="100" class="ap-b-progress ${m.remaining<0?'is-over':''}" stroke-dasharray="${m.ratio*100} 100"/>`:''}</svg><div class="ap-b-gauge-copy">${TARGET}<span>${gaugeText}</span>${m.configured?`<strong>${cash(Math.abs(m.remaining))}</strong>`:''}</div></div>`;
  const categories=m.categories.map(row=>`<div class="ap-b-category"><span class="ap-b-category-icon">${icon(categoryIconKey(row.category))}</span><div class="ap-b-category-content"><div><span>${esc(row.category)}</span><strong>${cash(row.spent)}</strong></div><div class="ap-b-track" ${row.limit!==null&&row.limit>0&&!prefs.mask?`role="progressbar" aria-label="${esc(row.category)}预算使用" aria-valuemin="0" aria-valuemax="${row.limit}" aria-valuenow="${Math.min(row.limit,row.spent)}"`:'aria-hidden="true"'}>${row.limit>0&&!prefs.mask?`<i class="${row.spent>row.limit?'is-over':''}" style="width:${Math.max(0,Math.min(100,row.spent/row.limit*100))}%"></i>`:''}</div>${row.limit!==null?`<small>预算 ${cash(row.limit)}</small>`:''}</div></div>`).join('');
  return `<div class="ap-budget">${tabs()}<section class="ap-b-card ap-b-monthly"><div class="ap-b-top"><h2>月度预算</h2><div class="ap-b-visual">${gauge}<div class="ap-b-document" aria-hidden="true">${GLASS_DOCUMENT}</div></div></div><div class="ap-b-footer"><div><span>本月已支出</span><strong>${cash(m.spent)}</strong></div>${unavailable?button(loading?'读取中':'重新读取','ap-budget-reload',loading?'disabled aria-disabled="true"':''):button('设置预算 '+icon('next'),'ap-budget-edit','class="ap-b-primary"')}</div>${error?'<p class="ap-b-error" role="alert">预算暂时无法读取</p>':''}</section><section class="ap-b-card ap-b-categories"><h2>分类预算</h2>${categories||'<p class="ap-b-empty">暂无支出分类</p>'}</section></div>`;
 }
 async function changed(budget){if(current&&budget.month===current.model.month)setContext(current.d,budget);if(ctx.onBudgetChanged)await ctx.onBudgetChanged(budget);else await render?.();}
 const message=(text,recovery=false)=>{const node=document.querySelector('#ap-budget-error');if(node)node.innerHTML=`<p role="alert">${esc(text)}</p>${recovery?button('核实保存','ap-budget-recover','class="ap-b-primary"'):''}`;};
 function formValues(form){return {total:form.elements.namedItem('total').value,categories:[...form.querySelectorAll('[data-budget-category]')].map(input=>({category:input.dataset.budgetCategory,value:input.value}))};}
 function formHTML(budget,draft=null,notice=''){
  const m=current.model,limits=new Map((budget.categories||[]).map(row=>[row.category,row.limit_minor]));
  const names=[...new Set([...m.categories.map(row=>row.category),...limits.keys(),...EXPENSE_CATEGORIES])];
  const draftMap=draft&&new Map(draft.categories.map(row=>[row.category,row.value]));
  const field=category=>`<label class="ap-b-edit-category"><span>${icon(categoryIconKey(category))}${esc(category)}</span><input name="category" type="text" inputmode="decimal" autocomplete="off" data-budget-category="${esc(category)}" aria-label="${esc(category)}预算（元）" value="${esc(draftMap?.get(category)??amount(limits.get(category)))}" placeholder="未设置"></label>`;
  const first=names.filter(name=>m.categories.some(row=>row.category===name)||limits.has(name)),more=names.filter(name=>!first.includes(name));
  return `<form id="ap-budget-form" class="ap-b-form" data-month="${esc(budget.month)}" data-revision="${budget.revision}"><label class="ap-b-total-label">总预算（元）<input name="total" type="text" inputmode="decimal" autocomplete="off" required value="${esc(draft?.total??amount(budget.total_minor))}" placeholder="0.00"></label><fieldset><legend>分类预算</legend>${first.map(field).join('')}${more.length?`<details ${!first.length?'open':''}><summary>${first.length?'其他分类':'选择分类'}</summary>${more.map(field).join('')}</details>`:''}</fieldset><div id="ap-budget-error" class="ap-b-form-error">${notice?`<p role="alert">${esc(notice)}</p>`:''}</div><div class="ap-b-form-actions">${button('取消','close-sheet')}<button type="submit" class="ap-b-primary">保存预算</button></div></form>`;
 }
 function recoverySheet(){modal('保存待核实',`<div class="ap-b-recovery"><p>${esc(attempt.month)} 预算</p><strong>${cash(attempt.payload.total_minor)}</strong><div id="ap-budget-error" class="ap-b-form-error"></div>${button('核实保存','ap-budget-recover','class="ap-b-primary"')}</div>`);}
 async function openEditor(){
  if(busy||!current)return;
  if(attempt){recoverySheet();return;}
  const month=current.model.month;busy=true;modal('设置预算','<div class="ap-b-form" role="status">读取中</div>');const sheet=ctx.getSheetGeneration?.();
  try{const budget=await finance(endpoint(month));if(current?.model.month!==month||!sheetCurrent(sheet))return;setContext(current.d,budget);modal('设置预算',formHTML(budget));}
  catch{if(sheetCurrent(sheet))modal('设置预算',`<div class="ap-b-form"><p role="alert">预算暂时无法读取</p>${button('重新读取','ap-budget-edit')}</div>`);}
  finally{busy=false;}
 }
 async function complete(result,month,sheet){
  remember(null);if(sheetCurrent(sheet))closeSheet();
  try{await changed(result);}catch{ctx.toast?.('预算已保存，刷新后查看');}
  // The immutable retry result may be older than a subsequent edit. Display the
  // latest GET, rather than overwriting it with that older idempotency receipt.
  try{const latest=await finance(endpoint(month));await changed(latest);}catch{}
 }
 async function recover(){
  if(busy||!attempt)return;busy=true;const saved=attempt,sheet=ctx.getSheetGeneration?.();
  const controls=document.querySelectorAll('[data-action="ap-budget-recover"]');controls.forEach(node=>node.disabled=true);
  try{const result=await finance(endpoint(saved.month),{method:'PUT',body:saved.payload});await complete(result,saved.month,sheet);}
  catch(error){if(error.status){remember(null);if(sheetCurrent(sheet)){message(error.status===409?'预算已变化，请重新读取核对':'暂时无法保存，请重新读取');const node=document.querySelector('#ap-budget-error');if(node)node.insertAdjacentHTML('beforeend',button('重新读取','ap-budget-edit'));}}else if(sheetCurrent(sheet))message('保存结果暂未确认，请再次核实',false);}
  finally{busy=false;controls.forEach(node=>{if(node.isConnected)node.disabled=false;});}
 }
 async function onSubmit(event){
  const form=event.target;if(form?.id!=='ap-budget-form')return;event.preventDefault();if(busy||attempt)return;
  const values=formValues(form),month=form.dataset.month,sheet=ctx.getSheetGeneration?.();let payload;
  try{payload=budgetPayload(values,Number(form.dataset.revision),id());}catch(error){message(error.message);return;}
  remember({month,payload});busy=true;const controls=[...form.querySelectorAll('input,button,summary')];controls.forEach(node=>{if('disabled' in node)node.disabled=true;});
  try{const result=await finance(endpoint(month),{method:'PUT',body:payload});await complete(result,month,sheet);}
  catch(error){
   if(error.status===409){remember(null);try{const latest=await finance(endpoint(month));if(current?.model.month===month)setContext(current.d,latest);if(sheetCurrent(sheet))modal('设置预算',formHTML(latest,values,'预算已更新，核对后再保存'));}catch{if(sheetCurrent(sheet)){message('预算已变化，请重新读取核对');const node=document.querySelector('#ap-budget-error');if(node)node.insertAdjacentHTML('beforeend',button('重新读取','ap-budget-edit'));}}}
   else if(error.status){remember(null);if(sheetCurrent(sheet))message(error.status===422?'请核对预算金额':'暂时无法保存，请稍后重试');}
   else if(sheetCurrent(sheet)){message('保存结果暂未确认，请先核实',true);controls.forEach(node=>{if(node.type==='submit')node.hidden=true;});}
  }finally{busy=false;if(!attempt)controls.forEach(node=>{if('disabled' in node&&node.isConnected)node.disabled=false;});}
 }
 async function reload(){if(busy||!current)return;busy=true;try{const result=await finance(endpoint(current.model.month));await changed(result);}catch{ctx.toast?.('预算暂时无法读取');}finally{busy=false;}}
 return {html,setContext,onSubmit,actions:{'ap-budget-edit':openEditor,'ap-budget-recover':recover,'ap-budget-reload':reload}};
}
