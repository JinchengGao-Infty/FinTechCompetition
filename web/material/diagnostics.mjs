import {distribution,frameDistribution,GpuTimer} from './timing.mjs';

function panel() {
  const e=document.createElement('details');e.id='fp-material-audit';
  e.innerHTML='<summary>材质验收</summary><div id="fp-material-controls"></div><pre id="fp-material-status"></pre><pre id="fp-material-result"></pre>';
  document.body.append(e);return e;
}
function button(host,label,run) {const e=document.createElement('button');e.textContent=label;e.type='button';e.addEventListener('click',run);host.append(e);}

export function installDiagnostics(renderer,readStatus) {
  const ui=panel(),controls=ui.querySelector('#fp-material-controls'),output=ui.querySelector('#fp-material-result');
  ui.querySelector('#fp-material-status').textContent=JSON.stringify(readStatus(),null,2);
  let running=null;
  const result=value=>{output.textContent=JSON.stringify(value,null,2);};
  button(controls,'背景像素校验',()=>result(renderer.verifyBackground()));
  button(controls,'测试上下文丢失',()=>renderer.testLoss());
  button(controls,'恢复上下文',()=>renderer.testRestore());
  button(controls,'减少透明度',()=>{const root=document.documentElement;root.dataset.reduceTransparency=String(root.dataset.reduceTransparency!=='true');});
  button(controls,'原材质 30 秒',()=>benchmark('css-baseline'));
  button(controls,'玻璃 30 秒',()=>benchmark('glass'));
  button(controls,'停止测量',()=>stop('user-stopped'));

  function conditions() {
    return {visibility:document.visibilityState,documentHasFocus:document.hasFocus(),topLevel:window===window.top,
      width:innerWidth,height:innerHeight,appWidth:renderer.width,dpr:renderer.dpr,
      scrollRange:Math.max(0,document.documentElement.scrollHeight-innerHeight),route:location.hash,
      activeMaterial:document.body.dataset.fpMaterialState};
  }
  function benchmark(variant) {
    if(running) return;
    const c=conditions();
    if(document.hidden||!document.hasFocus()||window!==window.top||c.scrollRange<10) {
      result({started:false,reason:'需要前台有焦点的顶层页面，并有实际滚动范围',conditions:c});return;
    }
    if(variant==='glass'&&(!renderer.resources||renderer.lost||renderer.terminal)) {
      result({started:false,reason:'玻璃未就绪，不能作为有效玻璃样本',conditions:c});return;
    }
    renderer.cancel();renderer.manualBenchmark=true;
    const enabled=renderer.enabled;
    renderer.setEnabled(variant==='glass','benchmark-baseline');
    const range=c.scrollRange;
    running={variant,initial:scrollY,enabled,start:performance.now(),last:null,intervals:[],cpu:[],min:Infinity,max:-Infinity,
      frames:0,raf:0,warmup:1500,duration:30000,conditions:c,range,visibilityValid:true,focusValid:true,startFrames:renderer.frames,cap:renderer.cap,
      gpu:variant==='glass'?new GpuTimer(renderer.gl):null,builds:renderer.backgroundBuilds};
    // A separate GPU timer owns queries during the measured pass.
    running.oldGpu=renderer.gpu;if(running.gpu)renderer.gpu=running.gpu;
    ui.open=false;
    const tick=now=>{
      const d=running;if(!d)return;
      if(document.hidden||!document.hasFocus()||location.hash!==d.conditions.route) return stop('conditions-changed');
      if(d.variant==='glass'&&(renderer.cap!==d.cap||renderer.terminal||renderer.lost))return stop('renderer-quality-or-context-changed');
      const measured=now-d.start>=d.warmup;
      if(measured&&d.last!==null)d.intervals.push(now-d.last);d.last=measured?now:null;
      const begin=performance.now();
      // Same actual content and scroll trajectory in A/B/A. No synthetic bank/task actions.
      scrollTo({top:(.5-.5*Math.cos((now-d.start)*.001))*range,behavior:'instant'});
      d.min=Math.min(d.min,scrollY);d.max=Math.max(d.max,scrollY);
      if(d.variant==='glass'){renderer.draw();d.gpu.poll();}
      if(measured){d.cpu.push(performance.now()-begin);d.frames++;}
      if(now-d.start>=d.warmup+d.duration)stop('completed');else d.raf=requestAnimationFrame(tick);
    };
    running.raf=requestAnimationFrame(tick);
  }
  function stop(reason) {
    const d=running;if(!d)return;running=null;cancelAnimationFrame(d.raf);
    const end=conditions(),gpu=d.gpu?.result()||null;
    if(d.oldGpu)renderer.gpu=d.oldGpu;d.gpu?.dispose();
    renderer.manualBenchmark=false;renderer.setEnabled(d.enabled);
    scrollTo({top:d.initial,behavior:'instant'});renderer.dirty=true;renderer.requestDraw();
    result({variant:d.variant,reason,valid:reason==='completed'&&end.visibility==='visible'&&end.documentHasFocus&&d.max-d.min>10,
      elapsedMs:performance.now()-d.start,warmupMs:d.warmup,targetMs:d.duration,
      frameIntervals:frameDistribution(d.intervals),cpuCallbackWork:distribution(d.cpu),gpu,
      scrollDistancePx:d.max-d.min,startConditions:d.conditions,endConditions:end,
      drawnFrames:renderer.frames-d.startFrames,glassRedrawWorkload:d.variant==='glass'?renderer.frames>d.startFrames:null,
      backgroundBuilds:renderer.backgroundBuilds-d.builds,
      explanation:'RAF interval is presentation scheduling, not GPU time. GPU excludes DOM/compositor. Same visible desktop only; no phone claim.',
      rawFrameIntervalsMs:d.intervals});ui.open=true;
  }
  const hidden=()=>{if(document.hidden)stop('hidden');};document.addEventListener('visibilitychange',hidden);
  return {dispose(){stop('disposed');document.removeEventListener('visibilitychange',hidden);ui.remove();}};
}
export function installBaselineDiagnostics() {
  const ui=panel();ui.querySelector('#fp-material-status').textContent=JSON.stringify({active:'original-r42-material',contexts:0,query:'material=off'},null,2);
  return {dispose:()=>ui.remove()};
}
