import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {ensurePaperPortfolio,reviewTrade,executePaperTrade} from '../web/investment-state.mjs';
import {paperOperation,paperExecutionId,paperReviewFingerprint} from '../web/paper-safety.mjs';
import {createInvestmentUI} from '../web/investment-ui.mjs';
import {authorizeSafety,beginChallenge,verifyChallenge,acquireExecution,lockSafety,invalidateSafetyEpoch,DEMO_VERIFICATION_CODE} from '../web/safety-policy.mjs';

const NOW=Date.parse('2026-11-02T09:00:00+08:00'),USER={kind:'user',method:'click'};
const baseline={revision:4,holdings:[{id:'synthetic-cmb',code:'600036',name:'招商银行',asset_class:'stock',quantity:'200',total_cost:'8019.84',market_value:'8354.00',reference_price:41.77,quote_as_of:'2026-10-23',quote_quality:'reference_close'}]};
const setup=()=>{const state=fresh();ensurePaperPortfolio(state,baseline);return state;};
const input=(patch={})=>({code:'600036',name:'招商银行',side:'buy',quantity:'100',price:'40.00',quoteDate:'2026-10-23',...patch});
const financial=state=>JSON.stringify({balance:state.balance,ledger:state.ledger,portfolio:state.paperPortfolio});
function reviewed(state,id='paper-safe-0001',patch={},options={}){
 const review=reviewTrade(state,input(patch)),operation=paperOperation(state,review,id,options);
 const grant=authorizeSafety(state,operation,{source:USER,now:NOW});
 return {review,operation,grant,id,options};
}
function verified(state,packet){
 const challenge=beginChallenge(state,packet.operation,{grantId:packet.grant.grantId,now:NOW});
 assert.equal(verifyChallenge(state,{challengeId:challenge.id,code:DEMO_VERIFICATION_CODE,source:USER,now:NOW}).ok,true);
 return {...packet,challenge};
}
const run=(state,packet,options={})=>executePaperTrade(state,packet.review,packet.id,{grantId:packet.grant.grantId,now:NOW,...packet.options,...options});

test('paper descriptor binds every trade field and separates a historical quote from execution time',()=>{
 const state=setup(),review=reviewTrade(state,input()),op=paperOperation(state,review,'paper-bind-0001');
 assert.equal(op.kind,'paper_buy');assert.equal(op.id,'paper:paper-bind-0001');assert.equal(op.revision,review.revision+1);assert.equal(op.scheduledAt,null);
 assert.deepEqual(JSON.parse(op.parameters),{code:review.code,name:review.name,side:review.side,quantity:review.quantity,priceMinor:review.priceMinor,referenceMinor:review.referenceMinor,amountMinor:review.amountMinor,quoteDate:review.quoteDate,portfolioRevision:review.revision,requestId:'paper-bind-0001'});
 assert.equal(op.parameterKey,op.parameters);assert.ok(Object.isFrozen(op)&&Object.isFrozen(op.scope));
 const dated=paperOperation(state,review,'paper-bind-0001',{scheduledAt:'2026-11-02T13:14:00+08:00'});
 assert.notEqual(dated.scheduledAt,op.scheduledAt);
});

test('a review and a naked boolean cannot replace explicit consent and independent red verification',()=>{
 const state=setup(),review=reviewTrade(state,input()),before=financial(state);
 assert.throws(()=>executePaperTrade(state,review,'paper-bare-0001',{now:NOW,verified:true}),e=>e.code==='authorization_required');
 assert.equal(financial(state),before);
 const packet=reviewed(state,'paper-red-0001');assert.equal(packet.grant.level,'red');
 assert.throws(()=>run(state,packet,{verified:true}),e=>e.code==='verification_required');assert.equal(financial(state),before);
 const challenge=beginChallenge(state,packet.operation,{grantId:packet.grant.grantId,now:NOW});
 assert.equal(verifyChallenge(state,{challengeId:challenge.id,verified:true,source:USER,now:NOW}).ok,false);
 assert.equal(financial(state),before);
 assert.equal(verifyChallenge(state,{challengeId:challenge.id,code:DEMO_VERIFICATION_CODE,source:USER,now:NOW}).ok,true);
 const result=run(state,packet);assert.equal(result.status,'completed');assert.equal(state.balance,46000);
 assert.equal(state.safety.executions[paperExecutionId(packet.id)].result.receipt,result.receipt);
});

test('manual pause, safety lock and a newer host epoch block new paper writes',()=>{
 for(const mode of ['paused','locked','host-epoch','host-lock','host-pause']){
  const state=setup(),packet=verified(state,reviewed(state,'paper-block-'+mode)),before=financial(state),options={};
  if(mode==='paused')state.paused=true;
  if(mode==='locked')lockSafety(state,'test_lock',{now:NOW});
  if(mode==='host-epoch')options.currentEpoch=state.safety.epoch+1;
  if(mode==='host-lock')options.currentLocked=true;
  if(mode==='host-pause')options.currentPaused=true;
  assert.throws(()=>run(state,packet,options),e=>['paused','locked','epoch_changed'].includes(e.code));
  assert.equal(financial(state),before);
 }
});

