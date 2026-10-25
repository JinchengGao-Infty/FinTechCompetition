import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createInvestment,productAvailability,holdingPeriod,liquidityLabel} from '../AI_accounting_agent/frontend/liquid-glass/investment.js';
import {createBanking} from '../AI_accounting_agent/frontend/liquid-glass/banking.js';

const data=JSON.parse(readFileSync('.runtime/investment-focus/overview.json','utf8'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const output='review/investment-batch3',checks=[];mkdirSync(output,{recursive:true});
function check(text){checks.push(text);console.log('PASS:',text);}
function fixture(snapshot=structuredClone(data)) {
  const calls=[],pages=[],saved=new Map(),nodes={'investment-view':{disabled:true},'investment-next-error':{textContent:''}};
  let html='',dialog=null,failed=false,closed=0;
  globalThis.document={getElementById:id=>nodes[id]||null,activeElement:null,querySelectorAll:()=>[],querySelector:()=>null};
  const ctx={state:{route:'investment',epoch:1,month:'2026-09',filter:{}},prefs:{mask:false},storage:{get:(key,fallback)=>saved.get(key)??fallback,set:(key,value)=>saved.set(key,value)},esc,money:value=>ctx.prefs.mask?'••••':'¥'+Number(value).toFixed(2),number:value=>String(value),icon:()=>'<svg class="icon"></svg>',card:(content,cls='')=>`<section class="surface-card ${cls}">${content}</section>`,btn:(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`,loading:()=>'<div class="loading">读取中</div>',range:()=>({start_date:'2026-09-01',end_date:'2026-09-30'}),go:route=>{pages.push(route);ctx.state.route=route;},closeSheet:()=>{closed++;dialog=null;},modal:(title,body)=>{dialog={title,body};},toast:()=>{},render:async()=>{await app.pages.investment(paint);}};
  const request=async(path,options)=>{calls.push({path,options});if(failed)throw new Error('<读取失败>');if(path==='/overview')return structuredClone(snapshot);if(path==='/bank-tasks'&&!options)return {tasks:[]};if(path==='/bank-tasks'&&options)return {id:'task-subscribe',version:1,kind:'subscribe',status:'collecting',draft:null,missing_slots:['amount'],slots:{product_id:'reserve'},history:[],steps:[]};throw new Error('unexpected '+path);};
  const bank=createBanking(ctx,{request,openDraft:async()=>{throw new Error('unexpected operation');}});
  const app=createInvestment(ctx,{request,startBanking:text=>bank.start(text)});
  const paint=value=>{html=value;};
  return {app,bank,ctx,calls,pages,nodes,paint,get html(){return html;},get dialog(){return dialog;},get closed(){return closed;},set failed(value){failed=value;},async select(id){app.onChange({target:{name:'investment-product',checked:true,value:id}});},snapshot};
}
function snapshot(name,html){writeFileSync(`${output}/${name}.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>静态结构 · ${name}</title>${['tokens','app','features','journey','investment','glass'].map(n=>`<link rel="stylesheet" href="../../AI_accounting_agent/frontend/liquid-glass/${n}.css">`).join('')}<body><div id="app" class="app-shell" data-route="investment"><main class="page-content investment-page">${html}<p class="hint">实际模块输出，静态证据；无运行脚本或浏览器验收。</p></main></div></body></html>`);}

{
  const f=fixture();await f.app.pages.investment(f.paint);
  assert.equal((f.html.match(/name="investment-product"/g)||[]).length,2);
  assert.equal((f.html.match(/class="btn primary/g)||[]).length,1);
  assert.match(f.html,/查看所选方案|收益率资料未提供/);assert.equal(f.nodes['investment-view'].disabled,true);
  assert.doesNotMatch(f.html,/planning-summary|funding-plan|investment-month|cashflow-chart|历史回测/);
  assert.match(f.html,/<details class="investment-more"><summary>资金计划与更多工具/);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/overview');snapshot('01-first-entry',f.html);
  await f.select('reserve');assert.equal(f.nodes['investment-view'].disabled,false);
  f.app.actions['investment-details']();assert.equal(f.dialog.title,'灵活现金');
  for(const text of ['候选方案 · 尚未发起申购','R1','资料列示费用','¥0.00','当前资料未提供，不作收益预测'])assert.ok(f.dialog.body.includes(text),text);
  assert.doesNotMatch(f.dialog.body,/保证收益率|年化.*%/);snapshot('02-product-detail',f.dialog.body);
  f.ctx.closeSheet();await f.app.pages.investment(f.paint);assert.match(f.html,/value="reserve" checked/);
  assert.ok(f.calls.every(c=>!c.options));
  check('首次进入只有方案选择主任务，查看/返回保留选择；风险、期限、取用及费用来自真实API，缺收益率不作预测，查看无写入。');
}
{
  const f=fixture();await f.app.pages.investment(f.paint);await f.select('reserve');f.app.actions['investment-details']();await f.app.actions['investment-next']();
  assert.deepEqual(f.pages,['banking']);assert.equal(f.calls.filter(c=>c.options).length,0);
  await f.bank.pages.banking(f.paint);assert.match(f.html,/>申购灵活现金<\/textarea>/);
  assert.equal(f.calls.filter(c=>c.options).length,0,'handoff only pre-fills, never auto-sends');
  await f.bank.submit('申购灵活现金');assert.match(f.html,/请补充人民币金额/);
  const taskCall=f.calls.find(c=>c.options);assert.equal(taskCall.path,'/bank-tasks');assert.equal(taskCall.options.body.text,'申购灵活现金');
  assert.ok(!f.calls.some(c=>c.path.startsWith('/operations')));
  f.ctx.state.route='investment';await f.app.pages.investment(f.paint);assert.match(f.html,/value="reserve" checked/);
  check('所选方案交接到现有银行助手只预填产品；用户发送后补金额，尚不创建资金操作；返回投资仍保留所选方案。');
}
{
  const s=structuredClone(data);s.products[0].holding_minor=12345;s.products[1].holding_minor=4567;s.assets_minor=s.cash_minor+16912;
  const f=fixture(s);await f.app.pages.investment(f.paint);assert.doesNotMatch(f.html,/¥123\.45|¥45\.67|¥169\.12/);
  f.app.actions['investment-current-holdings']();assert.equal(f.dialog.title,'持仓现状');
  for(const text of ['已持有本金','¥169.12','¥123.45','¥45.67'])assert.ok(f.dialog.body.includes(text),text);assert.match(f.dialog.body,/不含候选方案、未执行需求或研究中的历史组合/);
  assert.doesNotMatch(f.dialog.body,/收益率.*%/);snapshot('03-current-holdings',f.dialog.body);
  f.ctx.closeSheet();f.ctx.prefs.mask=true;await f.app.pages.investment(f.paint);f.app.actions['investment-current-holdings']();assert.doesNotMatch(f.dialog.body,/¥169\.12|¥123\.45|¥45\.67/);
  check('候选方案不混入持仓金额；持仓单列已持有本金，整数分合计与余额/账户总额口径自洽，并尊重隐藏金额。');
}
{
  const s=structuredClone(data);s.risk_completed=false;s.risk_level=1;s.planning.ready=false;s.investable_minor=0;s.products[0].eligible=true;s.products[1].eligible=false;
  assert.equal(productAvailability(s,s.products[0]).ready,true,'R1 eligibility follows the real backend, not an invented all-products questionnaire gate');
  assert.equal(productAvailability(s,s.products[1]).route,'profile');
  const f=fixture(s);await f.app.pages.investment(f.paint);await f.select('growth');f.app.actions['investment-details']();assert.match(f.dialog.body,/请先完善风险偏好/);await f.app.actions['investment-next']();assert.deepEqual(f.pages,['profile']);
  assert.ok(f.calls.every(c=>!c.options));
  s.protection_locked=true;assert.equal(productAvailability(s,s.products[0]).route,'security');
  s.protection_locked=false;s.cash_minor=0;assert.equal(productAvailability(s,s.products[0]).route,'bank');
  assert.equal(holdingPeriod(data.products.find(p=>p.id==='growth')),'12个月以上');
  assert.equal(liquidityLabel(data.products.find(p=>p.id==='growth')),'当前系统即时赎回');
  check('适配使用服务端 eligible 与现有余额口径；不误拦已有R1能力，不把建议期限写成锁定期；不满足条件有实际资料/账户出口。');
}
{
  const s=structuredClone(data);s.products=[];s.assets_minor=s.cash_minor;
  const f=fixture(s);await f.app.pages.investment(f.paint);assert.match(f.html,/暂无可查看的方案|重新读取/);assert.doesNotMatch(f.html,/name="investment-product"/);snapshot('04-empty-catalog',f.html);
  f.app.actions['investment-current-holdings']();assert.match(f.dialog.body,/当前没有持仓|返回方案/);
  const g=fixture();await g.app.pages.investment(g.paint);await g.select('growth');g.failed=true;await g.app.pages.investment(g.paint);
  assert.match(g.html,/暂时无法读取理财方案|重新读取|返回首页|&lt;读取失败&gt;/);snapshot('05-read-error',g.html);
  assert.equal(g.ctx.state.investmentChoice,'growth');g.failed=false;await g.app.actions['investment-refresh']();assert.match(g.html,/value="growth" checked/);
  check('空目录、空持仓、读取失败均有明确出口；重试恢复后选择不丢失，不用缺失数据伪造方案。');
}
{
  const f=fixture();await f.app.pages.investment(f.paint);
  for(const route of ['profile','wealth','holdings','research','compare'])assert.match(f.html,new RegExp(`data-route="${route}"`));
  f.app.actions['investment-tool']({dataset:{route:'research'}});assert.deepEqual(f.pages,['research']);
  f.ctx.state.route='investment';await f.app.pages.investment(f.paint);await f.select('reserve');f.app.actions['investment-details']();
  assert.equal(f.calls.filter(c=>c.options).length,0);
  check('目标、资产、持仓赎回和投研能力保留在次级入口；首屏无重复收支图表、策略开关或历史收益承诺。');
}
writeFileSync(`${output}/checks.json`,JSON.stringify({checks,fixture:'catalog/account fixture exported by temporary TestClient; nonzero holdings variant is explicitly synthetic',browser_validation:'pending; no browser or screenshots',operations:'no live financial operations'},null,2));
console.log(`PASS: ${checks.length} investment task groups.`);
