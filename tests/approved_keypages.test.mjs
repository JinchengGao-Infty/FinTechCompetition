import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedHome} from '../AI_accounting_agent/frontend/liquid-glass/approved-home.js';
import {createApprovedOverview} from '../AI_accounting_agent/frontend/liquid-glass/approved-overview.js';
import {createApprovedAssistant} from '../AI_accounting_agent/frontend/liquid-glass/approved-assistant.js';
import {approvedNav} from '../AI_accounting_agent/frontend/liquid-glass/approved-shell.js';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=n=>n==null?'—':'¥'+Number(n).toFixed(2),icon=()=>'<svg></svg>';
test('home keeps cash, wealth principal and personal cost separate, refund net totals and no shortcuts',async()=>{
 const rows=[{id:1,event_date:'2026-10-01',type:'income',category:'工资',amount:300},{id:2,event_date:'2026-10-02',type:'expense',category:'餐饮',amount:100},{id:3,event_date:'2026-10-03',type:'income',category:'退款',amount:20},{id:4,event_date:'2026-10-04',type:'expense',category:'餐饮',amount:999,metadata:{movement:'internal_transfer'}}];
 const calls=[],state={epoch:1,month:'2026-10'};let html='';
 const app=createApprovedHome({state,prefs:{},esc,money,icon,loading:()=>'',range:()=>({start_date:'2026-10-01',end_date:'2026-10-31'}),allBills:async()=>rows,finance:async path=>{calls.push(path);return path==='/overview'?{cash_minor:50000,assets_minor:9876500,products:[{holding_minor:10000}]}:{total_cost:200};}});
 await app.pages.home(v=>html=v);for(const n of [500,100,200,300,220])assert(html.includes(money(n)));assert.match(html,/ap-home-summary[\s\S]*收入<\/span><strong>¥300.00<\/strong>[\s\S]*支出<\/span><strong>¥100.00<\/strong>[\s\S]*结余<\/span><strong>¥220.00<\/strong>/);assert(!html.includes(money(98765)));assert(!html.includes(money(999)));assert.equal(state.homeRows.length,2);assert.deepEqual(calls.sort(),['/overview','/positions']);assert.doesNotMatch(html,/data-action="(?:entry|product-capture-open|statement-import|journey-transfer)"/);
});
test('home unavailable personal positions do not invent zero holdings',async()=>{let html='';const app=createApprovedHome({state:{epoch:1,month:'2026-10'},prefs:{},esc,money,icon,loading:()=>'',range:()=>({start_date:'2026-10-01',end_date:'2026-10-31'}),allBills:async()=>[],finance:async p=>{if(p==='/positions')throw Error('fixture unavailable');return {cash_minor:50000,products:[]};}});await app.pages.home(v=>html=v);assert.match(html,/个人持仓成本<\/span><strong>—/);});
test('overview exact real category proportions, zero income no fill and no invented budget',()=>{
 const app=createApprovedOverview({state:{productBudget:{status:'unset'}},prefs:{},money,esc,icon,categoryColor:c=>c==='餐饮'?'red':'blue'});
 const html=app.html({totals:{gross_expense_minor:4000,gross_income_minor:0,net_cashflow_minor:-4000,refund_minor:0,net_expense_minor:4000},expense_categories:[{category:'餐饮',amount_minor:3000},{category:'出行',amount_minor:1000}]});
 assert(html.includes('75.0%'));assert(html.includes('25.0%'));const segments=[...html.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)];assert.equal(segments.length,2);assert(Math.abs(Number(segments[0][1])/Number(segments[0][2])-.75)<1e-10);assert.match(html,/收入<\/span><span class="ap-o-track" aria-hidden="true"><\/span>/);assert(html.includes('预算未设置'));assert.doesNotMatch(html,/预算剩余|已使用|8,000/);
});
test('assistant escapes identity/messages, uses no execution draft cards and only real busy stop',()=>{
 const state={mode:'finance',chats:{finance:[]},chatBusy:false};const app=createApprovedAssistant({state,getDisplayName:()=>'<Ada>',icon});let html=app.pageHTML();assert(html.includes('&lt;Ada&gt;'));assert(!html.includes('David'));assert(!html.includes('stop-chat'));assert(!app.historyHTML().includes('<h2>'));
 state.chats.finance=[{role:'assistant',content:'<script>unsafe</script>',action_draft:{kind:'transfer',amount:'999'}}];const root={innerHTML:'',dataset:{},scrollHeight:10};app.renderMessages(root);assert(root.innerHTML.includes('&lt;script&gt;'));assert(!root.innerHTML.includes('transfer'));assert(!root.innerHTML.includes('999'));state.chatBusy=true;app.renderMessages(root);assert(root.innerHTML.includes('stop-chat'));assert(root.innerHTML.includes('生成中'));assert.equal(root.scrollTop,10);state.chatBusy=false;app.renderMessages(root);assert(!root.innerHTML.includes('生成中'));assert.equal(createApprovedAssistant({state:{mode:'book',chats:{book:[]}}}).pageHTML().includes('你好'),true);
});
test('shell has exactly five distinct destinations and one active item',()=>{for(const active of ['home','ledger','visualization','assistant','investment']){const html=approvedNav(active),targets=[...html.matchAll(/data-nav-tab="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(targets,['home','ledger','visualization','assistant','investment']);assert.equal(new Set(targets).size,5);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);}});

test('overview unknown budget is unavailable rather than a fabricated unset configuration',()=>{const app=createApprovedOverview({state:{},prefs:{},money,esc,icon,categoryColor:()=>'red'});const html=app.html({totals:{gross_expense_minor:0,gross_income_minor:0,net_cashflow_minor:0,refund_minor:0},expense_categories:[]});assert(html.includes('预算暂不可用'));assert(!html.includes('预算未设置'));});
