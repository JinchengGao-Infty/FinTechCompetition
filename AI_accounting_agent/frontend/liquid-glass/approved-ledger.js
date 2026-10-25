import {billDescription} from './primary-pages.js';
import {categoryIconKey,categoryBadgeStyle,LEDGER_CATEGORIES} from './category-icons.js';
// Calibrated native handoff-next/pages/ledger.html
// SHA256 0e8cf2af5ba033f88e5fb3dc6be1284688640e149754f8dd298e736d9996f2eb.
// Pure presentation: controller owns loading, filtered IDs, period, totals, limits,
// navigation and mutations. No native prototype amounts, IDs or event scripts.
export function createApprovedLedger({state,prefs,esc,money,icon}){
 const cash=(value,currency='CNY')=>prefs.mask?'••••':value==null?'—':money(value,currency);
 const minor=value=>cash(Number.isSafeInteger(value)?value/100:null);
 const button=(label,action,cls='',extra='')=>`<button type="button" class="ap-l-button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
 function summary(t,h={label:'本期支出',amount:t.gross_expense_minor}){
  return `<span class="ap-l-label">${esc(h.label)}</span><strong class="ap-l-total">${minor(h.amount)}</strong><div class="ap-l-pair"><div><span class="ap-l-label">收入</span><strong class="ap-l-income">${minor(t.gross_income_minor)}</strong></div><div><span class="ap-l-label">结余</span><strong>${minor(t.net_cashflow_minor)}</strong></div></div>${t.refund_minor?`<p class="ap-l-refund">退款 ${minor(t.refund_minor)}<span>净支出 ${minor(t.net_expense_minor)}</span></p>`:''}`;
 }
 function shell({dates=state.ledgerRange,categories=LEDGER_CATEGORIES,pending=state.productLedgerPending,errors=[]}={}){
  const selected=state.filter?.category||'',count=Number.isInteger(pending)&&pending>=0?pending:null;
  const cats=[...new Set([...categories,selected].filter(Boolean))];
  return `<div class="ap-ledger"><div class="ap-l-toolbar">${dates?`<div class="ap-l-range"><span>${esc(dates.start_date)} 至 ${esc(dates.end_date)}</span>${button('按月查看','fp-ledger-month')}</div>`:`<button type="button" class="ap-l-month" data-action="nl-month-open" aria-label="选择月份，当前${esc(state.month)}">${icon('calendar')}<span>${esc(String(state.month).replace('-','年'))}月</span>${icon('down')}</button><input id="month-picker" type="hidden" value="${esc(state.month)}">`}${button(icon('filter'),'filter','ap-l-round','aria-label="筛选账单"')}${button(icon('eye'),'mask','ap-l-round',`aria-label="${prefs.mask?'显示金额':'隐藏金额'}"`)}</div><section class="ap-l-glass ap-l-hero"><div id="ledger-filter-summary" aria-live="polite"></div></section><div class="ap-l-actions">${button(icon('add')+'记一笔','fp-ledger-capture','ap-l-primary')}${button(`待确认 <span class="ap-l-count">${count===null?'—':count}</span>${icon('next')}`,'fp-ledger-capture',`ap-l-pending ${count>0?'is-pending':''}`)}</div>${errors.map(error=>`<p class="ap-l-status" role="status">${esc(error)}</p>`).join('')}<label class="ap-l-search">${icon('search')}<input id="bill-search" type="search" placeholder="搜索账单" aria-label="搜索备注、分类、支付方式" value="${esc(state.filter?.q||'')}"></label><div class="ap-l-category-tools"><div class="ap-l-categories" role="group" aria-label="分类筛选">${button('全部','fp-ledger-category',!selected?'is-active':'',`data-value="" aria-pressed="${!selected}"`)}${cats.map(category=>button(icon(categoryIconKey(category))+esc(category),'fp-ledger-category',selected===category?'is-active':'',`data-value="${esc(category)}" style="${categoryBadgeStyle(category)}" aria-pressed="${selected===category}"`)).join('')}</div></div><div id="fp-ledger-active-filters" class="ap-l-filters"></div><div id="fp-ledger-results" class="ap-l-results sr-only" aria-live="polite"></div><div id="bill-list" class="ap-l-list"></div></div>`;
 }
 function row(row){
  let m=row.metadata||{};if(typeof m==='string'){try{m=JSON.parse(m)||{};}catch{m={};}}
  const name=billDescription({...row,metadata:m})||m.merchant||row.category||'未填写';
  const account=[...new Set([m.account_name||m.account_label||row.account_name||row.account_label,m.payment_method||row.payment_method].filter(Boolean))];
  const movement=m.movement||row.movement,badge=movement==='internal_transfer'?'内部划转':movement==='principal'?'本金流转':row.category==='退款'?(m.refund_of_bill_id?'退款（已关联）':'退款（未关联）'):'';
  const same=[row.category,row.category+'支出',row.category+'收入'].includes(name);
  const context=(account.length?account:['未选账户']).map(value=>`<span>${String(value).split(/(\d+)/).map(part=>/^\d+$/.test(part)?`<span class="ap-l-account-number">${esc(part)}</span>`:esc(part)).join('')}</span>`).join('');
  return `<button type="button" class="ap-l-row ap-l-glass ${state.highlightBill===row.id?'is-saved':''} ${String(row.amount).length>10?'is-long-value':''}" data-action="fp-ledger-bill" data-id="${esc(row.id)}"><span class="ap-l-icon" style="${categoryBadgeStyle(row.category,row.type)}">${icon(categoryIconKey(row.category,row.type))}</span><span class="ap-l-copy"><strong>${esc(name)}</strong>${same?'':`<small>${esc(row.category||'')}</small>`}<small class="ap-l-account">${context}</small>${badge?`<small>${esc(badge)}</small>`:''}</span><strong class="ap-l-value">${prefs.mask?'••••':(row.type==='income'?'+':'−')+cash(row.amount,row.currency)}</strong><span class="ap-l-next">${icon('next')}</span></button>`;
 }
 function rows(items){const groups=new Map();for(const item of items){const date=String(item.event_date).slice(0,10);if(!groups.has(date))groups.set(date,[]);groups.get(date).push(item);}return [...groups].map(([date,records])=>`<section class="ap-l-day"><h2>${esc(date.replaceAll('-','/'))}</h2>${records.map(row).join('')}</section>`).join('');}
 function empty(filtered=false){return `<section class="ap-l-glass ap-l-empty"><h2>${filtered?'没有匹配的记录':'这段时间还没有记录'}</h2></section>`;}
 const more=count=>button(`查看更多（还有 ${count} 笔）`,'fp-ledger-more','ap-l-more');
 return {shell,summary,rows,row,empty,more};
}
