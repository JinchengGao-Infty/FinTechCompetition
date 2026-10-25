import {marketCandles} from './market-candles.js';
import {CATEGORY_REGISTRY} from './category-registry.js';
import {createApprovedWealth} from './approved-wealth.js';
import {createApprovedResearch} from './approved-research.js?v=r4-four-final-20261025';
import {createApprovedRisk} from './approved-risk.js';
import {createApprovedLedger} from './approved-ledger.js';
import {createApprovedTrends} from './approved-trends.js?v=r4-four-final-20261025';
import {createApprovedBudget} from './approved-budget.js';
import {createApprovedHome} from './approved-home.js';
import {createApprovedAssistant} from './approved-assistant.js';
import {createApprovedOverview} from './approved-overview.js?v=r4-four-final-20261025';
import {approvedRole,approvedHeader,approvedNav} from './approved-shell.js';
import {assistantStartHTML} from './product-assistant.js';
import {createProductTask} from './product-task.js';
import {createProductInvestment} from './product-investment.js?v=r4-four-final-20261025';
import {createProductAnalysis,categoryChartColor} from './product-analysis.js?v=r4-four-final-20261025';
import {createProductLedger} from './product-ledger.js';
import {createProductCapture} from './product-capture.js?v=r4-four-final-20261025';
import {createManualCapture} from './manual-capture.js';
import {createProductMotion} from './product-motion.js';
import {CATEGORY_ICONS,categoryIconKey,categoryIconSVG,categoryBadgeStyle} from './category-icons.js';
import {billDescription,billDescriptionForSave,cashflowTotals,isCashflow} from './primary-pages.js';
import {createMobilePages} from './mobile-pages.js';
import {createRequestLifecycle} from './request-lifecycle.js';
import {billQueryKind} from './bill-query.js';
import {createFeatures} from './features.js';
import {createNavigation,parseRoute,routes,primaryTabs} from './navigation.js';
import {createJourney} from './journey.js?v=banking-cancel-r1-20261019';
import {createBanking} from './banking.js?v=banking-cancel-r1-20261019';
import {createInvestment} from './investment.js';
import {createResearch} from './research.js';
import {finance} from './finance-api.js';
import {createStatements} from './statements.js';
import {createGoals} from './goals.js';
import {createImprovement} from './improvement.js';
import {createWealth} from './wealth.js';
import {createLearning} from './learning.js';
import {storage, book, trader, baseURL, saveConnections, resetConnections, allBills} from './api.js';
const $ = (s, root=document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',visualization:'M4 3v18h17 M8 16v-5 M13 16V6 M18 16v-8',home:'M3 7h18v14H3z M3 7l3-4h12l3 4 M15 11h6v6h-6z M17 14h1',ledger:'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h4',assistant:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',investment:'M3 17l6-6 4 4 8-10 M15 5h6v6',settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',back:'M15 5l-7 7 7 7',next:'M9 5l7 7-7 7',down:'M6 9l6 6 6-6',add:'M12 5v14 M5 12h14',eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',refresh:'M20 7a9 9 0 1 0 1 8 M20 3v5h-5',close:'M6 6l12 12 M18 6L6 18',send:'M12 19V5 M5 12l7-7 7 7',search:'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14 M15 15l6 6',filter:'M4 6h16 M7 12h10 M10 18h4',food:'M4 3v6c0 3 6 3 6 0V3 M7 3v18 M18 3c-3 4-3 8 0 9h2 M20 3v18',transport:'M5 3h14v14H5z M8 17l-2 4 M16 17l2 4 M5 10h14 M8 14h1 M15 14h1',shopping:'M4 7h16l-1 14H5z M8 8V6a4 4 0 0 1 8 0v2',fun:'M4 6h16v15H4z M4 6V3h16v3 M7 3l3 3 M13 3l3 3',house:'M3 10l9-7 9 7 M5 9v12h14V9 M10 21v-8h4v8',other:'M5 12h.1 M12 12h.1 M19 12h.1',calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',copy:'M9 9h12v12H9z M15 5V3H3v12h2',upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',check:'M4 12l5 5L20 6',shield:'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z',star:'M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',delete:'M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7'};
const icon = name => {const glyph=categoryIconSVG(name);return glyph?`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`:`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.other}"/></svg>`;};
const expenseCategories=['餐饮','出行','购物','生活缴费','娱乐','住房','医疗健康','教育学习','保险','人情往来','旅行','其他'];const incomeCategories=['工资','奖金','副业','理财收益','退款','其他收入'];const categories=[...expenseCategories,...incomeCategories];const entryCategories=()=>draft.type==='income'?incomeCategories:expenseCategories;const categoryIcons=CATEGORY_ICONS;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const prefs=storage.get('QINGCAI_PREFS',{mask:false,reduceTransparency:false,reduceMotion:false,period:'month'});
const state={route:'home',month:today().slice(0,7),period:prefs.period||'month',filter:{category:'',type:'',q:''},ledgerRange:null,bills:[],mode:'book',insightTab:'收支',investmentTab:'自选',stockTab:'资讯',stockDays:10,stockCode:'600036',stockName:'招商银行',chats:storage.get('QINGCAI_CHATS',{book:[],trader:[]}),reports:{},quotes:{},watchlist:[],favorites:storage.get('QINGCAI_FAVORITES',[]),chatBusy:false,chatDraft:'',epoch:0};
if(!Array.isArray(state.chats.finance))state.chats.finance=[];
let ledgerContextPromise;
async function ensureLedgerContext(){
 if(!ledgerContextPromise)ledgerContextPromise=book('/health').then(info=>{
  state.ledgerInfo=info;
  if(!state.monthInitialized){state.month=info.date_range?.end?.slice(0,7)||today().slice(0,7);state.monthInitialized=true;}
 }).catch(error=>{ledgerContextPromise=null;throw error;});
 return ledgerContextPromise;
}
const filterCategories=()=>[...new Set([...categories,...(state.ledgerInfo?.categories||[])])];
const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let draft=storage.get('QINGCAI_DRAFT',null) || freshDraft();
// A persisted write has no live response owner after reload. Reconcile it first.
if(draft.pending){draft.pending=false;draft.uncertain=true;storage.set('QINGCAI_DRAFT',draft);}
// The visible entry form belongs to this exact draft object. A parse, discard or
// successful save replaces it, so old DOM values must not overwrite the new draft.
let renderedEntryDraft;
function freshDraft(){return {event_date:today(),amount:'',category:'餐饮',type:'expense',description:'',currency:'CNY',payment:'',client_request_id:uid()};}
let sheetGeneration=0;
const productMotion=createProductMotion({prefs});
for(const event of ['close','cancel'])$('#sheet')?.addEventListener(event,()=>{if(event==='cancel'||!$('#sheet').open)sheetGeneration++;productMotion.dispose($('#sheet-content'));});
function persistPrefs(){storage.set('QINGCAI_PREFS',prefs);applyPrefs();}
function applyPrefs(){productMotion.setReducedMotion(prefs.reduceMotion);document.documentElement.dataset.reduceTransparency=String(prefs.reduceTransparency);document.documentElement.dataset.reduceMotion=String(prefs.reduceMotion);}
applyPrefs();
function money(value,currency='CNY'){if(prefs.mask)return '••••';if(value==null||value==='')return '—';const n=Number(value);if(!Number.isFinite(n))return '—';try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency,minimumFractionDigits:2}).format(n);}catch{return `${currency} ${n.toFixed(2)}`;}}
function number(value,digits=2){return prefs.mask?'••••':Number.isFinite(Number(value))?Number(value).toLocaleString('zh-CN',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';}
function pct(value){return prefs.mask?'••••':`${Number(value)>=0?'+':''}${Number(value).toFixed(2)}%`;}
function range(period='month'){const [y,m]=state.month.split('-').map(Number);let start=new Date(y,m-1,1),end=new Date(y,m,0);if(period==='year'){start=new Date(y,0,1);end=new Date(y,11,31);}if(period==='week'){const ref=state.month===today().slice(0,7)?new Date(today()+'T12:00:00'):new Date(y,m-1,1);const weekday=(ref.getDay()+6)%7;start=new Date(ref);start.setDate(ref.getDate()-weekday);end=new Date(start);end.setDate(start.getDate()+6);}if(dateISO(start)<=today()&&dateISO(end)>today())end=new Date(today()+'T12:00:00');return {start_date:dateISO(start),end_date:dateISO(end)};}
const rangeLabel = p => {const r=range(p);return `${r.start_date} — ${r.end_date}`;};
const btn=(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const ib=(name,label,action,extra='')=>`<button class="icon-button" aria-label="${label}" title="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
const card=(content,cls='')=>`<section class="surface-card ${cls}">${content}</section>`;
const loading=()=>`<div class="loading" role="status"><span class="spinner"></span>正在读取</div>`;
const empty=(text,action='')=>`<div class="empty">${icon('ledger')}<p>${esc(text)}</p>${action}</div>`;
const errorHTML=error=>`<div class="error" role="alert">${esc(error.message || error)}<div class="mt">${btn('重试','refresh','small')}</div></div>`;
function segmented(values,selected,action){return `<div class="segmented glass" role="tablist">${values.map(x=>`<button role="tab" aria-selected="${x===selected}" data-action="${action}" data-value="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;}
function toast(text){const el=$('#toast');el.textContent=text;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3300);}
function replaceWithMotion(root,html){
 const previous=[...root.querySelectorAll('[data-motion-object]')];
 for(const node of previous)node.remove();
 productMotion.dispose(root);root.innerHTML=html;
 const incoming=[...root.querySelectorAll('[data-motion-object]')];
 for(const node of previous){
  const next=incoming.find(item=>item.dataset.motionObject===node.dataset.motionObject&&item.dataset.motionKind===node.dataset.motionKind);
  if(next)next.replaceWith(node);else productMotion.dispose(node);
 }
}
function modal(title,body){const dialog=$('#sheet');sheetGeneration++;replaceWithMotion($('#sheet-content'),`<div class="sheet-head"><h2>${esc(title)}</h2>${ib('close','关闭','close-sheet')}</div>${body}`);if(!dialog.open)dialog.showModal();}
function confirmSheet(title,text,action,extra=''){modal(title,`<p class="dialog-message">${esc(text)}</p><div class="actions">${btn('取消','close-sheet')}${btn('确认',action,'primary',extra)}</div>`);}
function closeSheet(){sheetGeneration++;productMotion.dispose($('#sheet-content'));$('#sheet').close();}
const pageDrafts=new Map();
const retainedForms='#finance-profile-form,#connections-form,#statement-file-form,#visual-range-form';
function retainPageDraft(){
 syncDraft();
 const form=$('#content')?.querySelector(retainedForms);
 if(!form||form.querySelector('button[type="submit"]:disabled'))return;
 pageDrafts.set(state.route,{form:form.id,fields:[...form.querySelectorAll('input,select,textarea')].map(el=>({id:el.id,name:el.name,type:el.type,value:el.value,checked:el.checked,files:el.type==='file'?el.files:null}))});
}
function restorePageDraft(root){
 const saved=pageDrafts.get(state.route);if(!saved)return;
 const form=root.querySelector('#'+saved.form);if(!form)return;
 for(const item of saved.fields){const el=item.id?form.querySelector('#'+item.id):[...form.querySelectorAll('input')].find(el=>el.name===item.name&&el.value===item.value);if(!el)continue;if(item.type==='file'){if(item.files?.length)el.files=item.files;}else if(['radio','checkbox'].includes(item.type))el.checked=item.checked;else el.value=item.value;}
}
const navigation=createNavigation({window,onChange:()=>{closeSheet();render();},beforeLeave:()=>{retainPageDraft();if(state.route==='capture')productCapture.leave();}});
function go(route,options){navigation.go(route,options);}
function ask(text,mode='book',context=null){if(state.chatBusy)stopChat();state.mode=mode;state.chatDraft=text;state.chatContext=context;state.chatLedgerRange=mode==='book'?{...(state.route==='visualization'?state.visualReportRange:state.route==='insights'?(state.insightRange||range(state.period)):state.route==='ledger'?(state.ledgerRange||range()):range())}:null;go('assistant');}
function header(title){const role=approvedRole(state.route,state);if(role)return approvedHeader(role,{state,esc});const secondary=!primaryTabs.includes(state.route)||(state.route==='ledger'&&Boolean(state.productLedgerReturnTo));return `<header class="topbar"><div class="topbar-inner"><div class="row topbar-title">${secondary?state.route==='entry'?btn(draft.uncertain||draft.pending?'关闭':'取消','back','small'):ib('back','返回','back'):''}<h1>${esc(title)}</h1></div><div class="row topbar-actions">${state.route==='home'?ib('settings','设置','settings'):''}</div></div></header>`;}

function nav(){if(approvedRole(state.route,state))return approvedNav(navigation.activeTab);return `<nav class="tab-bar glass" aria-label="主导航">${primaryTabs.map(key=>`<a href="#/${key}" data-nav-tab="${key}" ${navigation.activeTab===key?'aria-current="page"':''}>${icon(key)}<span>${routes[key].title}</span></a>`).join('')}</nav>`;}
function monthPicker(){if(state.route==='ledger'&&state.ledgerRange)return `<div class="row between"><div class="range-caption"><strong>${esc(state.ledgerRange.start_date)}</strong><span>至 ${esc(state.ledgerRange.end_date)}</span></div><div class="row">${ib('calendar','返回所选月份','clear-ledger-range')}${ib('filter','筛选账单','filter')}</div>`;return `<div class="row between"><label class="pill glass month-choice" aria-label="月份"><span>${esc(state.month.replace('-','年'))}月</span>${icon('calendar')}<input class="time-input" type="month" id="month-picker" value="${state.month}" aria-label="选择月份"></label><div class="row">${ib('eye',prefs.mask?'显示金额':'隐藏金额','mask')}${state.route==='ledger'?ib('filter','筛选账单','filter'):btn('财务分析','insights','small glass')}</div></div>`;}
function overview(report){return card(`<div class="row between"><span class="muted">区间结余</span><span class="tag">CNY</span></div><span class="hero-amount money">${money(report.net.current)}</span><div class="metrics"><div class="metric"><small><i class="dot"></i>收入</small><strong class="money">${money(report.summary.income_total)}</strong></div><div class="metric"><small><i class="dot dark"></i>支出</small><strong class="money">${money(report.summary.expense_total)}</strong></div></div>`);}
function chart(values,labels,second=null,title='数据'){if(prefs.mask)return '<div class="chart-hidden">金额已隐藏</div>';if(!values.length)return empty('暂无趋势数据');const nums=values.map(Number),all=second?[...nums,...second.map(Number)]:nums;const rawHigh=Math.max(...all),rawLow=Math.min(...all);const padding=Math.max((rawHigh-rawLow)*.12,Math.abs(rawHigh)*.002,.001);const high=second?Math.max(rawHigh,0):rawHigh+padding,low=second?Math.min(rawLow,0):rawLow-padding;const diff=high-low||1;const x=i=>10+(i*300/Math.max(1,nums.length-1)),y=n=>120-((n-low)/diff)*103;const points=nums.map((n,i)=>`${x(i)},${y(n)}`).join(' ');const secondary=second?`<polyline points="${second.map((n,i)=>`${x(i)},${y(n)}`).join(' ')}" fill="none" stroke="#86a396" stroke-width="2"/>`:'';
 return `<div><svg class="chart" viewBox="0 0 320 145" role="img" aria-label="${esc(title)}"><path d="M10 120H310 M10 65H310" stroke="#e7ecf2" stroke-dasharray="3 4"/>${second?'':`<text x="10" y="10" fill="#788698" font-size="9">${number(rawHigh,3)}</text><text x="10" y="142" fill="#788698" font-size="9">${number(rawLow,3)}</text>`}<polygon points="10,130 ${points} ${x(nums.length-1)},130" fill="#1d4ed80c"/>${secondary}<polyline points="${points}" fill="none" stroke="#1d4ed8" stroke-width="2.3" stroke-linejoin="round"/>${nums.map((n,i)=>`<circle class="chart-point" tabindex="0" role="button" aria-label="${esc(labels[i])}：${esc(number(n))}${second?`；收入 ${esc(number(second[i]))}`:''}" data-action="chart-point" data-value="${esc(labels[i])}：${esc(number(n))}${second?`；收入 ${esc(number(second[i]))}`:''}" cx="${x(i)}" cy="${y(n)}" r="${nums.length>15?3:4}" fill="white" stroke="#1d4ed8" stroke-width="1.5"><title>${esc(labels[i])}：${esc(number(n))}</title></circle>`).join('')}</svg><div class="chart-labels"><span>${esc(labels[0])}</span><span>${esc(labels[Math.floor(labels.length/2)])}</span><span>${esc(labels.at(-1))}</span></div><div class="chart-value" aria-live="polite"></div></div>`;
}
function trend(report){return card(`<div class="row between"><h2>收支趋势</h2><div class="legend"><span><b></b>支出</span><span><b class="green"></b>收入</span></div></div>${chart(report.bars.expense,report.bars.labels,report.bars.income,'区间收支趋势')}`);}
function billRows(rows){return rows.map(b=>`<button class="bill-row" data-action="bill" data-id="${b.id}"><span class="bill-icon">${icon(categoryIconKey(b.category,b.type))}</span><span class="grow"><strong class="truncate">${esc(b.description)}</strong><small>${esc(b.event_date)} · ${esc(b.category)}${['internal_transfer','principal'].includes(b.metadata?.movement)?' · 划转':''}</small></span><span class="right"><span class="amount money ${b.type==='income'?'good':''}">${b.type==='income'?'+':'−'}${money(b.amount,b.currency)}</span><small>${esc(b.metadata?.payment_method || (b.source==='manual'?'手动录入':b.source||''))}</small></span></button>`).join('');}
function billModal(id){const b=state.bills.find(x=>x.id===Number(id));if(!b)return;modal('账单详情',`<p class="hero-amount center money">${b.type==='income'?'+':'−'}${money(b.amount,b.currency)}</p><div class="col"><h3>${esc(b.description)}</h3><p class="muted">${esc(b.event_date)} · ${esc(b.category)} · ${b.metadata?.movement==='internal_transfer'?'内部划转':b.metadata?.movement==='principal'?'本金划转':b.type==='income'?'收入':'支出'}</p><p class="muted">${esc(b.metadata?.payment_method||'未填写支付方式')}</p></div><div class="actions">${btn('编辑账单','edit-bill','primary',`data-id="${b.id}"`)}${btn('问助手','ask-bill','',`data-id="${b.id}"`)}${btn('删除账单','delete-prompt','danger',`data-id="${b.id}"`)}</div>`);}
async function render(){
 retainPageDraft();
 const {route,query}=parseRoute(location.hash);state.route=route;
 if(route==='stock'){const params=new URLSearchParams(query);state.stockCode=params.get('code')||state.stockCode;state.stockName=params.get('name')||state.stockName;}
 if(state.mobileLocation!==location.hash){state.mobileLocation=location.hash;const p=new URLSearchParams(query);if(['ledger','categories'].includes(route)&&/^\d{4}-\d{2}$/.test(p.get('month')||'')){state.month=p.get('month');state.monthInitialized=true;if(route==='ledger'){state.filter={category:p.get('category')||'',type:p.has('type')?p.get('type'):(CATEGORY_REGISTRY.find(category=>category.label===p.get('category'))?.type||''),q:state.filter.q||'',day:p.get('day')||''};state.mobileLimit=4;}if(p.get('start_date')&&p.get('end_date')){const dates={start_date:p.get('start_date'),end_date:p.get('end_date')};if(route==='ledger')state.ledgerRange=dates;else state.visualReportRange=dates;}else if(route==='ledger')state.ledgerRange=null;if(route==='categories'&&p.get('period'))state.visualPeriod=p.get('period');}}
 if(state.productRouteLocation!==location.hash){
  state.productRouteLocation=location.hash;const p=new URLSearchParams(query);
  if(route==='ledger'){
   state.productLedgerCashflowOnly=p.get('cashflow_only')==='1';
   state.productLedgerIds=p.has('bill_ids')?(p.get('bill_ids')||'').split(',').filter(x=>/^\d+$/.test(x)).map(Number):null;
   state.productLedgerReturnTo=(p.get('return_to')||'').startsWith('visualization')?p.get('return_to'):null;
   if(!p.has('start_date')&&!p.has('end_date'))state.ledgerRange=null;
   if(!query)state.filter={category:'',type:'',q:'',day:''};
  }
  if(route==='visualization'){
   if(['composition','trend','budget'].includes(p.get('tab')))state.productAnalysisTab=p.get('tab');
   if(['week','month','year','custom'].includes(p.get('period')))state.visualPeriod=p.get('period');
   if(/^\d{4}-\d{2}$/.test(p.get('month')||'')){state.month=p.get('month');state.monthInitialized=true;}
   if(state.visualPeriod==='custom'&&p.get('start_date')&&p.get('end_date'))state.visualRange={start_date:p.get('start_date'),end_date:p.get('end_date')};
  }
 }
 const token=++state.epoch,scrollY=navigation.current.scrollY,title=route==='stock'?state.stockName:routes[route].title;
 const app=$('#app');app.dataset.route=route;const role=approvedRole(route,state);const legacyPolish=document.querySelector('link[href*="product-polish.css"]');if(legacyPolish)legacyPolish.disabled=!!role;if(role){app.dataset.approvedUi=role;document.body.dataset.approvedUi=role;if(['overview','trend','budget'].includes(role))state.visualPeriod='month';}else{delete app.dataset.approvedUi;delete document.body.dataset.approvedUi;}
 featureContext.disposeRisk?.();productAnalysis.dispose?.();productLedger.dispose?.();productMotion.dispose(app);app.innerHTML=header(title)+`<main id="content" class="page-content ${route}-page ${['entry','settings','capture'].includes(route)?'entry-content':''} ${route==='assistant'?'chat-page':''}">${loading()}</main>`+(!['entry','settings','categories','accounts','capture','risk'].includes(route)?nav():'');
 const root=$('#content');
 const paint=html=>{if(token===state.epoch){replaceWithMotion(root,html);restorePageDraft(root);}};
 try{
  if(['home','ledger','insights','visualization','entry','assistant','categories','capture'].includes(route))await ensureLedgerContext();
  if(token!==state.epoch)return;
  document.querySelector('.topbar').outerHTML=header(title);
  await ({entry:entryPage,assistant:assistantPage,stock:stockPage,settings:settingsPage,...features.pages,...journey.pages,...banking.pages,...investment.pages,...research.pages,...statements.pages,...improvement.pages,...wealth.pages,...primary.pages}[route])(paint);
 }catch(error){paint(primary.pages[route]?primary.errorHTML(error):errorHTML(error));}
 finally{if(token===state.epoch)requestAnimationFrame(()=>{if(token===state.epoch){window.scrollTo(0,scrollY);navigation.restored();}});}
}
function entryPage(paint){
 renderedEntryDraft=draft;if(manualCapture.attempt){manualCandidateRecoveryPage(paint);return;}if(draft.uncertain||draft.pending){entryRecoveryPage(paint);return;}
 paint(`<div class="pc-entry-shortcut">${btn('文字与票据录入','product-capture-open','small')}</div><form id="entry-form" class="stitch-entry-form">${segmented(['支出','收入'],draft.type==='income'?'收入':'支出','entry-type')}
 ${card(`<label class="entry-amount-label" for="entry-amount">${icon('ledger')}<span>输入金额</span></label><div class="entry-amount-line"><span>¥</span><input id="entry-amount" name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="999999999" required placeholder="0.00" value="${esc(draft.amount)}" aria-label="账单金额"></div>`,'entry-amount-card')}
 ${card(`<details class="mobile-category-picker entry-category-row"><summary><span class="entry-row-label"><i style="${categoryBadgeStyle(draft.category,draft.type)}">${icon(categoryIconKey(draft.category,draft.type))}</i>分类</span><strong>${esc(draft.category)}</strong>${icon('next')}</summary><div class="category-grid">${entryCategories().map(c=>`<button type="button" class="${draft.category===c?'selected':''}" data-action="entry-category" data-value="${c}" style="${categoryBadgeStyle(c,draft.type)}">${icon(categoryIcons[c])}${c}</button>`).join('')}</div></details>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-payment"><i>${icon('home')}</i>支付方式</label><select id="entry-payment" name="payment" aria-label="支付方式">${['','微信支付','支付宝','银行卡','信用卡','现金','其他'].map(v=>`<option ${draft.payment===v?'selected':''} value="${v}">${v||'未填写'}</option>`).join('')}</select></div>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-date"><i>${icon('calendar')}</i>日期</label><input id="entry-date" type="date" name="event_date" value="${esc(draft.event_date)}" required></div>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-description"><i>${icon('ledger')}</i>备注</label><input id="entry-description" name="description" maxlength="512" placeholder="添加备注" value="${esc(draft.description)}" required></div>`,'entry-details-card')}
 <div id="entry-error" role="alert"></div><button id="save-entry" class="btn primary entry-save" type="submit">核对记录</button>
 <details class="entry-extras"><summary>更多</summary><div class="entry-extra-actions">${btn('文字解析','parse-entry','small','type="button"')}${state.ledgerInfo?.capabilities?.ocr?btn('识别票据','ocr-entry','small','type="button"'):''}${btn('丢弃草稿','discard-draft','small','type="button"')}</div></details></form>`);
 $('#entry-form')?.querySelectorAll('.segmented button').forEach(b=>b.type='button');if(draft.save_error)$('#entry-error').innerHTML=`<div class="error" role="alert">${esc(draft.save_error)}</div>`;
}
function entryRecoveryPage(paint){
 renderedEntryDraft=draft;const pending=draft.pending&&!draft.uncertain;
 const status=pending?'正在保存':draft.reconciled?'未查到记录':'暂时无法确认是否保存';
 const rows=[['分类',draft.category,categoryIcons[draft.category]||'other'],['支付方式',draft.payment||'未填写','home'],['日期',draft.event_date,'calendar'],['备注',draft.description||'未填写','ledger']];
 paint(`<div class="entry-recovery"><section id="entry-error" class="surface-card entry-status-card" role="status"><h2><i></i>${status}</h2>${btn('查看流水'+icon('next'),'entry-view-ledger','primary','type="button"')}</section>
 ${card(`<div class="row between"><span class="mobile-label">${draft.type==='income'?'收入':'支出'}金额（草稿）</span><i class="entry-draft-icon">${icon('ledger')}</i></div><strong class="entry-draft-amount money">${money(draft.amount,draft.currency)}</strong>`,'entry-draft-card')}
 ${card(rows.map(([label,value,glyph])=>`<div class="entry-readonly-row"><span class="entry-row-label"><i>${icon(glyph)}</i>${label}</span><strong>${esc(value)}</strong></div>`).join(''),'entry-details-card')}
 ${!pending?`<div class="entry-recovery-actions">${draft.reconciled?btn('再次保存','entry-retry-same-request','small','type="button"'):btn('重新核实','entry-reconcile','small','type="button"')}</div>`:''}</div>`);
}

function syncDraft(){const form=$('#entry-form');if(!form||renderedEntryDraft!==draft||draft.pending||draft.uncertain)return;for(const [k,v] of new FormData(form))draft[k]=v;storage.set('QINGCAI_DRAFT',draft);}
function parseObject(reply){const match=String(reply).match(/\{[\s\S]*\}/);if(!match)throw new Error('未得到有效的账单 JSON，请改用手动录入。');return JSON.parse(match[0]);}
function applyParsed(p){if(p.needs_clarification)throw new Error(p.reason||'请补充账单信息');const amount=Number(p.amount??p['金额']);const date=p.event_date??p['日期'];if(!(amount>0)||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new Error('识别结果缺少有效金额或日期，请手动填写。');const currency=p.currency||p['币种']||'CNY';if(currency!=='CNY')throw new Error('当前记账页使用人民币，识别到其他币种，请确认金额后手动录入。');draft={...draft,client_request_id:uid(),amount:amount.toFixed(2),event_date:date,category:categories.includes(p.category??p['类别'])?(p.category??p['类别']):'其他',description:String(p.description??p['描述']??p.merchant??p['商户']??''),type:p.type==='income'?'income':'expense',payment:p.payment_method||''};storage.set('QINGCAI_DRAFT',draft);closeSheet();go('entry');toast('已填入草稿，请核对后保存');}
function finishEntry(result,{navigate=true}={}){ledgerContextPromise=null;draft=freshDraft();storage.set('QINGCAI_DRAFT',draft);if(navigate){state.month=result.event_date.slice(0,7);state.monthInitialized=true;state.ledgerRange=null;state.filter={category:'',type:'',q:'',day:''};state.mobileLimit=4;state.highlightBill=result.id;go('ledger?'+new URLSearchParams({month:state.month}));toast('已保存');}}
function showUncertainEntry(){const close=$('.topbar [data-action=back]');if(close)close.textContent='关闭';if(state.route==='entry')entryRecoveryPage(html=>{$('#content').innerHTML=html;});}

// New manual entries join the same review/confirm/undo batch as text and files.
// Existing uncertain legacy bill saves retain saveEntry's recovery path below.
function manualCandidateRecoveryPage(paint){
 const original=manualCapture.attempt.payload.bill;
 paint(`<div class="entry-recovery">${card(`<div class="row between"><h2>候选待核实</h2>${icon('ledger')}</div><strong class="entry-draft-amount money">${money(original.amount,original.currency)}</strong><div class="row between"><span>${esc(original.category)}</span><span>${esc(original.event_date)}</span></div>`,'entry-draft-card')}<button class="btn primary" data-action="manual-capture-recover" ${manualCapture.busy?'disabled':''} aria-busy="${manualCapture.busy}">${manualCapture.busy?'正在核对':'核对候选'}</button>${btn('待确认','product-capture-open','small')}${manualCapture.error?`<p class="pc-error" role="alert">${esc(manualCapture.error)}</p>`:''}</div>`);
}
function openManualCandidate(batch){
 if(!batch)return;
 const request=manualCapture.attempt?.request_id;
 if(draft.client_request_id===request){draft=freshDraft();storage.set('QINGCAI_DRAFT',draft);}
 productCapture.flow.reset();go('capture?'+new URLSearchParams({batch:batch.id}));manualCapture.opened(batch.id);
}
async function recoverManualCandidate(){try{openManualCandidate(await manualCapture.recover());}catch{}}
async function saveManualCapture(){
 syncDraft();const target=draft,button=$('#save-entry');if(target.pending||target.uncertain||manualCapture.busy||!button||button.disabled)return;
 const key=target.client_request_id;storage.set('QINGCAI_DRAFT',target);
 try{
  const batch=await manualCapture.start({request_id:key,bill:{event_date:target.event_date,category:target.category,type:target.type,amount:Number(target.amount),currency:target.currency||'CNY',description:target.description,source:'manual',metadata:{payment_method:target.payment||'',client_request_id:key}}});
  if(state.route==='entry'&&draft===target)openManualCandidate(batch);
  else toast('记录已加入待确认');
 }catch(error){if(draft!==target)return;target.save_error=error.message;storage.set('QINGCAI_DRAFT',target);if(state.route==='entry')await render();}
}

async function saveEntry({retry=false}={}){
 syncDraft();const button=$('#save-entry');if(draft.uncertain||draft.pending||(!retry&&(!button||button.disabled)))return;
 const target=draft,key=target.client_request_id,form=$('#entry-form');
 const owns=()=>draft===target&&draft.client_request_id===key;
 const visible=()=>owns()&&state.route==='entry'&&renderedEntryDraft===target;
 const fields=[...(form?.querySelectorAll('input,select,textarea,button')||[])];fields.forEach(el=>el.disabled=true);if(button)button.textContent='正在保存';
 const {payment,client_request_id,pending,uncertain,attempted,reconciled,save_error,...data}=target;
 target.pending=true;storage.set('QINGCAI_DRAFT',target);if(retry)showUncertainEntry();
 try{const result=await book('/bills',{method:'POST',body:{...data,amount:Number(data.amount),source:'manual',metadata:{payment_method:payment,client_request_id,...(target.duplicate_keep?{duplicate_decision:'keep'}:{})}},timeout:20000});
  if(!result.id||!result.event_date)throw new Error('保存结果待核实');
  if(owns())finishEntry(result,{navigate:visible()});
 }catch(error){if(!owns())return;target.pending=false;
  if(error.status===409&&error.detail?.code==='possible_duplicate'){
   target.save_error='';storage.set('QINGCAI_DRAFT',target);await render();
   modal('可能重复',`<div class="pc-manual-matches">${error.detail.matches.map(x=>`<p>${esc(x.event_date)} ${esc(x.description)} ${money(Number(x.amount))}</p>`).join('')}</div><div class="actions">${btn('取消','manual-duplicate-cancel')}${btn('仍然保存','manual-duplicate-keep','primary')}</div>`);return;
  }
  if(!error.status||error.status>=500){target.uncertain=true;storage.set('QINGCAI_DRAFT',target);if(visible())showUncertainEntry();}
  else{target.attempted=true;target.save_error=error.message;storage.set('QINGCAI_DRAFT',target);if(visible())render();}
 }
}

function habitText(b){const flags=b.risk_flags||[];return flags.length?flags.map(x=>typeof x==='string'?x:`${x.category}：${x.message}（月均 ${money(x.avg)}）`).join('\n\n'):'当前数据没有产生额外行为提示。继续记账后，可观察更长时间的变化。';}
function categoryDistribution(report){const total=report.summary.expense_total;return report.pie.length?report.pie.map(c=>`<button class="category-row" data-action="category-ledger" data-value="${esc(c.name)}"><span class="row between"><span>${esc(c.name)}</span><span class="money">${money(c.value)} <small>${prefs.mask?'':(c.value/total*100).toFixed(1)+'%'}</small></span></span>${prefs.mask?'':`<span class="progress-bar"><span style="width:${Math.min(100,c.value/total*100)}%"></span></span>`}</button>`).join(''):empty('本期暂无支出');}
const chatLifecycle=createRequestLifecycle();
function assistantPage(paint){paint(approvedAssistant.pageHTML());renderMessages();syncChatComposer();}
function syncChatComposer(){const b=$('#chat-submit');if(!b)return;if($('#app').dataset.approvedUi==='assistant'){b.disabled=state.chatBusy||!state.chatDraft.trim();b.type='submit';b.dataset.action='send';b.setAttribute('aria-label','发送消息');b.innerHTML='↑';return;}b.disabled=!state.chatBusy&&!state.chatDraft.trim();b.type=state.chatBusy?'button':'submit';b.dataset.action=state.chatBusy?'stop-chat':'send';b.setAttribute('aria-label',state.chatBusy?'停止':'发送消息');b.innerHTML=icon(state.chatBusy?'close':'send');}
function renderMessages(){const root=$('#chat-messages');if(!root)return;if($('#app').dataset.approvedUi==='assistant'){approvedAssistant.renderMessages(root);return;}const messages=state.chats[state.mode]||[];root.innerHTML=messages.length?messages.slice(-12).map((m,offset)=>{const i=messages.length-Math.min(messages.length,12)+offset;const fact=m.fact;return `<article class="chat-message ${m.role==='user'?'user':''} ${m.stopped?'chat-stopped':''}">${m.role==='user'?`<div class="bubble">${esc(m.content)}</div>`:m.stopped?'<div class="bubble">已停止</div>':fact?`<div class="bubble mobile-chat-fact"><span>${esc(fact.label)}</span><strong class="mobile-total money">${money(fact.amount_minor/100)}</strong><div class="row between">${btn('查看流水'+icon('next'),'mobile-chat-ledger','small',`data-index="${i}"`)}${ib('copy','复制','copy-message',`data-index="${i}"`)}</div></div>`:`<div class="bubble">${prefs.mask?'内容已隐藏':m.content.length>800?`<p>${esc(m.content.slice(0,240))}…</p><details><summary>展开回复</summary>${features.replyHTML(m.content)}</details>`:features.replyHTML(m.content)}</div>${!m.failed?`<div class="row">${ib('copy','复制回复','copy-message',`data-index="${i}"`)}${state.mode==='finance'?journey.chatDraftButton(m,i):''}</div>`:''}`}</article>`;}).join(''):assistantStartHTML({state,esc,icon});if(state.chatBusy)root.innerHTML+=`<article class="chat-message chat-pending" data-request-id="${chatLifecycle.current?.id||''}"><div class="bubble"><div class="row">${icon('assistant')}<strong>${state.chatReading?'正在读取流水':'正在思考'}</strong></div><div class="request-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>${btn('停止','stop-chat','small','type="button"')}</div></article>`;root.lastElementChild?.scrollIntoView({block:'nearest'});}
function stopChat(){if(!chatLifecycle.stop())return;state.chatBusy=false;state.chats[state.mode].push({role:'assistant',content:'已停止',stopped:true,failed:true});storage.set('QINGCAI_CHATS',state.chats);renderMessages();syncChatComposer();}
async function sendChat(){const input=$('#chat-input'),text=input?.value.trim();if(!text||state.chatBusy)return;const mode=state.mode,run=chatLifecycle.start();state.chatDraft='';input.value='';state.chatBusy=true;state.chatReading=mode==='book'&&billQueryKind(text)!==null;state.chats[mode].push({role:'user',content:text});storage.set('QINGCAI_CHATS',state.chats);renderMessages();syncChatComposer();try{let reply,fact;const dates=chatRange(text);if(state.chatReading){const rows=await allBills(dates,{signal:run.signal});const category=[...(state.ledgerInfo?.categories||[]),...expenseCategories,...incomeCategories].find(c=>text.includes(c))||(/交通/.test(text)?'出行':'');const selected=rows.filter(r=>(!category||r.category===category)&&isCashflow(r));const totals=cashflowTotals(selected),kind=billQueryKind(text);fact={label:(category||'本期')+(kind==='income'?'收入':kind==='net'?'结余':'支出'),amount_minor:Math.round((kind==='income'?totals.income:kind==='net'?totals.net:totals.expense)*100),dates,category,type:kind==='income'?'income':kind==='expense'?'expense':'',bill_ids:selected.filter(r=>kind==='income'?r.type==='income'&&r.category!=='退款':kind==='expense'?r.type==='expense':true).map(r=>r.id)};reply=`${fact.label} ${money(fact.amount_minor/100)}（${dates.start_date} — ${dates.end_date}）`;}else{const history=state.chats[mode].filter(x=>!x.failed).slice(-20).map(({role,content})=>({role,content}));const opts={method:'POST',body:mode==='finance'?{messages:history.slice(-12)}:{messages:history,system_prompt:'请简短使用简体中文回答，不得声称已执行金融操作。',include_bill_context:mode==='book',...(mode==='book'?{ledger_range:dates}:{}),max_new_tokens:1000},timeout:180000,signal:run.signal};const result=mode==='finance'?await finance('/assistant',opts):await(mode==='trader'?trader:book)('/chat',opts);reply=result.reply;fact=null;if(!chatLifecycle.isCurrent(run))return;state.chats[mode].push({role:'assistant',content:reply,plan_next:result.plan_next||null,action_draft:result.draft?{...result.draft,feedback_ref:result.feedback_ref,request_id:uid()}:null});}if(!chatLifecycle.isCurrent(run))return;if(fact)state.chats[mode].push({role:'assistant',content:reply,fact});}catch(error){if(chatLifecycle.isCurrent(run))state.chats[mode].push({role:'assistant',content:error.message,failed:true});}finally{if(chatLifecycle.finish(run)){state.chatBusy=false;storage.set('QINGCAI_CHATS',state.chats);if(state.route==='assistant'){renderMessages();syncChatComposer();}}}}

function chatRange(text){
 const selected=state.chatLedgerRange||range();
 const explicit=text.match(/(?:(20\d{2})年)?(1[0-2]|0?[1-9])月/);
 if(explicit){const year=explicit[1]||selected.start_date.slice(0,4),month=Number(explicit[2]);return {start_date:`${year}-${String(month).padStart(2,'0')}-01`,end_date:dateISO(new Date(Number(year),month,0))};}
 return selected;
}
let editingBill;
function editBill(id){
 const b=state.bills.find(x=>x.id===Number(id));if(!b)return;
 editingBill={...b};
 const opts=type=>(type==='income'?incomeCategories:expenseCategories).map(c=>`<option ${b.category===c?'selected':''}>${esc(c)}</option>`).join('');
 modal('编辑账单',`<form id="bill-edit-form" data-id="${b.id}" data-version="${esc(b.version)}"><label class="field-label" for="edit-amount">金额（元）</label><input class="field" id="edit-amount" name="amount" type="number" min="0.01" step="0.01" max="999999999" required value="${b.amount}"><label class="field-label" for="edit-type">收支</label><select class="field" id="edit-type" name="type"><option value="expense" ${b.type==='expense'?'selected':''}>支出</option><option value="income" ${b.type==='income'?'selected':''}>收入</option></select><label class="field-label" for="edit-category">分类</label><select class="field" id="edit-category" name="category">${opts(b.type)}</select><label class="field-label" for="edit-date">日期</label><input class="field" id="edit-date" name="event_date" type="date" required value="${esc(b.event_date)}"><label class="field-label" for="edit-description">描述</label><input class="field" id="edit-description" name="description" maxlength="512" required value="${esc(billDescription(b))}"><label class="field-label" for="edit-payment">支付方式</label><input class="field" id="edit-payment" name="payment_method" maxlength="40" value="${esc(b.metadata?.payment_method||'')}"><p class="field-feedback" role="alert"></p><div class="actions">${btn('取消','close-sheet','','type="button"')}<button type="submit" class="btn primary">保存修改</button></div></form>`);
}
document.addEventListener('change',e=>{if(e.target.id==='edit-type')$('#edit-category').innerHTML=(e.target.value==='income'?incomeCategories:expenseCategories).map(c=>`<option>${esc(c)}</option>`).join('');});
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.id!=='bill-edit-form')return;e.preventDefault();
 const button=form.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;
 try{const data=Object.fromEntries(new FormData(form));data.description=billDescriptionForSave(editingBill,data.description);const result=await book('/bills/'+form.dataset.id,{method:'PUT',body:{...data,amount:Number(data.amount),currency:'CNY',expected_version:form.dataset.version}});ledgerContextPromise=null;closeSheet();await render();toast('账单已更新');}
 catch(error){form.querySelector('[role="alert"]').textContent=error.message;}
 finally{if(button.isConnected)button.disabled=false;}
});

function stockLink(code,name){go('stock?'+new URLSearchParams({code,name}));}
function reportSections(text){const chunks=String(text).split(/\n(?=(?:#{1,4}\s|\*\*))/).filter(x=>x.trim());return chunks.map((chunk,i)=>{const lines=chunk.trim().split('\n');let title=lines[0].replace(/^#+\s*|\*\*/g,'').trim();if(title.length>40||lines.length<2){title=`研究内容${chunks.length>1?' '+(i+1):''}`;}else lines.shift();const body=lines.join('\n');return `<details class="report-section"><summary>${esc(title)}</summary><div class="report-text">${esc(prefs.mask?'内容已隐藏':body)}</div></details><p class="report-preview">${esc(prefs.mask?'内容已隐藏':body)}</p>`;}).join('');}
async function stockPage(paint){paint(loading());if(!state.watchlist.length)state.watchlist=await trader('/trader/watchlist');const supported=state.watchlist.some(x=>x.code===state.stockCode);if(!supported){const p=state.portfolio||await trader('/trader/portfolio');const h=p.holdings.find(x=>x.code===state.stockCode);paint(card(`<h2>${esc(state.stockName)}</h2><p class="period-stamp">${esc(state.stockCode)}</p>${h?`<span class="hero-amount money">${money(h.market_value,p.summary.base_currency)}</span><p>持仓收益 ${pct(h.pnl_pct)}</p>`:''}<div class="empty">暂无行情或研报</div><div class="mt">${btn('查看 A10 自选','watchlist','primary')}</div>`));return;}
 const [rows,quality]=await Promise.all([trader(`/trader/stock/${encodeURIComponent(state.stockCode)}/kline?days=${state.stockDays}`),trader(`/trader/stock/${encodeURIComponent(state.stockCode)}/quality`)]);state.quotes[state.stockCode]=rows;const last=rows.at(-1),prev=rows.at(-2);const change=last&&prev?Number(last.close)-Number(prev.close):null;const changePct=change!==null&&Number(prev.close)!==0?change/Number(prev.close)*100:null;let content='';if(state.stockTab==='资讯'){const news=await trader(`/trader/stock/${state.stockCode}/news`);state.news=[...(news.news||[]),...(news.reports||[])];content=card(`<h2>研究资料</h2>${state.news.length?state.news.map((n,i)=>`<button class="news-row" data-action="news" data-index="${i}"><span>${esc(n['新闻标题']||n['报告名称']||n.title||'资讯')}</span><small>${esc(n.published_at?.slice(0,10)||n['发布时间']||n['发布日期']||n['日期']||'')} · ${esc(n['文章来源']||n['机构']||n.source||'')}</small></button>`).join(''):empty('没有资讯记录')}`);}else content=card(`<div class="row between mb"><h2>研究日报</h2>${btn(state.reports[state.stockCode]?'重新生成':'生成研究','stock-report','small glass')}</div>${state.reports[state.stockCode]?reportSections(state.reports[state.stockCode]):empty('根据这只股票现有的行情与资讯生成研究。')}`);
 paint(`<div class="row between"><span class="muted">${esc(state.stockCode)} · CNY</span>${btn(icon('star')+(state.favorites.includes(state.stockCode)?'已关注':'关注'),'favorite','small glass')}</div>`+card(last?`<small>最近收盘价</small><span class="hero-amount money">${money(last.close)}</span><p class="${change>=0?'good':'bad'}">${change===null?'—':`${change>=0?'+':''}${money(change)} (${pct(changePct)})`}</p><div class="quote-grid"><div><small>开盘</small>${money(last.open)}</div><div><small>最高</small>${money(last.high)}</div><div><small>最低</small>${money(last.low)}</div><div><small>成交量（约股）</small>${number(last.volume,0)}</div></div>${marketCandles(rows,{esc,money,mask:prefs.mask})}<p class="period-stamp">${esc(last.date)}</p>${Number(last.high)<Number(last.low)?'<p class="status mt">原始文件的最高 / 最低价存在不一致，请核对数据源。</p>':''}`:empty(quality.excluded?'行情待核对':'暂无行情'))+(quality.excluded?card(`<details><summary>行情校验 · 已排除 ${quality.excluded} 条</summary><p class="dialog-message">最高价、最低价或价格区间异常。仅使用通过校验的历史记录，原始文件保持不变。</p></details>`):'')+segmented(['10日','30日','90日'],state.stockDays+'日','stock-days')+segmented(['日报','资讯'],state.stockTab,'stock-tab')+content+btn('问投研助手','stock-ask','primary'));
}
function settingsPage(paint){paint(card(`<h2 class="mb">外观与隐私</h2>${[['mask','隐藏金额'],['reduceTransparency','减少透明度'],['reduceMotion','减少动画']].map(([key,label])=>`<label class="setting-row" for="pref-${key}"><span>${label}</span><input class="switch" id="pref-${key}" type="checkbox" data-pref="${key}" ${prefs[key]?'checked':''}></label>`).join('')}`)+card(`<h2 class="mb">数据与显示</h2><label class="setting-row">默认分析范围<select id="default-period" class="time-input">${[['week','周'],['month','月'],['year','年']].map(([v,t])=>`<option value="${v}" ${prefs.period===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="setting-row"><span>记账货币</span><span class="muted">人民币 CNY</span></div><div class="setting-row"><span>数据刷新</span>${btn('立即刷新','refresh-data','small')}</div>`)+card(`<h2>服务状态</h2><div id="service-status"></div><div class="mt">${btn('测试连接','health','small glass')}</div>`)+card(`<details><summary>高级设置</summary><form id="connections-form" class="mt"><label class="field-label" for="book-url">记账服务地址</label><input class="field" type="url" required id="book-url" value="${esc(baseURL('book'))}"><label class="field-label mt" for="trader-url">投研服务地址</label><input class="field" type="url" required id="trader-url" value="${esc(baseURL('trader'))}"><div class="actions"><button type="submit" class="btn primary">保存</button>${btn('恢复默认','reset-connections','','type="button"')}</div><p id="connections-error" class="field-feedback" role="alert"></p></form></details>`)+card(`<div class="setting-row"><span>一起改进助手</span>${btn('查看','improvement-open','small glass')}</div>`)+card(`<details><summary>数据与服务</summary><p>语音、票据采用固定识别结果，核对确认后记入本机隔离账本。</p><p>持仓为合成数据；行情与研究资料保留公开来源和日期。</p><p>麦克风、真实OCR与银行执行未连接。</p></details>`)+card(btn('清空本机对话','clear-all-chat','danger'))+``);}
async function busy(button, action){if(button?.disabled)return;const original=button?.innerHTML;if(button){button.disabled=true;button.innerHTML='处理中…';}try{await action();}catch(error){modal('操作未完成',`<div class="error" role="alert">${esc(error.message)}</div>`);}finally{if(button?.isConnected){button.disabled=false;button.innerHTML=original;}}}
async function healthCheck(button){await busy(button,async()=>{const results=await Promise.allSettled([book('/health'),trader('/health')]);const container=$('#service-status');if(container)container.innerHTML=results.map((r,i)=>{const ok=r.status==='fulfilled'&&r.value.status==='ok';const llm=ok?r.value.llm:null;return `<div class="setting-row"><div><span>${i?'投研服务':'记账服务'}</span><small style="display:block">${ok?(llm?.loaded&&llm?.fine_tuned?'新版微调模型已加载':llm?.configured?'模型已配置（调用时验证）':'AI 尚未配置'):esc(r.reason?.message||r.value?.error||'服务不可用')}</small></div><span class="tag ${ok?'success':'warning'}">${ok?'已连接':'未连接'}</span></div>`;}).join('');});}
async function generatedReport(button, stock=false){await busy(button,async()=>{const code=state.stockCode;const result=await trader(stock?`/trader/stock/${encodeURIComponent(code)}/daily_report`:'/trader/analyst/report',{method:'POST',timeout:180000});if(stock){state.reports[code]=result.reply;if(state.route==='stock'&&state.stockCode===code)render();else toast('研究报告已生成');}else modal('组合解读',`${reportSections(result.reply)}`);});}
const featureContext={state,prefs,storage,productMotion,getSheetGeneration:()=>sheetGeneration,book,trader,esc,money,number,card,btn,icon,loading,empty,range,monthPicker,overview,chart,segmented,modal,closeSheet,toast,render,go,ask,today,habitText,applyParsed,busy,resetLedgerContext:({keepMonth=false}={})=>{ledgerContextPromise=null;if(!keepMonth)state.monthInitialized=false;state.reports={};}};
const approvedWealth=createApprovedWealth(featureContext);featureContext.approvedWealth=approvedWealth;
const approvedResearch=createApprovedResearch(featureContext);featureContext.approvedResearch=approvedResearch;
const approvedRisk=createApprovedRisk(featureContext);featureContext.approvedRisk=approvedRisk;
const goals=createGoals(featureContext);
featureContext.goalCard=goals.goalCard;
const features=createFeatures(featureContext);
const primary=createMobilePages({...featureContext,allBills,finance});
const approvedHome=createApprovedHome({...featureContext,allBills,finance});
const approvedAssistant=createApprovedAssistant({...featureContext,getDisplayName:()=>state.userDisplayName||''});
const approvedOverview=createApprovedOverview({...featureContext,categoryColor:category=>category==='餐饮'?'var(--jade9)':categoryChartColor(category)});
featureContext.approvedOverview=d=>approvedOverview.html(d);
const approvedLedger=createApprovedLedger(featureContext);
featureContext.approvedLedger=approvedLedger;
const approvedTrends=createApprovedTrends(featureContext);
featureContext.approvedTrends=d=>approvedTrends.html(d);
const approvedBudget=createApprovedBudget({...featureContext,finance,onBudgetChanged:value=>{if(value.month===state.month){state.productBudget=value;render();}}});
featureContext.approvedBudget=approvedBudget;
const productAnalysis=createProductAnalysis(featureContext);
const productLedger=createProductLedger({...featureContext,allBills,finance});
const manualCapture=createManualCapture({finance,storage,changed:()=>{if(state.route==='entry')entryPage(html=>{$('#content').innerHTML=html;});else if(state.route==='capture')productCapture.repaint();}});
featureContext.manualCapture=manualCapture;featureContext.recoverManualCandidate=recoverManualCandidate;
const productCapture=createProductCapture(featureContext);
const productInvestment=createProductInvestment({...featureContext,finance});
Object.assign(primary.pages,productAnalysis.pages,productLedger.pages,productCapture.pages,productInvestment.pages,approvedHome.pages);
primary.renderBillList=productLedger.renderBillList;
featureContext.productTask=createProductTask(featureContext);
const journey=createJourney(featureContext);
const banking=createBanking(featureContext,{openDraft:journey.openDraft,openOperation:journey.openOperation});
const investment=createInvestment(featureContext,{startBanking:text=>banking.start(text)});
const research=createResearch(featureContext);
const statements=createStatements(featureContext);
const improvement=createImprovement(featureContext);
const wealth=createWealth(featureContext);
const learning=createLearning(featureContext);
const actions={
 'manual-capture-recover':recoverManualCandidate,
 'product-capture-open':()=>go('capture'), 'home':()=>go('home'),'ledger':()=>go('ledger'),'entry':()=>go('entry'),'insights':()=>go('insights'),'settings':()=>go('settings'),
 'protection-new':()=>{if(banking.start('')!==false)closeSheet();},
 'back':()=>{if(state.route==='capture'&&productCapture.flow.state.busy)productCapture.flow.stop();if(state.route==='ledger'&&state.productLedgerReturnTo){go(state.productLedgerReturnTo);return;}if(state.route==='entry'&&(draft.uncertain||draft.pending))actions['entry-view-ledger']();else navigation.back();},'refresh':()=>render(),'close-sheet':closeSheet,
 'mask':()=>{prefs.mask=!prefs.mask;persistPrefs();render();},
 'ask':()=>ask(`${range().start_date} 至 ${range().end_date} 的收支情况怎么样？`),
 'clear-ledger-range':()=>{state.ledgerRange=null;go('ledger?'+new URLSearchParams({month:state.month,category:state.filter.category||'',type:state.filter.type||''}),{replace:true});},
 'edit-bill':b=>editBill(b.dataset.id),
 'bill':b=>billModal(b.dataset.id),
 'ask-bill':b=>{const bill=state.bills.find(x=>x.id===Number(b.dataset.id));closeSheet();if(bill)ask('请分析这笔账单：'+JSON.stringify(bill));},
 'delete-prompt':b=>confirmSheet('删除这笔账单？','删除后，该账单会从账本和统计中移除。','delete-confirm',`data-id="${b.dataset.id}"`),
 'delete-confirm':b=>busy(b,async()=>{await book('/bills/'+Number(b.dataset.id),{method:'DELETE'});ledgerContextPromise=null;closeSheet();await render();toast('账单已删除');}),
 'filter':()=>modal('筛选账单',`<div class="form-row"><label class="field-label" for="filter-category">分类</label><select id="filter-category" class="field">${['',...filterCategories()].map(c=>`<option value="${esc(c)}" ${state.filter.category===c?'selected':''}>${esc(c||'全部分类')}</option>`).join('')}</select></div><label class="field-label" for="filter-type">收支</label><select id="filter-type" class="field"><option value="">全部</option><option value="expense" ${state.filter.type==='expense'?'selected':''}>支出</option><option value="income" ${state.filter.type==='income'?'selected':''}>收入</option></select><div class="actions">${btn('重置','reset-filter')}${btn('应用筛选','apply-filter','primary')}</div>`),
 'apply-filter':()=>{state.filter.category=$('#filter-category').value;state.filter.type=$('#filter-type').value;closeSheet();render();},
 'reset-filter':()=>{state.filter={category:'',type:'',q:''};state.ledgerRange=null;closeSheet();render();},
 'entry-type':b=>{syncDraft();draft.type=b.dataset.value==='收入'?'income':'expense';if(!entryCategories().includes(draft.category))draft.category=entryCategories()[0];storage.set('QINGCAI_DRAFT',draft);render();},
 'entry-category':b=>{syncDraft();draft.category=b.dataset.value;storage.set('QINGCAI_DRAFT',draft);render();},
 'discard-draft':()=>confirmSheet('丢弃草稿？','金额、分类和备注将被清空。','discard-confirm'),
 'discard-confirm':()=>{draft=freshDraft();storage.set('QINGCAI_DRAFT',draft);closeSheet();render();},
 'parse-entry':()=>{syncDraft();modal('文字解析',`<label class="field-label" for="parse-text">描述这笔收支</label><textarea class="field" id="parse-text" placeholder="例如：今天中午用微信吃饭花了 28 元"></textarea><div class="mt">${btn('解析','parse-confirm','primary')}</div>`);},
 'parse-confirm':b=>busy(b,async()=>{const text=$('#parse-text').value.trim();if(!text)throw new Error('请先输入账单描述');const parsed=await book('/bills/parse',{method:'POST',body:{text,reference_date:today()},timeout:180000});applyParsed(parsed);}),
 'ocr-entry':()=>{if(!state.ledgerInfo?.capabilities?.ocr){actions['parse-entry']();return;}syncDraft();modal('识别票据',`<input class="field" id="receipt-file" type="file" accept="image/*" aria-label="选择票据图片"><div class="mt">${btn('开始识别','ocr-confirm','primary')}</div>`);},
 'ocr-confirm':b=>busy(b,async()=>{const file=$('#receipt-file').files[0];if(!file)throw new Error('请先选择图片');if(file.size>10*1024*1024)throw new Error('图片不能超过 10 MB');const form=new FormData();form.append('file',file);const result=await book('/bills/ocr',{method:'POST',body:form,timeout:180000});applyParsed(result.parsed);}),
 'insight-tab':b=>{state.insightTab=b.dataset.value;render();},
 'period':b=>{state.period={'周':'week','月':'month','年':'year'}[b.dataset.value];render();},
 'category-ledger':b=>{state.ledgerRange=range(state.period);state.filter.category=b.dataset.value;state.filter.q='';state.filter.type='expense';go('ledger');},
 'insight-advice':()=>ask('请基于以下真实区间统计给出简短财务建议，不要臆测其他数据：'+JSON.stringify(state.currentReport)),
 'chart-point':b=>{const el=b.closest('.chart-container')?.querySelector('.chart-value')||b.closest('svg').parentElement.querySelector('.chart-value');if(el)el.textContent=b.dataset.value;},
 'chat-mode':b=>{if(state.chatBusy){toast('请先等待回复或停止等待');return;}state.chatDraft=$('#chat-input')?.value||'';state.mode=b.dataset.value==='投研'?'trader':b.dataset.value==='规划'?'finance':'book';state.chatContext=null;state.chatLedgerRange=null;closeSheet();render();},
 'suggestion':b=>{if(b.dataset.value==='查看自选股'){actions.watchlist();return;}const input=$('#chat-input');input.value=b.dataset.value;state.chatDraft=b.dataset.value;state.chatContext=null;syncChatComposer();input.focus();},
 'send':()=>{},
 'stop-chat':stopChat,
 'copy-message':b=>busy(b,async()=>{const text=state.chats[state.mode][Number(b.dataset.index)]?.content;if(!text)return;if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const field=document.createElement('textarea');field.value=text;field.setAttribute('aria-hidden','true');field.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();if(!copied)throw new Error('无法复制，请选择文本');}toast('已复制');}),
 'clear-chat':()=>{if(state.chatBusy){toast('请先停止等待回复');return;}confirmSheet('开始新对话？','将清空本机当前模式的对话记录。','clear-chat-confirm');},
 'clear-chat-confirm':()=>{state.chats[state.mode]=[];storage.set('QINGCAI_CHATS',state.chats);state.chatDraft='';state.chatContext=null;closeSheet();render();},
 'clear-all-chat':()=>{if(state.chatBusy){toast('请先停止等待回复');return;}confirmSheet('清空本机对话？','本机全部对话将被清除，账本不受影响。','clear-all-confirm');},
 'clear-all-confirm':()=>{state.chats={book:[],trader:[],finance:[]};storage.set('QINGCAI_CHATS',state.chats);closeSheet();toast('本机对话已清空');},
 'investment-tab':b=>{state.investmentTab=b.dataset.value;render();},
 'stock':b=>stockLink(b.dataset.code,b.dataset.name),
 'watchlist':()=>{closeSheet();state.investmentTab='自选';go('research');},
 'portfolio-report':b=>generatedReport(b),
 'investment-ask':()=>ask('请解读当前组合的配置与风险。','trader'),
 'stock-tab':b=>{state.stockTab=b.dataset.value;render();},
 'stock-days':b=>{state.stockDays=parseInt(b.dataset.value,10);render();},
 'stock-report':b=>generatedReport(b,true),
 'stock-ask':()=>ask(`请分析 ${state.stockName}（${state.stockCode}）。以下是项目历史行情：${JSON.stringify(state.quotes[state.stockCode]||[])}。请明确数据日期。`,'trader'),
 'favorite':()=>{const code=state.stockCode;state.favorites=state.favorites.includes(code)?state.favorites.filter(x=>x!==code):[...state.favorites,code];storage.set('QINGCAI_FAVORITES',state.favorites);render();},
 'news':b=>{const item=state.news[Number(b.dataset.index)];if(!item)return;const title=item.title||item['新闻标题']||item['报告名称']||'研究资料';const publisher=item.publisher||item.source||item['文章来源']||item['机构']||'';const kind=({broker_research:'券商研报',consulting_research:'咨询研究',company_disclosure:'公司披露',company_report:'公司披露',company_report_summary:'财报摘要'}[item.type]||'公开资料');const date=(item.published_at||item['日期']||'').slice(0,10);const body=item['新闻内容']||item.content||item['摘要']||'';const url=item.url||item['新闻链接']||item['报告链接'];let link='';try{const u=new URL(url);if(['http:','https:'].includes(u.protocol))link=`<a class="btn primary mt" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">查看原文</a>`;}catch{}modal(title,`<div class="row between"><span>${esc(kind)}</span><span>${esc(date)}</span></div><p>${esc(publisher)}</p>${body?`<div class="report-text">${esc(body)}</div>`:''}${link}`);},
 'health':healthCheck,
 'reset-connections':()=>{resetConnections();ledgerContextPromise=null;state.monthInitialized=false;state.reports={};render();toast('服务地址已恢复默认');},
 'manual-duplicate-cancel':()=>{closeSheet();render();},
 'manual-duplicate-keep':async()=>{closeSheet();draft.duplicate_keep=true;await render();await saveEntry({retry:true});},
 'refresh-data':()=>{state.reports={};state.quotes={};state.watchlist=[];ledgerContextPromise=null;toast('缓存已清除，页面将重新读取数据');},
};
Object.assign(actions,features.actions,journey.actions,banking.actions,investment.actions,research.actions,statements.actions,goals.actions,improvement.actions,wealth.actions,learning.actions,primary.actions,productAnalysis.actions,productLedger.actions,productCapture.actions,productInvestment.actions);
Object.assign(actions,{
 'statement-import':()=>{closeSheet();go('capture');},
 'apply-filter':()=>{state.filter.category=$('#filter-category').value;state.filter.type=$('#filter-type').value;state.mobileLimit=4;closeSheet();go('ledger?'+new URLSearchParams({...state.ledgerRange,month:state.month,category:state.filter.category,type:state.filter.type}),{replace:true});},
 'entry-view-ledger':()=>{state.month=draft.event_date.slice(0,7);state.monthInitialized=true;state.filter={category:'',type:'',q:'',day:''};state.ledgerRange=null;go('ledger?'+new URLSearchParams({month:state.month}));},
 'entry-reconcile':b=>busy(b,async()=>{if(draft.pending)return;const target=draft,key=draft.client_request_id;const rows=await allBills({start_date:draft.event_date,end_date:draft.event_date});if(draft!==target||draft.client_request_id!==key)return;const saved=rows.find(r=>r.metadata?.client_request_id===key);if(saved)finishEntry(saved,{navigate:state.route==='entry'&&renderedEntryDraft===target});else{draft.reconciled=true;storage.set('QINGCAI_DRAFT',draft);showUncertainEntry();}}),
 'entry-retry-same-request':async b=>{if(!draft.uncertain||!draft.reconciled)return;draft.uncertain=false;draft.pending=false;draft.reconciled=false;storage.set('QINGCAI_DRAFT',draft);b.disabled=true;b.textContent='正在保存';await saveEntry({retry:true});},
 'mobile-chat-ledger':b=>{const f=state.chats[state.mode][Number(b.dataset.index)]?.fact;if(!f)return;go('ledger?'+new URLSearchParams({...f.dates,month:state.month,category:f.category||'',type:f.type||'',cashflow_only:'1',...(f.bill_ids?{bill_ids:f.bill_ids.join(',')}: {})}));},
 'mobile-chat-options':()=>modal('更多功能',`<div class="fp-assistant-actions">${btn(icon('ledger')+'快速记账','product-capture-open')}${btn(icon('shield')+'银行任务与记录','mobile-bank')}${btn(icon('mic')+'语音输入','feature-unavailable','','data-feature="voice"')}${btn(icon('calendar')+'订阅管理','feature-unavailable','','data-feature="subscriptions"')}</div>`),
 'feature-unavailable':b=>{const title=b.dataset.feature==='subscriptions'?'订阅管理':'语音输入';modal(title,`<div class="fp-feature-unavailable">${icon(b.dataset.feature==='subscriptions'?'calendar':'mic')}<h3>暂未开放</h3>${b.dataset.feature==='voice'?btn('使用文字录入','product-capture-open','primary'):btn('返回','close-sheet','primary')}</div>`);},
 'assistant-investment':()=>{closeSheet();go('research');}
});
Object.assign(actions,approvedAssistant.actions,approvedBudget.actions,approvedResearch.actions,{
 'ap-chart-trend':()=>{state.productAnalysisTab='trend';render();},
 'ap-chart-budget':()=>{state.productAnalysisTab='budget';render();}
});
const legacyChatAdd=actions['chat-add'];
actions['chat-add']=b=>state.mode==='finance'?journey.showQuickInputs():legacyChatAdd(b);
document.addEventListener('input',features.onInput);
document.addEventListener('change',features.onChange);
document.addEventListener('change',investment.onChange);
document.addEventListener('submit',features.onSubmit);
document.addEventListener('submit',approvedBudget.onSubmit);
document.addEventListener('submit',journey.onSubmit);
document.addEventListener('submit',banking.onSubmit);
document.addEventListener('input',banking.onInput);
document.addEventListener('keydown',banking.onKeyDown);
document.addEventListener('submit',statements.onSubmit);
document.addEventListener('input',statements.onInput);
document.addEventListener('change',statements.onChange);
document.addEventListener('submit',goals.onSubmit);
document.addEventListener('submit',wealth.onSubmit);
document.addEventListener('change',wealth.onChange);
document.addEventListener('submit',learning.onSubmit);
document.addEventListener('input',learning.onInput);
document.addEventListener('click',event=>{const tab=event.target.closest('[data-nav-tab]');if(tab&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();go(tab.dataset.navTab,{root:true});return;}const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action!=='send')event.preventDefault();if(['entry','ledger','insights','settings'].includes(action)&&$('#sheet').open)closeSheet();const handler=actions[action];if(handler)Promise.resolve(handler(button,event)).catch(e=>toast(e.message));});
document.addEventListener('keydown',event=>{const point=event.target.closest('.chart-point,.mobile-chart-bucket');if(point&&['Enter',' '].includes(event.key)){event.preventDefault();actions[point.dataset.action]?.(point);}if(event.target.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();sendChat();}});
document.addEventListener('input',event=>{if(event.target.closest(retainedForms))retainPageDraft();if(event.target.closest('#entry-form')){if(!draft.uncertain&&!draft.pending&&draft.attempted){draft.client_request_id=uid();draft.pending=false;draft.attempted=false;}syncDraft();}if(event.target.id==='bill-search'){state.filter.q=event.target.value;primary.renderBillList();}if(event.target.id==='chat-input'){state.chatDraft=event.target.value;syncChatComposer();}});
document.addEventListener('change',event=>{const el=event.target;if(el.closest(retainedForms))retainPageDraft();if(el.id==='month-picker'&&/^\d{4}-\d{2}$/.test(el.value)){state.month=el.value;state.monthInitialized=true;state.ledgerRange=null;state.mobileLimit=4;if(state.route==='ledger')go('ledger?'+new URLSearchParams({month:state.month,category:state.filter.category||'',type:state.filter.type||''}),{replace:true});else render();}if(el.dataset.pref){prefs[el.dataset.pref]=el.checked;persistPrefs();}if(el.id==='default-period'){prefs.period=el.value;state.period=el.value;persistPrefs();}});
document.addEventListener('submit',async event=>{event.preventDefault();if(event.target.id==='entry-form'){await saveManualCapture();}if(event.target.id==='chat-form')await sendChat();if(event.target.id==='connections-form'){try{saveConnections($('#book-url').value.trim(),$('#trader-url').value.trim());ledgerContextPromise=null;state.monthInitialized=false;state.reports={};state.watchlist=[];toast('服务地址已保存');}catch(error){$('#connections-error').textContent=error.message;}}});
$('#sheet').addEventListener('click',event=>{if(event.target===$('#sheet')){const r=event.target.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right)closeSheet();}});
document.addEventListener('submit',event=>{if(event.target.matches(retainedForms))pageDrafts.delete(state.route);},true);
function fitViewport(){const vv=window.visualViewport;if(!vv)return;document.body.classList.toggle('keyboard',window.innerHeight-vv.height>150);document.documentElement.style.setProperty('--keyboard-inset',`${Math.max(0,window.innerHeight-vv.height-vv.offsetTop)}px`);document.documentElement.style.setProperty('--visual-height',`${vv.height}px`);}
window.visualViewport?.addEventListener('resize',fitViewport);window.visualViewport?.addEventListener('scroll',fitViewport);fitViewport();
render();

document.addEventListener('input',e=>productCapture.onInput(e));
document.addEventListener('change',e=>{productCapture.onChange(e);if(e.target.id==='pa-point-picker')productAnalysis.actions['pa-point-select'](e.target);});
document.addEventListener('submit',e=>productCapture.onSubmit(e));

document.addEventListener('change',e=>productInvestment.onChange(e));
document.addEventListener('submit',e=>productInvestment.onSubmit(e));
