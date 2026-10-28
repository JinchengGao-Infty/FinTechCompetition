// Engineering completion of Stitch 4fbdcab51d644d66b3af85283abf85b3.
export const SPRING = Object.freeze({stiffness:120,damping:16,maxDegrees:12});
export function tiltTarget(x,y,width,height){
  const clamp=v=>Math.max(-1,Math.min(1,v));
  return {x:-clamp(y/Math.max(1,height)*2-1)*12,y:clamp(x/Math.max(1,width)*2-1)*12};
}
export function springStep(s,seconds){
  let remaining=Math.max(0,Math.min(.05,seconds));
  while(remaining>0){const dt=Math.min(remaining,1/120);remaining-=dt;
    for(const axis of ['x','y']){const v=axis==='x'?'vx':'vy',t=axis==='x'?'tx':'ty';
      s[v]+=(-120*(s[axis]-s[t])-16*s[v])*dt;s[axis]+=s[v]*dt;}}
  const active=Math.abs(s.x-s.tx)+Math.abs(s.y-s.ty)+Math.abs(s.vx)+Math.abs(s.vy)>.002;
  if(!active){s.x=s.tx;s.y=s.ty;s.vx=s.vy=0;}return active;
}
export function rotateNormal(n,x,y){
  // CSS rotateX(x) rotateY(y), converted from CSS y-down to shader y-up.
  const a=-x*Math.PI/180,b=y*Math.PI/180;
  const v=[Math.cos(b)*n[0]+Math.sin(b)*n[2],n[1],-Math.sin(b)*n[0]+Math.cos(b)*n[2]];
  return [v[0],Math.cos(a)*v[1]-Math.sin(a)*v[2],Math.sin(a)*v[1]+Math.cos(a)*v[2]];
}
export function reflectionUV(uv,I,N){
  const length=v=>Math.hypot(...v), il=length(I),nl=length(N);
  if(!il||!nl)throw Error('Non-zero ray and normal required');
  const i=I.map(v=>v/il),n=N.map(v=>v/nl),dot=i.reduce((a,v,j)=>a+v*n[j],0);
  const r=i.map((v,j)=>v-2*dot*n[j]),z=Math.max(r[2],.2);
  return {ray:r,uv:[uv[0]+.12*r[0]/z,uv[1]+.12*r[1]/z]};
}
