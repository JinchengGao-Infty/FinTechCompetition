import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaptureFlow} from '../AI_accounting_agent/frontend/liquid-glass/capture-flow.js';
const storage=()=>{const values=new Map();return {get:(k,d)=>structuredClone(values.get(k)??d),set:(k,v)=>values.set(k,structuredClone(v))};};
const pending=id=>({id,status:'pending',challenge:'challenge-'+id,rows:[{row:1,event_date:'2026-10-22',amount:'28.00',category:'餐饮',type:'expense',description:'午餐',currency:'CNY',movement:'cashflow'}]});
test('unknown confirmation survives reload; pending GET permits only original replay, never edited payload',async()=>{
 const store=storage(),batch=pending('one'),posts=[];let imported=false,effects=0;
 const request=async(path,opts)=>{if(opts?.method==='POST'){posts.push(structuredClone(opts.body));if(posts.length===1)throw new Error('response lost');assert.deepEqual(posts[0],posts[1]);if(!imported){imported=true;effects++;}return {id:batch.id,status:'imported',created:1,bill_ids:[123]};}return structuredClone(batch);};
 let flow=createCaptureFlow({store,request});await flow.open('one');await flow.confirm();assert.equal(flow.state.confirmationUnknown,true);assert.equal(await flow.confirm(),null);assert.equal(posts.length,1);
 batch.rows[0].amount='29.00';flow=createCaptureFlow({store,request});await flow.open('one');assert.equal(flow.state.rows[0].amount,'28.00');assert.equal(flow.state.confirmationUnknown,true);assert.equal(flow.state.retryOriginal,true);
 flow.state.rows[0].amount='29.00';await flow.confirm({retryOriginal:true});assert.equal(posts[1].rows[0].amount,'28.00');assert.equal(effects,1);assert.deepEqual(store.get('QINGCAI_CAPTURE_CONFIRM_ATTEMPTS',{}),{});
});
test('late original completion and an explicit replay share the same effect and receipt',async()=>{
 const store=storage(),batch=pending('late'),posts=[];let effects=0,result;
 const request=async(path,opts)=>{if(opts?.method==='POST'){posts.push(structuredClone(opts.body));if(posts.length===1)throw new Error('disconnected');assert.deepEqual(posts[0],posts[1]);return result;}return structuredClone(batch);};
 const flow=createCaptureFlow({store,request});await flow.open(batch.id);await flow.confirm();await flow.open(batch.id);
 result={id:batch.id,status:'imported',created:1,bill_ids:[321]};effects++;const replay=await flow.confirm({retryOriginal:true});assert.equal(replay.bill_ids[0],321);assert.equal(effects,1);assert.equal(flow.state.confirmationUnknown,false);
});
test('another candidate cannot erase an unresolved confirmation; explicit rejection releases only its own attempt',async()=>{
 const store=storage();let reject=false;
 const request=async(path,opts)=>{if(opts?.method==='POST')throw reject?Object.assign(new Error('duplicate requires choice'),{status:409}):new Error('offline');return pending(path.split('/').at(-1));};
 const flow=createCaptureFlow({store,request});await flow.open('first');await flow.confirm();await flow.open('second');reject=true;await flow.confirm();const saved=store.get('QINGCAI_CAPTURE_CONFIRM_ATTEMPTS',{});assert.ok(saved.first);assert.equal(saved.second,undefined);await flow.open('first');assert.equal(flow.state.confirmationUnknown,true);
});
test('a lost confirmation response recovered as imported has a success result without an error notice',async()=>{
 const store=storage(),batch=pending('committed');let posts=0;
 const request=async(path,opts)=>{if(opts?.method==='POST'){posts++;batch.status='imported';batch.result={id:batch.id,status:'imported',created:1,bill_ids:[456]};throw new Error('lost response');}return structuredClone(batch);};
 const flow=createCaptureFlow({store,request});await flow.open(batch.id);const result=await flow.confirm();assert.equal(result.bill_ids[0],456);assert.equal(flow.state.error,'');assert.equal(flow.state.confirmationUnknown,false);assert.equal(posts,1);
});
