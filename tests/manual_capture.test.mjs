import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualCapture} from '../AI_accounting_agent/frontend/liquid-glass/manual-capture.js';
const payload={request_id:'lost-manual-1',bill:{amount:28,description:'午餐'}};
function storage(){const data=new Map();return {get:(k,d)=>data.get(k)??d,set:(k,v)=>data.set(k,structuredClone(v))};}
test('lost response, changed form and reload recover the original candidate without another POST',async()=>{
 const saved=storage(),calls=[];let created;
 const finance=async(path,options)=>{calls.push({path,body:options?.body});if(options?.method==='POST'){created={id:'same-batch',rows:[options.body.bill],status:'pending'};throw new Error('response lost');}if(!created)throw Object.assign(new Error('missing'),{status:404});return structuredClone(created);};
 let flow=createManualCapture({finance,storage:saved});await assert.rejects(flow.start(payload));
 assert.equal(flow.attempt.payload.bill.amount,28);
 flow=createManualCapture({finance,storage:saved});const batch=await flow.start({...payload,bill:{amount:29}});
 assert.equal(batch.id,'same-batch');assert.equal(batch.rows[0].amount,28);
 assert.equal(calls.filter(c=>c.body).length,1);assert.match(calls.at(-1).path,/requests\/lost-manual-1$/);
 flow.opened(batch.id);assert.equal(flow.attempt,null);
});
test('not received: recovery replays the immutable original request, not edited form values',async()=>{
 const saved=storage(),bodies=[];let first=true;
 const finance=async(path,options)=>{if(!options){throw Object.assign(new Error('missing'),{status:404});}bodies.push(structuredClone(options.body));if(first){first=false;throw new Error('offline');}return {id:'original'};};
 const flow=createManualCapture({finance,storage:saved});await assert.rejects(flow.start(payload));
 payload.bill.amount=29;const batch=await flow.start(payload);payload.bill.amount=28;
 assert.equal(batch.id,'original');assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[1].bill.amount,28);
});
test('concurrent recovery is locked; server terminal state is retained',async()=>{
 const saved=storage();let release;let calls=0;
 const finance=async()=>{calls++;return new Promise(resolve=>{release=resolve;});};
 const flow=createManualCapture({finance,storage:saved});const p=flow.start(payload);assert.equal(flow.busy,true);
 assert.equal(await flow.recover(),null);release({id:'done',status:'imported'});
 assert.equal((await p).status,'imported');assert.equal(calls,1);flow.opened('other');assert.ok(flow.attempt);flow.opened('done');assert.equal(flow.attempt,null);
});
test('failed lookup never blindly submits; validation failure permits correction',async()=>{
 const saved=storage();let posts=0;
 const finance=async(path,opts)=>{if(opts){posts++;throw new Error('lost');}throw Object.assign(new Error(posts?'service unavailable':'missing'),{status:posts?503:404});};
 const flow=createManualCapture({finance,storage:saved});await assert.rejects(flow.start(payload));await assert.rejects(flow.recover());assert.equal(posts,1);assert.ok(flow.attempt);
 const invalid=createManualCapture({storage:storage(),finance:async()=>{throw Object.assign(new Error('invalid'),{status:422});}});
 await assert.rejects(invalid.start(payload));assert.equal(invalid.attempt,null);
});
test('an old saved draft resolves its existing server candidate before sending changed contents',async()=>{
 let posts=0;
 const flow=createManualCapture({storage:storage(),finance:async(path,options)=>{if(options)posts++;return {id:'pre-upgrade',rows:[{amount:28}]};}});
 const batch=await flow.start({...payload,bill:{amount:29}});assert.equal(batch.rows[0].amount,28);assert.equal(posts,0);
});
