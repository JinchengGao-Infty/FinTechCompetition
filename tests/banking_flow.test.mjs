import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createBanking} from '../AI_accounting_agent/frontend/liquid-glass/banking.js';
import {createJourney} from '../AI_accounting_agent/frontend/liquid-glass/journey.js';
import {createProductTask} from '../AI_accounting_agent/frontend/liquid-glass/product-task.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checks=[],evidence='review/banking-batch2';mkdirSync(evidence,{recursive:true});
function check(text){checks.push(text);console.log('PASS:',text);}
function fixture({mfa=false,lostConfirm=false}={}) {
  const saved=new Map(),calls=[],ops=new Map(),reviews=new Map(),fields=new Map(),listeners=[];
  let sheetOpen=false,task=null,html='',modal='',modalTitle='',debits=0,confirmCalls=0,nextTask=null,failTask=false,lateTask=null;
  const directory={cash_minor:100000,mfa_enabled:true,recipients:[{id:'acct-alice',name:'小林',remark:'朋友',phone:'138****0001'}],products:[{id:'reserve',name:'灵活现金',risk:1,liquidity:'随时可用'}]};
  const makeReady=(amount='80.00')=>({id:'task-1',version:(task?.version||0)+1,kind:'transfer',status:'ready',draft:{kind:'transfer',recipient_id:'acct-alice',amount},slots:{},history:[{role:'user',content:'给小林转'+amount+'元'},{role:'assistant',content:'草稿已整理'}],steps:[{label:'理解需求',status:'completed'},{label:'核对参数',status:'pending'},{label:'确认执行',status:'pending'}]});
  async function request(path,options) {
    calls.push({path,options:structuredClone(options)});
    if(path==='/overview')return structuredClone(directory);
    if(path==='/bank-tasks'&&!options)return {tasks:task?[task]:[]};
    if(path==='/bank-tasks'&&options){if(failTask){failTask=false;throw new Error('网络断开');}if(lateTask){task=await lateTask;return structuredClone(task);}task=nextTask||makeReady();nextTask=null;return structuredClone(task);}
    if(path.startsWith('/bank-tasks/')&&!options)return structuredClone(task);
    if(path.endsWith('/cancel')&&path.startsWith('/bank-tasks/')){task={...task,status:'cancelled',draft:null,version:task.version+1};return structuredClone(task);}
    if(path==='/operations/review') {
      const b=options.body;if(reviews.has(b.request_id))return structuredClone(ops.get(reviews.get(b.request_id)));
      const handle='op-'+(ops.size+1),op={handle,kind:b.kind,status:mfa?'needs_mfa':'needs_confirmation',params:{from_account:'acct-user',to_account:b.recipient_id||'fund-reserve',amount_minor:Math.round(Number(b.amount)*100)},product_id:b.product_id,target_name:b.kind==='transfer'?'小林':'灵活现金',target_detail:b.kind==='transfer'?'138****0001':'模拟本金划转',label:b.kind==='transfer'?'转给小林':'申购灵活现金',challenge:'challenge-'+handle};
      op.taskRequestId=b.request_id;ops.set(handle,op);reviews.set(b.request_id,handle);return structuredClone(op);
    }
    const [,handle,action]=path.match(/^\/operations\/([^/]+)(?:\/(.*))?$/)||[];
    const op=ops.get(handle);if(!op)throw new Error('unexpected '+path);
    if(action==='cancel'){
      if(['unknown','succeeded'].includes(op.status))return structuredClone(op);
      op.status='cancelled';
      if(!options.body.keep_task&&op.taskRequestId?.startsWith(`task-${task.id}-${task.version}`)){
        task={...task,status:'cancelled',draft:null,version:task.version+1,reply:'已取消当前转账任务，关联操作已取消，资金未划出。',history:[...task.history,{role:'assistant',content:'已取消当前转账任务，关联操作已取消，资金未划出。'}]};
        return structuredClone({...op,bank_task:task});
      }
      return structuredClone(op);
    }
    if(action==='confirm') {
      confirmCalls++;assert.equal(options.body.challenge,op.challenge);
      if(mfa&&options.body.code!=='123456')throw new Error('验证码不正确');
      debits++;op.status=lostConfirm?'unknown':'succeeded';op.receipt_hash='receipt-'+handle;
      if(lostConfirm)throw new Error('无法连接服务');return structuredClone(op);
    }
    if(action==='reconcile'){op.status='succeeded';return structuredClone(op);}
    return structuredClone(op);
  }
  const ctx={state:{route:'banking',chats:{finance:[]}},prefs:{mask:false},storage:{get:(key,fallback)=>saved.get(key)??fallback,set:(key,value)=>saved.set(key,value)},esc,money:value=>ctx.prefs.mask?'••••':'¥'+Number(value).toFixed(2),number:value=>String(value),icon:()=>'<svg class="icon"></svg>',card:(content,cls='')=>`<section class="surface-card ${cls}">${content}</section>`,btn:(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`,loading:()=>'<span>读取中</span>',toast:()=>{},go:()=>{},render:async()=>{await bank.pages.banking(paint);},modal:(title,body)=>{sheetOpen=true;modalTitle=title;modal=body;},closeSheet:()=>{sheetOpen=false;modal='';},resetLedgerContext:()=>{}};
  ctx.productTask=createProductTask(ctx);
  const journey=createJourney(ctx,{request});
  let bank=createBanking(ctx,{request,openDraft:journey.openDraft,openOperation:journey.openOperation});
  const paint=value=>{html=value;};
  const feedback={textContent:'',isConnected:true},button={disabled:false,isConnected:true};
  const document={activeElement:null,querySelectorAll:()=>[],querySelector:selector=>selector==='#sheet'?{get open(){return sheetOpen;}}:null,getElementById:id=>({value:fields.get(id)||'',focus:opts=>listeners.push(opts),setSelectionRange:()=>{}})};
  globalThis.document=document;
  async function form(id,values={}) {
    for(const [key,value] of Object.entries(values))fields.set(key,value);
    feedback.textContent='';
    await journey.onSubmit({target:{id,get isConnected(){return sheetOpen;},closest:()=>null,querySelector:selector=>selector==='button[type="submit"]'?button:feedback},preventDefault(){}});
    return feedback.textContent;
  }
  return {ctx,journey,get bank(){return bank;},request,calls,ops,saved,fields,listeners,paint,form,makeReady,
    get html(){return html;},get modal(){return modal;},get modalTitle(){return modalTitle;},get debits(){return debits;},get confirmCalls(){return confirmCalls;},
    set nextTask(value){nextTask=value;},set failTask(value){failTask=value;},set lateTask(value){lateTask=value;},
    async reload(){bank=createBanking(ctx,{request,openDraft:journey.openDraft,openOperation:journey.openOperation});await bank.pages.banking(paint);}
  };
}
function snapshot(name,body){writeFileSync(`${evidence}/${name}.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>静态结构 · ${name}</title>${['tokens','app','features','journey','glass','banking'].map(n=>`<link rel="stylesheet" href="../../AI_accounting_agent/frontend/liquid-glass/${n}.css">`).join('')}<body><div class="app-shell" data-route="banking"><main class="page-content banking-page">${body}<p class="hint">实际模块输出，静态证据，无交互脚本或浏览器验收。</p></main></div></body></html>`);}

{
  const f=fixture();await f.bank.pages.banking(f.paint);
  assert.equal((f.html.match(/data-action="banking-example"/g)||[]).length,3);
  assert.ok(f.html.indexOf('id="banking-input"')<f.html.indexOf('class="banking-prompts"'));
  assert.doesNotMatch(f.html,/模拟|合成|banking-steps|banking-task-status/);snapshot('01-first-entry',f.html);
  f.bank.actions['banking-example']({dataset:{text:'本月收支是多少'}});assert.match(f.html,/本月收支是多少/);assert.equal(f.calls.filter(c=>c.options).length,0);
  f.nextTask={id:'bills-1',version:1,kind:'bills',status:'completed',slots:{query:'本月收支是多少'},history:[],steps:[],facts:{status:'ready',period:{start_date:'2026-10-01',end_date:'2026-10-18'},totals:{income_minor:100000,expense_minor:20000,refund_minor:0,net_minor:80000},record_count:2,evidence:[]}};
  await f.bank.submit('本月收支是多少');assert.match(f.html,/查询完成|¥800\.00/);assert.doesNotMatch(f.html,/finance-confirm-form/);
  assert.ok(!f.calls.some(c=>c.path.startsWith('/operations')));snapshot('02-query-result',f.html);
  check('首次进入输入优先且仅三个入口；发起查询直接显示结果与账本出口，不创建资金操作。');
}
{
  const f=fixture();await f.bank.pages.banking(f.paint);await f.bank.submit('给小林转80元');
  assert.match(f.html,/小林|¥80\.00|待核对/);assert.match(f.html,/<details class="banking-conversation-history"/);assert.doesNotMatch(f.html,/<details[^>]* open/);
  assert.doesNotMatch(f.html,/确认后执行|需身份验证/,'risk/confirmation status is not predicted from a task draft');
  await f.bank.actions['banking-review']();assert.equal(f.modalTitle,'确认后执行');assert.match(f.modal,/小林|138\*\*\*\*0001|返回修改|确认执行/);assert.equal(f.debits,0);snapshot('03-confirm-80',f.modal);
  const old=[...f.ops.values()][0];await f.journey.actions['journey-edit-operation']();assert.equal(old.status,'cancelled');assert.match(f.modal,/finance-operation-form/);
  assert.equal(await f.form('finance-operation-form',{'finance-amount':'50.00','finance-recipient':'acct-alice'}),'');
  const next=[...f.ops.values()][1];assert.equal(next.params.amount_minor,5000);assert.notEqual(next.handle,old.handle);assert.equal(old.status,'cancelled');assert.match(f.modal,/50\.00/);
  await f.form('finance-confirm-form');assert.equal(f.debits,1);assert.equal(f.confirmCalls,1);assert.equal(next.status,'succeeded');assert.match(f.html,/已完成|¥50\.00/);snapshot('04-completed-50',f.html);
  const reviewCalls=f.calls.filter(c=>c.path==='/operations/review');assert.notEqual(reviewCalls[0].options.body.request_id,reviewCalls[1].options.body.request_id);
  check('需要确认的80元操作返回修改时先取消旧确认；重新核对50元后只确认新操作，结果回到助手。');
}
{
  const f=fixture({lostConfirm:true});await f.bank.pages.banking(f.paint);await f.bank.submit('给小林转80元');await f.bank.actions['banking-review']();
  await f.form('finance-confirm-form');assert.equal(f.confirmCalls,1);assert.equal(f.debits,1);assert.match(f.html,/结果待核实|核实结果/);snapshot('05-unknown',f.html);
  await f.reload();assert.match(f.html,/结果待核实/);const before=f.calls.length;await f.bank.actions['banking-review']();assert.equal(f.calls.length,before,'an uncertain operation cannot be reviewed as a new draft');
  await f.bank.actions['banking-operation']();assert.match(f.modal,/核实(?:操作)?结果/);await f.journey.actions['journey-reconcile']({disabled:false,isConnected:true,closest:()=>null,setAttribute(){},removeAttribute(){}});
  assert.match(f.html,/已完成/);assert.equal(f.confirmCalls,1);assert.equal(f.debits,1);assert.equal(f.calls.filter(c=>c.path==='/operations/review').length,1);
  check('确认请求失去结果后显示待核实；刷新恢复同一操作，只核实、不重新 review 或 confirm，资金效果不重复。');
}
{
  const f=fixture({mfa:true});await f.bank.pages.banking(f.paint);await f.bank.submit('给小林转80元');await f.bank.actions['banking-review']();
  assert.equal(f.modalTitle,'需身份验证');assert.match(f.modal,/finance-code|验证并确认/);assert.equal(await f.form('finance-confirm-form',{'finance-code':'000000'}),'验证码不正确');assert.equal(f.debits,0);
  await f.form('finance-confirm-form',{'finance-code':'123456'});assert.equal(f.debits,1);
  const confirms=f.calls.filter(c=>c.path.endsWith('/confirm'));assert.equal(confirms[1].options.body.code,'123456');check('需身份验证只在后端 needs_mfa 后出现；保留验证码与 challenge，错误验证码不显示成功。');
}
{
  const f=fixture();await f.bank.pages.banking(f.paint);let finish;f.lateTask=new Promise(resolve=>{finish=resolve;});
  f.bank.onInput({target:{id:'banking-input',value:'给小林转80元'}});const pending=f.bank.submit();
  f.bank.onInput({target:{id:'banking-input',value:'下一条尚未发送'}});f.lateTask=null;finish(f.makeReady());await pending;
  assert.match(f.html,/>下一条尚未发送<\/textarea>/);assert.doesNotMatch(f.html,/<textarea[^>]*disabled/);
  const cancelling=f.bank.actions['banking-cancel']();f.bank.onInput({target:{id:'banking-input',value:'取消期间的新需求'}});await cancelling;
  assert.match(f.html,/>取消期间的新需求<\/textarea>/);
  const restoring=f.bank.actions['banking-resume']({dataset:{id:'task-1'}});f.bank.onInput({target:{id:'banking-input',value:'恢复期间的新需求'}});await restoring;
  assert.match(f.html,/>恢复期间的新需求<\/textarea>/);
  check('请求、取消或恢复任务期间的新输入不会被完成回调清空；不自动滚动，当前输入仍可继续编辑。');
}
{
  const f=fixture();await f.bank.pages.banking(f.paint);await f.bank.submit('给小林转80元');await f.bank.actions['banking-review']();
  await f.journey.actions['journey-cancel']();
  assert.match(f.modal,/已取消/);assert.doesNotMatch(f.modal,/id="finance-confirm-form"/);
  assert.match(f.html,/任务已取消/);assert.match(f.html,/资金未划出/);assert.doesNotMatch(f.html,/data-action="banking-review"/);
  await f.journey.actions['journey-done']();await f.reload();
  assert.match(f.html,/任务已取消/);assert.doesNotMatch(f.html,/data-action="banking-review"/);
  f.bank.actions['banking-new']();await f.bank.actions['banking-resume']({dataset:{id:'task-1'}});
  assert.match(f.html,/任务已取消/);assert.doesNotMatch(f.html,/data-action="banking-review"/);
  f.bank.actions['banking-new']();f.nextTask={...f.makeReady('30.00'),id:'new-after-cancel',version:1};await f.bank.submit('给小林转30元');
  assert.match(f.html,/¥30\.00/);assert.equal(f.debits,0);assert.equal(f.confirmCalls,0);
  check('确认页取消后对话、主卡片、最近任务及刷新重进均结束；新需求正常，全程没有确认执行。');
}
{
  const f=fixture();await f.bank.pages.banking(f.paint);await f.bank.submit('给小林转80元');await f.bank.actions['banking-review']();
  const op=[...f.ops.values()][0];op.status='unknown';await f.journey.actions['journey-cancel']();
  assert.match(f.modal,/核实(?:操作)?结果/);assert.match(f.html,/结果待核实/);assert.doesNotMatch(f.html,/任务已取消|资金未划出/);
  assert.equal(f.confirmCalls,0);assert.equal(f.debits,0);check('受控未知结果取消仍显示待核实，未宣称未执行，也没有请求确认。');
}
writeFileSync(`${evidence}/checks.json`,JSON.stringify({checks,browser_validation:'pending; no browser started',test_mode:'real Banking + Journey modules, deterministic request and DOM stubs; backend semantics separately covered by existing isolated tests'},null,2));
console.log(`PASS: ${checks.length} bank-assistant flow groups.`);
