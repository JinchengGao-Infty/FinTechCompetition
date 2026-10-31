import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../web/engine.mjs';
import {createBankCards} from '../web/bank-cards.mjs';

function fixture(state=fresh()) {
 let saves=0;
 const ui=createBankCards({getState:()=>state,save:()=>saves++,esc:String,money:n=>String(n),icon:()=>'',onLedger(){}});
 return {state,ui,saves:()=>saves};
}
function withDocument(fn) {
 const previous=globalThis.document;
 globalThis.document={querySelector:()=>null};
 try {fn();} finally {globalThis.document=previous;}
}
const confirmation=ui=>({dataset:{version:ui.html().match(/data-action="bank-product-confirm" data-version="([^"]+)"/)[1]}});

test('new wallet exposes application beside its heading, ahead of the full card stack',()=>{
 const {ui}=fixture(),html=ui.html();
 assert.match(html,/>2张<\/span>/);
 assert.ok(html.indexOf('data-action="bank-card-apply"')<html.indexOf('class="bank-wallet-stack"'));
 assert.doesNotMatch(html,/管理信用卡|信用卡 0921 已开通/);
});

test('cancelled application leaves two cards, and its late confirmation cannot create a card',()=>withDocument(()=>{
 const {state,ui,saves}=fixture(),before=structuredClone(state);
 ui.actions['bank-card-apply']();const old=confirmation(ui),html=ui.html();
 assert.ok(html.indexOf('data-action="bank-product-confirm"')<html.indexOf('class="bank-wallet-stack"'));
 assert.match(html,/data-action="bank-card-apply" disabled/);
 ui.actions['bank-product-cancel']();ui.actions['bank-product-confirm'](old);
 assert.deepEqual(state,before);assert.equal(saves(),0);assert.match(ui.html(),/>2张<\/span>/);
 assert.doesNotMatch(ui.html(),/data-action="bank-card-apply" disabled/);
}));

test('application confirmation makes three cards once; rerender/navigation exposes management without duplicating',()=>withDocument(()=>{
 const {state,ui,saves}=fixture(),cash=state.balance,rows=state.ledger.length;
 ui.actions['bank-card-apply']();const submit=confirmation(ui);
 ui.actions['bank-product-confirm'](submit);ui.actions['bank-product-confirm'](submit);
 assert.equal(saves(),1);assert.equal(state.balance,cash);assert.equal(state.ledger.length,rows);
 const reloaded=fixture(JSON.parse(JSON.stringify(state))).ui;
 assert.match(reloaded.html(),/>3张<\/span>/);assert.match(reloaded.html(),/信用卡 0921 已开通/);
 assert.doesNotMatch(reloaded.html(),/data-action="bank-card-apply"/);
 assert.ok(reloaded.html().indexOf('data-action="bank-card-manage"')<reloaded.html().indexOf('class="bank-wallet-stack"'));
}));

test('management and card face share an actual toggle and switching clears stale panels',()=>withDocument(()=>{
 const state=fresh();state.bankCards={credit:{}};const {ui}=fixture(state);
 ui.actions['bank-card-manage']();assert.match(ui.html(),/data-action="bank-card-manage" aria-expanded="true"/);
 ui.actions['bank-card-manage']();assert.match(ui.html(),/data-action="bank-card-manage" aria-expanded="false"/);
 assert.match(ui.html(),/id="bank-card-details" hidden/);
 ui.actions['bank-card-details']();assert.match(ui.html(),/data-action="bank-card-manage" aria-expanded="true"/);
 ui.actions['bank-card-limit']();assert.match(ui.html(),/bank-product/);
 ui.actions['bank-card-select']({dataset:{card:'living'}});assert.doesNotMatch(ui.html(),/bank-product/);
 ui.actions['bank-card-manage']();assert.match(ui.html(),/bank-card-credit is-front/);
 ui.actions['bank-card-manage']();assert.match(ui.html(),/id="bank-card-details" hidden/);
}));

test('existing legacy credit card remains intact and its visible management entry opens limit controls',()=>withDocument(()=>{
 const state=fresh();state.bankCards={credit:{limitMinor:3000000,reminder:false,paused:true}};
 const before=structuredClone(state),{ui,saves}=fixture(state);
 assert.match(ui.html(),/信用卡 0921 已开通/);assert.doesNotMatch(ui.html(),/data-action="bank-card-apply"/);
 ui.actions['bank-card-manage']();
 assert.match(ui.html(),/bank-card-credit is-front/);assert.match(ui.html(),/data-action="bank-card-limit">调整额度/);
 assert.match(ui.html(),/30000/);assert.deepEqual(state,before);assert.equal(saves(),0);
 ui.actions['bank-card-limit']();assert.match(ui.html(),/id="bank-limit-input"[^>]*value="30000"/);
 ui.actions['bank-product-cancel']();assert.deepEqual(state,before);assert.equal(saves(),0);
}));
