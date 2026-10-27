import {protectionReason} from './protection.js';
import {finance} from './finance-api.js';
import {billDescription} from './primary-pages.js';

const selectionKey='FINPILOT_CONTEST_BANK_TASK',operationKey='FINPILOT_CONTEST_BANK_OPERATION';
const kindNames={transfer:'转账',bill_analysis:'账单分析',bills:'账单分析',subscribe:'理财申购',redeem:'理财赎回',investment:'理财',unsupported:'待确认事项'};
const statusNames={collecting:'等待补充',ready:'待核对',completed:'查询完成',cancelled:'已取消',unsupported:'暂不支持',model_unavailable:'暂时无法整理需求'};
const operationNames={needs_confirmation:'确认后执行',needs_mfa:'需身份验证',succeeded:'已完成',unknown:'结果待核实',blocked:'已拦截',cancelled:'操作已取消',expired:'确认已失效'};
const slotNames={amount:'人民币金额',currency:'币种',recipient_id:'收款人',recipient:'收款人',product_id:'理财产品',product:'理财产品',period:'查询区间',start_date:'开始日期',end_date:'结束日期',kind:'办理事项'};
const uuid=()=>globalThis.crypto?.randomUUID?.()||`task-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Tasks prepare requirements; Journey alone owns reviewed money operations.
export function createBanking(ctx,{openDraft,openOperation,request=finance}) {
  const {state,prefs,storage,esc,money,card,btn,icon,go,toast}=ctx;
  let current=null,tasks=[],selectedId=storage.get(selectionKey,null),input='',busy=false,error='',pending=null,paintCurrent,revision=0,editing=false,directory=null,operation=null;
  let operationLink=storage.get(operationKey,null);
  const visible=value=>prefs.mask?'内容已隐藏':esc(value);
  const title=task=>kindNames[task.kind]||'银行任务';
  const status=task=>statusNames[task.status]||'待处理';
  const minor=value=>Number.isSafeInteger(value)?money(value/100):'—';
  const active=task=>task&&['collecting','ready','model_unavailable'].includes(task.status);
  const canContinue=task=>task&&task.status!=='cancelled';
  const persistSelection=()=>storage.set(selectionKey,selectedId);
  function upsert(task) {
    revision++;if(current?.id!==task.id||current?.version!==task.version){operation=null;operationLink=null;storage.set(operationKey,null);}
    current=task;selectedId=task.id;persistSelection();tasks=[task,...tasks.filter(item=>item.id!==task.id)];
  }
  async function targets() {
    if(!current?.draft||directory)return;
    try{const result=await request('/overview');directory={recipients:result.recipients||[],products:result.products||[]};}catch{ /* Journey will re-read the same directory before review. */ }
  }
  function flowFor(task) {
    return {taskRequestId:`task-${task.id}-${task.version}`,onOperation:op=>{
      if(current?.id!==task.id||current?.version!==task.version)return;
      if(op.status==='cancelled'&&op.bank_task){upsert(op.bank_task);draw();return;}
      operation=op;operationLink={task_id:task.id,task_version:task.version,handle:op.handle};storage.set(operationKey,operationLink);draw();
    }};
  }
  const entryCard=()=>card(`<h2>银行助手</h2><p class="banking-copy">查账单、转账或办理理财。</p>${btn('开始办理 '+icon('next'),'banking-open','primary finance-wide')}`,'banking-entry');

  function factsHTML(facts) {
    const period=facts.period||{},totals=facts.totals||{},rows=Array.isArray(facts.evidence)?facts.evidence:[];
    const hasRecords=facts.status!=='no_records'&&facts.status!=='needs_clarification';
    const query=current.slots?.query||'';
    const metrics={net:['净流入','net_minor'],income:['收入','income_minor'],expense:['支出','expense_minor'],refund:['退款','refund_minor']};
    const netQuery=/净(?:流入|收入|收支|进|额)|结余|收支/.test(query)||/收入|进账|挣.*钱|赚.*钱/.test(query)&&/支出|开销|花.*钱/.test(query);
    const focus=metrics[facts.requested_metric]||(netQuery?metrics.net:facts.category||/支出|花了|消费/.test(query)?metrics.expense:/退款/.test(query)?metrics.refund:/收入/.test(query)?metrics.income:metrics.net);
    const delta=facts.comparison?.[focus[1].replace('_minor','_delta_minor')];
    return `<p class="period-stamp">${esc(period.start_date||'')} — ${esc(period.end_date||'')}${facts.category?' · '+esc(facts.category):''}</p><span class="banking-eyebrow">${focus[0]}</span><strong class="banking-main-amount money">${hasRecords?minor(totals[focus[1]]):'暂无记录'}</strong>${Number.isSafeInteger(delta)&&facts.comparison?.status!=='no_records'?`<p class="banking-copy">较对比区间${delta>0?'增加':delta<0?'减少':'持平'}${delta?minor(Math.abs(delta)):''}</p>`:''}<div class="banking-result-line"><span>收入 ${hasRecords?minor(totals.income_minor):'—'}</span><span>支出 ${hasRecords?minor(totals.expense_minor):'—'}</span></div>${!hasRecords?'<p class="banking-copy">可换个区间查询，或在账本补充记录。</p>':''}${btn('查看对应账单','banking-ledger','primary finance-wide')}<details class="banking-evidence"><summary>金额与来源账单</summary><dl class="banking-facts"><div><dt>退款</dt><dd>${hasRecords?minor(totals.refund_minor):'暂无记录'}</dd></div><div><dt>净流入</dt><dd>${hasRecords?minor(totals.net_minor):'暂无记录'}</dd></div></dl>${facts.comparison_period?`<p class="banking-copy">对比：${esc(facts.comparison_period.start_date)} — ${esc(facts.comparison_period.end_date)}</p>`:''}<p class="banking-copy">本期 ${esc(facts.record_count??rows.length)} 笔${facts.excluded_count?' · 排除 '+esc(facts.excluded_count)+' 条非统计记录':''}</p>${rows.map(row=>`<article><div class="row between"><strong>${visible(row.category||'账单')}</strong><strong>${minor(row.amount_minor)}</strong></div><p>${visible(billDescription(row))}</p><small>${esc(row.event_date)} · ${row.period_role==='comparison'?'对比期 · ':''}账单 #${esc(row.id)}</small></article>`).join('')}</details>`;
  }
  function draftHTML() {
    const draft=current.draft,recipient=directory?.recipients.find(item=>item.id===draft.recipient_id),product=directory?.products.find(item=>item.id===draft.product_id);
    return `<span class="banking-eyebrow">${draft.kind==='transfer'?'收款人':'产品'}</span><h3 class="banking-target">${visible(recipient?.name||product?.name||'请在下一步核对对象')}</h3>${recipient?.phone?`<p class="banking-copy">${visible(recipient.phone)}</p>`:''}<strong class="banking-main-amount money">${money(Number(draft.amount))}</strong>${product?`<p class="banking-copy">风险等级 R${esc(product.risk)}${product.liquidity?' · '+esc(product.liquidity):''}</p>`:''}<p class="banking-copy">核对对象与金额后，再确认执行。</p>${btn(error?'重新核对':'核对并继续','banking-review','primary finance-wide',busy?'disabled':'')}`;
  }
  function operationHTML() {
    const op=operation,needs=['needs_confirmation','needs_mfa'].includes(op.status);
    return card(`<div class="row between"><h2>${esc(title(current))}</h2><span class="tag">${esc(operationNames[op.status]||'待处理')}</span></div><strong class="banking-main-amount money">${minor(op.params?.amount_minor)}</strong><h3 class="banking-target">${visible(op.kind==='redeem'?'FinPilot账户':op.target_name||'操作对象待核对')}</h3><p class="banking-copy">${visible(['subscribe','redeem'].includes(op.kind)?'本金划转':op.target_detail||'')}</p><p class="protection-reason">${esc(protectionReason(op,{hidden:prefs.mask}))}</p>${needs||op.status==='unknown'?btn(op.status==='unknown'?'核实结果':op.status==='needs_mfa'?'继续身份验证':'继续确认','banking-operation','primary finance-wide',busy?'disabled':''):btn('开始新需求','banking-new','primary finance-wide')}<div class="banking-secondary">${!needs&&op.status!=='unknown'?btn('查看操作详情','banking-operation','small'):''}</div>`,'banking-current-step');
  }
  function currentHTML() {
    if(!current)return '<div class="banking-welcome"><h2>想查账单，还是办一笔业务？</h2></div>';
    if(operation)return operationHTML();
    let body='';
    if(current.status==='ready'&&current.draft)body=draftHTML();
    else if(current.status==='completed'&&current.facts)body=factsHTML(current.facts);
    else if(current.status==='model_unavailable')body='<p class="banking-current-question">暂时无法整理这项需求。</p><p class="banking-copy">需求已保留，可稍后继续，或使用参数表单。</p>'+btn('打开参数表单','journey-bank','small');
    else if(current.status==='cancelled')body='<p class="banking-current-question">任务已取消。</p>';
    else if(current.status==='unsupported')body='<p class="banking-current-question">请选一项需求：查账单、转账、申购或赎回。</p>';
    else {
      const missing=current.missing_slots||[];
      const question=missing.length?'请补充'+missing.map(slot=>slotNames[slot]||slot).join('、')+'。':current.reply||'请说明要办理的事项。';
      body=`<p class="banking-current-question">${visible(question)}</p>${missing.includes('currency')?'<p class="banking-copy">请明确人民币金额，不自动换算外币。</p>':''}`;
    }
    return card(`<div class="row between"><h2>${esc(title(current))}</h2><span class="tag">${esc(status(current))}</span></div>${body}`,'banking-current-step');
  }
  function historyHTML() {
    if(!current)return '';
    return `<details class="banking-conversation-history" data-banking-fold="conversation"><summary>本次对话</summary>${(current.history||[]).map(message=>`<article><small>${message.role==='user'?'你':'银行助手'}</small><p>${visible(message.content)}</p></article>`).join('')}</details><details class="banking-technical" data-banking-fold="technical"><summary>流程与记录详情</summary>${(current.steps||[]).length?`<ol>${current.steps.map(step=>`<li>${esc(step.label)} · ${esc(step.status)}</li>`).join('')}</ol>`:''}<p>任务 ${esc(current.id)} · 版本 ${esc(current.version)}</p>${current.facts?.scope_note?`<p>${esc(current.facts.scope_note)}</p>`:''}</details>`;
  }
  function composerHTML() {
    return `<form id="banking-form" class="banking-composer glass"><label class="field-label" for="banking-input">${canContinue(current)?current?.status==='completed'?'继续追问':'补充或修改需求':'告诉我你的需求'}</label><textarea id="banking-input" rows="2" maxlength="2000" placeholder="${current?.kind==='bills'?'例如：和上月比呢':current?'例如：改成50元':'例如：查询本月收支'}">${esc(input)}</textarea><div class="row between"><small>${current?'Enter 发送 · Shift+Enter 换行':'查账单、转账、申购或赎回'}</small><button class="btn primary small" type="submit" ${busy?'disabled':''}>${icon('send')}${busy?'处理中':'发送'}</button></div></form>`;
  }
  function draw() {
    if(state.route!=='banking'||!paintCurrent)return;
    const doc=typeof document==='undefined'?null:document,focused=doc?.activeElement?.id==='banking-input';
    const selection=focused?[doc.activeElement.selectionStart,doc.activeElement.selectionEnd]:null;
    const openFolds=[...(doc?.querySelectorAll?.('[data-banking-fold][open]')||[])].map(el=>el.dataset.bankingFold);
    const showComposer=!current||!operation&&(current.status!=='ready'&&current.status!=='completed'||editing||Boolean(input)||Boolean(pending));
    const more=current&&!operation?`<div class="banking-secondary">${!operation&&['ready','completed'].includes(current.status)&&!showComposer?btn(current.status==='completed'?'继续追问':'修改需求','banking-edit','small'):''}${!operation&&active(current)?btn('取消任务','banking-cancel','small',busy?'disabled':''):''}${btn('新需求','banking-new','small',busy?'disabled':'')}</div>`:'';
    const errorHTML=error?`<div class="error banking-error" role="alert"><p>这一步暂时未完成，输入已保留。</p><details data-banking-fold="error"><summary>查看原因</summary><p>${esc(error)}</p></details><div class="banking-secondary">${pending?btn('重试这一步','banking-retry','small',busy?'disabled':''):btn('重新读取','banking-refresh','small',busy?'disabled':'')}</div></div>`:'';
    paintCurrent(`<div class="banking-workspace">${currentHTML()}${busy?'<div class="banking-busy" role="status"><span class="spinner" aria-hidden="true"></span>正在处理这一步…</div>':''}${errorHTML}${showComposer?composerHTML():''}${!current?`<div class="banking-prompts">${[['查账单','本月收支是多少'],['转账','给小林转账'],['办理理财','买200元灵活现金']].map(([label,text])=>`<button data-action="banking-example" data-text="${esc(text)}"><span>${label}</span>${icon('next')}</button>`).join('')}</div>`:''}${more}${historyHTML()}<details class="banking-history" data-banking-fold="tasks"><summary>最近任务（${tasks.length}）</summary>${tasks.length?tasks.map(task=>`<button class="banking-history-row" data-action="banking-resume" data-id="${esc(task.id)}" ${busy?'disabled':''}><span><strong>${esc(title(task))}</strong><small>${visible(task.history?.find(item=>item.role==='user')?.content||'查看任务')}</small></span><span>${esc(status(task))}</span></button>`).join(''):'<p class="banking-copy">还没有任务，从上方输入开始。</p>'}</details></div>`);
    for(const name of openFolds){const el=doc?.querySelector?.(`[data-banking-fold="${name}"]`);if(el)el.open=true;}
    if(focused){const el=doc?.getElementById?.('banking-input');el?.focus({preventScroll:true});if(selection)el?.setSelectionRange(...selection);}
  }
  async function refresh() {
    const started=revision,id=selectedId,result=await request('/bank-tasks'),rows=Array.isArray(result.tasks)?result.tasks:[];
    let restored=id?rows.find(task=>task.id===id):null;
    if(id&&!restored)try{restored=await request('/bank-tasks/'+encodeURIComponent(id));}catch(failure){if(failure.status!==404)throw failure;}
    if(started!==revision)return;
    tasks=rows;current=restored;
    if(!restored||operationLink?.task_id!==restored.id||operationLink.task_version!==restored.version)operation=null;
    if(id&&!restored){selectedId=null;operation=null;persistSelection();toast('此前任务已不可用，请新建需求');}
    if(restored&&operationLink?.task_id===restored.id&&operationLink.task_version===restored.version){const restoredOperation=await request('/operations/'+encodeURIComponent(operationLink.handle));if(started!==revision||selectedId!==id)return;operation=restoredOperation;}
    await targets();
  }
  async function page(paint){paintCurrent=paint;draw();try{await refresh();error='';}catch(failure){error=failure.message;}draw();}
  async function submit(text=input) {
    const clean=String(text).trim();if(!clean||busy)return;
    pending={text:clean,request_id:uuid(),...(canContinue(current)?{task_id:current.id,version:current.version}:{})};await transmit();
  }
  async function transmit() {
    if(!pending||busy)return;
    const body=pending,before=input;busy=true;error='';draw();
    try{upsert(await request('/bank-tasks',{method:'POST',body,timeout:180000}));await targets();if(input===before&&(before===body.text||before===''))input='';pending=null;editing=false;}
    catch(failure){error=failure.message;if(input===before&&(before===body.text||before===''))input=body.text;if(failure.status===409){pending=null;try{await refresh();}catch{}}}
    finally{busy=false;draw();}
  }
  async function cancel() {
    if(!active(current)||operation||busy)return;const before=input;busy=true;error='';draw();
    try{upsert(await request('/bank-tasks/'+encodeURIComponent(current.id)+'/cancel',{method:'POST',body:{version:current.version}}));pending=null;if(input===before)input='';}
    catch(failure){error=failure.message;}finally{busy=false;draw();}
  }
  const actions={
    'banking-open':()=>go('banking'),
    'banking-new':()=>{if(busy)return;revision++;current=null;selectedId=null;operation=null;operationLink=null;storage.set(operationKey,null);persistSelection();input='';error='';pending=null;editing=false;draw();},
    'banking-example':button=>{if(busy)return;input=button.dataset.text;draw();if(typeof document!=='undefined'){const el=document.getElementById('banking-input');el?.focus({preventScroll:true});el?.setSelectionRange(input.length,input.length);}},
    'banking-edit':()=>{editing=true;draw();if(typeof document!=='undefined')document.getElementById('banking-input')?.focus({preventScroll:true});},
    'banking-resume':async button=>{if(busy)return;const before=input;busy=true;error='';draw();try{upsert(await request('/bank-tasks/'+encodeURIComponent(button.dataset.id)));await targets();if(input===before)input='';pending=null;editing=false;}catch(failure){error=failure.message;}finally{busy=false;draw();}},
    'banking-refresh':async()=>{if(busy)return;busy=true;draw();try{await refresh();error='';}catch(failure){error=failure.message;}finally{busy=false;draw();}},
    'banking-retry':transmit,'banking-cancel':cancel,
    'banking-review':async()=>{if(busy||operation||!current?.draft||current.status!=='ready')return;busy=true;error='';draw();try{const fresh=await request('/bank-tasks/'+encodeURIComponent(current.id));upsert(fresh);if(fresh.status!=='ready'||!fresh.draft){toast('需求已更新，请核对当前一步');return;}await openDraft({...fresh.draft,request_id:`task-${fresh.id}-${fresh.version}`},flowFor(fresh));}catch(failure){error=failure.message;}finally{busy=false;draw();}},
    'banking-operation':async()=>{if(busy||!operation?.handle)return;busy=true;error='';draw();try{await openOperation(operation.handle,flowFor(current));}catch(failure){error=failure.message;}finally{busy=false;draw();}},
    'banking-ledger':()=>{const facts=current?.facts;if(!facts?.period)return;state.ledgerRange={...facts.period};state.month=facts.period.start_date?.slice(0,7)||state.month;state.monthInitialized=true;state.filter={q:'',category:facts.category||'',type:''};go('ledger');},
  };
  return {pages:{banking:page},actions,entryCard,submit,start:text=>{if(busy){toast('请先等待当前任务完成');return false;}actions['banking-new']();input=String(text);go('banking');return true;},
    onSubmit:event=>{if(event.target.id==='banking-form'){event.preventDefault();void submit();}},
    onInput:event=>{if(event.target.id==='banking-input')input=event.target.value;},
    onKeyDown:event=>{if(event.target.id==='banking-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void submit();}},
  };
}
