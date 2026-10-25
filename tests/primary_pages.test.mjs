import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createPrimaryPages,cashflowTotals,filterBills,billDescription,billDescriptionForSave,spendingStory,previousRange} from '../AI_accounting_agent/frontend/liquid-glass/primary-pages.js';

const data=JSON.parse(readFileSync(process.env.FINPILOT_UI_FIXTURE || '.runtime/ui-batch1-evidence/data-fixture.json','utf8'));
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const checks=[];
function check(message){checks.push(message);console.log('PASS:',message);}
function fixture({report=data.report,rows=data.rows}={}) {
  let html='',dialog=null,closed=0,renders=0;
  const nodes={'#bill-list':{innerHTML:''},'#ledger-filter-summary':{innerHTML:''}};
  globalThis.document={querySelector:selector=>nodes[selector]||null};
  const requests=[],pages=[],state={route:'home',epoch:1,month:'2026-09',filter:{q:'',category:'',type:''},ledgerRange:null,visualPeriod:'month',visualType:'折线',visualBreakdown:'占比',bills:[]};
  const prefs={mask:false};
  const ctx={state,prefs,esc:escape,money:(value,currency='CNY')=>prefs.mask?'••••':new Intl.NumberFormat('zh-CN',{style:'currency',currency}).format(value),number:value=>prefs.mask?'••••':String(value),icon:()=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',btn:(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`,card:(content,cls='')=>`<section class="surface-card ${cls}">${content}</section>`,empty:(text,action='')=>`<div class="empty"><p>${escape(text)}</p>${action}</div>`,loading:()=>'<div class="loading" role="status">正在读取</div>',segmented:(values,selected,action)=>`<div class="segmented" role="tablist">${values.map(value=>`<button role="tab" aria-selected="${value===selected}" data-action="${action}" data-value="${value}">${value}</button>`).join('')}</div>`,range:()=>({...data.dates}),modal:(title,body)=>{dialog={title,body};},closeSheet:()=>{closed++;},render:()=>{renders++;},go:route=>pages.push(route),book:async path=>{requests.push(path);return {custom:structuredClone(report)};},allBills:async params=>{requests.push(params);return structuredClone(rows).filter(row=>(!params.category||row.category===params.category)&&(!params.type||row.type===params.type));}};
  const app=createPrimaryPages(ctx);
  const paint=value=>{html=value;};
  return {app,ctx,state,prefs,nodes,requests,pages,paint,get html(){return html.replace('<div id="bill-list"></div>',`<div id="bill-list">${nodes['#bill-list'].innerHTML}</div>`).replace('<div id="ledger-filter-summary" class="ledger-result" aria-live="polite" aria-atomic="true"></div>',`<div id="ledger-filter-summary" class="ledger-result" aria-live="polite">${nodes['#ledger-filter-summary'].innerHTML}</div>`);},get dialog(){return dialog;},get closed(){return closed;},get renders(){return renders;}};
}
const output='review';mkdirSync(output,{recursive:true});
function snapshot(name,html,route=name) {
  const css=['tokens','app','features','journey','analytics','investment','wealth','glass','banking','primary-pages'].map(name=>`<link rel="stylesheet" href="../AI_accounting_agent/frontend/liquid-glass/${name}.css">`).join('');
  const titles={home:'首页',ledger:'账本',visualization:'图表'};
  writeFileSync(`${output}/${name}.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>静态证据 · ${titles[route]}</title>${css}<body><div id="app" class="app-shell" data-route="${route}"><header class="topbar"><div class="topbar-inner"><h1>${titles[route]}</h1><small>静态结构证据</small></div></header><main class="page-content ${route}-page">${html}<p class="hint">此文件为真实渲染函数生成的静态结构，按钮无运行脚本；未进行浏览器视觉验收。</p></main></div></body></html>`);
}

assert.deepEqual(cashflowTotals(data.rows),{income:data.report.summary.income_total,expense:data.report.summary.expense_total});
assert.equal(spendingStory(data.report).top.name,'住房');
assert.deepEqual(previousRange(data.dates),{start_date:'2026-08-02',end_date:'2026-08-31'});
assert.equal(billDescription({description:'房租 · 虚构演示',source:'synthetic_demo'}),'房租');
assert.equal(billDescription({description:'手工 · 示例',source:'manual'}),'手工 · 示例');
check('真实隔离 API 账本与汇总金额一致，内部划转和本金排除；上期为明确的等长区间。');

for(const sample of [
  {description:'午餐 · 虚构演示',visible:'午餐'},
  {description:'合成预览数据 · 2026-09 · 1',visible:'餐饮支出',metadata:{client_request_id:'finpilot-live-preview-20261018-dux51bd3-2026-09-0'}}
]) {
  const record={...data.rows.find(row=>row.category==='餐饮'),description:sample.description,event_date:'2026-09-02',source:'synthetic_demo',version:1,...(sample.metadata?{metadata:sample.metadata}:{})};
  const before=structuredClone(record),f=fixture({rows:[record]});f.state.route='ledger';
  await f.app.pages.ledger(f.paint);f.app.actions['primary-bill']({dataset:{id:record.id}});
  assert.ok(f.html.includes(`<strong>${sample.visible}</strong>`));
  assert.ok(f.dialog.body.includes(`>${sample.visible}</h3>`));
  assert.doesNotMatch(f.html+f.dialog.body,/合成预览数据|虚构演示|比赛样本|原始描述|银行来源/);
  const appSource=readFileSync('AI_accounting_agent/frontend/liquid-glass/app.js','utf8');
  const start=appSource.indexOf('let editingBill;'),end=appSource.indexOf('function stockLink',start);
  assert.ok(start>=0 && end>start);
  const handlers={},writes=[],feedback={textContent:''},button={disabled:false,isConnected:true};
  const form={id:'bill-edit-form',dataset:{id:String(record.id),version:'1'},values:{amount:String(record.amount),type:'expense',category:'其他',event_date:record.event_date,description:sample.visible,payment_method:'微信支付'},querySelector:selector=>selector==='[type="submit"]'?button:feedback};
  const editor={state:f.state,expenseCategories:['餐饮','其他'],incomeCategories:['工资'],esc:escape,btn:f.ctx.btn,modal:f.ctx.modal,billDescription,billDescriptionForSave,document:{addEventListener:(type,handler)=>{handlers[type]=handler;}},FormData:class {constructor(target){this.values=target.values;}*[Symbol.iterator](){yield* Object.entries(this.values);}},book:async(path,options)=>{writes.push({path,options});return {};},closeSheet:()=>{},render:async()=>{},toast:()=>{},$:()=>null,ledgerContextPromise:null};
  runInNewContext(appSource.slice(start,end)+`\neditBill(${record.id});`,editor);
  assert.ok(f.dialog.body.includes(`id="edit-description" name="description" maxlength="512" required value="${sample.visible}"`));
  assert.doesNotMatch(f.dialog.body,/虚构演示/);
  assert.equal(writes.length,0,'opening detail/edit must not write the record');
  await handlers.submit({target:form,preventDefault(){}});
  assert.equal(feedback.textContent,'');
  assert.equal(writes[0].options.body.description,record.description,'classification-only save retains the exact original description');
  assert.equal(writes[0].options.body.category,'其他');
  assert.equal(writes[0].options.body.expected_version,'1');
  assert.ok(!('source' in writes[0].options.body),'editing must not invent a new source');
  form.values.description='同事午餐';await handlers.submit({target:form,preventDefault(){}});
  assert.equal(writes[1].options.body.description,'同事午餐','an explicit description change is saved as entered');
  assert.deepEqual(record,before,'view formatting never mutates the record');
  for(const source of ['manual','csv_import','syntheticSomethingElse']) {
    const input={...record,source,description:'午餐示例 · 续记'};
    assert.equal(billDescription(input),input.description);
    assert.equal(billDescriptionForSave(input,input.description),input.description);
  }
  const manual={...record,source:'manual',description:'午餐 · 示例'};
  assert.equal(billDescription(manual),manual.description);
  assert.equal(billDescriptionForSave(manual,manual.description),manual.description);
  check('样本记录列表、详情与真实编辑表单统一展示；只改分类保留原文，明确改写才提交新值，普通用户描述不截断且不伪造来源。');
}

{
  const seed={id:90001,event_date:'2026-10-02',category:'餐饮',type:'expense',amount:40,currency:'CNY',description:'合成预览数据 · 2026-10 · 1',source:'synthetic_demo',metadata:{client_request_id:'finpilot-live-preview-20261018-dux51bd3-2026-10-0'}};
  const before=structuredClone(seed);
  assert.equal(billDescription(seed),'餐饮支出');
  assert.equal(billDescription({...seed,category:'工资',type:'income'}),'工资收入');
  assert.equal(filterBills([seed],'餐饮支出').length,1);
  assert.equal(filterBills([seed],seed.description).length,1,'original description remains searchable');
  for(const changed of [{source:'manual'},{source:'csv_import'},{metadata:{}},{event_date:'2026-09-02'},{metadata:{client_request_id:'user-entered-record'}},{metadata:{client_request_id:'finpilot-live-preview-20261018-dux51bd3-2026-10-1'}}]) {
    const record={...seed,...changed};assert.equal(billDescription(record),record.description,'unmatched provenance must preserve the entered text');
  }
  const edited={...seed,description:'同事午餐 · 自己输入的备注'};
  assert.equal(billDescription(edited),edited.description);
  assert.equal(billDescriptionForSave(edited,edited.description),edited.description);
  for(const description of ['同事午餐 · 示例','合成预览数据 · 2026-10 · 1 · 用户备注']) {
    assert.equal(billDescription({...seed,description}),description,'explicitly edited preview text must not be cleaned as a seed marker');
  }
  assert.deepEqual(seed,before);
  check('预览种子须来源、请求标识、月份和序号同时匹配才展示类别名称；原文可搜索，自填或不匹配描述原样保留。');
}

{
  const f=fixture();await f.app.pages.home(f.paint);
  assert.equal((f.html.match(/class="btn primary"/g)||[]).length,1);
  assert.match(f.html,/本期结余|2026-09-01 — 2026-09-30/);
  assert.doesNotMatch(f.html,/bill-row|cashflow-chart|banking-entry|analytics-goal|模拟|合成/);
  assert.match(f.html,/看看住房支出/);
  f.app.actions['home-review']();assert.deepEqual(f.state.ledgerRange,data.dates);assert.deepEqual(f.state.filter,{category:'住房',type:'expense',q:''});assert.equal(f.requests.length,1);
  snapshot('home',f.html);check('首页仅一个主要下一步，显示周期与结余，点击带同一日期和最大分类进入账本。');
}
{
  const f=fixture();f.state.route='ledger';f.state.ledgerRange={...data.dates};f.state.filter={category:'餐饮',type:'expense',q:'#'+data.rows.find(row=>row.category==='餐饮').id};
  await f.app.pages.ledger(f.paint);
  assert.match(f.html,/bill-search/);assert.doesNotMatch(f.html,/home-status|cashflow-chart|banking-entry/);
  const original=structuredClone(f.state.filter),id=f.state.bills[0].id;
  f.app.actions['primary-bill']({dataset:{id}});
  assert.match(f.dialog.body,/返回账本|编辑分类与明细/);assert.deepEqual(f.state.filter,original);
  f.ctx.closeSheet();assert.deepEqual(f.state.filter,original);assert.equal(f.renders,0,'closing a detail preserves the existing search DOM and does not reload');
  assert.deepEqual(f.requests[0],{...data.dates,category:'餐饮',type:'expense'});
  snapshot('ledger-filtered',f.html,'ledger');
  f.state.filter.q='不存在的记录';f.app.renderBillList();assert.match(f.html,/没有找到符合条件的记录|清除搜索与筛选/);
  snapshot('ledger-no-results',f.html,'ledger');
  f.app.actions['primary-reset-filter']();assert.deepEqual(f.state.ledgerRange,data.dates);assert.deepEqual(f.state.filter,{q:'',category:'',type:''});
  check('指定记录搜索→详情→关闭保留分类、搜索、区间且不重新请求；无结果可清除条件并保留原区间。');
}
{
  const f=fixture();f.state.route='ledger';await f.app.pages.ledger(f.paint);snapshot('ledger',f.html);
  assert.match(f.nodes['#ledger-filter-summary'].innerHTML,/收入|支出/);
  assert.equal((f.html.match(/class="btn primary"/g)||[]).length,1);
  f.state.bills=[{...data.rows[0],description:'<script>不可信记录</script>'}];f.app.renderBillList();assert.match(f.html,/&lt;script&gt;/);assert.doesNotMatch(f.html,/<script>/);
  assert.ok(filterBills(data.rows,'#'+data.rows[0].id).length>=1);check('账本以记录为主体，收支结果汇总与当前搜索同步，文本安全转义。');
}
{
  const f=fixture();f.state.route='visualization';await f.app.pages.visualization(f.paint);
  assert.match(f.html,/支出较上期减少|最大支出是住房|2026-08-02 — 2026-08-31/);
  assert.doesNotMatch(f.html,/home-status|analytics-balance|analytics-goal|bill-row|模拟|合成/);
  assert.equal((f.html.match(/class="btn primary"/g)||[]).length,1);
  assert.match(f.html,/逐项金额|tabindex="0" role="button"/);
  f.app.actions['primary-top-category']();assert.deepEqual(f.state.filter,{category:'住房',type:'expense',q:''});assert.deepEqual(f.state.ledgerRange,data.dates);
  snapshot('visualization',f.html);check('图表首个结论是支出变化和最大分类，展示对比日期与可展开读数；钻取与账本同口径。');
  f.state.visualBreakdown='对比';await f.app.pages.visualization(f.paint);assert.match(f.html,/comparison-row/);snapshot('visualization-comparison',f.html,'visualization');
  f.prefs.mask=true;await f.app.pages.visualization(f.paint);assert.doesNotMatch(f.html,/¥|￥|22\.92%/);assert.match(f.html,/金额已隐藏/);
  check('占比与对比可切换；隐藏金额覆盖故事、比例、图形与展开读数。');
}
{
  const report=structuredClone(data.report);report.summary={income_total:0,expense_total:0};report.net={current:0,previous:0,difference:0};report.pie=[];report.categories=[];report.bars={labels:[],income:[],expense:[]};
  for(const route of ['home','ledger','visualization']) {
    const f=fixture({report,rows:[]});f.state.route=route;await f.app.pages[route](f.paint);
    assert.match(f.html,/记第一笔|去记一笔/);assert.doesNotMatch(f.html,/cashflow-chart/);assert.equal((f.html.match(/class="btn primary"/g)||[]).length,1);snapshot(`${route}-empty`,f.html,route);
    const failed=f.app.errorHTML(new Error('<网络读取失败>'));assert.match(failed,/重新读取|查看原因/);assert.match(failed,/&lt;网络读取失败&gt;/);snapshot(`${route}-error`,failed,route);
  }
  check('三页空记录不画假图，均有记账出口；加载失败提供重试、保留选择及展开原因。');
}
{
  const report=structuredClone(data.report);report.categories=report.categories.map(row=>({...row,previous:0}));report.net.previous=0;
  const f=fixture({report});f.state.route='visualization';await f.app.pages.visualization(f.paint);
  assert.match(f.html,/暂无收支记录，暂不计算增减/);assert.doesNotMatch(f.html,/支出较上期增加|增长.*%/);check('缺上期记录时不虚构支出增减或增长率。');
}
{
  const f=fixture();f.state.epoch++;
  let resolve;f.ctx.book=()=>new Promise(r=>{resolve=r;}); // module captures dependencies, so use an explicit new module for this timing check.
  const app=createPrimaryPages(f.ctx),pending=app.pages.home(f.paint);f.state.epoch++;resolve({custom:data.report});await pending;
  assert.match(f.html,/正在读取/);assert.doesNotMatch(f.html,/home-status/);check('离开页面后迟到的读取结果不会覆盖新页面状态。');
}
writeFileSync(`${output}/checks.json`,JSON.stringify({checks,browser_validation:'not run: previously blocked Chromium path was not retried',layout_status:'static CSS review only; 390px, 200% zoom, focus and motion require browser acceptance'},null,2));
console.log(`PASS: ${checks.length} focused checks; static HTML evidence in review/.`);
