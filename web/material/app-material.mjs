import {AppGlass} from './renderer.mjs';

const query = new URLSearchParams(location.search);
const app = document.getElementById('app');
const audit = query.get('material-audit') === '1';
const optedOut = query.get('material') === 'off';
const opticalCandidates = '.card,.ap-home-asset,.ap-home-month,.ap-l-hero,.ap-w-assets,.ap-r-plan,.fp-invest-card,nav.ap-nav';
const readableCandidates = '.card,.ap-home-card,.ap-l-glass,.ap-o-card,.ap-t-card,.ap-w-glass,.ap-r-list,.fp-invest-card,.composer,.form';

if(app && !optedOut) {
  document.body.dataset.fpMaterialEnabled = 'true';
  const canvas = document.createElement('canvas');
  canvas.className = 'fp-material-canvas'; canvas.hidden = true;
  canvas.setAttribute('aria-hidden','true');
  const opaqueQuery = matchMedia('(prefers-reduced-transparency: reduce)');
  let diagnostic = null, lastStatus = null, queued = false;
  const renderer = new AppGlass(app,canvas,status=>{
    lastStatus = status;
    const node = document.getElementById('fp-material-status');
    if(node) node.textContent = JSON.stringify(status,null,2);
  },{noWebgl:query.get('material-fail')==='webgl',compileFailure:query.get('material-fail')==='compile'});

  function opaque() {
    return opaqueQuery.matches || document.documentElement.dataset.reduceTransparency==='true';
  }
  function preference() {
    document.body.dataset.fpMaterialOpaque = String(opaque());
    renderer.setEnabled(!opaque());
  }
  function refresh() {
    queued = false;
    if(canvas.parentNode!==app) app.prepend(canvas); // Reuse the same context across App rerenders.
    app.querySelectorAll('[data-fp-optical]').forEach(e=>e.removeAttribute('data-fp-optical'));
    app.querySelectorAll(readableCandidates).forEach(e=>e.dataset.fpSurface='readable');
    const route = (location.hash.slice(2)||'today').split('?')[0];
    const targets = [];
    const use = (e,role='card') => {
      if(!e || targets.includes(e) || e.closest('.bubble,.form') || e.matches('button')) return;
      if(targets.some(parent=>parent.contains(e))) return;
      e.dataset.fpOptical=role; targets.push(e);
    };
    if(route==='today') app.querySelectorAll('main > .card').forEach(e=>use(e));
    else if(route==='bot' || route==='bot/tasks') app.querySelectorAll('.card').forEach(e=>use(e));
    else if(route.startsWith('bot/task/')) use(app.querySelector('main > .card'));
    else if(route==='finance' || route==='finance/accounts') app.querySelectorAll('.ap-home-asset,.ap-home-month').forEach(e=>use(e));
    else if(route==='finance/ledger') use(app.querySelector('.ap-l-hero'));
    else if(route==='investment') app.querySelectorAll('.ap-w-assets,.ap-r-plan,.fp-invest > .fp-invest-card:not(.fp-invest-empty)').forEach(e=>use(e));
    else if(route==='me' || route==='me/accounts') app.querySelectorAll('main > .card').forEach(e=>use(e));
    use(app.querySelector('nav.ap-nav'),'nav');
    renderer.setTargets(targets); preference();
    renderer.resize().catch(e=>renderer.fallback(e.message,true));
  }
  function queue() {if(!queued){queued=true;queueMicrotask(refresh);}}
  const observer = new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n!==canvas&&
      (n.matches?.('main, #baseline-content,'+opticalCandidates)||n.querySelector?.(opticalCandidates))))) queue();
  });
  observer.observe(app,{childList:true,subtree:true});
  const prefsObserver = new MutationObserver(preference);
  prefsObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduce-transparency']});
  opaqueQuery.addEventListener('change',preference);
  window.addEventListener('hashchange',queue);
  document.fonts?.ready.then(()=>{renderer.dirty=true;renderer.requestDraw();});
  window.addEventListener('pagehide',event=>{
    if(event.persisted){renderer.cancel();return;}
    observer.disconnect();prefsObserver.disconnect();opaqueQuery.removeEventListener('change',preference);
    window.removeEventListener('hashchange',queue); diagnostic?.dispose(); renderer.dispose();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){renderer.dirty=true;renderer.resize().catch(e=>renderer.fallback(e.message,true));}});
  if(audit) import('./diagnostics.mjs').then(({installDiagnostics})=>{diagnostic=installDiagnostics(renderer,()=>lastStatus);});
  queue();
} else if(app && audit) {
  // Opt-out performs no rendering, DOM wrapping, background replacement or styling.
  import('./diagnostics.mjs').then(({installBaselineDiagnostics})=>installBaselineDiagnostics());
}
