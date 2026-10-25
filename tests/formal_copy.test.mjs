import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createJourney} from '../AI_accounting_agent/frontend/liquid-glass/journey.js';
import {routes} from '../AI_accounting_agent/frontend/liquid-glass/navigation.js';
import {terms} from '../AI_accounting_agent/frontend/liquid-glass/learning.js';

const snapshot=JSON.parse(readFileSync('.runtime/protection-view/after-mfa.json','utf8'));
const original=JSON.stringify(snapshot),calls=[];
let html='',dialog=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={state:{route:'holdings',epoch:1},prefs:{mask:false},storage:{get:(_k,fallback)=>fallback,set:()=>{}},esc,money:value=>'¥'+Number(value).toFixed(2),number:String,icon:()=>'',card:body=>`<section>${body}</section>`,btn:(label,action,cls='',extra='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`,loading:()=>'<p>读取中</p>',modal:(title,body)=>{dialog={title,body};},closeSheet:()=>{},toast:()=>{},go:()=>{},render:()=>{}};
const app=createJourney(ctx,{request:async(path,options)=>{calls.push({path,options});assert.equal(path,'/overview');assert.equal(options,undefined);return structuredClone(snapshot);}});
const paint=value=>{html=value;};

await app.pages.holdings(paint);
for(const text of ['总资产','可用金额','>申购<','>赎回<','>账户<','当前系统即时赎回'])assert.ok(html.includes(text),text);
assert.doesNotMatch(html,/模拟|体验/);
assert.ok(html.includes(ctx.money(snapshot.assets_minor/100)));
assert.ok(html.includes(ctx.money(snapshot.products[0].holding_minor/100)));
await app.actions['journey-subscribe']({dataset:{product:'reserve'}});
assert.equal(dialog.title,'理财申购 · 灵活现金');assert.match(dialog.body,/finance-operation-form|核对操作/);assert.doesNotMatch(dialog.title+dialog.body,/模拟|体验/);
console.log('PASS: 持仓和申购入口使用正式业务文案，仍显示实际总资产、本金和原核对表单。');

await app.pages.compare(paint);
for(const text of ['账户适配','可安排金额','费用','持仓管理','当前系统即时赎回','0 元'])assert.ok(html.includes(text),text);
assert.doesNotMatch(html,/模拟|体验/);
assert.match(html,/R1/);assert.match(html,/R3/);
console.log('PASS: 方案比较文案统一，费用、风险与取用口径保留真实字段。');

await app.pages.bank(paint);
assert.match(html,/系统内账户|账户范围|未连接外部银行|不表示外部银行到账/);
assert.doesNotMatch(html,/体验账户|>体验</);
assert.equal(routes.holdings.title,'持仓管理');assert.equal(routes.bank.title,'账户');
assert.match(terms.risk.check,/系统内方案等级|不能替代销售机构/);assert.doesNotMatch(terms.risk.check,/模拟方案|辅助体验/);
for(const name of ['improvement.js','wealth.js'])assert.doesNotMatch(readFileSync('AI_accounting_agent/frontend/liquid-glass/'+name,'utf8'),/模拟申购|模拟赎回|模拟持仓/);
assert.equal(JSON.stringify(snapshot),original,'display formatting cannot rewrite source fields');
assert.equal(snapshot.products.find(p=>p.id==='growth').liquidity,'体验中即时赎回');
assert.ok(calls.every(call=>!call.options));
console.log('PASS: 路由、帮助与资产口径文案统一，保留系统内账户接入说明，不修改原始产品值或发起资金请求。');
console.log('PASS: 3 concise formal-copy regression groups.');
