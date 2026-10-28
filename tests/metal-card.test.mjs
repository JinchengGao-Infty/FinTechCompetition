import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPRING,tiltTarget,springStep,rotateNormal,reflectionUV} from '../web/material/metal-math.mjs';
import {blurFragment,metalFragment} from '../web/material/metal-card.mjs';
test('metal target is limited to plus/minus twelve degrees',()=>{
 assert.deepEqual(SPRING,{stiffness:120,damping:16,maxDegrees:12});
 assert.deepEqual(tiltTarget(0,0,320,500),{x:12,y:-12});
 assert.deepEqual(tiltTarget(999,-50,320,500),{x:12,y:12});
 assert.deepEqual(tiltTarget(160,250,320,500),{x:-0,y:0});
});
test('spring 120/16 settles then returns exactly to rest',()=>{
 const s={x:0,y:0,tx:12,ty:-12,vx:0,vy:0};let active;
 for(let i=0;i<900;i++)active=springStep(s,1/60);
 assert.equal(active,false);assert.equal(s.x,12);assert.equal(s.y,-12);
 s.tx=s.ty=0;for(let i=0;i<900;i++)active=springStep(s,1/60);
 assert.equal(active,false);assert.equal(s.x,0);assert.equal(s.y,0);assert.equal(s.vx,0);
});
test('CSS rotation and shader use the same normal orientation',()=>{
 const n=rotateNormal([0,0,1],12,0),m=rotateNormal([0,0,1],0,12);
 assert.ok(n[1]>0&&Math.abs(n[2]-Math.cos(Math.PI/15))<1e-10);
 assert.ok(m[0]>0&&Math.abs(Math.hypot(...m)-1)<1e-10);
 assert.deepEqual(rotateNormal([0,0,1],0,0),[0,0,1]);
});
test('normal incidence keeps UV, oblique ray reflects, grazing denominator is finite',()=>{
 const front=reflectionUV([.5,.5],[0,0,-1],[0,0,1]);
 assert.deepEqual(front,{ray:[0,0,1],uv:[.5,.5]});
 const oblique=reflectionUV([.5,.5],[1,0,-1],[0,0,1]);assert.ok(oblique.uv[0]>.5);
 const grazing=reflectionUV([.5,.5],[1,0,0],[0,0,1]);assert.ok(grazing.uv.every(Number.isFinite));
 assert.throws(()=>reflectionUV([0,0],[0,0,0],[0,0,1]));
});
test('two real directional blur passes and sampled desaturation are present',()=>{
 const code=readFileSync(new URL('../web/material/metal-card.mjs',import.meta.url),'utf8');
 assert.match(code,/for\(let pass=0;pass<2;pass\+\+\)/);
 assert.match(code,/this\.fbos\[pass\]/);assert.match(code,/this\.textures\[pass\]/);
 assert.match(code,/texSubImage2D/);assert.match(blurFragment,/direction\*1\.384/);
 assert.match(metalFragment,/vec3 sampleColor=texture\(environment,sampleUV\)/);
 assert.match(metalFragment,/dot\(sampleColor,vec3\(\.299,\.587,\.114\)\)/);
});
test('card redraw avoids transformed rect resizing and owns no per-card WebGL context',()=>{
 const code=readFileSync(new URL('../web/material/metal-card.mjs',import.meta.url),'utf8');
 assert.match(code,/e\.clientWidth/);assert.match(code,/if\(sizeChanged\)/);
 assert.doesNotMatch(code,/getContext\(['"]webgl/);assert.match(code,/deleteTexture/);assert.match(code,/deleteFramebuffer/);
 assert.doesNotMatch(code,/requestAnimationFrame/);assert.match(code,/document\.hidden/);
});
test('wallet is a stack, import toolbar absent, source names visible',()=>{
 const bank=readFileSync(new URL('../web/bank-cards.mjs',import.meta.url),'utf8');
 const inv=readFileSync(new URL('../web/investment-ui.mjs',import.meta.url),'utf8');
 const research=readFileSync(new URL('../web/research.mjs',import.meta.url),'utf8');
 assert.match(bank,/bank-wallet-stack/);assert.doesNotMatch(bank,/class="bank-card-select"/);
 assert.doesNotMatch(inv,/button\('导入 CSV'/);assert.match(research,/<span>\$\{esc\(r\.publisher/);
});