test('pause invalidation and parameter changes require a fresh grant rather than replaying a ready quote',()=>{
 const state=setup(),packet=verified(state,reviewed(state,'paper-stale-0001')),before=financial(state);
 invalidateSafetyEpoch(state,'manual_pause',{now:NOW});
 assert.throws(()=>run(state,packet),e=>['epoch_changed','authorization_required'].includes(e.code));assert.equal(financial(state),before);
 const next=verified(state,reviewed(state,'paper-stale-0002'));
 const changed={...next.review,quantity:50,amountMinor:200000};changed.fingerprint=paperReviewFingerprint(changed);
 assert.throws(()=>executePaperTrade(state,changed,next.id,{grantId:next.grant.grantId,now:NOW}),e=>e.code==='stale_binding');
 assert.equal(financial(state),before);
});

test('a completed same-request replay is read-only after reload and lock; a changed replay is rejected',()=>{
 let state=setup();const packet=verified(state,reviewed(state,'paper-replay-0001')),first=run(state,packet);
 state=JSON.parse(JSON.stringify(state));state.paused=true;lockSafety(state,'test_lock',{now:NOW});
 const before=JSON.stringify(state);
 assert.deepEqual(executePaperTrade(state,packet.review,packet.id),first);assert.equal(JSON.stringify(state),before);
 const changed={...packet.review,quantity:50,amountMinor:200000};changed.fingerprint=paperReviewFingerprint(changed);
 assert.throws(()=>executePaperTrade(state,changed,packet.id),/参数已变化/);
 assert.throws(()=>executePaperTrade(state,packet.review,packet.id,{scheduledAt:'2026-11-03T00:00:00+08:00'}),/参数已变化/);
 assert.equal(state.ledger.filter(row=>row.id==='paper-trade:'+packet.id).length,1);
});

test('an existing pending execution cannot be submitted again or manufacture a portfolio receipt',()=>{
 const state=setup(),packet=verified(state,reviewed(state,'paper-pending-0001')),before=financial(state);
 acquireExecution(state,packet.operation,{grantId:packet.grant.grantId,executionId:paperExecutionId(packet.id),now:NOW});
 assert.throws(()=>run(state,packet),/执行记录已存在/);assert.equal(financial(state),before);
});

test('a future explicit execution time stays gated until due and remains in its receipt binding',()=>{
 const scheduledAt='2026-11-02T09:01:00+08:00',state=setup();
 const packet=verified(state,reviewed(state,'paper-due-0001',{}, {scheduledAt})),before=financial(state);
 assert.throws(()=>run(state,packet),e=>e.code==='not_due');assert.equal(financial(state),before);
 const result=run(state,packet,{now:NOW+60000});assert.equal(result.scheduledAt,scheduledAt);
});

test('holding collapse remains local while buy/sell input and consent move to the Bot host',async()=>{
 const originalDocument=globalThis.document,slots=new Map([['trade-600036',{innerHTML:''}]]),attrs=new Map(),inputs=[];
 globalThis.document={getElementById:id=>slots.get(id)||null,querySelector:()=>({setAttribute:(key,value)=>attrs.set(key,value)})};
 try{
  const ui=createInvestmentUI({state:{epoch:0},prefs:{mask:false},esc:String,money:String,icon:()=>'',finance:{},render(){},modal(){throw Error('unexpected modal');},closeSheet(){},loading:()=>'',
   paper:{get:async()=>({...baseline,total_cost:'8019.84',market_value:'8354.00',pnl:'334.16',pnl_pct:4.2}),profile:()=>({ready:false}),requestInline:input=>inputs.push(input)}});
  await ui.pages.investment(()=>{});
  ui.actions['paper-holding']({dataset:{code:'600036'}});
  assert.equal(attrs.get('aria-expanded'),'true');assert.match(slots.get('trade-600036').innerHTML,/paper-inline-trade/);assert.doesNotMatch(slots.get('trade-600036').innerHTML,/<input/);assert.equal(inputs.length,0);
  ui.actions['paper-holding']({dataset:{code:'600036'}});assert.equal(attrs.get('aria-expanded'),'false');assert.equal(slots.get('trade-600036').innerHTML,'');
  ui.actions['paper-holding']({dataset:{code:'600036'}});
  await ui.actions['paper-inline-trade']({dataset:{code:'600036',side:'sell'}});
  assert.equal(inputs.length,1);assert.equal(inputs[0].side,'sell');assert.equal(inputs[0].code,'600036');assert.equal(inputs[0].quantity,'100');assert.equal(inputs[0].referencePrice,41.77);assert.equal(inputs[0].quoteDate,'2026-10-23');assert.equal(inputs[0].source.investment,'holdings');assert.ok(inputs[0].requestId);
  await ui.pages.investment(()=>{});ui.actions['paper-holding']({dataset:{code:'600036'}});
  assert.equal(attrs.get('aria-expanded'),'true');assert.equal(inputs.length,1);
  await ui.actions['paper-stock-buy']({dataset:{code:'600900',name:'长江电力',price:'29.45',date:'2026-10-23'}});
  assert.equal(inputs.length,2);assert.equal(inputs[1].source.investment,'research');assert.equal(inputs[1].code,'600900');assert.equal(inputs[1].price,'29.45');
 }finally{globalThis.document=originalDocument;}
});
