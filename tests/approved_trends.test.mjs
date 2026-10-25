import test from 'node:test';import assert from 'node:assert/strict';import {cumulativeTrend,nearestTrendIndex,createApprovedTrends} from '../AI_accounting_agent/frontend/liquid-glass/approved-trends.js';
const trend=[{period:'2026-10-01',gross_expense_minor:100,gross_income_minor:0,bill_ids:[1]},{period:'2026-10-02',gross_expense_minor:0,gross_income_minor:0,bill_ids:[]},{period:'2026-10-03',gross_expense_minor:200,gross_income_minor:500,bill_ids:[2,3]}];const d={trend,totals:{gross_expense_minor:300,gross_income_minor:500,net_cashflow_minor:200}};
test('exact accumulation ends at period totals and preserves inactive days',()=>{assert.deepEqual(cumulativeTrend(trend).map(p=>p.cumulative_minor),[100,100,300]);assert.deepEqual(cumulativeTrend(trend,'income').map(p=>p.cumulative_minor),[0,0,500]);assert.equal(cumulativeTrend(trend)[1].active,false);assert.throws(()=>cumulativeTrend([{gross_expense_minor:0.1}]),TypeError);});
test('nearest chart selection clamps and matches chip indices',()=>{assert.equal(nearestTrendIndex(.5,3),1);assert.equal(nearestTrendIndex(-1,3),0);assert.equal(nearestTrendIndex(2,3),2);assert.equal(nearestTrendIndex(0,0),-1);});
test('view shares selected state, real metric, no duplicate ledger, safe empty and mask',()=>{
 const state={productAnalysisPoint:1},prefs={};
 const app=createApprovedTrends({state,prefs,money:n=>'CNY'+n,esc:String});
 let html=app.html(d);
 assert.doesNotMatch(html,/ap-t-dates|pa-point-select/);assert.match(html,/data-trend-guide/);
 assert.match(html,/data-trend-date datetime="2026-10-02"/);
 assert.match(html,/data-action="pa-trend-metric" data-metric="income"/);
 // Selection is now mounted by charts-interaction; the legacy delegated click action must stay absent.
 assert.match(html,/role="slider"/);
 assert.match(html,/aria-valuenow="1"/);
 assert.match(html,/data-chart-trend data-count="3"/);
 assert(!html.includes('data-action="pa-trend-chart"'));
 // A single explicit detail control follows the selected point, rather than navigating on initial touch.
 assert.equal((html.match(/data-action="pa-point-ledger"/g)||[]).length,1);
 assert.match(html,/data-action="pa-point-ledger" data-point-index="1"/);
 assert.match(html,/ L160 /);
 assert.match(html,/data-trend-value[^>]*>CNY1/);
 state.productAnalysisMetric='income';html=app.html(d);
 assert(html.includes('累计收入'));
 assert(html.includes('CNY5'));
 assert.match(html,/data-trend-value[^>]*>CNY0/);
 prefs.mask=true;html=app.html(d);
 assert(!html.includes('ap-t-chart"'));
 assert(!html.includes('CNY5'));
 assert(!html.includes('data-chart-trend'));
 assert(!html.includes('data-action="pa-trend-chart"'));
 assert.throws(()=>app.html({...d,totals:{...d.totals,gross_income_minor:501}}),RangeError);
 prefs.mask=false;html=app.html({trend:[],totals:{gross_income_minor:0,gross_expense_minor:0,net_cashflow_minor:0}});
 assert.match(html,/data-chart-trend data-count="0"/);
 assert(!html.includes('data-action="pa-point-ledger"'));
 assert(!html.includes('NaN'));
});
