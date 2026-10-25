import {mountLedgerStrip,ledgerMonthOptions,monthSelectionRoute} from './ledger-controls.js';
import {billDescription} from './primary-pages.js';
import {categoryIconKey,LEDGER_CATEGORIES} from './category-icons.js';
import {selectLedgerRows} from './mobile-pages.js';

// Native source: stitch-core-inputs/ledger.html, SHA256 57297af00f5628693747c51040ce95dcef08070a2916391e83e790cb3ac9aec6.
// Retains its compact summary, paired stats/actions, category pills and dated cards.
const CATEGORIES=LEDGER_CATEGORIES;
const metadata=row=>{if(typeof row.metadata==='string'){try{return JSON.parse(row.metadata)||{};}catch{return {};}}return row.metadata||{};};
const cashflow=row=>!['internal_transfer','principal'].includes(metadata(row).movement||row.movement);
const refund=row=>row.type==='income'&&['退款','refund'].includes(row.category);
const text=value=>typeof value==='string'?value.trim():'';
export function ledgerRowContext(row){
 const meta=metadata(row),category=text(row.category);
 const name=text(row.description)?billDescription({...row,metadata:meta}):text(meta.merchant)||category||'未填写';
 const account=text(meta.account_name)||text(meta.account_label)||text(row.account_name)||text(row.account_label);
 const payment=text(meta.payment_method)||text(row.payment_method);
 const accounts=[...new Set([account,payment].filter(Boolean))];
 const sameCategory=[category,category+'支出',category+'收入'].includes(name);
 return {name,category:sameCategory?'':category,account:accounts.join(' / ')||'未选账户',accountParts:accounts.length?accounts:['未选账户'],date:String(row.event_date||'').slice(0,10)};
}

