export const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export function normalize(v){if(v.length!==3||!v.every(Number.isFinite))throw Error('Invalid vector');const len=Math.hypot(...v);if(len<1e-12)throw Error('Cannot normalize zero vector');return v.map(x=>x/len)}
export function refract(I,N,eta){const d=dot(N,I),k=1-eta*eta*(1-d*d);if(k<0)return null;return I.map((x,i)=>eta*x-(eta*d+Math.sqrt(k))*N[i])}
export function tracePlate({point=[0,0,10],incident=[0,0,-1],normal=[0,0,1],ior=1.46,gap=28}={}){
 if(!Number.isFinite(ior)||ior<1||!Number.isFinite(gap)||gap<0||point.length!==3||!point.every(Number.isFinite)||point[2]<0)throw Error('Invalid optical geometry');
 const I=normalize(incident),N=normalize(normal),inside=refract(I,N,1/ior);
 if(!inside||inside[2]>=-1e-8)return {tir:true};
 const t=-point[2]/inside[2],back=point.map((v,i)=>v+inside[i]*t);
 // Geometric back outward normal is -z; refract needs the incident-facing +z.
 const exit=refract(inside,[0,0,1],ior);
 if(!exit||exit[2]>=-1e-8)return {tir:true,inside,back};
 const distance=-gap/exit[2],hit=back.map((v,i)=>v+exit[i]*distance);
 return {tir:false,inside,back,exit,hit};
}
