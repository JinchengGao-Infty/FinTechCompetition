import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCaptureFlow} from '../AI_accounting_agent/frontend/liquid-glass/capture-flow.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const memory=()=>{const data={};return {get:(key,fallback)=>structuredClone(data[key]??fallback),set:(key,value)=>{data[key]=structuredClone(value);}};};
const batch=id=>({id,status:'pending',kind:'text',challenge:'fixture-challenge',rows:[{row:1,enabled:true,event_date:'2026-10-23',type:'expense',amount:'1.00',category:'餐饮',description:'午餐',movement:'cashflow',errors:[]}]});

test('slow inbox read does not own the mutation busy flag or abort control',async()=>{
 const list=deferred(),parse=deferred(),events=[];
 const flow=createCaptureFlow({store:memory(),changed:event=>events.push(event),request:path=>path==='/capture'?list.promise:parse.promise});
 const reading=flow.inbox();assert.equal(flow.state.listBusy,true);assert.equal(flow.state.busy,false);assert.equal(flow.state.controller,null);
 const parsing=flow.text('午餐1元','2026-10-23');assert.equal(flow.state.busy,true);assert.equal(flow.state.operation,'text');
 list.resolve({batches:[]});await reading;assert.equal(flow.state.busy,true);assert.equal(flow.state.listBusy,false);
 parse.resolve(batch('new'));await parsing;assert.equal(flow.state.batch.id,'new');assert.equal(flow.state.busy,false);
 assert.deepEqual(events.map(event=>event.scope),['list','operation','list','operation']);
});

test('late detail GET cannot replace a newer parsed candidate',async()=>{
 const old=deferred();const flow=createCaptureFlow({store:memory(),request:path=>path==='/capture/old'?old.promise:Promise.resolve(batch('new'))});
 const reading=flow.open('old');assert.equal(flow.state.batchBusy,true);assert.equal(flow.state.busy,false);
 await flow.text('午餐1元','2026-10-23');old.resolve(batch('old'));assert.equal(await reading,null);assert.equal(flow.state.batch.id,'new');
});

test('read failure stays local and empty input never begins recognition',async()=>{
 let calls=0;const flow=createCaptureFlow({store:memory(),request:async()=>{calls++;throw Error('读取失败');}});
 await flow.inbox();assert.equal(flow.state.listError,'读取失败');assert.equal(flow.state.error,'');assert.equal(flow.state.busy,false);
 await flow.text('  ','2026-10-23');await flow.file(null);assert.equal(calls,1);assert.equal(flow.state.operation,'');
});

test('unknown confirmation stays locked and retries the stored original rows',async()=>{
 const submitted=[],store=memory();
 const flow=createCaptureFlow({store,request:async(path,options)=>{
  if(path.endsWith('/confirm')){submitted.push(structuredClone(options.body.rows));if(submitted.length===1)throw Error('timeout');return {id:'unknown',status:'imported',created:1};}
  return batch('unknown');
 }});
 await flow.open('unknown');await flow.confirm();assert.equal(flow.state.confirmationUnknown,true);assert.equal(flow.state.retryOriginal,false);
 await flow.update([{row:1,amount:'999.00'}]);await flow.text('new','2026-10-23');assert.equal(submitted.length,1);
 await flow.open('unknown');assert.equal(flow.state.retryOriginal,true);flow.state.rows[0].amount='999.00';
 await flow.confirm({retryOriginal:true});assert.deepEqual(submitted[1],submitted[0]);assert.equal(flow.state.confirmationUnknown,false);
});

test('stopping an actual parse cancels its own request, not an inbox read',async()=>{
 const list=deferred();let parseAborted=false;
 const flow=createCaptureFlow({store:memory(),request:(path,{signal})=>path==='/capture'?list.promise:new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{parseAborted=true;reject(Error('stopped'));}))});
 const reading=flow.inbox(),parsing=flow.text('午餐1元','2026-10-23');flow.stop();await parsing;
 assert.equal(parseAborted,true);assert.equal(flow.state.listBusy,true);list.resolve({batches:[]});await reading;
});

