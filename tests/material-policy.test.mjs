import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleSurfaces,rasterScale,qualityDecision,TEXTURE_LIMIT,MAX_SURFACES} from '../web/material/policy.mjs';

test('visible surface budget always preserves navigation above cards',()=>{
  const cards=Array.from({length:12},(_,order)=>({order,nav:false,rect:[0,order*25,300,80]}));
  const nav={order:20,nav:true,rect:[0,700,300,72]};
  const chosen=visibleSurfaces([...cards,nav],844);
  assert.equal(chosen.length,MAX_SURFACES);assert.equal(chosen.at(-1),nav);
  assert.ok(!visibleSurfaces([{order:0,rect:[0,900,300,30]}],844).length);
  assert.equal(visibleSurfaces([{order:0,rect:[0,-50,300,80]}],844).length,1);
});
test('high-DPR and large desktops cannot exceed shared texture budget',()=>{
  for(const [w,h,dpr] of [[320,844,3],[390,844,2],[390,4000,4],[4096,2160,2]]){
    const scale=rasterScale(w,h,dpr);
    assert.ok(scale<=1.5);assert.ok(w*h*scale*scale*4*(1+4/3)<=TEXTURE_LIMIT+.001);
  }
  assert.equal(rasterScale(390,844,2,1),1);
});
test('scroll updates reuse bounded output without retaining offscreen surfaces',()=>{
  const out=[],shape={order:0,nav:false,rect:[0,10,300,200]};
  assert.equal(visibleSurfaces([shape],844,8,out),out);assert.equal(out[0],shape);
  shape.rect[1]=-300;assert.equal(visibleSurfaces([shape],844,8,out),out);assert.equal(out.length,0);
  const nav={order:1,nav:true,rect:[0,700,300,72]};visibleSurfaces([nav,shape],844,8,out);assert.deepEqual(out,[nav]);
});
test('quality degrades from measured cost only, after sufficient samples',()=>{
  assert.equal(qualityDecision({gpuSamples:19,gpuP95:100}), 'keep');
  assert.equal(qualityDecision({gpuSamples:20,gpuP95:4.1}), 'lower-resolution');
  assert.equal(qualityDecision({gpuSamples:20,gpuP95:4.1,cap:1}), 'readable-fallback');
  assert.equal(qualityDecision({cpuSamples:120,cpuP95:8.1,cap:1}), 'readable-fallback');
  assert.equal(qualityDecision({frameIntervalP95:1004}), 'keep');
});
