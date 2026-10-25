import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetMinor,budgetPayload,budgetModel,createApprovedBudget} from '../AI_accounting_agent/frontend/liquid-glass/approved-budget.js';

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const dto={period:{start_date:'2026-10-01',end_date:'2026-10-31'},totals:{gross_expense_minor:4200,net_expense_minor:3200},expense_categories:[{category:'餐饮',amount_minor:4200}]};
const unset={status:'unset',month:'2026-10',total_minor:null,categories:[],revision:0};
const configured={status:'set',month:'2026-10',total_minor:10000,categories:[{category:'餐饮',limit_minor:5000}],revision:1};
const base={state:{month:'2026-10'},prefs:{mask:false},money:n=>Number.isFinite(n)?`¥${n.toFixed(2)}`:'—',esc,icon:name=>`<svg data-icon="${esc(name)}"></svg>`};

test('minor parser uses exact decimal cents',()=>{
 assert.equal(budgetMinor('0.29'),29);assert.equal(budgetMinor('12.1'),1210);assert.equal(budgetMinor(' 123 '),12300);
 for(const value of ['-1','1e3','3.333','NaN','','.2','2.'])assert.throws(()=>budgetMinor(value));
 assert.throws(()=>budgetMinor('9007199254740991'));
});
test('payload validates total, sum, duplicates and revision without mutation',()=>{
 const values={total:'100',categories:[{category:'餐饮',value:'20.12'},{category:'购物',value:''}]};
 assert.deepEqual(budgetPayload(values,0,'id'),{total_minor:10000,categories:[{category:'餐饮',limit_minor:2012}],expected_revision:0,request_id:'id'});
 assert.equal(values.categories.length,2);
 assert.throws(()=>budgetPayload({total:'0'},0,'id'));
 assert.throws(()=>budgetPayload({total:'1',categories:[{category:'餐饮',value:'2'}]},0,'id'));
 assert.throws(()=>budgetPayload({total:'3',categories:[{category:'餐饮',value:'1'},{category:'餐饮',value:'1'}]},0,'id'));
 assert.throws(()=>budgetPayload(values,-1,'id'));
});
test('model keeps gross-spending basis and no invented unset ratios',()=>{
 const m=budgetModel(dto,unset);assert.equal(m.spent,4200);assert.equal(m.configured,false);assert.equal(m.remaining,null);assert.equal(m.ratio,null);assert.equal(m.categories[0].limit,null);
 assert.equal(budgetModel(dto,{...configured,month:'2026-09'}).ready,false);
 assert.equal(budgetModel(dto,undefined).ready,false);
});
test('configured model combines zero-spend categories and caps visual overspend only',()=>{
 const m=budgetModel(dto,{...configured,total_minor:4000,categories:[{category:'出行',limit_minor:0}]});
 assert.equal(m.ratio,1);assert.equal(m.remaining,-200);assert.equal(m.categories[1].spent,0);assert.equal(m.categories[1].limit,0);
});
test('unset view retains native arc and document with one setup action',()=>{
 const ui=createApprovedBudget(base),html=ui.html(dto,unset);
 assert.match(html,/未设置/);assert.match(html,/M24 128 C-5 72 30 18 80 18/);assert.match(html,/ap-b-sheet/);
 assert.equal((html.match(/data-action="ap-budget-edit"/g)||[]).length,1);assert.doesNotMatch(html,/role="progressbar"|NaN|undefined|>0%</);
 assert.match(html,/data-value="budget" aria-selected="true"/);
});
test('loading and failure are separate from unset',()=>{
 const ui=createApprovedBudget(base);
 assert.match(ui.html(dto,null,{loading:true}),/读取中/);assert.doesNotMatch(ui.html(dto,null,{loading:true}),/未设置/);
 assert.match(ui.html(dto,undefined),/读取中/);assert.doesNotMatch(ui.html(dto,undefined),/未设置/);
 assert.match(ui.html(dto,null,{error:new Error('failed')}),/暂不可用/);assert.doesNotMatch(ui.html(dto,null,{error:true}),/未设置/);
});
test('mask removes visible amounts and configured progress',()=>{
 const html=createApprovedBudget({...base,prefs:{mask:true}}).html(dto,configured);
 assert.match(html,/金额已隐藏/);assert.doesNotMatch(html,/¥|role="progressbar"|class="ap-b-progress/);
});
test('category names escaped in view and editor',async()=>{
 let modalHTML='';const malicious={...dto,expense_categories:[{category:'<img onerror="1">',amount_minor:4200}]};
 const ui=createApprovedBudget({...base,finance:async()=>unset,modal:(_,html)=>{modalHTML=html;}});
 assert.doesNotMatch(ui.html(malicious,unset),/<img/);await ui.actions['ap-budget-edit']();assert.doesNotMatch(modalHTML,/<img/);assert.match(modalHTML,/&lt;img/);
});

function harness(response){
 let modalHTML='',closed=0;const calls=[],changed=[],memory=new Map();
 const errorNode={innerHTML:'',insertAdjacentHTML:(_,html)=>{errorNode.innerHTML+=html;}};
 globalThis.document={querySelector:()=>errorNode,querySelectorAll:()=>[]};
 const ctx={...base,finance:async(path,options={})=>{calls.push({path,options});return response(path,options,calls.length);},modal:(_,html)=>{modalHTML=html;},closeSheet:()=>{closed++;},onBudgetChanged:async data=>changed.push(data),storage:{get:key=>memory.get(key),set:(key,value)=>memory.set(key,value)}};
 const ui=createApprovedBudget(ctx);ui.setContext(dto,unset);
 const control={disabled:false,isConnected:true,type:'submit',hidden:false};
 const form=(total='100',revision='0')=>({id:'ap-budget-form',dataset:{month:'2026-10',revision},elements:{namedItem:()=>({value:total})},querySelectorAll:selector=>selector==='[data-budget-category]'?[]:[control]});
 return {ui,calls,changed,memory,control,form,errorNode,get modalHTML(){return modalHTML;},get closed(){return closed;}};
}
test('successful submit waits for actual PUT then latest GET',async()=>{
 const h=harness((path,options)=>options.method==='PUT'?configured:{...configured,revision:2});
 await h.ui.onSubmit({target:h.form(),preventDefault(){}});
 assert.equal(h.calls[0].options.method,'PUT');assert.equal(h.calls[0].options.body.expected_revision,0);assert.equal(h.calls[1].options.method,undefined);
 assert.equal(h.closed,1);assert.equal(h.changed.at(-1).revision,2);assert.equal(h.memory.get('finpilot-budget-pending-v1'),null);
});
test('uncertain PUT locks edits and recovers only identical request ID/payload',async()=>{
 let first=true;const h=harness((path,options)=>{if(options.method==='PUT'&&first){first=false;throw new Error('lost response');}return configured;});
 await h.ui.onSubmit({target:h.form(),preventDefault(){}});
 const original=h.calls[0].options.body;assert.equal(h.control.disabled,true);assert.equal(h.control.hidden,true);assert.match(h.errorNode.innerHTML,/核实保存/);
 await h.ui.onSubmit({target:h.form('200'),preventDefault(){}});assert.equal(h.calls.length,1);
 await h.ui.actions['ap-budget-recover']();
 assert.deepEqual(h.calls[1].options.body,original);assert.equal(h.changed.at(-1).revision,1);assert.equal(h.memory.get('finpilot-budget-pending-v1'),null);
});
test('409 does not auto-resubmit and preserves editable proposal after reload',async()=>{
 let first=true;const h=harness((path,options)=>{if(options.method==='PUT'&&first){first=false;throw Object.assign(new Error('revision changed'),{status:409});}return {...configured,revision:2};});
 await h.ui.onSubmit({target:h.form('123'),preventDefault(){}});
 assert.equal(h.calls.filter(c=>c.options.method==='PUT').length,1);assert.match(h.modalHTML,/data-revision="2"/);assert.match(h.modalHTML,/value="123"/);assert.match(h.modalHTML,/核对后再保存/);assert.equal(h.memory.get('finpilot-budget-pending-v1'),null);
 await h.ui.onSubmit({target:h.form('123','2'),preventDefault(){}});
 assert.notEqual(h.calls[0].options.body.request_id,h.calls[2].options.body.request_id);assert.equal(h.calls[2].options.body.expected_revision,2);
});
test('known rejection allows correction without retaining ambiguous attempt',async()=>{
 const h=harness(()=>{throw Object.assign(new Error('invalid'),{status:422});});
 await h.ui.onSubmit({target:h.form(),preventDefault(){}});
 assert.equal(h.control.disabled,false);assert.equal(h.memory.get('finpilot-budget-pending-v1'),null);assert.match(h.errorNode.innerHTML,/核对预算金额/);
});
test('duplicate submit while request is in flight cannot issue second PUT',async()=>{
 let resolve;const wait=new Promise(r=>resolve=r);const h=harness((path,options)=>options.method==='PUT'?wait:configured);
 const pending=h.ui.onSubmit({target:h.form(),preventDefault(){}});
 await h.ui.onSubmit({target:h.form(),preventDefault(){}});assert.equal(h.calls.length,1);
 resolve(configured);await pending;assert.equal(h.calls.filter(c=>c.options.method==='PUT').length,1);
});
test('closed or replaced sheet is not reopened by a late read',async()=>{
 let resolve,generation=0,count=0;const wait=new Promise(r=>resolve=r);
 const ui=createApprovedBudget({...base,finance:async()=>wait,getSheetGeneration:()=>generation,modal:()=>{generation++;count++;}});ui.setContext(dto,unset);
 const open=ui.actions['ap-budget-edit']();generation++;resolve(unset);await open;assert.equal(count,1);
});
test('late saved response updates data without closing another sheet',async()=>{
 let resolve,generation=1,closed=0;const wait=new Promise(r=>resolve=r);
 const h=harness((path,options)=>options.method==='PUT'?wait:configured);
 const ui=createApprovedBudget({...base,finance:async(path,options)=>options?.method==='PUT'?wait:configured,getSheetGeneration:()=>generation,closeSheet:()=>{closed++;},onBudgetChanged:async()=>{}});ui.setContext(dto,unset);
 const saved=ui.onSubmit({target:h.form(),preventDefault(){}});generation++;resolve(configured);await saved;assert.equal(closed,0);
});
test('render callback error does not reclassify a known saved result as uncertain',async()=>{
 const h=harness(()=>configured);const stored=new Map(),toasts=[];
 const ui=createApprovedBudget({...base,finance:async()=>configured,closeSheet(){},onBudgetChanged:async()=>{throw new Error('render failed');},storage:{get:key=>stored.get(key),set:(key,value)=>stored.set(key,value)},toast:value=>toasts.push(value)});ui.setContext(dto,unset);
 await ui.onSubmit({target:h.form(),preventDefault(){}});
 assert.equal(stored.get('finpilot-budget-pending-v1'),null);assert.equal(toasts[0],'预算已保存，刷新后查看');assert.doesNotMatch(h.errorNode.innerHTML,/保存结果暂未确认/);
});