test('input fixtures: list-only repaint, usable tabs/manual, file readiness and manual return',async()=>{
 const list=deferred(),inbox={innerHTML:'',setAttribute(){}},button={disabled:true},label={textContent:''};
 let paints=0,html='',destination='';const state={route:'capture'};
 globalThis.document={querySelector:selector=>selector==='[data-pc-inbox]'?inbox:selector.startsWith('#pc-text-form button')?button:selector==='.pc-file-name'?label:null};
 globalThis.location={hash:'#/capture'};
 globalThis.__captureScopeFactory=options=>createCaptureFlow({...options,store:memory(),request:()=>list.promise});
 const source=(await readFile(new URL('../AI_accounting_agent/frontend/liquid-glass/product-capture.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const {createProductCapture}=await import('data:text/javascript;base64,'+Buffer.from('const createCaptureFlow=globalThis.__captureScopeFactory;const createRecognitionDemoAdapter=x=>x;const finance=()=>{};const categoryIconKey=x=>x;const categoryBadgeStyle=()=>"";\n'+source).toString('base64'));
 const product=createProductCapture({state,prefs:{},esc:String,money:String,icon:()=>'',btn:(text,action)=>`<button data-action="${action}">${text}</button>`,loading:()=>'',go:route=>{destination=route;},modal(){},closeSheet(){},render(){},book:async()=>[]});
 try{
  const reading=product.pages.capture(value=>{html=value;paints++;});
  assert.equal(paints,1);assert.match(inbox.innerHTML,/读取候选/);assert(!html.includes('正在识别'));assert(!html.includes('pc-stop'));
  for(const tag of html.matchAll(/<button[^>]*data-action="pc-mode"[^>]*>/g))assert(!tag[0].includes('disabled'));
  product.actions['pc-manual']();assert.equal(destination,'entry');
  product.actions['pc-mode']({dataset:{value:'image'}});assert.match(html,/<button[^>]*type="submit" disabled>预览/);
  assert(!html.includes('data-action="pc-manual"'));assert(!html.includes('data-feature="voice"'));
  await product.onChange({target:{id:'pc-file',dataset:{},files:[{name:'票据.png',size:100}]}});assert.equal(button.disabled,false);assert.equal(label.textContent,'票据.png');
  const before=paints;state.route='entry';list.resolve({batches:[]});await reading;assert.equal(paints,before);
  state.route='capture';await product.pages.capture(value=>{html=value;paints++;});assert.match(html,/票据.png/);assert.match(html,/<button[^>]*type="submit" >预览/);
  product.actions['pc-mode']({dataset:{value:'csv'}});assert.match(html,/<button[^>]*type="submit" disabled>预览/);
  assert(!html.includes('data-action="pc-manual"'));assert(!html.includes('data-feature="voice"'));
  await product.onChange({target:{id:'pc-file',dataset:{},files:[{name:'empty.csv',size:0}]}});assert.equal(button.disabled,true);
  await product.onChange({target:{id:'pc-file',dataset:{},files:[{name:'账单.csv',size:20}]}});assert.equal(button.disabled,false);
  product.actions['pc-mode']({dataset:{value:'text'}});product.onInput({target:{id:'pc-text',value:'午餐1元'}});assert.equal(button.disabled,false);
  assert(html.includes('data-action="pc-manual"'));
  product.onInput({target:{id:'pc-text',value:' '}});assert.equal(button.disabled,true);
  product.flow.state.busy=true;product.flow.state.operation='csv';product.repaint();assert.match(html,/正在预览/);assert(!html.includes('正在识别'));assert.match(html,/pc-stop/);
  product.flow.state.batch=batch('unknown');product.flow.state.rows=product.flow.state.batch.rows;product.flow.state.operation='confirm';product.flow.state.confirmationUnknown=true;product.repaint();
  assert.match(html,/正在核实结果/);assert(!html.includes('pc-stop'));assert.match(html,/data-action="pc-confirm" disabled/);
 }finally{delete globalThis.document;delete globalThis.location;delete globalThis.__captureScopeFactory;}
});
