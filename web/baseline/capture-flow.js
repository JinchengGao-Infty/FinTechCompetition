import {finance} from './finance-api.js';
import {storage} from './api.js';

const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const captureFields=row=>Object.fromEntries(['row','event_date','type','amount','category','description','movement','payment_method','refund_of_bill_id','duplicate_decision'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));

// Captures only create reviewable candidates. Only confirm writes the ledger.
export function createCaptureFlow({changed=()=>{},request=finance,store=storage}={}){
 const attemptKey='QINGCAI_CAPTURE_CONFIRM_ATTEMPTS',attempts=store.get(attemptKey,{});
 const attemptFor=id=>attempts[id];
 const keepAttempt=(value,id=value?.batchId||state.batch?.id)=>{if(value)attempts[id]=value;else delete attempts[id];store.set(attemptKey,attempts);};
 const state={batch:null,rows:[],batches:[],busy:false,operation:'',listBusy:false,batchBusy:false,listError:'',batchError:'',confirming:false,confirmationUnknown:false,retryOriginal:false,error:'',mode:'text',text:'',request:null,controller:null};
 const reads=new Map();let revision=0,recognitionSequence=0;
 async function read(scope,task){
  reads.get(scope)?.abort();const controller=new AbortController();reads.set(scope,controller);
  state[scope+'Busy']=true;state[scope+'Error']='';changed({scope,phase:'start'});
  try{return await task(controller.signal,()=>reads.get(scope)===controller);}
  catch(error){if(reads.get(scope)===controller)state[scope+'Error']=error.message;return null;}
  finally{if(reads.get(scope)===controller){reads.delete(scope);state[scope+'Busy']=false;changed({scope,phase:'finish'});}}
 }
 async function run(task,operation='save'){
  if(state.busy||state.confirmationUnknown&&operation!=='confirm')return;
  const controller=new AbortController();revision++;state.busy=true;state.operation=operation;state.error='';state.controller=controller;changed({scope:'operation',phase:'start'});
  try{return await task(controller.signal);}
  catch(error){if(state.controller!==controller)return null;state.error=error.message;
   if(error.detail?.code==='possible_duplicate'||error.detail?.code==='candidate_duplicate'){
    const row=state.rows.find(r=>r.row===error.detail.row);
    if(row)row[error.detail.code==='candidate_duplicate'?'candidate_duplicates':'possible_duplicates']=error.detail.matches;
    state.error='请核对可能重复的记录';
   }
   return null;
  }finally{if(state.controller===controller){state.busy=false;state.operation='';state.controller=null;changed({scope:'operation',phase:'finish'});}}
 }
 function recognize(task,operation){
  if(state.busy||state.confirmationUnknown)return;
  const sequence=++recognitionSequence;
  return run(async signal=>{const batch=await task(signal);return sequence===recognitionSequence&&!signal.aborted&&state.controller?.signal===signal?accept(batch):null;},operation);
 }
 // A known terminal result completes its create request. A later intentional
 // entry is a new operation; stopped/pending/unknown attempts keep their ID.
 function retireRequest(batch){if(['imported','undone','discarded'].includes(batch?.status))state.request=null;}
 function accept(batch){retireRequest(batch);if(batch.status!=='pending'&&attemptFor(batch.id))keepAttempt(null,batch.id);state.confirmationUnknown=batch.status==='pending'&&!!attemptFor(batch.id);state.retryOriginal=state.confirmationUnknown;state.batch=batch;state.rows=batch.rows.map(row=>({...row,...(state.confirmationUnknown?attemptFor(batch.id).rows.find(original=>original.row===row.row):{})}));state.error='';return batch;}
 async function inbox(){return read('list',async(signal,current)=>{const data=await request('/capture',{signal});if(current())state.batches=data.batches;return data;});}
 async function open(id){const atRevision=revision;return read('batch',async(signal,current)=>{const batch=await request('/capture/'+encodeURIComponent(id),{signal});return current()&&atRevision===revision&&!state.busy?accept(batch):null;});}
 function requestId(kind,key){if(state.request?.kind!==kind||state.request.key!==key)state.request={kind,key,id:uid()};return state.request.id;}
 async function text(value,referenceDate){if(!value?.trim())return null;state.text=value;return run(async signal=>accept(await request('/capture/text',{method:'POST',body:{text:value,reference_date:referenceDate,request_id:requestId('text',referenceDate+'\n'+value)},signal,timeout:180000})),'text');}
 async function voice(){return recognize(signal=>request('/capture/voice',{method:'POST',body:{request_id:requestId('voice','fixed-capture-20261025-v1')},signal}), 'voice');}
 async function file(file,accountLabel='默认账户'){
  if(!file)return null;
  const kind=/\.csv$/i.test(file.name)?'csv':'image';
  const task=async signal=>{
   const captureRequestId=requestId(kind,[file.name,file.size,file.lastModified,accountLabel].join('|'));
   let body;
   if(kind==='csv'){
    if(file.size>1_000_000)throw new Error('请选择不超过 1 MB 的 CSV');
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    body={content:btoa(binary),account_label:accountLabel,request_id:captureRequestId};
   }else{
    if(file.size>10*1024*1024)throw new Error('请选择不超过 10 MB 的图片');
    body=new FormData();body.append('file',file);body.append('request_id',captureRequestId);
   }
   return request('/capture/'+kind,{method:'POST',body,signal,timeout:180000});
  };
  return kind==='image'?recognize(task,kind):run(async signal=>accept(await task(signal)),kind);
 }
 async function manual(bill){return run(async signal=>accept(await request('/capture/manual',{method:'POST',body:{bill,request_id:requestId('manual',JSON.stringify(bill))},signal})));}
 async function update(rows){return run(async signal=>{
  // Send one complete snapshot so editing another row cannot erase selections
  // or duplicate decisions. Accept only the server-confirmed snapshot.
  const patches=new Map(rows.map(row=>[row.row,{...row}]));
  const snapshot=state.rows.map(row=>({...row,...patches.get(row.row)}));
  return accept(await request('/capture/'+state.batch.id,{method:'PUT',
   body:{rows:snapshot.map(row=>({...captureFields(row),enabled:row.enabled!==false}))},signal}));
 });}
 async function confirm({retryOriginal=false}={}){if(state.busy||state.confirmationUnknown&&!(retryOriginal&&state.retryOriginal))return null;state.confirming=true;try{return await run(async signal=>{
  const batch=state.batch;
  const rows=retryOriginal&&!!attemptFor(batch.id)?attemptFor(batch.id).rows:state.rows.filter(r=>r.enabled!==false).map(captureFields);
  if(!rows.length)throw new Error('请选择需要入账的记录');
  const body={challenge:batch.challenge,rows};
  keepAttempt({batchId:batch.id,rows:JSON.parse(JSON.stringify(rows))});state.retryOriginal=false;
  try{
   const result=await request('/capture/'+batch.id+'/confirm',{method:'POST',body,signal,timeout:45000});
   keepAttempt(null);state.confirmationUnknown=false;batch.result=result;batch.status=result.status;batch.profile_sync_pending=false;retireRequest(batch);return result;
  }catch(error){
   if(error.status!==409&&error.status!==422){
    state.confirmationUnknown=true;
    try{const known=await request('/capture/'+batch.id);state.batch=known;
     if(known.status==='imported'){keepAttempt(null);state.confirmationUnknown=false;state.error='';retireRequest(known);return known.result;}
    }catch{}
   }
   if(error.status===409||error.status===422){keepAttempt(null);state.confirmationUnknown=false;}
   throw error;
  }
 },'confirm');}finally{state.confirming=false;}}
 async function reconcile(){return run(async signal=>{
  const batch=state.batch;const result=await request('/capture/'+batch.id+'/reconcile',{method:'POST',body:{challenge:batch.challenge},signal});
  batch.profile_sync_pending=false;batch.result=result;batch.status='imported';retireRequest(batch);return result;
 });}
 async function undo(){return run(async signal=>{
  const batch=state.batch;const result=await request('/capture/'+batch.id+'/undo',{method:'POST',body:{challenge:batch.challenge},signal});batch.status=result.status;retireRequest(batch);return result;
 });}
 async function discard(){return run(async signal=>{
  const batch=state.batch;const result=await request('/capture/'+batch.id,{method:'DELETE',body:{challenge:batch.challenge},signal});batch.status=result.status;state.rows=[];retireRequest(batch);return result;
 });}
 function cancelRecognition(showStopped=false){
  recognitionSequence++;
  if(!['voice','image'].includes(state.operation))return;
  const controller=state.controller;state.controller=null;state.busy=false;state.operation='';state.error=showStopped?'已停止':'';
  controller?.abort();changed({scope:'operation',phase:'cancel'});
 }
 function leave(){revision++;cancelRecognition();for(const controller of reads.values())controller.abort();reads.clear();state.listBusy=false;state.batchBusy=false;}
 function stop(){if(['voice','image'].includes(state.operation))cancelRecognition(true);else state.controller?.abort();}
 return {state,inbox,open,text,voice,file,manual,update,confirm,reconcile,undo,discard,stop,leave,reset(){leave();state.listError='';state.batchError='';state.confirming=false;state.confirmationUnknown=false;state.retryOriginal=false;state.batch=null;state.rows=[];state.error='';state.request=null;changed();}};
}
