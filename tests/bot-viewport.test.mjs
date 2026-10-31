import test from 'node:test';import assert from 'node:assert/strict';
import {botActivity,nearBottom,keyboardInset,composerClearance,installBotViewport,operationScrollTarget} from '../web/bot-viewport.mjs';
test('activity follows real work and stops for waiting,unknown,completed,cancelled,failed and pause',()=>{
 for(const status of ['permission','review','verify','unknown','done','cancelled','failed'])assert.equal(botActivity({tasks:[{status}]}),'idle');
 assert.equal(botActivity({busy:true}),'thinking');assert.equal(botActivity({tasks:[{status:'executing'}]}),'working');assert.equal(botActivity({busy:true,paused:true}),'idle');
});
test('bottom and keyboard geometry preserves composer and safe readable gap',()=>{
 assert.equal(nearBottom(1300,2200,844),true);assert.equal(nearBottom(500,2200,844),false);
 assert.equal(keyboardInset(844,844),0);assert.equal(keyboardInset(844,500,20),324);assert.equal(composerClearance(844,600),260);
});
test('send forces latest; new reply follows only when pinned; route return preserves upper reading',()=>{
 const events={},frames=new Map(),root={scrollHeight:2200};let next=0,observe;
 const win={scrollY:0,innerHeight:800,visualViewport:null,ResizeObserver:class{constructor(fn){observe=fn;}observe(){}disconnect(){}},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);},addEventListener(n,fn){events[n]=fn;},removeEventListener(){},scrollTo({top}){this.scrollY=top;}};
 const app={style:{setProperty(){}},querySelector:s=>s==='.composer'?{getBoundingClientRect:()=>({top:640})}:{}};
 const ui=installBotViewport(app,{win,doc:{scrollingElement:root}});const flush=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
 ui.afterRender(true);flush();assert.equal(win.scrollY,1400);assert.equal(frames.size,0);
 events.wheel({deltaY:-100});win.scrollY=400;events.scroll();ui.beforeRender();root.scrollHeight=2600;ui.afterRender(true);flush();assert.equal(win.scrollY,400);
 ui.forceBottom();ui.beforeRender();ui.afterRender(true);flush();assert.equal(win.scrollY,1800);
 root.scrollHeight=2800;observe();flush();assert.equal(win.scrollY,2000);
 events.wheel({deltaY:-100});win.scrollY=500;events.scroll();ui.beforeRender();ui.afterRender(false);win.scrollY=0;ui.beforeRender();ui.afterRender(true);
 // A queued scroll-to-top from the previous route and a second paint must not
 // overwrite the pending Bot bookmark before its first layout frame commits.
 events.scroll();ui.beforeRender();ui.afterRender(true);flush();assert.equal(win.scrollY,500);
 ui.destroy();assert.equal(frames.size,0);
});

test('a covered operation is placed above the measured composer, not a guessed viewport offset',()=>{
 const top=operationScrollTarget({scrollTop:400,scrollHeight:1800,viewport:800,cardTop:500,cardBottom:800,composerTop:640,headerBottom:100});
 assert.equal(top,576);assert.equal(800-(top-400),624);
 const unchanged=operationScrollTarget({scrollTop:400,scrollHeight:1800,viewport:800,cardTop:200,cardBottom:500,composerTop:640,headerBottom:100});
 assert.equal(unchanged,400);
});
test('a tall operation starts below the sticky header and remains natively scrollable to its actions',()=>{
 const top=operationScrollTarget({scrollTop:400,scrollHeight:1800,viewport:800,cardTop:200,cardBottom:1000,composerTop:600,headerBottom:100});
 assert.equal(top,488);assert.equal(200-(top-400),112);
 assert.equal(operationScrollTarget({scrollTop:0,scrollHeight:600,viewport:800,cardTop:100,cardBottom:700,composerTop:600,headerBottom:100}),0);
});
