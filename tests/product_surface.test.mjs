import {protectionPageHTML} from '../AI_accounting_agent/frontend/liquid-glass/protection.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductTask} from '../AI_accounting_agent/frontend/liquid-glass/product-task.js';
import {assistantStartHTML} from '../AI_accounting_agent/frontend/liquid-glass/product-assistant.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const task=createProductTask({esc,icon:name=>`<svg data-icon="${name}"></svg>`});
const base={handle:'op-controlled',kind:'transfer',status:'needs_confirmation',params:{amount_minor:50000,from_account:'from'},target_name:'小林',created_at:0};
const render=(op=base,options={})=>task.render(op,{snapshot:{mfa_enabled:true},accountName:()=>'<account>',...options}).html;
test('confirmation action matches actual operation kind, amount and MFA consequence',()=>{for(const [kind,label]of [['transfer','转账'],['subscribe','申购'],['redeem','赎回']]){assert.match(render({...base,kind}),new RegExp('确认'+label+' ¥500.00'));assert.match(render({...base,kind,status:'needs_mfa'}),new RegExp('验证并'+label+' ¥500.00'));}});
test('masked confirmation never leaks amount or target and stays disabled',()=>{const html=render(base,{hidden:true});assert.doesNotMatch(html,/500.00|小林|&lt;account&gt;/);assert.match(html,/<button type="submit"[^>]*disabled/);});
test('unknown result has meaningful stationary stages and reconciliation only',()=>{const html=render({...base,status:'unknown'});assert.match(html,/已请求/);assert.match(html,/待核实/);assert.match(html,/待结果/);assert.match(html,/data-action="journey-reconcile"/);assert.doesNotMatch(html,/finance-confirm-form|再次划转|data-action="journey-cancel"/);});
test('all assistant modes expose existing routes without starting or faking an operation',()=>{for(const mode of ['book','finance','trader']){const html=assistantStartHTML({state:{mode},esc,icon:()=>'<svg></svg>'});assert.match(html,/type="button"/);assert.doesNotMatch(html,/已到账|识别成功|实时行情|setTimeout|fetch\(/);}const html=assistantStartHTML({state:{mode:'book'},esc,icon:()=>''});assert.match(html,/data-action="mobile-bank"/);assert.match(html,/data-action="product-capture-open"/);});

test('protection overview leads with actual records/settings, keeps unresolved recovery and policy disclosure',()=>{const ctx={esc,card:body=>`<section>${body}</section>`,btn:(label,action)=>`<button data-action="${action}">${label}</button>`,money:value=>'¥'+Number(value).toFixed(2),prefs:{mask:false}};const html=protectionPageHTML(ctx,{policy_version:'2026.1.0',mfa_enabled:false,protection_locked:true,operations:[{...base,status:'unknown',label:'转账'}]});assert.match(html,/待核实（1）/);assert.match(html,/data-action="journey-operation"/);assert.match(html,/data-action="journey-recovery"/);assert.match(html,/<details[^>]*><summary>确认规则/);assert.doesNotMatch(html,/哪些步骤由你决定|查询不多一步|动用资金，先核对/);});
