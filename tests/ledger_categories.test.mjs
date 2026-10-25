import test from 'node:test';
import assert from 'node:assert/strict';
import {LEDGER_CATEGORIES,categoryIconKey,categoryIconSVG,categoryBadgeStyle} from '../AI_accounting_agent/frontend/liquid-glass/category-icons.js';
import {createApprovedLedger} from '../AI_accounting_agent/frontend/liquid-glass/approved-ledger.js';
const esc=x=>String(x??'').replaceAll('"','&quot;').replaceAll('<','&lt;');
test('all ledger categories have native semantic glyphs and official palette; fallback remains meaningful',()=>{
 assert.equal(LEDGER_CATEGORIES.length,18);
 for(const c of LEDGER_CATEGORIES){assert.ok(categoryIconSVG(categoryIconKey(c)));assert.match(categoryBadgeStyle(c),/--category-ink:var\(--\w+11\);--category-bg:var\(--\w+3\)/);}
 assert.equal(categoryBadgeStyle('交通'),categoryBadgeStyle('出行'));assert.equal(categoryIconKey('新分类'),categoryIconKey('其他'));
});
test('scroll strip includes every category and explicit pressed states without truncated labels',()=>{
 const state={month:'2026-11',filter:{category:'保险'}},v=createApprovedLedger({state,prefs:{mask:false},esc,money:String,icon:k=>`<svg data-key="${k}"></svg>`}),html=v.shell();
 assert.equal((html.match(/data-action="fp-ledger-category"/g)||[]).length,19);
 assert.ok(html.includes('data-value="保险"'));assert.ok(html.includes('role="group"'));assert.ok(!html.includes('…'));
 const selected=html.match(/<button[^>]*data-value="保险"[^>]*>/)[0];assert.ok(selected.includes('aria-pressed="true"'));
});
