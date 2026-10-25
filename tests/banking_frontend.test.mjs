import assert from 'node:assert/strict';
import {createBanking} from '../AI_accounting_agent/frontend/liquid-glass/banking.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ready={id:'b6385514-63a2-49a3-bd78-2b0bd8ac93bf',version:2,kind:'transfer',status:'ready',draft:{kind:'transfer',recipient_id:'acct-lin',amount:'80.00'},slots:{},history:[{role:'user',content:'给小林转80元'},{role:'assistant',content:'草稿待核对'}],reply:'草稿待核对',steps:[{label:'确认',status:'pending'}]};
function fixture(request,selected=null) {
  const saved=new Map(selected?[['FINPILOT_CONTEST_BANK_TASK',selected]]:[]),opened=[],notices=[],pages=[];
  const ctx={state:{route:'banking'},prefs:{mask:false},storage:{get:(key,fallback)=>saved.get(key)??fallback,set:(key,value)=>saved.set(key,value)},esc:escape,money:value=>ctx.prefs.mask?'••••':'¥'+value.toFixed(2),card:(content,cls)=>`<section class="${cls}">${content}</section>`,btn:(label,action,cls,extra='')=>`<button data-action="${action}" class="${cls}" ${extra}>${label}</button>`,icon:()=>'<svg></svg>',loading:()=>'<span>loading</span>',go:route=>pages.push(route),toast:text=>notices.push(text)};
  const app=createBanking(ctx,{request:(path,options)=>path==='/overview'?Promise.resolve({recipients:[{id:'acct-lin',name:'小林'}],products:[]}):request(path,options),openDraft:async data=>opened.push(data)});
  let html='';
  return {app,ctx,saved,opened,notices,pages,paint:text=>{html=text;},get html(){return html;}};
}

{
  let server=structuredClone(ready);const calls=[];
  const f=fixture(async(path,options)=>{calls.push({path,options});return path==='/bank-tasks'?{tasks:[server]}:server;},ready.id);
  await f.app.pages.banking(f.paint);
  assert.match(f.html,/待核对/);
  assert.match(f.html,/核对对象与金额后，再确认执行/);
  await f.app.actions['banking-review']();await f.app.actions['banking-review']();
  assert.equal(f.opened.length,2);
  assert.equal(f.opened[0].request_id,f.opened[1].request_id,'reopening a task must reuse the reviewed operation identity');
  assert.equal(f.opened[0].request_id,`task-${ready.id}-2`);
  assert.ok(calls.every(call=>!call.options?.method),'draft review must only read task state; never execute money');
  server={...server,status:'cancelled',draft:null,version:3};
  await f.app.actions['banking-review']();
  assert.equal(f.opened.length,2,'a remotely cancelled task must not open a stale money draft');
}
console.log('PASS: restored drafts use stable identities and recheck current task before the existing confirmation flow.');

{
  let failed=true;const requests=[];
  const f=fixture(async(path,options)=>{if(!options)return {tasks:[]};requests.push(structuredClone(options.body));if(failed){failed=false;throw new Error('网络断开');}return ready;});
  await f.app.pages.banking(f.paint);await f.app.submit('给小林转80元');
  assert.equal(requests.length,1,'failed task POST is not retried automatically');
  assert.match(f.html,/网络断开/);assert.match(f.html,/给小林转80元/);
  await f.app.actions['banking-retry']();
  assert.deepEqual(requests[0],requests[1],'explicit retry preserves idempotency key and exact payload');
  assert.equal(f.saved.get('FINPILOT_CONTEST_BANK_TASK'),ready.id);
  await f.app.submit('改成50元');
  assert.equal(requests[2].task_id,ready.id);assert.equal(requests[2].version,2);
  assert.notEqual(requests[2].request_id,requests[1].request_id);
}
console.log('PASS: retries are explicit and idempotent; corrections carry the task version.');

