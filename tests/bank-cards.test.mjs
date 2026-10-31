import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {bankCardState,prepareCardChange,prepareCardReminder,setCardPaused,setCardReminder,createBankCards,DEMO_BANK_CARDS} from '../web/bank-cards.mjs';
import {riskProfile} from '../web/investment-state.mjs';
test('bank cards contain only masked tails and synthetic credit facts',()=>{assert.equal(DEMO_BANK_CARDS.length,3);for(const c of DEMO_BANK_CARDS)assert.match(c.tail,/^\d{4}$/);assert.equal(DEMO_BANK_CARDS[2].dueMinor,128000);});
const pause=(state,id,value,options={})=>{const ticket=prepareCardChange(state,id,value,options);return {ticket,result:setCardPaused(state,id,value,{...options,ticket})};};
const remind=(state,value)=>{const ticket=prepareCardReminder(state,'credit',value);return setCardReminder(state,'credit',value,{ticket});};
const safety=state=>state.safety||=( {epoch:0,locked:false} );

test('card pause is an idempotent set, preserves cash and serializes independently per card',()=>{
 let s=fresh();const cash=s.balance,{ticket,result}=pause(s,'salary',true,{expected:false});
 const once=structuredClone(s);assert.deepEqual(setCardPaused(s,'salary',true,{expected:false,ticket}),result);assert.deepEqual(s,once);
 pause(s,'living',true,{expected:false});assert.equal(s.cardLocked,true);s=JSON.parse(JSON.stringify(s));
 assert.equal(bankCardState(s,'salary').paused,true);pause(s,'living',false,{expected:true});
 assert.equal(s.cardLocked,false);assert.equal(bankCardState(s,'salary').paused,true);assert.equal(s.balance,cash);
});
test('stale change and invalid card cannot affect state; reminder is not repayment',()=>{
 const s=fresh();pause(s,'credit',true);const before=structuredClone(s);
 assert.throws(()=>prepareCardChange(s,'credit',false,{expected:false}));assert.throws(()=>prepareCardChange(s,'missing',true));assert.deepEqual(s,before);
 remind(s,false);assert.equal(bankCardState(s,'credit').reminder,false);assert.equal(bankCardState(s,'credit').dueMinor,128000);assert.equal(s.balance,50000);
 assert.throws(()=>prepareCardReminder(s,'living',true));
});
test('risk buffer reserves known card bill without inventing a repayment or unknown debts',()=>{const s=fresh(),p=riskProfile(s);assert.equal(p.knownDebtMinor,0);assert.equal(p.liabilities,'unknown');assert.equal(p.bufferMonths,p.cashMinor/p.essentialMinor);s.bankCards={credit:{}};assert.equal(riskProfile(s).knownDebtMinor,128000);assert.equal(s.balance,50000);assert.equal(s.ledger.filter(r=>r.kind==='credit-repayment').length,0);});

test('naked setters cannot bypass preparation, even with a boolean verified flag',()=>{
 const s=fresh(),before=structuredClone(s);
 for(const options of [{},{verified:true}]){
  assert.throws(()=>setCardPaused(s,'living',true,options),e=>e.code==='stale_write');
  assert.throws(()=>setCardReminder(s,'credit',false,options),e=>e.code==='stale_write');
 }
 assert.deepEqual(s,before);
});
test('locked or paused controls cannot change cards, reminders, or global safety',()=>{
 for(const mode of ['locked','paused']){
  const s=fresh();pause(s,'living',true);const card=prepareCardChange(s,'living',false),reminder=prepareCardReminder(s,'credit',false);
  if(mode==='locked'){safety(s).locked=true;safety(s).epoch++;}else s.paused=true;
  const before=structuredClone(s);
  assert.throws(()=>setCardPaused(s,'living',false,{ticket:card}),e=>e.code===mode);
  assert.throws(()=>setCardReminder(s,'credit',false,{ticket:reminder}),e=>e.code===mode);
  assert.throws(()=>setCardPaused(s,'living',false),e=>e.code===mode);
  assert.throws(()=>prepareCardChange(s,'salary',true),e=>e.code===mode);
  assert.throws(()=>prepareCardReminder(s,'credit',false),e=>e.code===mode);
  assert.equal(bankCardState(s,'living').paused,true);assert.deepEqual(s,before);
 }
});
test('recovery invalidates old tickets and reads never renew them',()=>{
 const s=fresh();pause(s,'living',true);const ticket=prepareCardChange(s,'living',false);
 safety(s).locked=true;safety(s).epoch++;s.safety.locked=false;
 const before=structuredClone(s);bankCardState(s,'living');assert.deepEqual(s,before);
 assert.throws(()=>setCardPaused(s,'living',false,{ticket}),e=>e.code==='stale_write');assert.deepEqual(s,before);
 pause(s,'living',false);assert.equal(s.cardLocked,false);assert.equal(s.safety.epoch,1);
});
test('bound card, value, and expected state cannot be replaced after preparation',()=>{
 const s=fresh(),ticket=prepareCardChange(s,'living',true),reminder=prepareCardReminder(s,'credit',false),before=structuredClone(s);
 assert.throws(()=>setCardPaused(s,'salary',true,{ticket}),e=>e.code==='stale_binding');
 assert.throws(()=>setCardPaused(s,'living',false,{ticket}),e=>e.code==='stale_binding');
 assert.throws(()=>setCardPaused(s,'living',true,{ticket,expected:true}),e=>e.code==='stale_binding');
 assert.throws(()=>setCardReminder(s,'credit',true,{ticket:reminder}),e=>e.code==='stale_binding');assert.deepEqual(s,before);
});
test('old receipt replay is read-only and cannot undo a later card change',()=>{
 const s=fresh(),first=pause(s,'living',true);pause(s,'living',false);const before=structuredClone(s);
 assert.deepEqual(setCardPaused(s,'living',true,{ticket:first.ticket}),first.result);
 assert.equal(s.cardLocked,false);assert.deepEqual(s,before);
 safety(s).locked=true;assert.throws(()=>setCardPaused(s,'living',true,{ticket:first.ticket}),e=>e.code==='locked');
});
test('intervening card revision invalidates pending confirmations, including ABA changes',()=>{
 const s=fresh(),pending=prepareCardChange(s,'living',true);pause(s,'living',true);pause(s,'living',false);
 const before=structuredClone(s);assert.throws(()=>setCardPaused(s,'living',true,{ticket:pending}));assert.deepEqual(s,before);
 const reminder=prepareCardReminder(s,'credit',false);pause(s,'credit',true);
 assert.throws(()=>setCardReminder(s,'credit',false,{ticket:reminder}));assert.equal(bankCardState(s,'credit').reminder,true);
});
test('pending UI confirmation reads current safety and cannot resume a locked living card',()=>{
 const prior=globalThis.document;globalThis.document={querySelector:()=>null};
 try{
  const s=fresh();pause(s,'living',true);let saves=0;
  const ui=createBankCards({getState:()=>s,save:()=>saves++,esc:x=>x,money:x=>String(x),icon:()=>'',onLedger:()=>{}});
  ui.actions['bank-card-select']({dataset:{card:'living'}});ui.actions['bank-card-pause']();
  const version=ui.html().match(/data-version="([^"]+)"/)[1];safety(s).locked=true;safety(s).epoch++;const before=structuredClone(s);
  assert.throws(()=>ui.actions['bank-card-confirm']({dataset:{card:'living',version}}),e=>e.code==='locked');
  assert.equal(saves,0);assert.equal(s.cardLocked,true);assert.deepEqual(s,before);
 }finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
});
