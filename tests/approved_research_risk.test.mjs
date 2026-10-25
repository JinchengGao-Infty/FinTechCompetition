import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApprovedResearch,researchQuoteStatus,researchPlanning} from '../AI_accounting_agent/frontend/liquid-glass/approved-research.js';
import {STOCK_IDENTITIES,stockIdentity} from '../AI_accounting_agent/frontend/liquid-glass/stock-identity.js';
import {createApprovedRisk} from '../AI_accounting_agent/frontend/liquid-glass/approved-risk.js';
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const state={investmentTab:'自选',favorites:['ABC'],selectedCode:'ABC'};
const ctx={state,prefs:{mask:false},esc,money:n=>`¥${n.toFixed(2)}`,icon:k=>`<svg data-icon="${esc(k)}"></svg>`,modal(){}};
const planning={planning:{basis:{observed_months:0},ready:false}};
const watchlist=[{code:'600036',name:'招商银行',quality:{status:'unavailable'}},{code:'ABC',name:'自选测试',quality:{status:'verified',latest_valid_date:'2025-12-01'}}];
test('watchlist is solely caller data, not the five prototype securities',()=>{
 const ui=createApprovedResearch(ctx);assert.doesNotMatch(ui.html({watchlist:[],planning}),/招商银行|贵州茅台|长江电力|中国神华|工业富联/);
 const html=ui.html({watchlist,planning});assert.equal((html.match(/data-action="stock"/g)||[]).length,2);assert.ok(html.indexOf('data-code="ABC"')<html.indexOf('data-code="600036"'));
 assert.match(html,/aria-current="true" aria-label="自选测试/);assert.match(html,/data-name="自选测试"/);assert.match(html,/fp-stock-company-logo/);assert.match(html,/<img\b/);assert.doesNotMatch(html,/https?:\/\//);
});
test('all ten securities have local company artwork without hotlinks',()=>{
 const codes=['600036','600519','600900','601088','601138','601288','601398','601628','601857','601988'];
 assert.deepEqual(Object.keys(STOCK_IDENTITIES).sort(),codes);
 const identities=codes.map(stockIdentity);assert.equal(new Set(identities).size,10);
 for(const identity of identities){assert.match(identity,/fp-stock-company-logo/);assert.match(identity,/data-company-logo="[0-9]{6}"/);assert.match(identity,/assets\/company-logos\//);assert.doesNotMatch(identity,/https?:\/\//);}
 const html=createApprovedResearch(ctx).html({planning,watchlist:codes.map(code=>({code,name:code}))});
 assert.equal((html.match(/data-action="stock"/g)||[]).length,10);assert.equal((html.match(/fp-stock-company-logo/g)||[]).length,10);
});

test('unavailable, absent, and nonnumeric quotes stay hidden rather than becoming zero returns',()=>{
 const ui=createApprovedResearch(ctx);
 for(const quote of [undefined,{status:'unavailable',price:93.47,change_pct:0},{status:'verified',price:null,change_pct:0},{status:'verified',price:'invalid',change_pct:0}]){
  const html=ui.html({planning,watchlist:[{code:'600036',name:'招商银行',quote}]});
  assert.doesNotMatch(html,/ap-r-price|93\.47|0\.00%/);assert.equal((html.match(/data-action="stock"/g)||[]).length,1);
 }
 const html=ui.html({planning,watchlist:[{code:'600036',name:'招商银行',quote:{status:'verified',price:93.47,change_pct:null}}]});
 assert.match(html,/93\.47/);assert.match(html,/涨跌待核对/);assert.doesNotMatch(html,/0\.00%/);
});

test('semantic fallback and XSS escaping do not require external fonts or logos',()=>{
 const html=createApprovedResearch(ctx).html({watchlist:[{code:'<123',name:'<img src=x onerror="bad">'}],planning});
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);assert.match(html,/<svg viewBox="0 0 24 24"/);assert.doesNotMatch(html,/https?:\/\//);
});
test('all three investment tabs and both real subtab actions remain',()=>{
 const html=createApprovedResearch(ctx).html({planning,watchlist});
 for(const name of ['个人持仓','银行理财','投资研究','自选研究','历史组合'])assert.ok(html.includes(name));
 assert.equal((html.match(/id="investment-sections"/g)||[]).length,1);assert.equal((html.match(/data-action="investment-tab"/g)||[]).length,2);
});
test('planning reflects readiness rather than invented income or a failed request',()=>{
 assert.equal(researchPlanning(planning).ready,false);assert.equal(researchPlanning({planning:{basis:{observed_months:3},ready:true,after_goal_minor:230001}}).ready,true);
 const ui=createApprovedResearch(ctx);assert.match(ui.html({planning,watchlist}),/先补齐月度收支/);assert.match(ui.html({planning:null,watchlist}),/暂时无法读取/);assert.doesNotMatch(ui.html({planning:null,watchlist}),/先补齐月度收支/);
 assert.match(ui.html({planning:{planning:{basis:{observed_months:3},after_goal_minor:230001}},watchlist}),/¥2300\.01/);
});
test('quality label and date follow actual research quality fields',()=>{
 assert.equal(researchQuoteStatus({quality:{status:'unavailable'}}).label,'待核对');assert.equal(researchQuoteStatus({quality:{status:'partial',latest_valid_date:'2025-11-22'}}).date,'2025-11-22');
 assert.equal(researchQuoteStatus({quality:{status:'verified'}}).label,'日期未提供');
 let body='';const ui=createApprovedResearch({...ctx,modal:(_,html)=>body=html});ui.html({planning,watchlist});ui.actions['ap-research-quotes']();assert.match(body,/2025-12-01/);assert.match(body,/日期未提供/);assert.doesNotMatch(body,/实时行情/);
});
test('historical portfolio renderer remains the trusted controller slot',()=>{
 const ui=createApprovedResearch({...ctx,state:{...state,investmentTab:'持仓'}});const html=ui.html({planning,watchlist,historyHTML:'<div data-existing-history>历史净值 2025-12-01</div>'});
 assert.match(html,/data-existing-history/);assert.match(html,/2025-12-01/);assert.equal((html.match(/data-action="stock"/g)||[]).length,0);
});
test('failed selected research source shows retry, not old watchlist',()=>{
 const html=createApprovedResearch(ctx).html({planning,watchlist,error:new Error('connection')});assert.match(html,/研究数据暂未加载/);assert.match(html,/data-action="refresh"/);assert.equal((html.match(/data-action="stock"/g)||[]).length,0);
});

function riskRoot(status='pending'){
 const label={textContent:''},button={dataset:{},disabled:false,textContent:'',setAttribute(){}};const listeners=new Map();let cancelled=0;
 return {dataset:{riskStatus:status},label,button,listeners,setAttribute(){},querySelector:s=>s.includes('h2')?label:button,contains:()=>true,addEventListener:(t,fn)=>listeners.set(t,fn),removeEventListener:t=>listeners.delete(t),getAnimations:()=>[{cancel(){cancelled++;}}],get animationCancels(){return cancelled;}};
}
test('risk defaults to idle and contains copied hollow arcs without assets/percentages',()=>{
 const ui=createApprovedRisk();const html=ui.html();assert.match(html,/data-risk-status="idle"/);assert.equal((html.match(/class="fp-cross-plane /g)||[]).length,2);
 assert.match(html,/M218 58 C168 11 73 17 33 97/);assert.doesNotMatch(html,/¥|资产|%|setTimeout|setInterval/);assert.match(html,/fpThinGlassB/);assert.match(html,/data-geometry-version="cross-v3"/);assert.equal((html.match(/class="fp-arc-glint"/g)||[]).length,2);
});
test('only actual host pending state runs and no timer completes the request',()=>{
 const ui=createApprovedRisk();const root=riskRoot();const token=ui.mount(root,{status:'pending'});assert.equal(ui.status,'pending');assert.equal(root.dataset.riskStatus,'pending');assert.equal(root.button.textContent,'取消');
 assert.equal(ui.setState({status:'completed'},token),true);assert.equal(root.label.textContent,'分析完成');assert.equal(root.button.textContent,'返回');assert.equal(ui.setState({status:'pending'},token),false);
});
test('cancel freezes synchronously and emits one intent without assuming cancelled',()=>{
 const calls=[],ui=createApprovedRisk({onCancel:x=>calls.push(x)}),root=riskRoot();ui.mount(root,{status:'pending'});
 assert.equal(ui.cancel(),true);assert.equal(ui.status,'cancelling');assert.equal(root.button.disabled,true);assert.equal(ui.cancel(),false);assert.equal(calls.length,1);
 ui.setState({status:'cancelled'});assert.equal(root.label.textContent,'已取消');assert.equal(root.button.textContent,'返回');
});
test('back pending invokes cancellation intent; terminal back is ordinary navigation',()=>{
 const intents=[];let backs=0;const ui=createApprovedRisk({onCancel:x=>intents.push(x),onBack:()=>backs++}),root=riskRoot();ui.mount(root,{status:'pending'});
 const button={dataset:{riskAction:'back'},disabled:false};const event={preventDefault(){},target:{closest:()=>button}};root.listeners.get('click')(event);assert.equal(intents[0].source,'backButton');assert.equal(backs,0);
 ui.setState({status:'cancelled'});root.listeners.get('click')(event);assert.equal(backs,1);
});
test('same-root mount does not restart loops and dispose rejects stale responses',()=>{
 const ui=createApprovedRisk(),root=riskRoot();const token=ui.mount(root,{status:'pending'});assert.equal(ui.mount(root,{status:'pending'}),token);ui.dispose();assert.equal(root.dataset.riskStatus,'disposed');assert.equal(root.listeners.size,0);assert.equal(root.animationCancels,1);assert.equal(ui.setState({status:'completed'},token),false);
 const next=riskRoot();const nextToken=ui.mount(next,{status:'pending'});assert.notEqual(nextToken,token);assert.equal(ui.setState({status:'completed'},token),false);assert.equal(ui.status,'pending');
});
test('only completed state exposes optional actual-result action; header back stays distinct',()=>{
 let results=0,backs=0;const ui=createApprovedRisk({onResult:()=>results++,onBack:()=>backs++}),root=riskRoot();ui.mount(root,{status:'pending'});
 assert.doesNotMatch(ui.html({status:'pending'}),/查看分析/);ui.setState({status:'completed'});assert.equal(root.button.textContent,'查看分析');assert.equal(root.button.dataset.riskAction,'result');
 const button={dataset:{riskAction:'result'},disabled:false};const event={preventDefault(){},target:{closest:()=>button}};root.listeners.get('click')(event);assert.equal(results,1);assert.equal(backs,0);
 button.dataset.riskAction='back';root.listeners.get('click')(event);assert.equal(backs,1);
 assert.doesNotMatch(createApprovedRisk().html({status:'completed'}),/查看分析/);
});
test('reduced motion remains explicit static state and stops with each terminal',()=>{
 const ui=createApprovedRisk({prefs:{reduceMotion:true}}),root=riskRoot();ui.mount(root,{status:'pending'});assert.equal(root.dataset.riskReduced,'true');ui.setReducedMotion(false);assert.equal(root.dataset.riskReduced,'false');
 ui.stop('error');assert.equal(root.dataset.riskStatus,'error');assert.equal(root.button.textContent,'返回');
});
test('failed cancellation never reports success',async()=>{
 const ui=createApprovedRisk({onCancel:async()=>{throw new Error('abort failed');}}),root=riskRoot();ui.mount(root,{status:'pending'});ui.cancel();await Promise.resolve();await Promise.resolve();assert.equal(ui.status,'error');assert.doesNotMatch(root.label.textContent,/完成|已取消/);
});
test('cross-v3 animates one XYZ parent while both planes stay fixed and orthogonal',()=>{
 const css=readFileSync(new URL('../AI_accounting_agent/frontend/liquid-glass/approved-risk.css',import.meta.url),'utf8');assert.match(css,/animation:apRiskCrossVolume 12\.8s linear infinite/);assert.match(css,/perspective:900px/);assert.match(css,/\.fp-cross-plane-a\{transform:rotateY\(90deg\)/);assert.match(css,/\.fp-cross-plane-b\{transform:rotateX\(90deg\) rotateZ\(90deg\)/);assert.match(css,/\.fp-cross-plane\{[^}]*animation:none!important/);assert.doesNotMatch(css,/apRiskOrbit|5\.6s|fpCrossRigid/);
 const section=css.slice(css.indexOf('@keyframes apRiskCrossVolume'),css.indexOf('@keyframes apRiskArcHighlight'));const xs=[...section.matchAll(/rotateX\((-?[\d.]+)deg\)/g)].map(m=>Number(m[1])),ys=[...section.matchAll(/rotateY\((-?[\d.]+)deg\)/g)].map(m=>Number(m[1]));assert.equal(xs.length,33);assert.equal(Math.min(...xs),-24);assert.equal(Math.max(...xs),60);assert.equal(Math.min(...ys),-40);assert.equal(Math.max(...ys),24);
});
test('cross-v3 pauses parent and all highlights and has static reduced motion',()=>{
 const css=readFileSync(new URL('../AI_accounting_agent/frontend/liquid-glass/approved-risk.css',import.meta.url),'utf8');assert.match(css,/apRiskArcHighlight 6\.4s linear infinite/);assert.match(css,/animation-delay:-3\.2s/);assert.match(css,/data-risk-status=pending\] :is\(\.ap-risk-rotor,\.fp-arc-trail,\.fp-arc-glint\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/data-risk-status=disposed/);assert.match(css,/stroke-dashoffset:-35;opacity:\.55/);
});