{
  const task={...ready,kind:'bills',status:'completed',draft:null,reply:'<img src=x onerror=alert(1)>',history:[],facts:{period:{start_date:'2026-09-01',end_date:'2026-09-30'},category:'餐饮',totals:{income_minor:0,expense_minor:3028,refund_minor:200,net_minor:-2828},record_count:2,excluded_count:1,evidence:[{id:4,event_date:'2026-09-03',amount_minor:3028,type:'expense',category:'餐饮',description:'<script>不可信账单文本</script>'}]}};
  const f=fixture(async()=>({tasks:[task]}),ready.id);await f.app.pages.banking(f.paint);
  assert.match(f.html,/¥30\.28/);assert.match(f.html,/账单 #4/);assert.match(f.html,/&lt;script&gt;/);
  assert.doesNotMatch(f.html,/<script>|<img src=x/);
  f.app.actions['banking-ledger']();assert.deepEqual(f.ctx.state.ledgerRange,task.facts.period);assert.equal(f.ctx.state.filter.category,'餐饮');assert.deepEqual(f.pages,['ledger']);
  f.ctx.prefs.mask=true;await f.app.pages.banking(f.paint);assert.doesNotMatch(f.html,/¥30\.28|不可信账单文本/);
}
console.log('PASS: facts render server minor units, evidence is escaped, ledger uses the same dates, privacy masking covers content.');

{
  const task={...ready,kind:'bills',status:'completed',draft:null,history:[],slots:{query:'本月截至今天收入减去支出'},facts:{requested_metric:'net',period:{start_date:'2026-10-01',end_date:'2026-10-19'},totals:{income_minor:100000,expense_minor:17000,refund_minor:0,net_minor:83000},record_count:5,evidence:[]}};
  const f=fixture(async()=>({tasks:[task]}),ready.id);await f.app.pages.banking(f.paint);
  assert.match(f.html,/净流入<\/span><strong[^>]*>¥830\.00/);
  assert.match(f.html,/2026-10-01 — 2026-10-19/);
  assert.doesNotMatch(f.html,/banking-main-amount money">¥170\.00/);
}
console.log('PASS: the server net-income metric takes precedence over expense words in the question.');

for(const query of ['本月截至今天，收入扣掉支出净进了多少？','本月截至今天,收入扣掉支出净进了多少?','当月收入减开销的结余']) {
  for(const requested_metric of ['net',undefined]) {
    const task={...ready,kind:'bills',status:'completed',draft:null,history:[],slots:{query},facts:{requested_metric,period:{start_date:'2026-10-01',end_date:'2026-10-19'},totals:{income_minor:100000,expense_minor:17000,refund_minor:0,net_minor:83000},record_count:5,evidence:[]}};
    const f=fixture(async()=>({tasks:[task]}),ready.id);await f.app.pages.banking(f.paint);
    assert.match(f.html,/净流入<\/span><strong[^>]*>¥830\.00/);
    assert.doesNotMatch(f.html,/banking-main-amount money">¥170\.00/);
  }
}
console.log('PASS: net-flow paraphrases retain the 830 headline for current and legacy facts, including normalized punctuation.');

{
  const f=fixture(async path=>{if(path==='/bank-tasks')return {tasks:[]};const error=new Error('任务不存在');error.status=404;throw error;},ready.id);
  await f.app.pages.banking(f.paint);assert.match(f.html,/想查账单，还是办一笔业务/);assert.equal(f.saved.get('FINPILOT_CONTEST_BANK_TASK'),null);
  assert.equal(f.notices.length,1);assert.doesNotMatch(f.html,/role="alert"/);
}
console.log('PASS: an expired session cannot strand the page on an inaccessible saved task.');

{
  let finishList;let calls=0;
  const f=fixture(async(path,options)=>{if(options)return ready;calls++;return new Promise(resolve=>{finishList=resolve;});});
  const loading=f.app.pages.banking(f.paint);await f.app.submit('给小林转80元');
  finishList({tasks:[]});await loading;assert.match(f.html,/待核对/);assert.equal(calls,1);
}
console.log('PASS: a delayed task list cannot overwrite a newly submitted task.');
