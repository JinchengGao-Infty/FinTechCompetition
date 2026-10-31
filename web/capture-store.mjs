import {ensureFinance,syncFinance,STORY_DATE} from './finance-state.mjs';
import {prepareLocalWrite,assertLocalWrite} from './local-write-guard.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=(message,status=422,detail)=>{const e=Error(message);e.status=status;e.detail=detail;throw e};
const uid=()=>crypto.randomUUID();
const fields=['event_date','type','amount','category','description','movement','payment_method','refund_of_bill_id','duplicate_decision','enabled'];
const batchParameters=batch=>({batchId:batch.id,requestId:batch.request_id,kind:batch.kind,challenge:batch.challenge,
 rows:batch.rows.map(row=>Object.fromEntries(['row',...fields].filter(key=>row[key]!==undefined).map(key=>[key,row[key]])))});
function guardError(task){try{return task()}catch(error){if(['locked','paused','stale_write','stale_binding','invalid_write'].includes(error.code))error.status=409;throw error;}}
function notAborted(signal){if(signal?.aborted){const error=Error('已停止');error.name='AbortError';throw error;}}
function confirmedRows(batch,data){
 if(data.challenge!==batch.challenge)fail('记录已修改，请重新核对',409);
 const expected=batch.rows.filter(row=>row.enabled!==false);
 if(!Array.isArray(data.rows)||data.rows.length!==expected.length||data.rows.some((row,i)=>row.row!==expected[i].row||fields.some(key=>row[key]!==undefined&&String(row[key])!==String(expected[i][key]))))fail('确认参数已变化，请重新核对',409);
}
function normalize(r,index){
 const row={...r,row:index+1,type:r.type||'expense',movement:r.movement||'cashflow',enabled:r.enabled!==false};
 row.description=String(r.description||'').trim();row.category=String(r.category||'其他').trim();
 row.amount=String(r.amount??'');row.errors=[];
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(row.amount)||Number(row.amount)<=0)row.errors.push('金额须大于零，最多两位小数');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.event_date||'')||Number.isNaN(Date.parse(r.event_date))||new Date(r.event_date).toISOString().slice(0,10)!==r.event_date)row.errors.push('请核对日期');
 if(!row.description||row.description.length>512)row.errors.push('请填写备注');
 if(!['income','expense'].includes(row.type)||!['cashflow','principal','internal_transfer'].includes(row.movement))row.errors.push('收支或资金性质无效');
 return row;
}
function csvParse(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=c;}
 if(quoted)fail('CSV 引号未闭合');row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2||rows.length>501)fail('CSV 需要表头及 1 至 500 条记录');
 const names={日期:'event_date',收支:'type',金额:'amount',分类:'category',备注:'description',支付方式:'payment_method',资金性质:'movement'};
 const keys=rows.shift().map(x=>names[x.trim().replace(/^\uFEFF/,'')]||x.trim());
 if(!['event_date','amount','description'].every(x=>keys.includes(x)))fail('CSV 须包含日期、金额、备注列');
 return rows.map(values=>{const r=Object.fromEntries(keys.map((k,i)=>[k,values[i]||'']));r.type=r.type==='收入'?'income':r.type==='支出'||!r.type?'expense':r.type;return r});
}
export function createCaptureStore({getState,save}){
 // Reads and candidate decoration never mutate the live ledger or renew a ticket.
 function root(value=getState()){const s=copy(value);ensureFinance(s);s.capture||={batches:[],requests:{}};return s}
 const ticketFor=detail=>guardError(()=>prepareLocalWrite(getState(),detail));
 const check=(state,ticket,parameters)=>guardError(()=>assertLocalWrite(state,ticket,{parameters}));
 function commit(fn,ticket,parameters,signal){
  notAborted(signal);const original=getState();check(original,ticket,parameters);
  const working=root(original),value=fn(working);syncFinance(working);
  notAborted(signal);const latest=getState();check(latest,ticket,parameters);
  if(latest!==original)fail('页面状态已变化，请重新核对',409);
  Object.assign(original,working);save();return copy(value);
 }
 function checkBatch(state,batch){check(state,batch.write_ticket,batchParameters(batch));}
 function stampBatch(state,batch){batch.write_ticket=guardError(()=>prepareLocalWrite(state,{kind:'capture_batch',id:batch.id,parameters:batchParameters(batch)}));}
 function decorate(batch,s){const out=copy(batch);out.rows=out.rows.map((r,i)=>normalize(r,i));for(const r of out.rows){r.possible_duplicates=s.ledger.filter(x=>x.date===r.event_date&&x.direction===r.type&&x.amountMinor===Math.round(Number(r.amount)*100)&&x.title===r.description&&!x.id.startsWith('capture:'+batch.id+':')).map(x=>({id:x.id,event_date:x.date,description:x.title,amount:x.amountMinor/100}));r.candidate_duplicates=out.rows.filter(x=>x.row!==r.row&&x.event_date===r.event_date&&x.type===r.type&&x.amount===r.amount&&x.description===r.description).map(x=>({row:x.row}));}return out}
 return async function request(path,options={}){
  notAborted(options.signal);
  const method=options.method||'GET',data=options.body||{},s=root(),parts=path.split('/').filter(Boolean);
  if(parts[0]!=='capture')fail('无效采集路径',404);
  if(parts.length===1)return {batches:s.capture.batches.map(b=>({...copy(b),count:b.rows.length}))};
  if(parts[1]==='requests'){const b=s.capture.batches.find(b=>b.request_id===parts[2]);if(!b)fail('未找到候选',404);return decorate(b,s)}
  if(['manual','text','csv','fixed'].includes(parts[1])&&method==='POST'){
    if(typeof data.request_id!=='string'||!data.request_id||data.request_id.length>180)fail('缺少有效请求编号');const previous=s.capture.requests[data.request_id];
   if(previous){if(previous.payload!==JSON.stringify(data))fail('原请求参数已变化',409);return decorate(s.capture.batches.find(b=>b.id===previous.id),s)}
    const parameters={path,method,requestId:data.request_id},ticket=ticketFor({kind:'capture_create',id:data.request_id,parameters});
   let candidates,kind=parts[1];
   if(kind==='manual')candidates=[{...data.bill,payment_method:data.bill?.metadata?.payment_method||data.bill?.payment_method}];
   if(kind==='text'){const text=String(data.text||'').trim(),amount=text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块)/)?.[1];if(!amount)fail('请提供金额，例如“午餐28元”，或选择手动填写');const income=/工资|收入|奖金|退款/.test(text);let date=data.reference_date||STORY_DATE;const explicit=text.match(/\b(\d{4}-\d{2}-\d{2})\b/);if(explicit)date=explicit[1];else if(/昨天|昨日/.test(text)){const d=new Date(date);d.setUTCDate(d.getUTCDate()-1);date=d.toISOString().slice(0,10)}candidates=[{event_date:date,type:income?'income':'expense',amount,category:/退款/.test(text)?'退款':income?'工资':/餐|饭|咖啡/.test(text)?'餐饮':'其他',description:text,movement:'cashflow',evidence:{text}}]}
   if(kind==='csv'){if(String(data.content||'').length>1400000)fail('CSV 超过 1 MB');try{const binary=atob(data.content);candidates=csvParse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))))}catch(e){if(e.status)throw e;fail('请使用 UTF-8 CSV 文件')}}
   if(kind==='fixed'){kind=data.kind;candidates=[{event_date:STORY_DATE,type:'expense',amount:kind==='voice'?'28':'86.50',category:'餐饮',description:kind==='voice'?'午餐':'餐厅消费',movement:'cashflow',evidence:{text:'固定结果演示样例'}}]}
   if(!candidates?.length)fail('没有可用候选');
    return commit(w=>{const b={id:uid(),request_id:data.request_id,kind,status:'pending',challenge:uid(),created_at:new Date().toISOString(),rows:candidates.map((r,i)=>({...normalize(r,i),origin:copy(r)}))};stampBatch(w,b);w.capture.batches.unshift(b);w.capture.requests[data.request_id]={id:b.id,payload:JSON.stringify(data)};return decorate(b,w)},ticket,parameters,options.signal);
  }
  const id=parts[1],batch=s.capture.batches.find(b=>b.id===id);if(!batch)fail('未找到候选',404);
  if(method==='GET')return decorate(batch,s);
   // These are read-only receipt lookups, not another submission or a ticket renewal.
   if(parts[2]==='reconcile'&&batch.status==='imported')return copy(batch.result);
   if(parts[2]==='confirm'&&batch.status==='imported'){confirmedRows(batch,data);return copy(batch.result);}
   if(parts[2]==='undo'&&batch.status==='undone'){if(data.challenge!==batch.challenge)fail('记录已修改，请重新核对',409);return {status:'undone'};}
   const parameters={path,method,batchId:id,challenge:data.challenge??null},ticket=ticketFor({kind:'capture_write',id:id+':'+method+':'+(parts[2]||'edit'),parameters});
  return commit(w=>{const b=w.capture.batches.find(x=>x.id===id),op=parts[2];
    checkBatch(w,b);
    if(method==='PUT'){if(b.status!=='pending')fail('记录状态已变化',409);if(!Array.isArray(data.rows)||data.rows.length!==b.rows.length||data.rows.some((r,i)=>r.row!==i+1))fail('候选记录不完整');b.rows=data.rows.map((r,i)=>({...b.rows[i],...Object.fromEntries(fields.filter(k=>r[k]!==undefined).map(k=>[k,r[k]])),row:i+1}));b.challenge=uid();stampBatch(w,b);return decorate(b,w)}
   if(data.challenge!==b.challenge)fail('记录已修改，请重新核对',409);
   if(op==='confirm'){
    if(b.status==='imported')return b.result;if(b.status!=='pending')fail('记录状态已变化',409);
     confirmedRows(b,data);const selected=decorate(b,w).rows.filter(r=>r.enabled!==false&&r.duplicate_decision!=='skip');
    if(!selected.length)fail('请选择需要入账的记录');
    for(const r of selected){if(r.errors.length)fail(r.errors.join('；'));if((r.possible_duplicates.length||r.candidate_duplicates.some(x=>selected.some(a=>a.row===x.row)))&&r.duplicate_decision!=='keep')fail('请核对可能重复的记录',409,{code:'possible_duplicate',row:r.row,matches:r.possible_duplicates})}
    for(const r of selected){const ledgerId='capture:'+id+':'+r.row;if(w.ledger.some(x=>x.id===ledgerId))continue;w.ledger.push({id:ledgerId,date:r.event_date,title:r.description,category:r.category,amountMinor:Math.round(Number(r.amount)*100),direction:r.type,movement:r.movement,kind:r.movement==='principal'?(r.type==='expense'?'investment':'redemption'):null,icon:'receipt',order:w.ledger.length,taskId:null,receipt:null,captureId:id,payment_method:r.payment_method||''})}
    b.status='imported';b.result={status:'imported',created:selected.length,duplicates:0,skipped_rows:b.rows.filter(r=>r.enabled===false||r.duplicate_decision==='skip').map(r=>r.row)};return b.result;
   }
   if(op==='undo'){if(b.status==='undone')return {status:'undone'};if(b.status!=='imported')fail('此记录不能撤销',409);w.ledger=w.ledger.filter(r=>r.captureId!==id);b.status='undone';return {status:'undone'}}
   if(method==='DELETE'){if(b.status!=='pending')fail('仅待确认记录可以丢弃',409);b.status='discarded';return {status:'discarded'}}
   if(op==='reconcile'&&b.status==='imported')return b.result;
   fail('不支持的采集操作',404);
   },ticket,parameters,options.signal);
 }
}
