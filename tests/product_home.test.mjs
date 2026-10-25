import assert from 'node:assert/strict';
import {createMobilePages} from '../AI_accounting_agent/frontend/liquid-glass/mobile-pages.js';
import {isCashflow} from '../AI_accounting_agent/frontend/liquid-glass/primary-pages.js';
const state={epoch:1,month:'2026-09',filter:{},bills:[]},calls=[],routes=[];
const bank={cash_minor:5000000,assets_minor:99999999,mode:'simulated_bank',products:[{holding_minor:12500}]};
let positions={total_cost:'351.01'},failed=false,body='';
const rows=[
 {id:6,event_date:'2026-10-24',type:'income',amount:500,category:'其他收入',description:'内部转入',metadata:{movement:'internal_transfer'}},
 {id:5,event_date:'2026-10-24',type:'expense',amount:500,category:'其他',description:'本金转出',movement:'principal'},
 {id:4,event_date:'2026-10-23',type:'expense',amount:28,category:'餐饮',description:'午餐',metadata:{}},
 {id:3,event_date:'2026-10-22',type:'income',amount:8.8,category:'退款',description:'商户退回',metadata:{}},
 {id:2,event_date:'2026-10-21',type:'income',amount:100,category:'工资',description:'工资',metadata:{}}
];
const ctx={state,prefs:{mask:false},finance:async path=>{calls.push(path);if(path==='/overview')return bank;if(path==='/positions'){if(failed)throw new Error('unavailable');return positions;}throw new Error(path)},allBills:async()=>rows,esc:String,money:x=>Number.isFinite(Number(x))?Number(x).toFixed(2):'—',icon:x=>`<svg data-icon="${x}"></svg>`,btn:(label,action)=>`<button data-action="${action}">${label}</button>`,card:html=>`<section>${html}</section>`,loading:()=>'',range:()=>({start_date:'2026-09-01',end_date:'2026-09-30'}),go:url=>routes.push(url)};
const pages=createMobilePages(ctx);
await pages.pages.home(html=>body=html);
assert.deepEqual(calls,['/overview','/positions']);assert.match(body,/账户余额/);assert.doesNotMatch(body,/净资产/);assert.match(body,/50000\.00/);assert.doesNotMatch(body,/999999\.99/);assert.match(body,/理财本金/);assert.match(body,/125\.00/);assert.match(body,/个人持仓成本/);assert.match(body,/351\.01/);
assert.match(body,/data-action="product-capture-open"/);assert.doesNotMatch(body,/data-action="entry"/);
assert.deepEqual(state.homeRows.map(x=>x.id),[4,3]);assert.match(body,/退款/);assert.match(body,/9月收支/);assert.equal((body.match(/50000\.00/g)||[]).length,1);assert.doesNotMatch(body,/内部转入|本金转出/);
assert.equal(isCashflow(rows[0]),false);assert.equal(isCashflow(rows[1]),false);
pages.actions['mobile-home-bank-holdings']();assert.equal(routes.at(-1),'holdings');pages.actions['mobile-investment']();assert.equal(routes.at(-1),'investment');
pages.actions['mobile-home-ledger']();const q=new URLSearchParams(routes.at(-1).split('?')[1]);assert.equal(q.get('cashflow_only'),'1');assert.equal(q.get('start_date'),'2026-10-21');assert.equal(q.get('end_date'),'2026-10-23');assert.equal(state.month,'2026-09');
positions={total_cost:'101.01'};await pages.pages.home(html=>body=html);assert.match(body,/101\.01/);assert.doesNotMatch(body,/351\.01/);
positions={total_cost:'1.005'};ctx.money=x=>Number.isFinite(Number(x))?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(x):'—';await createMobilePages(ctx).pages.home(html=>body=html);assert.match(body,/1\.01/);
failed=true;await pages.pages.home(html=>body=html);assert.match(body,/账户余额/);assert.match(body,/个人持仓成本<\/span><strong class="money">—/);
console.log('PASS: home uses bank cash/principal and personal cost as separate measures with matching destinations; never labels their sum net assets.');
console.log('PASS: home opens capture; recent cashflow excludes both movement forms, keeps refunds explicit, and its All link retains the exact cashflow range without changing global month.');
console.log('PASS: personal cost updates from positions; unavailable cost stays unknown while bank balance remains available.');
