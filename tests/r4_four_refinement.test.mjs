import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApprovedOverview} from '../AI_accounting_agent/frontend/liquid-glass/approved-overview.js';
import {createApprovedTrends,cumulativeTrend} from '../AI_accounting_agent/frontend/liquid-glass/approved-trends.js';
import {STOCK_LOGOS,stockIdentity} from '../AI_accounting_agent/frontend/liquid-glass/stock-identity.js';
const base=new URL('../AI_accounting_agent/frontend/liquid-glass/',import.meta.url);
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const money=n=>'¥'+Number(n).toFixed(2);
const data={totals:{gross_expense_minor:16466,gross_income_minor:20000,net_cashflow_minor:3534,refund_minor:0,net_expense_minor:16466},expense_categories:[{category:'餐饮',amount_minor:10000},{category:'出行',amount_minor:6466}],trend:[{period:'2026-11-01',gross_expense_minor:10000,gross_income_minor:0},{period:'2026-11-02',gross_expense_minor:0,gross_income_minor:0},{period:'2026-11-03',gross_expense_minor:6466,gross_income_minor:20000}]};
test('selection uses one visible capsule with category, amount and percentage; no center text',()=>{
 const html=createApprovedOverview({state:{productAnalysisFocus:'出行'},prefs:{},esc,money,icon:k=>`<svg data-icon="${k}"></svg>`,categoryColor:()=> 'var(--blue9)'}).html(data);
 const center=html.split('<span class="ap-o-center">')[1].split('</span></div>')[0];assert(!center.includes('¥'));assert(!center.includes('出行'));assert(!html.includes('data-chart-center-label'));assert(!html.includes('ap-o-selection'));
 assert.match(html,/data-chart-card-label>出行/);assert.match(html,/data-chart-card-amount>¥64.66/);assert.match(html,/data-chart-card-percent>39.3%/);assert.equal((html.match(/data-chart-detail/g)||[]).length,1);
});
test('privacy masks the capsule and removes financial ring sectors',()=>{
 const html=createApprovedOverview({state:{},prefs:{mask:true},esc,money,icon:()=>'',categoryColor:()=> 'blue'}).html(data);assert(!html.includes('¥'));assert(!html.includes('class="ap-o-sector"'));
});
test('trend selection uses the same true cumulative point for amount and date, without date scroller',()=>{
 assert.deepEqual(cumulativeTrend(data.trend).map(x=>x.cumulative_minor),[10000,10000,16466]);
 const html=createApprovedTrends({state:{productAnalysisPoint:1},esc,money}).html(data);assert.match(html,/data-trend-value[^>]*>¥100.00/);assert.match(html,/data-trend-date datetime="2026-11-02"/);assert.match(html,/data-trend-guide/);assert.match(html,/aria-valuenow="1"/);assert(!html.includes('ap-t-dates'));assert(!html.includes('pa-point-select'));assert.match(html,/data-point-index="1"/);
});
test('income, boundary points, empty and masked trends keep honest values',()=>{
 for(const i of [0,2]){const html=createApprovedTrends({state:{productAnalysisMetric:'income',productAnalysisPoint:i},esc,money}).html(data);assert.match(html,new RegExp('datetime="2026-11-0'+(i+1)+'"'));assert(html.includes(i===0?'¥0.00':'¥200.00'));assert(html.includes('left:clamp('));}
 const masked=createApprovedTrends({state:{},prefs:{mask:true},esc,money}).html(data);assert(!masked.includes('data-chart-trend'));assert(!masked.includes('¥'));
 const empty=createApprovedTrends({state:{},esc,money}).html({totals:{gross_expense_minor:0,gross_income_minor:0,net_cashflow_minor:0},trend:[]});assert(!empty.includes('NaN'));assert(!empty.includes('data-trend-guide'));assert(!empty.includes('pa-point-ledger'));
 assert.throws(()=>createApprovedTrends({state:{},esc,money}).html({...data,totals:{...data.totals,gross_expense_minor:1}}),RangeError);
});
test('ten local real logo files are present with recorded hashes and safe paths',async()=>{
 const manifest=JSON.parse(await readFile(new URL('assets/company-logos/MANIFEST.json',base),'utf8'));assert.equal(Object.keys(STOCK_LOGOS).length,10);
 for(const [code,[name,file]] of Object.entries(STOCK_LOGOS)){assert(/^[0-9]{6}\.(png|svg)$/.test(file));const bytes=await readFile(new URL('assets/company-logos/'+file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[file]);const html=stockIdentity(code);assert(html.includes('data-company-logo="'+code+'"'));assert(html.includes('assets/company-logos/'+file));assert(!html.includes('http'));assert(name.length>0);}
 assert.equal(stockIdentity('unknown'),'');assert(!stockIdentity('600036<script>').includes('<script>'));assert.equal(manifest.official_site_assets,10);assert.equal(manifest.third_party_hosted_asset,null);assert(manifest.rights_notice.includes('does not grant commercial reuse rights'));
});
