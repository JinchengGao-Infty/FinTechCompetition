import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {appURL,appStateKey,demoResetKeys,deviceScale} from '../web/desktop-session.mjs';
const entry=readFileSync(new URL('../web/entry.js',import.meta.url),'utf8');
function redirect(href,{wide=true,embedded=false}={}){
 const url=new URL(href),hits=[];
 const window={};window.top=embedded?{}:window;
 vm.runInNewContext(entry,{window,URL,URLSearchParams,matchMedia:()=>({matches:wide}),
  location:{href:url.href,search:url.search,hash:url.hash,replace:value=>hits.push(value)}});
 return hits;
}
test('desktop entry preserves session, material flags, extra query and route',()=>{
 const result=new URL(redirect('http://127.0.0.1:65281/?session=judge-2&material=off&material-audit=1&extra=a%2Bb#/investment')[0]);
 assert.equal(result.pathname,'/showcase.html');assert.equal(result.searchParams.get('session'),'judge-2');
 assert.equal(result.searchParams.get('material'),'off');assert.equal(result.searchParams.get('material-audit'),'1');
 assert.equal(result.searchParams.get('extra'),'a+b');assert.equal(result.hash,'#/investment');
});
test('iframe, app flag and mobile never enter a showcase redirect loop',()=>{
 const href='http://127.0.0.1:65281/?session=judge#/bot';
 assert.deepEqual(redirect(href,{embedded:true}),[]);assert.deepEqual(redirect(href,{wide:false}),[]);
 assert.deepEqual(redirect(href.replace('?','?app=1&')),[]);
 const embedded=appURL('http://127.0.0.1:65281/showcase.html?session=judge&material=off#/finance');
 assert.equal(embedded.searchParams.get('app'),'1');assert.equal(embedded.searchParams.get('session'),'judge');
 assert.equal(embedded.searchParams.get('material'),'off');assert.equal(embedded.hash,'#/finance');
 assert.deepEqual(redirect(embedded.href),[]);
});
test('showcase default and navigation URLs keep the intended demo namespace',()=>{
 assert.equal(appURL('http://127.0.0.1:65281/showcase.html').searchParams.get('session'),'demo');
 const url=appURL('http://127.0.0.1:65281/showcase.html?session=A%2Fjudge&material-fail=webgl#/bot','/today');
 assert.equal(url.searchParams.get('session'),'A/judge');assert.equal(appStateKey('A/judge'),'finpilot-companion-v1-Ajudge');
 assert.equal(url.searchParams.get('material-fail'),'webgl');assert.equal(url.hash,'#/today');
});
test('reset clears current R8/native/history keys but preserves other sessions and connections',()=>{
 const own=appStateKey('demo');
 const removable=[own,own+'-before-history-v1','finpilot-native-'+own+'-QINGCAI_MANUAL_CAPTURE_ATTEMPT',
  'finpilot-native-demo-QINGCAI_MANUAL_CAPTURE_ATTEMPT'];
 const preserved=[appStateKey('demo-other'),'finpilot-native-'+appStateKey('demo-other')+'-QINGCAI_MANUAL_CAPTURE_ATTEMPT',
  'finpilot-native-'+appStateKey('demo-OTHER')+'-QINGCAI_MANUAL_CAPTURE_ATTEMPT','AI_BOOKKEEPER_API','AI_TRADER_API','finpilot-prompt'];
 assert.deepEqual(demoResetKeys([...removable,...preserved],'demo'),removable);
});
test('phone frame fits projector and short desktop viewports without the old minimum-scale clipping',()=>{
 for(const [width,height] of [[1440,900],[1280,720],[1000,480],[390,844],[320,640]]){
  const scale=deviceScale(width,height);assert.ok(scale<=1&&scale>0);
  assert.ok(868*scale<=height-48+.01);assert.ok(414*scale<=width-48+.01);
 }
});
