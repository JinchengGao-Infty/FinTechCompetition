// Optional standalone/React bridge. The App uses its existing shared AppGlass
// context instead. This bridge owns exactly one context for one demonstration.
import {BankMetal} from './metal-card.mjs';
export function mountMetalCard(element){
 const offscreen=document.createElement('canvas'),gl=offscreen.getContext('webgl2',{alpha:true,antialias:false,depth:false});
 if(!gl){element.dataset.metalState='fallback';return()=>{};}
 let raf=0,disposed=false,pipeline=null,vao=null,buffer=null,lost=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function program(v,f){const shaders=[],p=gl.createProgram();try{
  for(const [type,source]of[[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Metal shader compilation failed');gl.attachShader(p,s);}
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Metal shader link failed');return p;
 }catch(e){gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}}
 const wake=()=>{if(disposed||lost||raf||document.hidden)return;raf=requestAnimationFrame(now=>{raf=0;try{
  const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(element.clientWidth*dpr),h=Math.round(element.clientHeight*dpr);
  if(offscreen.width!==w||offscreen.height!==h){offscreen.width=w;offscreen.height=h;}
  pipeline?.render(now,dpr);if(pipeline?.active)wake();
 }catch{pipeline?.fallback();}});};
 const change=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;pipeline?.pause();}else{for(const item of pipeline?.items.values()||[])item.dirty=true;wake();}};
 try{vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  pipeline=new BankMetal(gl,program,vao,wake,{reduced:()=>reduced.matches});pipeline.setCards([element]);wake();
 }catch{element.dataset.metalState='fallback';}
 const ro=new ResizeObserver(wake);ro.observe(element);window.addEventListener('resize',wake);document.addEventListener('visibilitychange',change);reduced.addEventListener('change',change);
 const loss=e=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);raf=0;pipeline?.fallback();};offscreen.addEventListener('webglcontextlost',loss);
 return()=>{disposed=true;cancelAnimationFrame(raf);ro.disconnect();window.removeEventListener('resize',wake);document.removeEventListener('visibilitychange',change);reduced.removeEventListener('change',change);offscreen.removeEventListener('webglcontextlost',loss);pipeline?.dispose({lost});if(!lost){if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);}offscreen.width=offscreen.height=1;};
}
