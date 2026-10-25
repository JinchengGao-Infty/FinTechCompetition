// Keep the original creation request until its candidate has been recovered.
// Editing happens on that candidate with PUT, never by changing a retried POST.
export function createManualCapture({finance,storage,changed=()=>{}}){
 const key='QINGCAI_MANUAL_CAPTURE_ATTEMPT';
 let attempt=storage.get(key,null),busy=false,error='';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function persist(){storage.set(key,attempt);}
 async function run(work){
  if(busy)return null;
  busy=true;error='';changed();
  try{return await work();}
  catch(e){error=e.message||'暂时无法核实';throw e;}
  finally{busy=false;changed();}
 }
 async function locate(){
  if(attempt.batch_id)return finance('/capture/'+encodeURIComponent(attempt.batch_id));
  try{return await finance('/capture/requests/'+encodeURIComponent(attempt.request_id));}
  catch(e){if(e.status!==404)throw e;}
  return finance('/capture/manual',{method:'POST',body:copy(attempt.payload)});
 }
 async function recover(){
  if(!attempt)return null;
  return run(async()=>{const batch=await locate();attempt.batch_id=batch.id;persist();return batch;});
 }
 async function start(payload){
  if(attempt)return recover();
  attempt={request_id:payload.request_id,payload:copy(payload)};persist();
  return run(async()=>{
   try{const batch=await locate();attempt.batch_id=batch.id;persist();return batch;}
   catch(e){if(e.status===422){attempt=null;persist();}throw e;}
  });
 }
 function opened(id){if(attempt?.batch_id===id){attempt=null;error='';persist();changed();}}
 return {start,recover,opened,get attempt(){return attempt?copy(attempt):null;},get busy(){return busy;},get error(){return error;}};
}
