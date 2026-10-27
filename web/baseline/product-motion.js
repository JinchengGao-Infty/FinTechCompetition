import {mountCandidate,mountTask,icon} from './motion/motion.js';
import {MotionScope} from './motion/lifecycle.js';

// Presentation only. Hosts own all requests, receipts, navigation and semantics.
// candidate/task roots MUST be dedicated empty decoration anchors, not cards.
const validId=value=>typeof value==='string'&&value.trim().length>0;
function minor(row){
 if(Number.isSafeInteger(row.amountMinor)&&row.amountMinor>=0)return row.amountMinor;
 const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(row.amount??''));
 if(!match)return null;
 const amount=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
 return Number.isSafeInteger(amount)?amount:null;
}

export function createProductMotion({prefs={}}={}){
 const controllers=new Map();let observer,override;
 const reduced=()=>override===undefined?(prefs.reduceMotion?true:undefined):override;
 function watch(){
  if(observer||typeof MutationObserver==='undefined'||!globalThis.document?.documentElement)return;
  observer=new MutationObserver(()=>{
   for(const [root,record] of controllers){
    if(root.isConnected)record.connected=true;
    else if(record.connected)dispose(root);
   }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
 }
 function remove(root){
  const record=controllers.get(root);if(!record)return;
  record.view.dispose();controllers.delete(root);
  if(record.kind!=='categories'){
   root.classList.remove('product-motion-decoration','product-motion-candidate','product-motion-task','fp-motion');
   root.removeAttribute('aria-hidden');root.removeAttribute('inert');root.removeAttribute('data-state');
   root.removeAttribute('data-product-motion');
   root.removeAttribute('data-task-status');
  }
 }
 function dispose(root){
  for(const key of [...controllers.keys()]){
   if(!root||key===root||root.contains?.(key))remove(key);
  }
  if(!controllers.size){observer?.disconnect();observer=undefined;}
 }
 function register(root,record){
  record.connected=!!root.isConnected;controllers.set(root,record);watch();return record;
 }
 function decorated(root,kind,key){
  if(!root?.querySelector)return null;
  if(prefs.mask){dispose(root);return null;}
  let record=controllers.get(root);
  if(record&&(record.kind!==kind||record.key!==key)){dispose(root);record=null;}
  if(!record){
   root.classList.add('product-motion-decoration','product-motion-'+kind);
   root.setAttribute('aria-hidden','true');root.setAttribute('inert','');
   root.dataset.productMotion=kind;
   const view=(kind==='candidate'?mountCandidate:mountTask)(root,{reducedMotion:reduced(),getReceiptTarget:()=>root.closest('.product-capture')?.querySelector('[data-motion-receipt-target]'),getCarrierContainer:()=>root.ownerDocument.body});
   record=register(root,{kind,key,view,initialized:false,waiting:false,terminal:false,dataKey:''});
  }
  return record;
 }
 function setup(record,data){
  if(record.initialized)return;
  // Open the real module's correlation gate silently. begin() is never used as
  // evidence that a request ran or succeeded.
  record.view.setReducedMotion(true);record.view.begin(data);
  record.view.receive({...data,status:'unknown'});
  record.view.setReducedMotion(reduced());record.initialized=true;
 }
 function present(record,data,{busy=false,success=false,receiptId}={}){
  if(record.terminal){record.view.setReducedMotion(true);record.view.setReducedMotion(reduced());return record.view;}
  if(success){
   const animate=record.waiting;setup(record,data);
   if(!animate)record.view.setReducedMotion(true);
   if(record.view.receive({...data,status:'succeeded',receiptId}))record.terminal=true;
   if(!animate)record.view.setReducedMotion(reduced());
  }else if(busy){
   if(!record.initialized){record.view.begin(data);record.initialized=true;record.waiting=true;}
   else if(!record.waiting){record.view.stop();record.view.begin(data);record.waiting=true;}
  }else{
   setup(record,data);
   if(record.waiting){
    record.view.setReducedMotion(true);record.view.receive({...data,status:'unknown'});
    record.view.setReducedMotion(reduced());record.waiting=false;
   }
  }
  return record.view;
 }
 function candidate(root,{batch,rows=[],phase='idle'}={}){
  if(!validId(batch?.id)||['undone','discarded'].includes(batch.status)){dispose(root);return null;}
  const selected=rows.filter(row=>row.enabled!==false&&row.duplicate_decision!=='skip');
  if(!selected.length||selected.some(row=>row.errors?.length||(row.currency&&row.currency!=='CNY'))){dispose(root);return null;}
  const amounts=selected.map(minor);
  const amountMinor=amounts.reduce((sum,value)=>sum+(value??0),0);
  if(amounts.includes(null)||!Number.isSafeInteger(amountMinor)){dispose(root);return null;}
  const objectId=batch.id,requestId='capture:'+objectId;
  const data={requestId,objectId,objectLabel:selected[0].description||batch.kind,
   amountMinor,category:selected[0].category||'',dateLabel:selected[0].event_date||'',
   source:batch.kind==='text'?'text':'receipt',icon:'receipt'};
  if(!validId(data.objectLabel)){dispose(root);return null;}
  let record=controllers.get(root);
  const dataKey=JSON.stringify(data);
  if(record?.kind==='candidate'&&record.dataKey!==dataKey)dispose(root);
  record=decorated(root,'candidate',objectId);if(!record)return null;
  if(!record.dataKey){record.view.setCandidate(data);record.dataKey=dataKey;}
  // A batch ID is only a LOCAL ledger receipt, never a bank receipt.
  const success=phase==='succeeded'&&batch.status==='imported'&&batch.result?.status==='imported'
   &&validId(batch.result?.id)&&batch.result.id===batch.id;
  return present(record,data,{busy:phase==='pending',success,receiptId:success?batch.id:undefined});
 }
 function task(root,op,{busy=false}={}){
  const objectId=op?.handle,amountMinor=op?.params?.amount_minor;
  const objectLabel=op?.target_name||op?.label||op?.kind;
  if(!validId(objectId)||!validId(objectLabel)||!Number.isSafeInteger(amountMinor)||amountMinor<0){dispose(root);return null;}
  const data={requestId:validId(op.request_id)?op.request_id:'operation:'+objectId,
   objectId,objectLabel,amountMinor};
  const record=decorated(root,'task',objectId);if(!record)return null;
  const success=op.status==='succeeded'&&validId(op.receipt_hash);
  const view=present(record,data,{busy:!!busy,success,receiptId:success?op.receipt_hash:undefined});
  // The decoration follows the host's known status; only a verified receipt gets a check.
  const glyph=success?'check':op.status==='failed'?'failure':op.status==='cancelled'?'close':
   (busy||['unknown','pending','executing'].includes(op.status))?'clock':'shieldOutline';
  root.dataset.taskStatus=op.status;
  const seal=root.querySelector('.fp-seal');
  if(seal&&seal.dataset.glyph!==glyph){
   seal.innerHTML=glyph==='clock'?'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>':
    glyph==='shieldOutline'?'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5c0 5 7.5 10 7.5 10s7.5-5 7.5-10V6L12 3Z"/></svg>':icon(glyph,34);
   seal.dataset.glyph=glyph;
  }
  return view;
 }
 function categories(root){
  if(!root?.querySelector)return null;
  let record=controllers.get(root);
  if(record?.kind==='categories')return record.view;
  if(record)dispose(root);
  const scope=new MotionScope(root,{reducedMotion:reduced(),getReceiptTarget:()=>root.closest('.product-capture')?.querySelector('[data-motion-receipt-target]'),getCarrierContainer:()=>root.ownerDocument.body});
  const rows=()=>[...root.querySelectorAll('.pa-category[data-category]')];
  const view={
   select(id){
    const items=rows(),index=id===null?-1:items.findIndex(row=>row.dataset.category===String(id));
    if(id!==null&&index<0)return false;
    scope.cancel();
    if(prefs.mask)return true;
    const options={duration:220};
    const segment=[...root.querySelectorAll('.pa-donut svg circle[stroke-dasharray]')][index];
    scope.play(segment,[{opacity:.5},{opacity:1}],options);
    if(index>=0)scope.play(items[index].querySelector('.pa-category-icon'),[{opacity:.55},{opacity:1}],options);
    return true;
   },
   dispose(){scope.dispose();},setReducedMotion(value){scope.setReducedMotion(value);},
   get activeAnimations(){return scope.animations.size;}
  };
  register(root,{kind:'categories',key:'categories',view});return view;
 }
 function selectCategory(root,id){return categories(root)?.select(id)??false;}
 function setReducedMotion(value){
  override=value;for(const record of controllers.values())record.view.setReducedMotion(reduced());
 }
 return {candidate,task,categories,selectCategory,dispose,setReducedMotion,
  get activeControllers(){return controllers.size;}};
}