function totals(rows){
 const t={gross_income_minor:0,refund_minor:0,gross_expense_minor:0};
 for(const row of rows){if(!cashflow(row)||(row.currency||'CNY')!=='CNY')continue;const n=Math.round(Number(row.amount)*100);if(!Number.isSafeInteger(n))continue;t[refund(row)?'refund_minor':row.type==='income'?'gross_income_minor':'gross_expense_minor']+=n;}
 t.net_expense_minor=t.gross_expense_minor-t.refund_minor;t.net_cashflow_minor=t.gross_income_minor-t.net_expense_minor;return t;
}
export function createProductLedger(ctx){
 const {state,prefs,allBills,finance,esc,money,icon,loading,range,go,render,modal,closeSheet}=ctx;
 const button=(label,action,cls='',extra='')=>`<button type="button" class="fp-ledger-button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
 const cash=n=>money(n/100,'CNY');
 const selectedDates=()=>state.ledgerRange||range();
 const filter=()=>state.filter||(state.filter={q:'',category:'',type:'',day:''});
 const filtered=()=>{let rows=selectLedgerRows(state.bills||[],filter());if(state.productLedgerCashflowOnly)rows=rows.filter(cashflow);if(Array.isArray(state.productLedgerIds)){const ids=new Set(state.productLedgerIds.map(String));rows=rows.filter(row=>ids.has(String(row.id)));}return rows;};
 const activeFilters=()=>Boolean(filter().q||filter().category||filter().type||filter().day||state.productLedgerCashflowOnly||Array.isArray(state.productLedgerIds));
 function hero(t){const category=filter().category;if(['退款','refund'].includes(category))return {label:'退款总额',amount:t.refund_minor};if(filter().type==='income'||['工资','奖金','副业','理财收益','其他收入'].includes(category))return {label:'收入总额',amount:t.gross_income_minor};return {label:activeFilters()?'支出总额':'本期支出',amount:t.gross_expense_minor};}
 function summaryHTML(t){const h=hero(t);return `<span class="fp-ledger-eyebrow">${h.label}</span><strong class="fp-ledger-total money">${cash(h.amount)}</strong><div class="fp-ledger-stats"><div><span>收入</span><strong class="money fp-ledger-income">${cash(t.gross_income_minor)}</strong></div><div><span>结余</span><strong class="money">${cash(t.net_cashflow_minor)}</strong></div></div>${t.refund_minor?`<p class="fp-ledger-basis"><span>退款 ${cash(t.refund_minor)}</span><span>净支出 ${cash(t.net_expense_minor)}</span></p>`:''}`;}
 function pendingHTML(){const count=state.productLedgerPending;return button(`待确认 <span class="fp-ledger-count">${Number.isInteger(count)?count:'—'}</span>${icon('next')}`,'fp-ledger-capture','fp-ledger-pending'+(Number.isInteger(count)&&count>0?' is-pending':' is-neutral'),`aria-label="待确认${Number.isInteger(count)?count+'条':'数量暂不可用'}"`);}
 const categories=()=>[...new Set([...CATEGORIES,...(state.ledgerInfo?.categories||[]),...(state.bills||[]).map(row=>row.category)])].filter(Boolean);
 function categoryHTML(){const current=filter().category;return `<div class="fp-ledger-category-tools"><div class="fp-ledger-categories" aria-label="分类筛选">${button('全部','fp-ledger-category',!current?'is-active':'',`data-value="" aria-pressed="${!current}"`)}${categories().slice(0,4).map(category=>button(`${icon(categoryIconKey(category))}${esc(category)}`,'fp-ledger-category',current===category?'is-active':'',`data-value="${esc(category)}" aria-pressed="${current===category}"`)).join('')}</div>${button(icon('filter')+'分类','fp-ledger-categories','fp-ledger-category-menu',`aria-label="全部分类${current?'，当前'+esc(current):''}"`)}</div>`;}
 function categoryModal(){const current=filter().category;modal('选择分类',`<div class="fp-ledger-category-grid">${button('全部','fp-ledger-category',!current?'is-active':'',`data-value=""`)}${categories().map(category=>button(`${icon(categoryIconKey(category))}${esc(category)}`,'fp-ledger-category',current===category?'is-active':'',`data-value="${esc(category)}" aria-pressed="${current===category}"`)).join('')}</div>`);}
 function rowHTML(row){const meta=metadata(row),move=meta.movement||row.movement,context=ledgerRowContext(row);const badge=move==='internal_transfer'?'内部划转':move==='principal'?'本金流转':refund(row)?(meta.refund_of_bill_id?'退款（已关联）':'退款（未关联）'):'';return `<button type="button" class="fp-ledger-row ${state.highlightBill===row.id?'fp-ledger-saved':''}" data-action="fp-ledger-bill" data-id="${esc(row.id)}"><span class="fp-ledger-icon">${icon(categoryIconKey(row.category,row.type))}</span><span class="fp-ledger-row-copy"><strong>${esc(context.name)}</strong><small class="fp-ledger-row-context">${context.category?`<span>${esc(context.category)}</span>`:''}<span class="fp-ledger-row-account">${context.accountParts.map(value=>`<span class="fp-ledger-account-part">${value.split(/(\d+)/).map(part=>/^\d+$/.test(part)?`<span class="fp-ledger-account-number">${esc(part)}</span>`:esc(part)).join('')}</span>`).join('')}</span></small>${badge?`<small class="fp-ledger-row-badge">${esc(badge)}</small>`:''}</span><span class="fp-ledger-row-value"><strong class="money ${row.type==='income'?'fp-ledger-income':''}">${row.type==='income'?'+':'−'}${money(row.amount,row.currency)}</strong>${row.currency&&row.currency!=='CNY'?`<small>${esc(row.currency)}</small>`:''}</span></button>`;}

 let disposeStrip=()=>{};
 function mountCategoryStrip(){
  disposeStrip();
  const strip=document.querySelector('.ap-l-categories');if(!strip)return;
  const reveal=button=>{const a=button.getBoundingClientRect(),b=strip.getBoundingClientRect();if(a.left<b.left+3)strip.scrollLeft-=b.left+3-a.left;else if(a.right>b.right-3)strip.scrollLeft+=a.right-b.right+3;};
  const selected=strip.querySelector('.is-active');if(selected){reveal(selected);if(state.ledgerCategoryFocus){selected.focus({preventScroll:true});state.ledgerCategoryFocus=false;}}
  disposeStrip=mountLedgerStrip(strip);
 }
 function renderBillList(){
  const list=document.querySelector('#bill-list'),summary=document.querySelector('#ledger-filter-summary');if(!list||!summary)return;
  const rows=filtered(),dates=selectedDates(),dto=state.productLedgerAnalysis;
  const t=!activeFilters()&&dto?.period?.start_date===dates.start_date&&dto?.period?.end_date===dates.end_date?dto.totals:totals(rows);
  summary.innerHTML=ctx.approvedLedger?ctx.approvedLedger.summary(t,hero(t)):summaryHTML(t);
  const limit=state.productLedgerLimit||8,visible=rows.slice(0,limit),groups=new Map();for(const row of visible){const day=String(row.event_date).slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(row);}
  const status=document.querySelector('#fp-ledger-results');if(status)status.textContent=`${rows.length} 条记录${activeFilters()?'（已筛选）':''}`;
  const chips=document.querySelector('#fp-ledger-active-filters');if(chips)chips.innerHTML=activeFilters()?`<span>${esc([filter().category,filter().type==='income'?'收入':filter().type==='expense'?'支出':'',filter().day,state.productLedgerCashflowOnly?'收支流水':'',Array.isArray(state.productLedgerIds)?'图表所选记录':''].filter(Boolean).join('，')||'搜索结果')}</span>${button('清除筛选','fp-ledger-clear','fp-ledger-text')}`:'';
  if(ctx.approvedLedger){list.innerHTML=rows.length?ctx.approvedLedger.rows(visible)+(rows.length>visible.length?ctx.approvedLedger.more(rows.length-visible.length):''):ctx.approvedLedger.empty(activeFilters());return;}
  list.innerHTML=rows.length?[...groups].map(([day,items])=>{const allDay=rows.filter(row=>String(row.event_date).slice(0,10)===day),daily=totals(allDay);return `<section class="fp-ledger-day"><header class="fp-ledger-day-head"><h2>${esc(day.replaceAll('-','/'))}</h2>${allDay.length>1?`<span>当日结余 <strong class="money">${cash(daily.net_cashflow_minor)}</strong></span>`:''}</header>${items.map(rowHTML).join('')}</section>`;}).join('')+(rows.length>visible.length?button(`查看更多（还有 ${rows.length-visible.length} 条）`,'fp-ledger-more','fp-ledger-more'):''):`<section class="fp-ledger-empty">${icon('ledger')}<h2>${activeFilters()?'没有匹配的记录':'这段时间还没有记录'}</h2><p>${activeFilters()?'调整分类、日期或关键词，查看其他流水。':'写一句话、识别票据或导入账单，核对后即可记入。'}</p>${button(activeFilters()?'清除筛选':'记一笔',activeFilters()?'fp-ledger-clear':'fp-ledger-capture','fp-ledger-primary')}</section>`;
 }
 async function ledgerPage(paint){
  const epoch=state.epoch,dates={...selectedDates()};paint(loading());
  const [rows,analysis,inbox]=await Promise.all([allBills(dates),finance('/analysis?'+new URLSearchParams(dates)).then(value=>({value}),error=>({error})),finance('/capture').then(value=>({value}),error=>({error}))]);if(epoch!==state.epoch)return;
  state.bills=[...rows].sort((a,b)=>String(b.event_date).localeCompare(String(a.event_date))||Number(b.id)-Number(a.id));state.productLedgerAnalysis=analysis.value||null;
  state.productLedgerPending=inbox.value?.batches?.filter(batch=>batch.status==='pending').reduce((sum,batch)=>sum+Number(batch.count||0),0)??null;
  state.productLedgerLimit=Math.max(8,state.productLedgerLimit||8);
  if(ctx.approvedLedger){paint(ctx.approvedLedger.shell({dates:state.ledgerRange,categories:categories(),pending:state.productLedgerPending,errors:[inbox.error?'待确认暂不可用':'',analysis.error?'汇总已按流水计算':''].filter(Boolean)}));renderBillList();mountCategoryStrip();return;}
  paint(`<div class="fp-ledger"><div class="fp-ledger-toolbar">${state.ledgerRange?`<span class="fp-ledger-range">${esc(dates.start_date)}<br>至 ${esc(dates.end_date)}</span>${button('按月查看','fp-ledger-month','fp-ledger-text')}`:`<label class="fp-ledger-month"><span>${esc(state.month.replace('-','年'))}月</span>${icon('down')}<input type="month" id="month-picker" value="${esc(state.month)}" aria-label="选择月份"></label>`}${button(icon('filter'),'filter','fp-ledger-tool','aria-label="筛选账单"')}${button(icon('eye'),'mask','fp-ledger-tool',`aria-label="${prefs.mask?'显示金额':'隐藏金额'}"`)}</div><section class="fp-ledger-overview"><div id="ledger-filter-summary" aria-live="polite"></div><div class="fp-ledger-main-actions">${button(icon('add')+'记一笔','fp-ledger-capture','fp-ledger-primary')}${pendingHTML()}</div>${inbox.error?'<p class="fp-ledger-basis" role="status">待确认数量暂不可用，可进入收集箱重试。</p>':''}${analysis.error?'<p class="fp-ledger-basis" role="status">汇总暂由已加载流水计算，可刷新重试。</p>':''}</section><label class="fp-ledger-search">${icon('search')}<input type="search" id="bill-search" placeholder="搜索备注、分类、支付方式" aria-label="搜索账单" value="${esc(filter().q||'')}"></label>${categoryHTML()}<div id="fp-ledger-active-filters" class="fp-ledger-active-filters"></div><div id="fp-ledger-results" class="fp-ledger-results" aria-live="polite"></div><div id="bill-list" class="fp-ledger-list"></div></div>`);renderBillList();
 }
 function updateCategory(category){state.ledgerCategoryFocus=globalThis.document?.activeElement?.dataset?.action==='fp-ledger-category';closeSheet();filter().category=category;filter().type='';state.productLedgerLimit=8;const params=new URLSearchParams({...state.ledgerRange,month:state.month,category,type:'',day:filter().day||''});if(state.productLedgerCashflowOnly)params.set('cashflow_only','1');if(Array.isArray(state.productLedgerIds))params.set('bill_ids',state.productLedgerIds.join(','));if(state.productLedgerReturnTo)params.set('return_to',state.productLedgerReturnTo);go('ledger?'+params,{replace:true});}
 function clearFilters(){state.filter={q:'',category:'',type:'',day:''};state.productLedgerCashflowOnly=false;state.productLedgerIds=null;state.productLedgerLimit=8;const params=new URLSearchParams({...state.ledgerRange,month:state.month});if(state.productLedgerReturnTo)params.set('return_to',state.productLedgerReturnTo);go('ledger?'+params,{replace:true});}
 function openBill(id){const row=(state.bills||[]).find(row=>String(row.id)===String(id));if(!row)return;const meta=metadata(row),move=meta.movement||row.movement;modal('账单详情',`<div class="fp-ledger-detail"><strong class="money">${row.type==='income'?'+':'−'}${money(row.amount,row.currency)}</strong><h3>${esc(ledgerRowContext(row).name)}</h3><p>${esc(row.event_date)}<br>${esc(row.category)}</p><p>${esc(ledgerRowContext(row).account)}${move==='principal'?'<br>本金流转':move==='internal_transfer'?'<br>内部划转':refund(row)?'<br>退款':''}</p><div class="fp-ledger-detail-actions">${button('编辑账单','edit-bill','fp-ledger-primary',`data-id="${esc(row.id)}"`)}${button('关闭','close-sheet')}</div><details><summary>更多操作</summary>${button('删除账单','delete-prompt','',`data-id="${esc(row.id)}"`)}</details></div>`);}
 function monthModal(){const months=ledgerMonthOptions();modal('选择月份',`<div class="nl-months">${['2025','2026'].map(year=>`<section><h3>${year}年</h3><div>${months.filter(m=>m.startsWith(year)).map(m=>button(Number(m.slice(5))+'月','nl-month-select',m===state.month?'is-active':'',`data-value="${m}" aria-pressed="${m===state.month}"`)).join('')}</div></section>`).join('')}</div>`);}
 function chooseMonth(value){const route=monthSelectionRoute(state,value);if(!route)return;state.month=value;state.monthInitialized=true;state.ledgerRange=null;state.productLedgerIds=null;state.filter.day='';state.productLedgerLimit=8;closeSheet();go(route);}
 return {pages:{ledger:ledgerPage},renderBillList,dispose:()=>disposeStrip(),actions:{'nl-month-open':monthModal,'nl-month-select':button=>chooseMonth(button.dataset.value),'fp-ledger-categories':categoryModal,'fp-ledger-capture':()=>go('capture'),'fp-ledger-manual':()=>go('entry'),'fp-ledger-import':()=>go('statement-import'),'fp-ledger-category':element=>updateCategory(element.dataset.value),'fp-ledger-more':()=>{state.productLedgerLimit=(state.productLedgerLimit||8)+8;renderBillList();},'fp-ledger-clear':clearFilters,'fp-ledger-month':()=>{state.ledgerRange=null;state.productLedgerCashflowOnly=false;state.productLedgerIds=null;state.productLedgerLimit=8;go('ledger?'+new URLSearchParams({month:state.month}),{replace:true});},'fp-ledger-bill':element=>openBill(element.dataset.id)}};
}


