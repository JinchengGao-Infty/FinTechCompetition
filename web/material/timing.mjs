export function distribution(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const q=f=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*f))]:null;
 return {samples:sorted.length,minMs:q(0),p50Ms:q(.5),p95Ms:q(.95),maxMs:q(1)};
}
export function frameDistribution(values){
 const stats=distribution(values),buckets={'<8ms':0,'8–20ms':0,'20–40ms':0,'40–100ms':0,'≥100ms':0};
 for(const ms of values)buckets[ms<8?'<8ms':ms<20?'8–20ms':ms<40?'20–40ms':ms<100?'40–100ms':'≥100ms']++;
 return {...stats,over33msRatio:values.filter(x=>x>33).length/(values.length||1),buckets};
}
export class GpuTimer{
 constructor(gl){this.gl=gl;this.ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.values=[];this.disjoint=0;this.counter=0;}
 begin(){if(!this.ext||(++this.counter%8)||this.pending.length>8)return null;const q=this.gl.createQuery();this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,q);return q;}
 end(q){if(q){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(q);}}
 poll(){if(!this.ext||!this.pending.length)return;const gl=this.gl;
  if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){this.disjoint++;for(const q of this.pending)gl.deleteQuery(q);this.pending=[];this.values=[];return;}
  this.pending=this.pending.filter(q=>{if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))return true;const ns=gl.getQueryParameter(q,gl.QUERY_RESULT);if(Number.isFinite(ns)&&ns>=0){this.values.push(ns/1e6);if(this.values.length>240)this.values.shift();}gl.deleteQuery(q);return false;});
 }
 result(){this.poll();return {extensionAvailable:Boolean(this.ext),...distribution(this.values),disjointEvents:this.disjoint,pendingQueries:this.pending.length,scope:'GPU elapsed for sampled glass draw commands, excludes DOM/compositor/display'};}
 dispose(){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];}
}
