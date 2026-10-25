import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProductInvestment} from '../AI_accounting_agent/frontend/liquid-glass/product-investment.js';

function fixture(holdings=[]){
 let html='',dialog;const routes=[],requests=[];
 const app=createProductInvestment({state:{epoch:1},prefs:{mask:false},
  finance:async(path,options)=>{requests.push({path,options});return {holdings,allocation:[],total_cost:100,quote_quality:'unavailable'};},
  esc:String,money:String,icon:name=>`<svg data-icon="${name}"></svg>`,loading:()=>'',
  go:route=>routes.push(route),modal:(title,body)=>{dialog={title,body};},closeSheet(){},render(){}});
 return {app,routes,requests,paint:value=>{html=value;},get html(){return html;},get dialog(){return dialog;}};
}

test('empty holdings retain add/import and concise grouped secondary links',async()=>{
 const f=fixture();await f.app.pages.investment(f.paint);
 assert.match(f.html,/还未添加持仓/);
 for(const action of ['fp-invest-add','fp-invest-import','fp-invest-research','fp-invest-bank','fp-invest-more'])assert.match(f.html,new RegExp(`data-action="${action}"`));
 assert.match(f.html,/<span>历史研究<\/span><svg data-icon="next"><\/svg>/);
 assert.match(f.html,/<span>银行理财<\/span><svg data-icon="next"><\/svg>/);
 assert.doesNotMatch(f.html,/历史投研记录/);
 assert.match(f.html,/class="fp-invest-button fp-invest-text fp-invest-more" data-action="fp-invest-more"/);
 assert.deepEqual(f.requests,[{path:'/positions',options:undefined}]);
});

test('existing secondary destinations and more actions are unchanged with holdings',async()=>{
 const f=fixture([{id:'p1',name:'原有持仓',code:'001',asset_class:'fund',quantity:'1',total_cost:100,as_of:'2026-10-23'}]);
 await f.app.pages.investment(f.paint);assert.match(f.html,/原有持仓/);
 f.app.actions['fp-invest-research']();f.app.actions['fp-invest-bank']();
 assert.deepEqual(f.routes,['research','holdings']);
 f.app.actions['fp-invest-more']();assert.equal(f.dialog.title,'投资工具');
 for(const action of ['fp-invest-assets','fp-invest-risk','journey-profile'])assert.match(f.dialog.body,new RegExp(`data-action="${action}"`));
 assert.match(f.html,/data-action="fp-invest-add"/);assert.match(f.html,/data-action="fp-invest-import"/);
});

test('secondary layout has two columns, separate more and 44px single-line 14px controls',async()=>{
 const css=await readFile(new URL('../AI_accounting_agent/frontend/liquid-glass/product-investment.css',import.meta.url),'utf8');
 assert.match(css,/\.fp-invest-secondary\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 const control=/\.fp-invest-secondary>\.fp-invest-button\{([^}]+)\}/.exec(css)[1];
 for(const rule of ['min-height:44px','font-size:14px','white-space:nowrap'])assert(control.includes(rule));
 assert.match(css,/\.fp-invest-secondary>\.fp-invest-more\{grid-column:1\/-1;justify-self:center\}/);
 assert.match(css,/\.fp-invest-secondary>\.fp-invest-button>span\{white-space:nowrap\}/);
});
