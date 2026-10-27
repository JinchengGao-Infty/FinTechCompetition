import {billDescription,isCashflow,cashflowTotals} from './primary-pages.js';
import {categoryIconKey} from './category-icons.js';
// Official R2 home b5b0883f710e45f4884f0d741f017f2f.
// code.html SHA256 1f1471b7c0460326858eabe57fbb588257726e775124dfead934f412c8846114.
// Adaptation: real DTOs replace prototype literals; global shell owns title/settings/nav.
// User reference has stronger glass contour and divided metrics; retained locally in CSS.
export function createApprovedHome(ctx){
 const {state,prefs,finance,allBills,esc,money,icon,range,loading}=ctx;
 const amount=value=>prefs.mask?'••••':value==null?'—':money(value,'CNY');
 const minor=value=>Number.isSafeInteger(value)?amount(value/100):amount(null);
 async function home(paint){
  const epoch=state.epoch;paint(loading());
  const [overview,rows,positions]=await Promise.all([finance('/overview'),allBills({}),finance('/positions').catch(()=>null)]);
  if(epoch!==state.epoch)return;
  const cashRows=rows.filter(isCashflow).sort((a,b)=>String(b.event_date).localeCompare(String(a.event_date))||Number(b.id)-Number(a.id));
  const dates=range(),monthRows=cashRows.filter(r=>r.event_date>=dates.start_date&&r.event_date<=dates.end_date),totals=cashflowTotals(monthRows);
  const products=overview.products,principal=Array.isArray(products)&&products.every(p=>Number.isSafeInteger(p.holding_minor))?products.reduce((sum,p)=>sum+p.holding_minor,0):null;
  state.mobileOverview=overview;state.homeRows=cashRows.slice(0,2);state.homeMonthRange={...dates};
  paint(`<div class="ap-home"><section class="ap-home-card ap-home-asset" aria-label="账户余额"><div class="ap-home-asset-top"><div><span class="ap-home-label">账户余额</span><strong class="ap-home-balance">${minor(overview.cash_minor)}</strong></div><button type="button" class="ap-home-eye" data-action="mask" aria-label="${prefs.mask?'显示金额':'隐藏金额'}">${icon('eye')}</button></div><div class="ap-home-parts"><div><span class="ap-home-label">理财本金</span><strong>${minor(principal)}</strong></div><div><span class="ap-home-label">个人持仓成本</span><strong>${amount(positions?.total_cost)}</strong></div></div></section><section class="ap-home-card ap-home-month"><h2>${esc(state.month.replace('-','年'))}月</h2><div class="ap-home-summary">${[['收入',totals.income],['支出',totals.expense],['结余',totals.net]].map(([label,value])=>`<div><span class="ap-home-label">${label}</span><strong>${amount(value)}</strong></div>`).join('')}</div></section><section class="ap-home-recent"><h2>最近收支</h2>${state.homeRows.length?state.homeRows.map(row=>`<div class="ap-home-card ap-home-row"><span class="ap-home-category">${icon(categoryIconKey(row.category))}</span><div class="ap-home-copy"><strong>${esc(billDescription(row))}</strong><span class="ap-home-label">${esc(String(row.event_date).slice(5,10).replace('-','月'))}日</span></div><strong class="ap-home-row-amount">${prefs.mask?'••••':(row.type==='income'?'+':'−')+amount(row.amount)}</strong></div>`).join(''):'<div class="ap-home-card ap-home-empty">暂无流水</div>'}</section></div>`);
 }
 return {pages:{home}};
}
