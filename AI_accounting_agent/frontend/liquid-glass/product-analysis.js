import {mountChartsInteraction} from './charts-interaction.js?v=r4-four-final-20261025';
import {finance} from './finance-api.js';
import {categoryIconKey} from './category-icons.js';

// Semantic category colors stay fixed when amounts reorder the category list.
const CATEGORY_CHART_SLOT=Object.freeze({
 'category-House':1,'category-Utensils':2,'category-ShoppingBag':3,
 'category-TrainFront':4,'category-Plane':4,'category-Clapperboard':5,
 'category-GraduationCap':5,'category-Gift':5,'category-HeartPulse':6,
 'category-ShieldCheck':6,'category-ReceiptText':6,'category-Shapes':6
});
export const categoryChartColor=category=>`var(--fp-chart-${CATEGORY_CHART_SLOT[categoryIconKey(category)]||6})`;

// Native Stitch reference: eee90a6dea41478bacaefd8ea3e7b2df, frozen analysis.html.
// All visible values and all chart segments originate in /finance/analysis.
export function createProductAnalysis(ctx){
 const {state,prefs,esc,money,icon,btn,loading,range,go,render}=ctx;
 let paintCurrent,disposeCharts=()=>{};
 const cash=n=>prefs.mask?'••••':money(Number.isSafeInteger(n)?n/100:NaN);
 const dates=()=>state.visualPeriod==='custom'?(state.visualRange||range('month')):range(state.visualPeriod||'month');
 const action=(label,name,extra='')=>`<button type="button" data-action="${name}" ${extra}>${label}</button>`;
 function period(){
  if(ctx.analysisPeriod)return ctx.analysisPeriod();
  return `<div class="pa-period"><label class="pa-month"><span>${esc(state.month)}</span>${icon('down')}<input id="month-picker" type="month" value="${esc(state.month)}" aria-label="选择月份"></label><div class="pa-periods" role="group" aria-label="分析周期">${[['week','周'],['month','月'],['year','年'],['custom','区间']].map(([value,label])=>action(label,'pa-period',`data-value="${value}" aria-pressed="${(state.visualPeriod||'month')===value}"`)).join('')}</div></div>${state.visualPeriod==='custom'?`<form id="visual-range-form" class="pa-custom"><label>开始<input class="field" type="date" id="visual-start" required value="${esc(dates().start_date)}"></label><label>结束<input class="field" type="date" id="visual-end" required value="${esc(dates().end_date)}"></label><button class="btn" type="submit">应用</button><p id="visual-range-error" role="alert"></p></form>`:''}`;
 }
 function budget(d){
  // Root may supply a confirmed budget in minor units for this exact period.
  const b=ctx.analysisBudget?.(d.period);
  if(!b||!Number.isSafeInteger(b.limit_minor)||b.limit_minor<=0)return '';
  const spent=d.totals.net_expense_minor,remaining=b.limit_minor-spent;
  return `<div class="pa-budget"><div><span>预算 ${cash(b.limit_minor)}</span><strong>剩余 ${cash(remaining)}</strong></div>${prefs.mask?'':`<progress max="${b.limit_minor}" value="${Math.max(0,Math.min(b.limit_minor,spent))}" aria-label="预算使用进度"></progress>`}</div>`;
 }
 function summary(d){return `<section class="pa-summary" aria-label="本期收支"><div class="pa-stat"><span>收入</span><strong class="money">${cash(d.totals.gross_income_minor)}</strong></div><div class="pa-stat"><span>结余</span><strong class="money pa-income">${cash(d.totals.net_cashflow_minor)}</strong></div>${budget(d)}</section>`;}
 function refundRow(d){return d.totals.refund_minor?`<dl class="pa-refunds"><div><dt>支出总额</dt><dd class="money">${cash(d.totals.gross_expense_minor)}</dd></div><div><dt>退款</dt><dd class="money">${cash(d.totals.refund_minor)}</dd></div><div><dt>净支出</dt><dd class="money">${cash(d.totals.net_expense_minor)}</dd></div></dl>`:'';}
 function donut(d){
  const total=d.totals.gross_expense_minor,categories=d.expense_categories,circumference=2*Math.PI*62;
  let offset=0;
  const segments=categories.map(item=>{const length=total?item.amount_minor/total*circumference:0;
   const segment=`<circle cx="80" cy="80" r="62" fill="none" stroke="${categoryChartColor(item.category)}" stroke-width="15" stroke-dasharray="${length} ${circumference}" stroke-dashoffset="${-offset}"/>`;offset+=length;return segment;}).join('');
  const categoryRow=item=>`<button type="button" class="pa-category" data-action="pa-category" data-category="${esc(item.category)}" aria-label="查看${esc(item.category)}支出明细"><span class="pa-category-icon" style="--pa-color:${categoryChartColor(item.category)}">${icon(categoryIconKey(item.category))}</span><span class="pa-category-name">${esc(item.category)}</span><strong class="money">${cash(item.amount_minor)}</strong><span class="pa-percent">${prefs.mask?'••':(total?item.amount_minor/total*100:0).toFixed(1)+'%'}</span>${icon('next')}</button>`;
  return `<div class="pa-donut"><svg viewBox="0 0 160 160" role="img" aria-label="${prefs.mask?'金额已隐藏':'支出分类构成'}"><circle cx="80" cy="80" r="62" fill="none" stroke="var(--fp-soft)" stroke-width="15"/>${prefs.mask?'':segments}</svg><div class="pa-donut-center"><span>支出总额</span><strong class="money">${cash(total)}</strong></div></div>${refundRow(d)}<div class="pa-categories">${categories.slice(0,5).map(categoryRow).join('')}</div>${categories.length>5?`<details class="pa-more-categories"><summary>更多分类（${categories.length-5}）</summary><div class="pa-categories">${categories.slice(5).map((item,i)=>categoryRow(item,i+5)).join('')}</div></details>`:''}${!categories.length?`<div class="pa-empty">本期暂无支出</div>`:''}`;
 }
 function trend(d){
  const points=d.trend,n=points.length;
  if(!n)return '<div class="pa-empty">本期暂无流水</div>';
  if(!Number.isInteger(state.productAnalysisPoint)||state.productAnalysisPoint>=n){
   const active=points.map((p,i)=>p.bill_ids?.length?i:-1).filter(i=>i>=0);
   state.productAnalysisPoint=active.length?active[active.length-1]:n-1;
  }
  const selected=state.productAnalysisPoint,current=points[selected],width=320,bottom=132,top=12,step=296/n;
  const max=Math.max(1,...points.flatMap(p=>[p.gross_income_minor,p.gross_expense_minor]));
  const barWidth=Math.min(13,step*.32);
  const svg=`<svg class="pa-trend" viewBox="0 0 320 156" role="img" aria-label="收入与支出总额趋势"><line x1="12" x2="308" y1="132" y2="132" stroke="var(--fp-line)"/>${points.map((p,i)=>{const x=12+i*step+step/2;
   return `<g opacity="${i===selected?1:.65}">${[['gross_income_minor','var(--fp-income)',-barWidth],['gross_expense_minor','var(--fp-chart-1)',0]].map(([key,fill,dx])=>{const h=p[key]/max*(bottom-top);return `<rect x="${x+dx}" y="${bottom-h}" width="${Math.max(.8,barWidth-.5)}" height="${h}" rx="1.5" fill="${fill}"/>`;}).join('')}${i===selected?`<line x1="${x}" x2="${x}" y1="8" y2="137" stroke="var(--fp-muted)" stroke-dasharray="2 3"/>`:''}</g>`;}).join('')}<text x="12" y="153">${esc(points[0].period.slice(5))}</text><text x="308" y="153" text-anchor="end">${esc(points[n-1].period.slice(5))}</text></svg>`;
  return `<div class="pa-trend-key"><span><i style="background:var(--fp-income)"></i>收入</span><span><i style="background:var(--fp-chart-1)"></i>支出</span></div>${prefs.mask?'<div class="pa-chart-mask">金额已隐藏</div>':svg}<div class="pa-point-control" aria-label="选择趋势日期">${action(icon('back'),'pa-point',`data-step="-1" aria-label="上一个日期" ${selected===0?'disabled':''}`)}<label class="pa-point-picker"><span class="sr-only">选择趋势日期</span><select id="pa-point-picker" aria-label="选择趋势日期">${points.map((p,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(p.period)}</option>`).join('')}</select></label>${action(icon('next'),'pa-point',`data-step="1" aria-label="下一个日期" ${selected===n-1?'disabled':''}`)}</div><dl class="pa-point-values"><div><dt>收入</dt><dd class="money">${cash(current.gross_income_minor)}</dd></div><div><dt>支出总额</dt><dd class="money">${cash(current.gross_expense_minor)}</dd></div>${current.refund_minor?`<div><dt>退款</dt><dd class="money">${cash(current.refund_minor)}</dd></div><div><dt>净支出</dt><dd class="money">${cash(current.net_expense_minor)}</dd></div>`:''}<div><dt>结余</dt><dd class="money">${cash(current.net_cashflow_minor)}</dd></div></dl><button type="button" class="pa-detail-link" data-action="pa-point-ledger">查看当${current.period.length===7?'月':'日'}流水 ${icon('next')}</button>`;
 }
 function template(d){
  const selected=state.productAnalysisTab||'composition';
  if(selected==='budget'&&ctx.approvedBudget){ctx.approvedBudget.setContext(d,state.productBudget);return ctx.approvedBudget.html(d,state.productBudget,{error:state.productBudgetError});}
  if(selected==='trend'&&ctx.approvedTrends)return ctx.approvedTrends(d);
  if(ctx.approvedOverview)return ctx.approvedOverview(d);
  return `<div class="product-analysis">${period()}${summary(d)}<div class="pa-tabs" role="tablist" aria-label="分析图表">${[['composition','支出构成'],['trend','收支趋势']].map(([value,label])=>action(label,'pa-tab',`id="pa-tab-${value}" role="tab" data-value="${value}" aria-selected="${selected===value}" aria-controls="pa-panel"`)).join('')}</div><section id="pa-panel" role="tabpanel" aria-labelledby="pa-tab-${selected}">${d.state==='empty'?`<div class="pa-empty">本期暂无流水 ${btn('记一笔','product-capture-open','small')}</div>`:selected==='trend'?trend(d):donut(d)}</section></div>`;
 }
 async function chartsPage(paint){
  paintCurrent=paint;const epoch=state.epoch,chosen={...dates()};
  const ticket=(state.productAnalysisTicket||0)+1;state.productAnalysisTicket=ticket;
  paint(`<div class="product-analysis">${ctx.approvedOverview?'':period()}${loading()}</div>`);
  try{
   const span=(Date.parse(chosen.end_date)-Date.parse(chosen.start_date))/86400000;
   const [d,budget]=await Promise.all([finance('/analysis?'+new URLSearchParams({...chosen,granularity:span>62?'month':'day'})),ctx.approvedBudget?finance('/budget?month='+encodeURIComponent(state.month)).then(value=>({value}),error=>({error})):Promise.resolve({})]);
   if(epoch!==state.epoch||ticket!==state.productAnalysisTicket)return;
   state.productAnalysis=d;state.visualReportRange={...chosen};state.productBudget=budget.value;state.productBudgetError=budget.error;
   paint(template(d));mountMotion();
  }catch(error){
   if(epoch!==state.epoch||ticket!==state.productAnalysisTicket)return;
   paint(`<div class="product-analysis">${period()}${ctx.analysisError?ctx.analysisError(error):`<section class="pa-error" role="alert"><h2>暂时无法加载</h2>${btn('重试','refresh','primary')}<details><summary>详情</summary><p>${esc(error.message||error)}</p></details></section>`}</div>`);
  }
 }
 function mountMotion(){disposeCharts();const host=document.querySelector('#content');if(host)disposeCharts=mountChartsInteraction(host,{onSelectCategory:category=>{state.productAnalysisFocus=category;},onSelectTrend:index=>{const focused=document.activeElement?.matches?.('[data-chart-trend]');state.productAnalysisPoint=index;repaint();if(focused)document.querySelector('[data-chart-trend]')?.focus({preventScroll:true});}});const dates=document.querySelector('.ap-t-dates'),active=dates?.querySelector('[aria-pressed=true]');if(dates&&active)dates.scrollLeft=active.offsetLeft-dates.offsetLeft-(dates.clientWidth-active.clientWidth)/2;const root=document.querySelector('.product-analysis');if(root){ctx.productMotion?.categories(root);if(state.productAnalysisFocus)ctx.productMotion?.selectCategory(root,state.productAnalysisFocus);root.querySelectorAll('[data-action=pa-category]').forEach(button=>{const focus=()=>ctx.productMotion?.selectCategory(root,button.dataset.category);button.addEventListener('pointerdown',focus);button.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key))focus();});});}}
 function repaint(){if(state.productAnalysis&&paintCurrent){paintCurrent(template(state.productAnalysis));mountMotion();}else render();}
 function ledgerLink(selected,category='',type='',billIds=[]){
  state.ledgerRange={...selected};state.filter={category,type,q:'',day:''};state.mobileLimit=4;
  const returnTo='visualization?'+new URLSearchParams({...state.visualReportRange,month:state.month,period:state.visualPeriod||'month'});
  go('ledger?'+new URLSearchParams({...selected,month:state.month,category,type,cashflow_only:'1',bill_ids:billIds.join(','),return_to:returnTo}));
 }
 return {pages:{visualization:chartsPage},dispose:()=>disposeCharts(),actions:{
  'pa-tab':b=>{state.productAnalysisTab=['trend','budget'].includes(b.dataset.value)?b.dataset.value:'composition';render();},
  'pa-trend-metric':b=>{state.productAnalysisMetric=b.dataset.metric==='income'?'income':'expense';repaint();},
  'pa-trend-chart':(b,event)=>{const rect=b.getBoundingClientRect(),count=state.productAnalysis?.trend.length||0;const fraction=((event.clientX-rect.left)/rect.width*320-10)/300;if(count){state.productAnalysisPoint=Math.round(Math.max(0,Math.min(1,fraction))*(count-1));repaint();}},
  'pa-period':b=>{state.visualPeriod=b.dataset.value;state.productAnalysisPoint=null;render();},
  'pa-category':b=>{const item=state.productAnalysis?.expense_categories.find(c=>c.category===b.dataset.category);if(item){state.productAnalysisFocus=item.category;ledgerLink(state.visualReportRange,item.category,'expense',item.bill_ids);}},
  'pa-point':b=>{const length=state.productAnalysis?.trend.length||0;state.productAnalysisPoint=Math.max(0,Math.min(length-1,state.productAnalysisPoint+Number(b.dataset.step)));repaint();},
  'pa-point-select':b=>{const index=Number(b.value);if(Number.isInteger(index)&&index>=0&&index<(state.productAnalysis?.trend.length||0)){state.productAnalysisPoint=index;repaint();}},
  'pa-point-ledger':button=>{const index=Number.isInteger(state.productAnalysisPoint)?state.productAnalysisPoint:Number(button.dataset.pointIndex);const point=state.productAnalysis?.trend[index],p=point?.period;if(!p)return;
   const full=state.visualReportRange;
   if(p.length===10)ledgerLink({start_date:p,end_date:p},'','',point.bill_ids);else{
    const [year,month]=p.split('-').map(Number),end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    ledgerLink({start_date:p+'-01'>full.start_date?p+'-01':full.start_date,end_date:end<full.end_date?end:full.end_date},'','',point.bill_ids);
   }
  }
 }};
}
