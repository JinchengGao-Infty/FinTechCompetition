import {createRecognitionDemoAdapter} from './baseline/recognition-demo.js';
import {createCaptureFlow} from './baseline/capture-flow.js';
import {categoryIconKey,categoryBadgeStyle} from './baseline/category-icons.js';


// Native Stitch inbox 8f6851250e394ab4954afda7c1e32218; SHA37da4331af1ef4c7d9806b0fa6441827f3f1cda9edfa826be3d886ff270088a3.
// Real candidate/source/confirmation states replace prototype scripts and amounts.
export function createProductCapture(ctx){
 const {state,prefs,esc,money,icon,btn,loading,go,modal,closeSheet,render,book,resetLedgerContext,finance}=ctx;
 const categories={expense:['餐饮','出行','购物','生活缴费','娱乐','住房','医疗健康','教育学习','保险','人情往来','旅行','其他'],income:['工资','奖金','副业','理财收益','退款','其他收入']};
 const names={text:'文字',image:'票据',voice:'语音',csv:'文件',manual:'手动'};
 let paintCurrent,page=0,editedRow,expenses=[],detailId='',lastRecognition='',pageGeneration=0,pageActive=false;
 const files={image:null,csv:null};let accountLabel='默认账户';
 const cash=n=>prefs.mask?'••••':money(n/100);
 const flow=createCaptureFlow({request:createRecognitionDemoAdapter(finance),store:ctx.storage,changed:event=>{if(event?.scope==='list')repaintInbox();else repaint();syncEditor();}});
 const f=flow.state;
 const today=()=>ctx.today||new Date().toLocaleDateString('sv-SE');
 const action=(label,name,extra='')=>`<button type="button" data-action="${name}" ${extra}>${label}</button>`;
 function source(row){return action('来源','pc-source',`class="pc-source-button" data-row="${row.row}"`);}
 function duplicate(row){
  const matches=[...(row.possible_duplicates||[]).map(x=>`账本 ${x.event_date} ${x.description} ${prefs.mask?'••••':x.amount}`),...(row.candidate_duplicates||[]).filter(x=>f.rows.some(r=>r.row===x.row&&r.enabled!==false&&r.duplicate_decision!=='skip')).map(x=>`本批第 ${x.row} 笔`)];
  if(!matches.length)return '';
  return `<div class="pc-duplicate"><details><summary>可能重复</summary>${matches.map(x=>`<p>${esc(x)}</p>`).join('')}</details><div role="group" aria-label="第 ${row.row} 笔重复核对">${[['keep','保留'],['skip','跳过']].map(([v,l])=>action(l,'pc-duplicate',`data-row="${row.row}" data-value="${v}" aria-pressed="${row.duplicate_decision===v}" ${f.busy||f.confirmationUnknown?'disabled':''}`)).join('')}</div></div>`;
 }
 function rowsHTML(){return f.rows.slice(page*6,page*6+6).map(row=>`<article class="pc-row ${row.enabled===false?'pc-unselected':''}"><div class="pc-row-top"><label class="pc-select"><input type="checkbox" data-pc-enabled="${row.row}" aria-label="选择第 ${row.row} 笔" ${row.enabled!==false?'checked':''} ${f.busy||f.confirmationUnknown?'disabled':''}></label><button class="pc-row-edit" type="button" data-action="pc-edit" data-row="${row.row}" ${f.busy||f.confirmationUnknown?'disabled':''}><span class="pc-icon" style="${categoryBadgeStyle(row.category,row.type)}">${icon(categoryIconKey(row.category,row.type))}</span><span class="pc-description"><strong>${esc(row.description||'待补充')}</strong><small>${esc(row.event_date||'日期待补充')} ${esc(row.category||'分类待补充')}</small></span><strong class="money">${row.type==='income'?'+':'−'}${row.amount?cash(Math.round(Number(row.amount)*100)):'—'}</strong>${icon('next')}</button></div>${row.errors?.length?`<p class="pc-row-error">${esc(row.errors.join('；'))}${action('修改','pc-edit',`data-row="${row.row}" ${f.busy||f.confirmationUnknown?'disabled':''}`)}</p>`:''}${row.movement!=='cashflow'?`<span class="pc-movement">${row.movement==='principal'?'本金划转':'内部划转'}</span>`:''}${duplicate(row)}${source(row)}</article>`).join('');}
 function resultHTML(batch){
  const result=batch.result||{},undone=batch.status==='undone',selected=f.rows.filter(row=>row.enabled!==false&&row.duplicate_decision!=='skip');
  const receiptRow=batch.status==='imported'&&result.created===1&&selected.length===1?selected[0]:null;
  return `<section class="pc-result"><span class="pc-result-icon">${icon(undone?'back':'check')}</span><h2>${undone?'已撤销':batch.status==='discarded'?'已丢弃':'已入账'}</h2>${batch.status==='imported'?`<strong>${result.created||0} 笔</strong>${receiptRow?`<div class="pc-receipt-row"><span class="pc-icon" style="${categoryBadgeStyle(receiptRow.category,receiptRow.type)}">${icon(categoryIconKey(receiptRow.category,receiptRow.type))}</span><span class="pc-receipt-object"><strong>${esc(receiptRow.description)}</strong><small>${esc(receiptRow.event_date)} ${esc(receiptRow.category)}</small></span><strong class="money" data-motion-receipt-target>${receiptRow.type==='income'?'+':'−'}${cash(Math.round(Number(receiptRow.amount)*100))}</strong></div>`:''}<p>${result.duplicates?`重复 ${result.duplicates} 笔 `:''}${result.skipped_rows?.length?`跳过 ${result.skipped_rows.length} 笔`:''}</p>${batch.profile_sync_pending?`<p role="status">账本已保存，待同步</p>${btn('核实结果','pc-reconcile','primary')}`:''}<div class="actions">${btn('查看流水','pc-ledger','primary')}${btn('撤销本批','pc-undo')}</div>`:''}${btn('继续记账','pc-new','small')}</section>`;
 }
 function editorHTML(){
  const batch=f.batch;
  if(batch.status!=='pending')return resultHTML(batch);
  const selected=f.rows.filter(r=>r.enabled!==false&&r.duplicate_decision!=='skip');
  const invalid=selected.some(r=>r.errors?.length||!r.amount||!r.event_date||!r.description);
  const pendingDuplicate=selected.some(r=>((r.possible_duplicates?.length||r.candidate_duplicates?.some(x=>selected.some(a=>a.row===x.row)))&&!r.duplicate_decision));
  const total=type=>selected.filter(r=>r.type===type&&r.movement==='cashflow'&&(type!=='income'||r.category!=='退款')).reduce((sum,r)=>sum+Math.round((Number(r.amount)||0)*100),0);
  return `<div class="pc-batch-heading"><h2>${f.confirmationUnknown?'入账待核实':'核对记录'}</h2><span>${f.rows.length} 笔 ${names[batch.kind]||''}</span></div><section class="pc-candidates">${rowsHTML()}</section>${f.rows.length>6?`<div class="pc-pager">${action('上一页','pc-page',`data-step="-1" ${page===0?'disabled':''}`)}<span>${page+1} / ${Math.ceil(f.rows.length/6)}</span>${action('下一页','pc-page',`data-step="1" ${(page+1)*6>=f.rows.length?'disabled':''}`)}</div>`:''}<div class="pc-confirm"><div class="pc-confirm-summary"><span>收入 <strong>${invalid?'待补充':cash(total('income'))}</strong></span><span>支出 <strong>${invalid?'待补充':cash(total('expense'))}</strong></span>${selected.some(r=>r.type==='income'&&r.category==='退款')?`<span>退款 <strong>${cash(selected.filter(r=>r.type==='income'&&r.category==='退款'&&r.movement==='cashflow').reduce((n,r)=>n+Math.round(Number(r.amount)*100),0))}</strong></span>`:''}</div><button class="btn primary" type="button" data-action="pc-confirm" ${f.busy||f.confirmationUnknown||invalid||pendingDuplicate||f.rows.every(r=>r.enabled===false)?'disabled':''}>${f.confirmationUnknown?'待核实':f.busy?'正在处理':`确认入账 ${selected.length} 笔`}</button>${invalid?'<span>有记录待补充</span>':pendingDuplicate?'<span>有重复记录待核对</span>':''}${f.confirmationUnknown?(f.retryOriginal?btn('重试入账','pc-retry-original','primary',f.busy?'disabled':''):btn('核实结果','pc-check-confirmation','primary',f.busy?'disabled':'')):action('丢弃本批','pc-discard')}</div>`;
 }
 const operationLabel=()=>f.operation==='confirm'&&f.confirmationUnknown?'正在核实结果':({text:'正在识别',image:'正在读取票据',voice:'正在聆听',csv:'正在预览',confirm:'正在入账',save:'正在保存'}[f.operation]||'正在处理');
 const inputReady=()=>f.mode==='text'?!!f.text.trim():!!files[f.mode]&&files[f.mode].size>0;
 const fileLabel=()=>files[f.mode]?files[f.mode].name+(files[f.mode].size===0?'（文件为空）':''):(f.mode==='csv'?'选择 CSV 账单':'选择票据图片');
 function inboxHTML(){
  const rows=f.batches.filter(batch=>batch.status==='pending');
  return `<div class="pc-batch-heading"><h2>待确认</h2>${action('刷新','pc-inbox',f.listBusy?'disabled':'')}</div>${f.listBusy?'<div class="pc-empty" role="status">读取候选…</div>':f.listError?`<p class="pc-error" role="alert">${esc(f.listError)}</p>`:rows.map(batch=>`<button type="button" class="pc-inbox-row" data-action="pc-open" data-id="${esc(batch.id)}"><span>${icon(batch.kind==='image'?'upload':batch.kind==='voice'?'mic':'ledger')}<strong>${names[batch.kind]||'记录'}</strong><small>${esc(batch.created_at.slice(5,16).replace('T',' '))}</small></span><span>${batch.count} 笔 ${icon('next')}</span></button>`).join('')||'<div class="pc-empty">暂无待确认记录</div>'}`;
 }
 function repaintInbox(){if(state.route!=='capture')return;const list=document.querySelector('[data-pc-inbox]');if(list){list.innerHTML=inboxHTML();list.setAttribute('aria-busy',String(f.listBusy));}}
 function inputHTML(){
  const locked=f.busy||f.confirmationUnknown;
  return `${ctx.manualCapture?.attempt?`<div class="pc-manual"><button class="btn primary" data-action="manual-capture-recover" ${ctx.manualCapture.busy?'disabled':''} aria-busy="${ctx.manualCapture.busy}">${ctx.manualCapture.busy?'正在核对':'核对上次候选'}</button>${ctx.manualCapture.error?`<p class="pc-error" role="alert">${esc(ctx.manualCapture.error)}</p>`:''}</div>`:''}<div class="pc-input-tabs" role="tablist" aria-label="录入方式">${[['text','文字'],['image','票据'],['csv','文件']].map(([value,label])=>action(label,'pc-mode',`data-value="${value}" role="tab" aria-selected="${f.mode===value}" ${locked?'disabled':''}`)).join('')}</div><section class="pc-input">${f.mode==='text'?`<form id="pc-text-form"><textarea id="pc-text" rows="3" aria-label="账单描述" placeholder="昨天午餐28元" ${locked?'disabled':''}>${esc(f.text)}</textarea><button class="btn primary" type="submit" ${locked||!inputReady()?'disabled':''}>${f.busy?operationLabel():'识别'}</button></form>`:`<form id="pc-file-form"><label class="pc-upload" for="pc-file">${icon('upload')}<span class="pc-file-name" aria-live="polite">${esc(fileLabel())}</span><input id="pc-file" type="file" accept="${f.mode==='csv'?'.csv,text/csv':'image/png,image/jpeg,image/webp'}" ${f.mode==='image'?'capture="environment"':''} ${locked?'disabled':''}></label>${f.mode==='csv'?`<label class="pc-account">账户名称<input id="pc-account" class="field" maxlength="40" value="${esc(accountLabel)}" ${locked?'disabled':''} required></label>`:''}<button class="btn primary" type="submit" ${locked||!inputReady()?'disabled':''}>${f.busy?operationLabel():'预览'}</button></form>`}${f.mode==='text'?`<div class="pc-manual">${btn('手动填写','pc-manual','small',locked?'disabled':'')}${btn(icon('mic')+'语音输入','pc-voice','small',locked?'disabled':'')}</div>`:''}</section><section class="pc-inbox" data-pc-inbox aria-busy="${f.listBusy}">${inboxHTML()}</section>`;
 }
 function syncInput(){const button=document.querySelector('#pc-text-form button[type="submit"],#pc-file-form button[type="submit"]');if(button)button.disabled=f.busy||f.confirmationUnknown||!inputReady();}
 function template(){return `<div class="product-capture">${f.batchBusy?'<div class="pc-detail-read" role="status">读取候选…</div>':''}${f.batch&&['pending','imported'].includes(f.batch.status)?`<div class="product-motion-candidate" data-candidate-motion data-motion-kind="candidate" data-motion-object="${esc(f.batch.id)}"></div>`:''}${f.busy&&['voice','image'].includes(f.operation)?'':f.batch?editorHTML():inputHTML()}${f.busy?`<div class="pc-wait ${['voice','image'].includes(f.operation)?'pc-recognizing':''}" role="status">${['voice','image'].includes(f.operation)?`<div class="pc-recognition-symbol" aria-hidden="true">${icon(f.operation==='voice'?'mic':'upload')}<span class="pc-wave">${'<i></i>'.repeat(5)}</span></div>`:'<span class="loading-dot"></span>'}<span>${operationLabel()}</span> ${!f.confirmationUnknown&&['text','voice','image','csv','confirm'].includes(f.operation)?action('停止','pc-stop'):''}</div>`:''}${f.error?`<div class="pc-error" role="alert">${esc(f.error)}${f.error==='已停止'&&lastRecognition?action('重新识别','pc-recognition-retry'):''}</div>`:''}${f.batchError?`<p class="pc-error" role="alert">${esc(f.batchError)}</p>`:''}</div>`;}
 function mountMotion(){const anchor=document.querySelector('[data-candidate-motion]');if(anchor&&f.batch)ctx.productMotion?.candidate(anchor,{batch:f.batch,rows:f.rows,phase:f.batch.status==='imported'?'succeeded':f.confirmationUnknown?'unknown':f.confirming&&f.busy?'pending':'idle'});}
 function repaint(){
  if(!pageActive||state.route!=='capture'||!paintCurrent)return;
  if(detailId&&f.batch?.id!==detailId){paintCurrent(`<div class="product-capture"><section class="pc-inbox">${f.batchBusy?'<div class="pc-empty" role="status">读取候选…</div>':`<p class="pc-error" role="alert">${esc(f.batchError||'暂时无法读取候选')}</p>${action('重试','pc-open',`data-id="${esc(detailId)}"`)}`}</section></div>`);return;}
  paintCurrent(template());mountMotion();const title=document.querySelector('.topbar h1');if(title)title.textContent=f.batch?(f.batch.status==='pending'?'待确认':'入账结果'):'记账';
 }
 async function capturePage(paint){
  pageActive=true;pageGeneration++;
  paintCurrent=paint;detailId=new URLSearchParams(location.hash.split('?')[1]||'').get('batch')||'';
  if(detailId){if(f.batch?.id!==detailId)await flow.open(detailId);else repaint();}
  else{if(!f.busy&&!f.confirmationUnknown){f.batch=null;f.rows=[];}repaint();await flow.inbox();}mountMotion();
 }
 function changedData(){resetLedgerContext?.();state.reports={};state.productAnalysis=null;}
 function openCreated(batch){if(batch){page=0;go('capture?'+new URLSearchParams({batch:batch.id}));}}
 async function createAndOpen(task){const generation=pageGeneration;const batch=await task();if(pageActive&&state.route==='capture'&&generation===pageGeneration)openCreated(batch);}
 function leave(){if(!pageActive)return;pageActive=false;pageGeneration++;flow.leave();}
 function syncEditor(){
  const form=document.querySelector('#pc-edit-form');if(!form)return;
  const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=f.busy;
  const feedback=form.querySelector('[data-pc-edit-error]');if(feedback)feedback.textContent=f.error||'';
 }
 async function saveRows(patches){
  if(f.busy)return null;
  const byRow=new Map(patches.map(row=>[row.row,row]));
  return flow.update(f.rows.map(row=>({...row,...byRow.get(row.row)})));
 }
 async function edit(row){
  if(f.busy||f.confirmationUnknown||!row)return;
  editedRow={...row};f.error='';
  if(row.category==='退款'){
   try{expenses=await book('/bills?type=expense&limit=100');}catch{expenses=[];}
  }
  modal('修改记录',`<form id="pc-edit-form"><label>金额<input class="field" name="amount" inputmode="decimal" value="${esc(row.amount||'')}" required></label><label>日期<input class="field" name="event_date" type="date" value="${esc(row.event_date||today())}" required></label><label>收支<select class="field" name="type" id="pc-edit-type"><option value="expense" ${row.type==='expense'?'selected':''}>支出</option><option value="income" ${row.type==='income'?'selected':''}>收入</option></select></label><label>分类<select class="field" name="category" id="pc-edit-category">${categories[row.type||'expense'].map(c=>`<option ${c===row.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>备注<input class="field" name="description" value="${esc(row.description)}" maxlength="512" required></label><label>支付方式<input class="field" name="payment_method" value="${esc(row.payment_method||'')}" maxlength="40"></label><label>资金性质<select class="field" name="movement">${[['cashflow','计入收支'],['internal_transfer','内部划转'],['principal','本金划转']].map(([v,l])=>`<option value="${v}" ${row.movement===v?'selected':''}>${l}</option>`).join('')}</select></label>${row.category==='退款'?`<label>原支出<select class="field" name="refund_of_bill_id"><option value="">不关联</option>${expenses.filter(x=>!['internal_transfer','principal'].includes(x.metadata?.movement)).map(x=>`<option value="${x.id}" ${row.refund_of_bill_id===x.id?'selected':''}>${esc(x.event_date)} ${esc(x.description)} ${prefs.mask?'••••':money(x.amount)}</option>`).join('')}</select></label>`:''}<p class="pc-error" data-pc-edit-error role="alert" aria-live="polite"></p><button class="btn primary" type="submit">完成</button></form>`);
 }
 async function onSubmit(event){
  if(!['pc-text-form','pc-file-form','pc-edit-form'].includes(event.target.id))return;
  event.preventDefault();if(f.busy)return;if(['pc-text-form','pc-file-form'].includes(event.target.id)&&!inputReady())return;
  if(event.target.id==='pc-text-form'){const value=document.querySelector('#pc-text').value.trim();if(!value)return;await createAndOpen(()=>flow.text(value,today()));}
  if(event.target.id==='pc-file-form'){const file=files[f.mode];if(file){lastRecognition=f.mode==='image'?'image':'';await createAndOpen(()=>flow.file(file,accountLabel.trim()||'默认账户'));}}
  if(event.target.id==='pc-edit-form'){
   const data=Object.fromEntries(new FormData(event.target));
   const staged={...editedRow,...data,refund_of_bill_id:data.refund_of_bill_id?Number(data.refund_of_bill_id):null,errors:[],duplicate_decision:null};
   // A correction must be checked again by the server before it becomes a bill.
   if(await saveRows([staged])){closeSheet();repaint();}else syncEditor();
  }
 }
 async function onChange(event){
  const el=event.target;
  if(el.id==='pc-file'){files[f.mode]=el.files?.[0]||null;const label=document.querySelector('.pc-file-name');if(label)label.textContent=fileLabel();syncInput();}
  if(el.dataset.pcEnabled){
   if(f.busy){repaint();return;}
   const row=f.rows.find(x=>x.row===Number(el.dataset.pcEnabled));if(row)await saveRows([{...row,enabled:el.checked}]);
  }
  if(el.id==='pc-edit-type'){const select=document.querySelector('#pc-edit-category');select.innerHTML=categories[el.value].map(c=>`<option>${esc(c)}</option>`).join('');}
 }
 return {pages:{capture:capturePage},flow,repaint,leave,onSubmit,onChange,onInput(event){if(event.target.id==='pc-text'){f.text=event.target.value;syncInput();}if(event.target.id==='pc-account')accountLabel=event.target.value;},actions:{
  'pc-voice':async()=>{if(f.busy||f.confirmationUnknown)return;lastRecognition='voice';await createAndOpen(()=>flow.voice());},
  'pc-recognition-retry':async()=>{if(f.busy||f.confirmationUnknown)return;if(lastRecognition==='voice')await createAndOpen(()=>flow.voice());else if(files.image)await createAndOpen(()=>flow.file(files.image,accountLabel));},
  'manual-capture-recover':()=>ctx.recoverManualCandidate(),
  'pc-mode':b=>{if(f.busy||f.confirmationUnknown)return;f.mode=b.dataset.value;repaint();},'pc-manual':()=>go('entry'),
  'pc-open':b=>{page=0;go('capture?'+new URLSearchParams({batch:b.dataset.id}));},'pc-inbox':()=>flow.inbox(),
  'pc-edit':b=>edit(f.rows.find(r=>r.row===Number(b.dataset.row))),
  'pc-source':b=>{const row=f.rows.find(r=>r.row===Number(b.dataset.row));const original=row.origin||row;modal('记录来源',`<p>${esc(names[f.batch.kind]||'记录')}</p><dl class="pc-source-record">${[['日期','event_date'],['金额','amount'],['分类','category'],['备注','description'],['支付方式','payment_method']].filter(([,k])=>original[k]).map(([label,key])=>`<div><dt>${label}</dt><dd>${esc(prefs.mask&&key==='amount'?'••••':original[key])}</dd></div>`).join('')}</dl>${row.evidence?.text?`<details><summary>原始文字</summary><pre class="pc-raw-text">${esc(row.evidence.text)}</pre></details>`:''}`);},
  'pc-duplicate':b=>{if(f.busy)return;const row=f.rows.find(r=>r.row===Number(b.dataset.row));if(row)return saveRows([{...row,duplicate_decision:b.dataset.value}]);},
  'pc-page':b=>{page=Math.max(0,Math.min(Math.ceil(f.rows.length/6)-1,page+Number(b.dataset.step)));repaint();},
  'pc-stop':()=>flow.stop(),
  'pc-confirm':async()=>{if(await flow.confirm())changedData();},
  'pc-check-confirmation':()=>flow.open(f.batch.id),
  'pc-retry-original':async()=>{if(await flow.confirm({retryOriginal:true}))changedData();},
  'pc-reconcile':async()=>{if(await flow.reconcile())changedData();},
  'pc-undo':()=>modal('撤销本批',`<p>移除本批入账的 ${f.batch.result?.created||0} 笔记录。</p><div class="actions">${btn('取消','close-sheet')}${btn('撤销','pc-undo-confirm','primary')}</div>`),
  'pc-undo-confirm':async()=>{closeSheet();if(await flow.undo())changedData();},
  'pc-discard':async()=>{if(await flow.discard())changedData();},
  'pc-new':()=>{flow.reset();go('capture');},
  'pc-ledger':()=>{const rows=f.rows.filter(r=>r.event_date);const dates=rows.map(r=>r.event_date).sort();state.filter={category:'',type:'',q:'',day:''};go('ledger?'+new URLSearchParams(dates.length?{month:dates.at(-1).slice(0,7),start_date:dates[0],end_date:dates.at(-1)}:{}));}
 }};
}
