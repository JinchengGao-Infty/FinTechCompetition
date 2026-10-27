// Explicit fixed-result adapter for the requested stage demonstration.
// No microphone, speech service or OCR engine is invoked. Only the returned
// server candidate can be confirmed; the adapter never writes a ledger row.
export function createRecognitionDemoAdapter(request,{duration=2200}={}){
 return async(path,options={})=>{
  if(!['/capture/image','/capture/voice'].includes(path))return request(path,options);
  const image=path.endsWith('/image'),form=options.body;
  const requestId=image?form.get('request_id'):form.request_id;
  const file=image?form.get('file'):null;
  if(image&&(!file||!file.size))throw new Error('请选择票据图片');
  await new Promise((resolve,reject)=>{
   const signal=options.signal;let timer;
   const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);const e=new Error('已停止');e.name='AbortError';reject(e);};
   if(signal?.aborted)return stop();
   signal?.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},duration);
  });
  if(options.signal?.aborted){const e=new Error('已停止');e.name='AbortError';throw e;}
  return request('/capture/fixed',{...options,body:{kind:image?'image':'voice',request_id:requestId,fixture_version:'fixed-capture-20261025-v1',file_name:file?.name||null},method:'POST'});
 };
}
