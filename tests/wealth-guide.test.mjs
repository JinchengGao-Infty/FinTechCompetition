import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import * as w from '../web/wealth-guide.mjs';
import * as p from '../web/safety-policy.mjs';
import {resetDemoOnBoot} from '../web/demo-boot.mjs';
const NOW=Date.parse('2026-11-02T01:00:00Z'),USER={kind:'user',method:'click'};
function state(){const s=fresh();p.ensureSafety(s);w.startWealthGuide(s,{now:NOW,id:'test-wealth'});return s;}
function pick(s,v){return w.wealthChoice(s,String(v),{now:NOW,expectedRevision:s.wealthGuide.revision});}
function confirmable(){const s=state();for(const v of ['earn','旅行',500000,'半年','了解基金或理财','可接受小幅亏损','收入稳定但有压力','demo-flex',300000])pick(s,v);return s;}
test('first three choices branch into saving, returns, and guidance without investment',()=>{
 const s=state(),before=s.balance;assert.equal(s.wealthGuide.stage,'direction');pick(s,'unsure');assert.equal(s.wealthGuide.stage,'direction');pick(s,'save');assert.equal(s.wealthGuide.stage,'goal');pick(s,'旅行');pick(s,60000);pick(s,2000);assert.equal(s.wealthGuide.stage,'saving_confirm');assert.equal(s.balance,before);assert.equal(s.wealthSubscriptions,undefined);
});
test('investment uses live data, explicit assessment and leaves unselected products unselected',()=>{const s=state();pick(s,'earn');pick(s,'暂无');pick(s,'随时');assert.equal(s.wealthGuide.stage,'experience');for(const x of ['没有经验','不能接受本金损失','收入不稳定'])pick(s,x);assert.equal(s.wealthRiskProfile.level,1);assert.equal(s.wealthGuide.fields.product_id,undefined);assert.throws(()=>pick(s,'demo-bond'));pick(s,'demo-flex');assert.throws(()=>pick(s,s.wealthGuide.allocation.cash+100));});
test('red challenge required; one confirmed reservation subtracts available funds but no shares',()=>{
 const s=confirmable(),cash=s.balance,invested=s.invested,op=w.wealthOperation(s,{now:NOW});const g=p.authorizeSafety(s,op,{source:USER,now:NOW});assert.equal(g.status,'verification_required');assert.throws(()=>p.acquireExecution(s,op,{grantId:g.grantId,executionId:op.id+':'+op.revision,now:NOW}));
 const challenge=p.beginChallenge(s,op,{grantId:g.grantId,now:NOW});assert.equal(p.verifyChallenge(s,{challengeId:challenge.id,code:'123456',source:USER,now:NOW}).ok,true);
 const permit=p.acquireExecution(s,op,{grantId:g.grantId,executionId:op.id+':'+op.revision,now:NOW});w.postWealthReservation(s,op,permit,{now:NOW});assert.equal(s.balance,cash-3000);assert.equal(s.invested,invested);assert.equal(s.wealthSubscriptions[0].status,'pending');assert.throws(()=>w.postWealthReservation(s,op,permit,{now:NOW}));assert.equal(s.wealthSubscriptions.length,1);
});
test('cancel, changed financial facts, reset and stale choice cannot execute',()=>{
 const s=confirmable(),before=s.balance,revision=s.wealthGuide.revision;assert.throws(()=>w.wealthChoice(s,'cancel',{now:NOW,expectedRevision:revision-1}));w.cancelWealthGuide(s,{now:NOW});assert.throws(()=>w.wealthOperation(s,{now:NOW}));assert.equal(s.balance,before);
 const other=confirmable();other.nativeBudget={'2026-11':{categories:[{category:'住房',limit_minor:999999}]}};assert.throws(()=>w.wealthOperation(other,{now:NOW}));resetDemoOnBoot(other);assert.equal(other.wealthGuide,null);
});
test('valid formal answers can be reused; ledger capacity suggestion is not substituted',()=>{const s=state();s.wealthRiskProfile={source:'self_report',level:2,answers:[1,1,1],expiresAt:NOW+10000};pick(s,'earn');pick(s,'暂无');pick(s,'一年');assert.equal(s.wealthGuide.stage,'products');const t=state();t.wealthRiskProfile={ready:true,level:3};pick(t,'earn');pick(t,'暂无');pick(t,'一年');assert.equal(t.wealthGuide.stage,'experience');});
