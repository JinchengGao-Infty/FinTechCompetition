import {createVisuals} from './visuals.js';

// Shared with the ledger's compact result totals; the API excludes these movements too.
export const isCashflow = bill => !['internal_transfer','principal'].includes((bill.metadata?.movement||bill.movement));
export function cashflowTotals(rows) {
  const minor = type => rows.filter(b=>b.type===type && isCashflow(b)).reduce((sum,b)=>sum+Math.round(Number(b.amount)*100),0);
  const refunds=rows.filter(b=>b.type==='income'&&b.category==='退款'&&isCashflow(b)).reduce((sum,b)=>sum+Math.round(Number(b.amount)*100),0);
  return {income:(minor('income')-refunds)/100,expense:minor('expense')/100,refund:refunds/100,netExpense:(minor('expense')-refunds)/100,net:(minor('income')-minor('expense'))/100};
}
export function billDescription(bill) {
  const text=String(bill.description || bill.category || '收支记录');
  const seed=/^合成预览数据 · (\d{4}-(?:0[1-9]|1[0-2])) · ([1-5])$/u.exec(text);
  const seedId=/^finpilot-live-preview-\d{8}-[a-z0-9_]+-(\d{4}-(?:0[1-9]|1[0-2]))-([0-4])$/u.exec(String(bill.metadata?.client_request_id||''));
  // Only the preview generator's marked seeds get a category-based display name.
  // Do not invent a merchant or rewrite the original description on the record.
  if(bill.source==='synthetic_demo' && seedId) {
    if(seed && seed[1]===seedId[1] && Number(seed[2])===Number(seedId[2])+1 && String(bill.event_date||'').startsWith(seed[1]+'-')) {
      return `${bill.category||'未分类'}${bill.type==='income'?'收入':'支出'}`;
    }
    return text; // A user-edited preview description stays exactly as entered.
  }
  return /^synthetic/.test(bill.source || '') ? text.replace(/\s*[·•]\s*(虚构演示|示例|模拟数据|合成数据|模拟|合成)$/u,'') : text;
}
export function billDescriptionForSave(bill,value) {
  // Presentation cleanup must never become an implicit edit to the stored record.
  return value===billDescription(bill) ? bill.description : value;
}
export function filterBills(rows,query) {
  const q=query.trim().toLocaleLowerCase();
  return rows.filter(b=>`${billDescription(b)} ${b.description||''} ${b.category} ${b.event_date} #${b.id} ${b.metadata?.payment_method||''}`.toLocaleLowerCase().includes(q));
}
export function previousRange(dates) {
  const day=86400000,start=Date.parse(dates.start_date+'T00:00:00Z'),end=Date.parse(dates.end_date+'T00:00:00Z');
  const iso=value=>new Date(value).toISOString().slice(0,10);
  return {start_date:iso(start-(end-start+day)),end_date:iso(start-day)};
}
export function spendingStory(report) {
  const top=[...report.pie].filter(x=>Number(x.value)>0).sort((a,b)=>Number(b.value)-Number(a.value))[0] || null;
  const current=Number(report.summary.expense_total);
  const previous=report.categories.reduce((sum,row)=>sum+Math.round(Number(row.previous)*100),0)/100;
  const hasCurrent=Number(report.summary.income_total)>0 || current>0;
  const hasPrevious=previous>0 || Number(report.net.previous)!==0;
  return {top,current,previous,hasCurrent,hasPrevious,delta:Math.round((current-previous)*100)/100};
}

