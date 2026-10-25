import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedOverview} from './approved-overview.js';
import {createApprovedTrends,cumulativeTrend} from './approved-trends.js';
import {mountChartsInteraction} from './charts-interaction.js';
const money=n=>'¥'+n.toFixed(2),esc=s=>String(s).replaceAll('"','&quot;');
const data={totals:{gross_expense_minor:748711,gross_income_minor:1375263,net_cashflow_minor:626552},expense_categories:[{category:'餐饮',amount_minor:6400},{category:'购物',amount_minor:742311}],trend:[{period:'2026-10-01',gross_expense_minor:6400,gross_income_minor:0},{period:'2026-10-02',gross_expense_minor:742311,gross_income_minor:1375263}]};
test('overview keeps totals and category interaction separate from ledger navigation',()=>{const html=createApprovedOverview({state:{},prefs:{},money,esc,icon:()=>'',categoryColor:()=> '#258b70'}).html(data);assert.match(html,/¥7487.11/);assert.match(html,/¥13752.63/);assert.equal((html.match(/class="ap-o-sector"/g)||[]).length,2);assert.match(html,/data-chart-value="¥64.00"/);assert.equal((html.match(/data-action="pa-category"/g)||[]).length,1);assert.match(html,/data-chart-detail/);});
test('trend uses exact accumulated DTO values and exposes a keyboard slider and explicit drill',()=>{assert.deepEqual(cumulativeTrend(data.trend).map(p=>p.cumulative_minor),[6400,748711]);const html=createApprovedTrends({state:{},money,esc}).html(data);assert.match(html,/role="slider"/);assert.match(html,/data-point-index="1"/);assert.match(html,/¥7487.11/);assert.doesNotMatch(html,/data-action="pa-trend-chart"/);assert.doesNotMatch(html,/<g transform/);});
test('trend rejects incoherent aggregate totals',()=>{assert.throws(()=>createApprovedTrends({state:{},money,esc}).html({...data,totals:{...data.totals,gross_expense_minor:1}}),/disagree/);});
test('privacy mode excludes chart categories and trend geometry',()=>{const html=createApprovedTrends({state:{},prefs:{mask:true},money,esc}).html(data);assert.doesNotMatch(html,/data-chart-trend/);assert.doesNotMatch(html,/¥/);});
test('interaction cleanup aborts all scoped listeners',()=>{let signal;const root={querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(type,fn,opts)=>{signal=opts.signal;}};const cleanup=mountChartsInteraction(root);assert.equal(signal.aborted,false);cleanup();assert.equal(signal.aborted,true);cleanup();});
function interactionHarness(){
 const callbacks={},nodes=['餐饮','购物'].map(category=>({dataset:{chartCategory:category,chartValue:'¥64.00'},attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
 const tooltip={},detail={dataset:{},setAttribute(){}};
 const root={querySelectorAll:()=>nodes,querySelector:s=>s==='[data-chart-tooltip]'?tooltip:s==='[data-chart-detail]'?detail:null,addEventListener:(type,fn,opts)=>{callbacks[type]=event=>{if(!opts.signal.aborted)fn(event);};}};
 const cleanup=mountChartsInteraction(root);
 const fire=(type,node,extra={})=>{let prevented=false;callbacks[type]({target:{closest:()=>node},preventDefault(){prevented=true;},...extra});return prevented;};
 return {nodes,tooltip,detail,cleanup,fire};
}
test('hover, touch click, focus, and Enter select actual category without navigation',()=>{
 const h=interactionHarness();h.fire('pointerover',h.nodes[0],{pointerType:'mouse'});assert.equal(h.detail.dataset.category,'餐饮');assert.equal(h.tooltip.textContent,'餐饮 · ¥64.00');
 assert.equal(h.fire('click',h.nodes[1],{pointerType:'touch'}),true);assert.equal(h.nodes[1].attributes['aria-pressed'],'true');assert.equal(h.nodes[0].attributes['aria-pressed'],'false');
 h.fire('focusin',h.nodes[0]);assert.equal(h.detail.dataset.category,'餐饮');assert.equal(h.fire('keydown',h.nodes[1],{key:'Enter'}),true);assert.equal(h.detail.dataset.category,'购物');
 h.cleanup();h.fire('click',h.nodes[0]);assert.equal(h.detail.dataset.category,'购物');
});
test('pending trend updates are coalesced and canceled during repaint',()=>{
 const callbacks={},frames=new Map();let next=0,updates=[];
 globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const chart={dataset:{count:'3'},getBoundingClientRect:()=>({left:0,width:320}),getAttribute:()=> '1',setPointerCapture(){},addEventListener:(name,fn,opts)=>{callbacks[name]=event=>{if(!opts.signal.aborted)fn(event);};}};
 const root={querySelector:s=>s==='[data-chart-trend]'?chart:null,querySelectorAll:()=>[],addEventListener(){}};
 const cleanup=mountChartsInteraction(root,{onSelectTrend:i=>updates.push(i)});
 callbacks.keydown({key:'End',preventDefault(){}});callbacks.keydown({key:'Home',preventDefault(){}});assert.equal(frames.size,1);for(const fn of frames.values())fn();frames.clear();assert.deepEqual(updates,[0]);
 callbacks.pointerdown({button:0,pointerId:1,clientX:100,clientY:20});callbacks.pointercancel({});callbacks.pointerup({pointerId:1,clientX:310,clientY:20});assert.equal(frames.size,0);
 callbacks.pointerdown({button:0,pointerId:2,clientX:100,clientY:20});callbacks.pointerup({pointerId:2,clientX:310,clientY:20});assert.equal(frames.size,1);cleanup();assert.equal(frames.size,0);assert.deepEqual(updates,[0]);
 delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;
});
test('both page styles disable interaction animation for reduced motion',async()=>{const {readFile}=await import('node:fs/promises');for(const name of ['approved-overview.css','approved-trends.css']){const css=await readFile(new URL(name,import.meta.url),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/transition:none/);}});
