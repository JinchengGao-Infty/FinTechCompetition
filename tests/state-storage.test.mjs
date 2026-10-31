import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,createTask,transition,applyConsequences} from '../web/engine.mjs';
import {financialFacts,ledgerView} from '../web/finance-state.mjs';
import {encodeAppState,decodeAppState} from '../web/state-storage.mjs';
import {ensurePaperPortfolio,reviewTrade,executePaperTrade} from '../web/investment-state.mjs';
import {paperOperation,paperExecutionId} from '../web/paper-safety.mjs';
import {authorizeSafety,beginChallenge,verifyChallenge,DEMO_VERIFICATION_CODE} from '../web/safety-policy.mjs';
const ordered=s=>[...s.ledger].sort((a,b)=>a.id.localeCompare(b.id));
function executeReviewedPaperFixture(state,review,requestId){
 const now=Date.now(),source={kind:'user',method:'click'},operation=paperOperation(state,review,requestId);
 const grant=authorizeSafety(state,operation,{source,now}),challenge=beginChallenge(state,operation,{grantId:grant.grantId,now});
 assert.equal(verifyChallenge(state,{challengeId:challenge.id,code:DEMO_VERIFICATION_CODE,source,now}).ok,true);
 return executePaperTrade(state,review,requestId,{grantId:grant.grantId,now});
}
test('bundled year round-trips exactly at less than a tenth of duplicated storage',()=>{const s=fresh(),raw=encodeAppState(s),back=decodeAppState(raw);assert.ok(raw.length<JSON.stringify(s).length/10);assert.deepEqual(ordered(back),ordered(s));assert.deepEqual(financialFacts(back),financialFacts(s));assert.deepEqual(ledgerView(back),ledgerView(s));});
test('edited, deleted, annotated and manual history survive compact reload',()=>{const s=fresh(),h=s.ledger.filter(r=>r.id.startsWith('history:'));h[0].amountMinor+=1;h[1].note='manual annotation';const deleted=h[2].id;s.ledger=s.ledger.filter(r=>r.id!==deleted);s.ledger.push({id:'manual',date:'2026-10-28',title:'手工账单',amountMinor:12345,direction:'expense',category:'其他',movement:'cashflow',order:99999});const back=decodeAppState(encodeAppState(s));assert.deepEqual(ordered(back),ordered(s));assert.equal(back.ledger.some(r=>r.id===deleted),false);});
test('task and paper receipts persist once and never debit twice on repeated restore',()=>{
 const s=fresh(),t=createTask(s,'travel');
 transition(s,t.id,'grant');transition(s,t.id,'confirm',{source:{kind:'user',method:'click'},revision:t.revision});transition(s,t.id,'complete');applyConsequences(s,t);
 ensurePaperPortfolio(s,{revision:1,holdings:[]});
 const review=reviewTrade(s,{code:'600036',name:'招商银行',side:'buy',quantity:10,price:'41.77',quoteDate:'2026-10-23'}),requestId='compact-paper-001';
 const receipt=executeReviewedPaperFixture(s,review,requestId);
 let back=decodeAppState(encodeAppState(s));back=decodeAppState(encodeAppState(back));
 assert.equal(back.balance,49582.3);assert.equal(back.paperPortfolio.trades.length,1);assert.equal(back.ledger.filter(r=>r.id==='paper-trade:'+requestId).length,1);assert.deepEqual(back.tasks,s.tasks);
 assert.equal(back.safety.executions[paperExecutionId(requestId)].status,'completed');
 assert.equal(back.safety.executions[paperExecutionId(requestId)].result.receipt,receipt.receipt);
 const before=encodeAppState(back);assert.deepEqual(executePaperTrade(back,review,requestId),receipt);assert.equal(encodeAppState(back),before);
});