export function createPrimaryPages(ctx) {
  const {state,prefs,book,allBills,esc,money,btn,icon,card,empty,loading,range,segmented,modal,closeSheet,render,go}=ctx;
  const visual=createVisuals(ctx);
  const names={week:'周',month:'月',year:'年',custom:'自定义'};
  const datesLabel=dates=>`${dates.start_date} — ${dates.end_date}`;
  const selectedRange=()=>state.visualPeriod==='custom'?(state.visualRange||range('month')):range(state.visualPeriod);
  const primary=(label,action,extra='')=>btn(label,action,'primary',extra);
  function monthControl() {
    return `<label class="pill glass month-choice"><span>${esc(state.month.replace('-','年'))}月</span>${icon('calendar')}<input class="time-input" type="month" id="month-picker" value="${esc(state.month)}" aria-label="选择月份"></label>`;
  }
  function periodStrip(dates,{ledger=false}={}) {
    const date=ledger&&state.ledgerRange?`<span class="period-custom">${esc(datesLabel(dates))}</span>`:monthControl();
    return `<div class="primary-period">${date}<div class="row">${ledger?btn(icon('filter')+'筛选','filter','small',`aria-label="筛选账单${state.filter.category||state.filter.type?'，已应用':''}"`):btn(icon('eye'),'mask','small',`aria-label="${prefs.mask?'显示金额':'隐藏金额'}"`)}${ledger&&state.ledgerRange?btn('按月查看','clear-ledger-range','small'):''}</div></div>`;
  }
  function chartsControls() {
    const dates=selectedRange();
    return periodStrip(dates)+segmented(['周','月','年','自定义'],names[state.visualPeriod],'visual-period')+(state.visualPeriod==='custom'?card(`<form id="visual-range-form"><div class="date-grid"><label class="field-label" for="visual-start">开始日期<input class="field" id="visual-start" type="date" required value="${esc(dates.start_date)}"></label><label class="field-label" for="visual-end">结束日期<input class="field" id="visual-end" type="date" required value="${esc(dates.end_date)}"></label></div><button class="btn primary mt" type="submit">应用区间</button><p id="visual-range-error" class="field-feedback" role="alert"></p></form>`,'analytics-date-panel'):'');
  }
  function errorHTML(error) {
    const dates=state.route==='visualization'?selectedRange():(state.ledgerRange||range());
    return `<div class="primary-workspace">${state.route==='visualization'?chartsControls():periodStrip(dates,{ledger:state.route==='ledger'})}${card(`<div role="alert"><h2>暂时无法读取${state.route==='visualization'?'图表':'账本'}</h2><p class="primary-copy">请重试，当前选择会保留。</p></div>${primary('重新读取','refresh')}<details class="primary-details"><summary>查看原因</summary><p class="break">${esc(error.message||error)}</p>${btn('检查连接','settings','small')}</details>`,'primary-empty')}</div>`;
  }
  async function homePage(paint) {
    const dates=range(),epoch=state.epoch;
    paint(`<div class="primary-workspace">${periodStrip(dates)}${loading()}</div>`);
    const {custom:report}=await book('/reports/aggregate?'+new URLSearchParams(dates));
    if(epoch!==state.epoch)return;
    const story=spendingStory(report);
    state.homeRange={...dates};state.homeCategory=story.top?.name||'';
    const next=story.top?`<span class="primary-eyebrow">下一步</span><h2>看看${esc(story.top.name)}支出</h2><p class="primary-copy">本期最多的一类，共 ${money(story.top.value)}。</p>${primary('查看这类账单 '+icon('next'),'home-review')}`:story.hasCurrent?`<span class="primary-eyebrow">下一步</span><h2>把收支记录完整</h2><p class="primary-copy">本期已有收入，暂未记下支出。</p>${primary('记一笔支出','entry')}`:`<span class="primary-eyebrow">从第一笔开始</span><h2>记录这段时间的收支</h2><p class="primary-copy">记下收入或支出后，就能看到结余与变化。</p>${primary('记第一笔','entry')}`;
    paint(`<div class="primary-workspace home-focus">${periodStrip(dates)}${card(`<div class="primary-eyebrow">本期结余 · CNY</div><p class="primary-dates">${esc(datesLabel(dates))}</p><strong class="home-net money">${story.hasCurrent?money(report.net.current):'暂无记录'}</strong>${story.hasCurrent?`<div class="home-totals"><span>收入 <strong>${money(report.summary.income_total)}</strong></span><span>支出 <strong>${money(report.summary.expense_total)}</strong></span></div>`:''}`,'home-status')}${card(next,'home-next')}<div class="primary-secondary">${btn('查看账本','home-ledger','small')}${btn('收支图表','home-charts','small')}${btn('操作保护','protection-open','small','aria-label="操作保护：查看确认规则与结果查询"')}</div></div>`);
  }
  function billRows(rows) {
    return rows.map(b=>`<button type="button" class="bill-row" data-action="primary-bill" data-id="${b.id}"><span class="grow"><strong>${esc(billDescription(b))}</strong><small>${esc(b.category)}${!isCashflow(b)?' · 划转':''}${b.metadata?.payment_method?' · '+esc(b.metadata.payment_method):''}</small></span><span class="amount money ${b.type==='income'?'good':''}">${b.type==='income'?'+':'−'}${money(b.amount,b.currency)}</span></button>`).join('');
  }
  function renderBillList() {
    const list=document.querySelector('#bill-list'),summary=document.querySelector('#ledger-filter-summary');
    if(!list||!summary)return;
    const rows=filterBills(state.bills,state.filter.q),totals=cashflowTotals(rows);
    const active=Boolean(state.filter.q.trim()||state.filter.category||state.filter.type);
    summary.innerHTML=`<span>${rows.length} 笔</span><span>收入 ${money(totals.income)} · 支出 ${money(totals.expense)}</span>`;
    if(!rows.length) {
      list.innerHTML=card(active?empty('没有找到符合条件的记录',btn('清除搜索与筛选','primary-reset-filter')):empty('这段时间还没有记录。记下收支，或换个月份看看。'),'primary-empty');
      return;
    }
    const days=[...new Set(rows.map(b=>b.event_date))].sort().reverse();
    list.innerHTML=days.map(day=>`<section class="ledger-day"><h2>${esc(day)}</h2><div class="surface-card list-card">${billRows(rows.filter(b=>b.event_date===day))}</div></section>`).join('');
  }
  async function ledgerPage(paint) {
    const dates=state.ledgerRange||range(),epoch=state.epoch;
    paint(`<div class="primary-workspace">${periodStrip(dates,{ledger:true})}${loading()}</div>`);
    const params={...dates,...(state.filter.category?{category:state.filter.category}:{}),...(state.filter.type?{type:state.filter.type}:{})};
    const rows=await allBills(params);
    if(epoch!==state.epoch)return;
    state.bills=rows;
    paint(`<div class="primary-workspace ledger-workspace"><div class="primary-heading"><div><h2>每一笔，都找得到</h2></div>${primary(icon('add')+(rows.length||state.filter.category||state.filter.type?'记一笔':'记第一笔'),'entry')}</div><label class="ledger-search"><span class="sr-only">搜索账单</span>${icon('search')}<input id="bill-search" class="field" type="search" placeholder="描述、分类、日期或记录号" value="${esc(state.filter.q)}" aria-label="搜索账单"></label>${periodStrip(dates,{ledger:true})}<div class="ledger-selection"><span>${esc(state.filter.category||'全部分类')} · ${state.filter.type==='income'?'收入':state.filter.type==='expense'?'支出':'全部收支'}</span>${state.filter.category||state.filter.type||state.filter.q?btn('清除','primary-reset-filter','small'):btn('导入流水','statement-import','small')}</div><div id="ledger-filter-summary" class="ledger-result" aria-live="polite" aria-atomic="true"></div><div id="bill-list"></div><details class="primary-details"><summary>统计口径</summary><p>结果金额按当前搜索与筛选统计，内部划转和投资本金不计入收支。退款独立列示。</p></details></div>`);
    renderBillList();
  }
  function billModal(id) {
    const bill=state.bills.find(b=>String(b.id)===String(id));
    if(!bill)return;
    const source=/^synthetic/.test(bill.source||'')?'':bill.source==='manual'?'手工录入':bill.source||'账本记录';
    modal('账单详情',`<p class="hero-amount center money">${bill.type==='income'?'+':'−'}${money(bill.amount,bill.currency)}</p><h3 class="break">${esc(billDescription(bill))}</h3><p class="primary-copy">${esc(bill.event_date)} · ${esc(bill.category)} · ${!isCashflow(bill)?'划转':bill.type==='income'?'收入':'支出'}</p><p class="primary-copy">${esc(bill.metadata?.payment_method||'未填写支付方式')}</p><div class="actions">${btn('编辑分类与明细','edit-bill','primary',`data-id="${bill.id}"`)}${btn('返回账本','close-sheet')}</div><details class="primary-details"><summary>记录信息</summary><p>记录 #${esc(bill.id)}${source?' · 来源：'+esc(source):''}</p>${btn('删除账单','delete-prompt','danger small',`data-id="${bill.id}"`)}</details>`);
  }
  async function visualizationPage(paint) {
    const dates=selectedRange(),epoch=state.epoch;
    paint(`<div class="primary-workspace analytics-workspace">${chartsControls()}${loading()}</div>`);
    const {custom:report}=await book('/reports/aggregate?'+new URLSearchParams(dates));
    if(epoch!==state.epoch)return;
    state.visualReport=report;state.visualReportRange={...dates};
    const story=spendingStory(report),previous=previousRange(dates);
    if(!story.hasCurrent) {
      paint(`<div class="primary-workspace analytics-workspace">${chartsControls()}${card(empty('这段时间还没有收支记录',primary('去记一笔','entry')),'primary-empty')}<p class="primary-copy">也可以选择其他月份或日期区间。</p></div>`);
      return;
    }
    const change=!story.hasPrevious?'先从本期支出看起':story.delta===0?'支出与上期持平':`支出较上期${story.delta>0?'增加':'减少'}`;
    const insight=card(`<span class="primary-eyebrow">支出变化</span><h2>${change}</h2><strong class="story-value money">${money(story.hasPrevious?Math.abs(story.delta):story.current)}</strong><p class="primary-copy">${story.top?`最大支出是${esc(story.top.name)}，${money(story.top.value)}，占本期支出 ${prefs.mask?'••••':(Number(story.top.value)/story.current*100).toFixed(1)+'%'}。`:'本期有收入，暂无支出分类。'}</p>${story.top?primary('查看最大支出 '+icon('next'),'primary-top-category'):primary('查看本期账单','primary-chart-ledger')}<details class="primary-details"><summary>对比区间与金额</summary><p>本期：${esc(datesLabel(dates))}，支出 ${money(story.current)}</p><p>上期：${esc(datesLabel(previous))}，${story.hasPrevious?'支出 '+money(story.previous):'暂无收支记录，暂不计算增减'}</p><p>上期为本期之前的等长区间。收入包含退款；内部划转与投资本金不计入收支。</p></details>`,'spending-story');
    const trend=card(`<div class="analytics-card-heading"><h2>钱在何时流入、流出</h2></div><p class="primary-dates">${esc(datesLabel(dates))}</p><div class="chart-toolbar">${segmented(['折线','柱状'],state.visualType,'visual-type')}<div class="legend cashflow-legend"><span><b></b>支出</span><span><b class="green"></b>收入</span></div></div>${visual.cashflow(report,{type:state.visualType})}<details class="primary-details"><summary>逐项金额</summary><div class="primary-data">${report.bars.labels.map((label,i)=>`<div><span>${esc(label)}</span><span>收入 ${money(report.bars.income[i])}<br>支出 ${money(report.bars.expense[i])}</span></div>`).join('')}</div></details>`,'analytics-trend');
    const breakdown=card(`<div class="analytics-card-heading"><h2>支出花在哪里</h2>${segmented(['占比','对比'],state.visualBreakdown,'visual-breakdown')}</div>${state.visualBreakdown==='对比'?visual.comparison(report):visual.donut(report.pie,{action:'visual-category',title:'支出分类占比',center:'总支出',limit:5})}`,'analytics-breakdown');
    paint(`<div class="primary-workspace analytics-workspace">${chartsControls()}${insight}${trend}${breakdown}</div>`);
  }
  function openLedger(dates,category='') {
    state.ledgerRange={...dates};state.filter={category,type:category?'expense':'',q:''};go('ledger');
  }
  function resetFilter() {
    state.filter={category:'',type:'',q:''};closeSheet();render();
  }
  return {pages:{home:homePage,ledger:ledgerPage,visualization:visualizationPage},renderBillList,errorHTML,actions:{
    'primary-bill':button=>billModal(button.dataset.id),
    'primary-reset-filter':resetFilter,'reset-filter':resetFilter,
    'protection-open':()=>go('security'),
    'home-review':()=>openLedger(state.homeRange,state.homeCategory),
    'home-ledger':()=>openLedger(state.homeRange),
    'home-charts':()=>{state.visualPeriod='month';state.visualRange=null;go('visualization');},
    'primary-top-category':()=>openLedger(state.visualReportRange,spendingStory(state.visualReport).top.name),
    'primary-chart-ledger':()=>openLedger(state.visualReportRange)
  }};
}
