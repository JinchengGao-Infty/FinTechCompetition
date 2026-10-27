// r2: one-way gestures, separate arrival and settling; keeps business rows anchored.
const glide='cubic-bezier(.32,.04,.28,1)';
const normal={duration:220,easing:'cubic-bezier(.25,.1,.25,1)'};

export function taskMotion(scope,root,state){
  const q=s=>root.querySelector(s);
  if(state==='pending'){
    // The shield stays anchored. One light pass acknowledges the request, then rests.
    scope.play(q('.fp-ray'),[
      {transform:'translateX(-76px) rotate(-22deg)',opacity:0,offset:0},
      {transform:'translateX(-48px) rotate(-22deg)',opacity:.4,offset:.18},
      {transform:'translateX(105px) rotate(-22deg)',opacity:.4,offset:.82},
      {transform:'translateX(135px) rotate(-22deg)',opacity:0,offset:1}
    ],{duration:720,easing:'linear'});
    return;
  }
  if(!['succeeded','failed'].includes(state))return;
  // 0–580ms: three planes meet. 580–780ms: hold a stable seal, no overshoot.
  scope.play(q('.fp-pane-front'),[
    {transform:'translate(-50%,-50%) rotate(-9deg)',offset:0,easing:glide},
    {transform:'translate(-50%,-50%) rotate(0deg)',offset:.76},
    {transform:'translate(-50%,-50%) rotate(0deg)',offset:1}
  ],{duration:780,easing:'linear'});
  scope.play(q('.fp-pane-mid'),[
    {transform:'translate(-50%,-50%) translate(20px,11px) rotate(12deg)',opacity:.9},
    {transform:'translate(-50%,-50%) translate(0,3px) rotate(0deg)',opacity:.24}
  ],{duration:600,easing:glide});
  scope.play(q('.fp-pane-back'),[
    {transform:'translate(-50%,-50%) translate(-19px,-9px) rotate(-22deg)',opacity:.8},
    {transform:'translate(-50%,-50%) translate(0,5px) rotate(0deg)',opacity:.16}
  ],{duration:620,easing:glide});
  // The semantic status is already visible; this icon is the final optical detail.
  scope.play(q('.fp-seal'),[
    {opacity:0,transform:'scale(.96)'},
    {opacity:1,transform:'scale(1)'}
  ],{duration:300,delay:360,easing:glide});
}

export function candidateWaitingMotion(scope,root){
  scope.play(root.querySelector('.fp-ticket-sheen'),[
    {transform:'translateX(-40px) rotate(-18deg)',opacity:0},
    {transform:'translateX(0px) rotate(-18deg)',opacity:.35,offset:.2},
    {transform:'translateX(110px) rotate(-18deg)',opacity:0}
  ],{duration:680,easing:'linear'});
}

export function candidateReceiptMotion(scope,root,options={}){
  const area=root.querySelector('.fp-capture-art');
  // 0–360ms: fields fold into one document silhouette, no 35ms cascading flashes.
  scope.play(area.querySelector('.fp-ticket-main'),[
    {transform:'translate(0px,0px) rotate(-7deg) scale(1)',opacity:1,offset:0,easing:glide},
    {transform:'translate(10px,18px) rotate(0deg) scale(.66)',opacity:.65,offset:.74},
    {transform:'translate(10px,18px) rotate(0deg) scale(.66)',opacity:0,offset:1}
  ],{duration:460,easing:'linear'});
  scope.play(area.querySelector('.fp-ticket-back'),[
    {transform:'translate(15px,8px) rotate(10deg)',opacity:.65},
    {transform:'translate(7px,12px) rotate(0deg)',opacity:0}
  ],{duration:300,easing:glide});
  for(const [i,chip] of [...area.querySelectorAll('.fp-field-a')].entries()){
    const start=i?'rotate(5deg)':'rotate(-3deg)',end=i?'translate(-42px,24px) rotate(0deg) scale(.85)':'translate(48px,-24px) rotate(0deg) scale(.85)';
    scope.play(chip,[{transform:start,opacity:1},{transform:end,opacity:0}],{duration:320,delay:40,easing:glide});
  }
  // The result seal is quiet; the only travelling focus is the readable amount.
  if(scope.reduced||typeof root.animate!=='function')return;
  // 0–150ms: readable source hold. 150–590ms: travel. 590–710ms: landed hold.
  // Only after landing does the carrier fade (710–840ms). Actual row never moves.
  const source=area.querySelector('.fp-field-b');
  const from=source.getBoundingClientRect();
  const destination=options.getReceiptTarget?options.getReceiptTarget():root.querySelector('.fp-ledger-destination .fp-money');
  if(!destination)return;
  const to=destination.getBoundingClientRect();
  const trace=root.ownerDocument.createElement('span');trace.className='fp-landing-amount';trace.setAttribute('aria-hidden','true');trace.textContent=source.textContent;
  const width=options.getReceiptTarget?Math.max(from.width,to.width):from.width,height=options.getReceiptTarget?Math.max(from.height,to.height,24):from.height;
  Object.assign(trace.style,{left:(from.left+(from.width-width)/2)+'px',top:(from.top+(from.height-height)/2)+'px',width:width+'px',height:height+'px'});
  if(options.getReceiptTarget){trace.classList.add('product-motion-amount');trace.textContent=destination.textContent;const font=root.ownerDocument.defaultView.getComputedStyle(destination);trace.style.font=font.font;trace.style.letterSpacing=font.letterSpacing;}
  (options.getCarrierContainer?.()||root).append(trace);
  const oldColor=destination.style.getPropertyValue('color'),oldPriority=destination.style.getPropertyPriority('color');
  const restoreAmount=scope.cleanup(()=>{if(oldColor)destination.style.setProperty('color',oldColor,oldPriority);else destination.style.removeProperty('color');scope.cleanups.delete(restoreAmount);});
  destination.style.setProperty('color','transparent','important');
  const remove=scope.cleanup(()=>trace.remove()),dx=to.left+to.width/2-from.left-from.width/2,dy=to.top+to.height/2-from.top-from.height/2;
  const animation=scope.play(trace,[
    {transform:'translate(0px,0px)',opacity:1,offset:0},
    {transform:'translate(0px,0px)',opacity:1,offset:.18,easing:'cubic-bezier(.3,.1,.35,1)'},
    {transform:`translate(${dx}px,${dy}px)`,opacity:1,offset:.70},
    {transform:`translate(${dx}px,${dy}px)`,opacity:1,offset:.845},
    {transform:`translate(${dx}px,${dy}px)`,opacity:0,offset:1}
  ],{duration:840,easing:'linear'});
  if(animation)animation.finished.then(()=>{restoreAmount();remove();scope.cleanups.delete(remove);},()=>{restoreAmount();remove();});else{restoreAmount();remove();}
  const halo=root.ownerDocument.createElement('span');halo.className='fp-arrival-edge';halo.setAttribute('aria-hidden','true');destination.append(halo);
  const removeHalo=scope.cleanup(()=>halo.remove());
  const landing=scope.play(halo,[{opacity:0},{opacity:.65,offset:.32},{opacity:.65,offset:.75},{opacity:0}],{duration:220,delay:620,easing:'linear'});
  landing?.finished.then(()=>{removeHalo();scope.cleanups.delete(removeHalo);},removeHalo);
  // A viewport change invalidates fixed endpoints; keep the real result and stop decoration.
  const win=root.ownerDocument.defaultView,onViewportChange=()=>scope.cancel();
  const disconnect=scope.cleanup(()=>{win.removeEventListener('scroll',onViewportChange,true);win.removeEventListener('resize',onViewportChange);scope.cleanups.delete(disconnect);});
  win.addEventListener('scroll',onViewportChange,{capture:true,passive:true});win.addEventListener('resize',onViewportChange,{passive:true});
  landing?.finished.then(disconnect,disconnect);
}

export function snapshotArcs(root){
  const win=root.ownerDocument.defaultView;
  return new Map([...root.querySelectorAll('[data-arc]')].map(node=>{
    const style=win.getComputedStyle(node);return [node.dataset.arc,{transform:style.transform,opacity:style.opacity}];
  }));
}

export function categoryMotion(scope,root,previous){
  // Continue from the actual in-flight pose when the user switches quickly.
  // No centre-amount bounce, no resetting every arc to full opacity/zero translation.
  for(const node of root.querySelectorAll('[data-arc]')){
    const start=previous.get(node.dataset.arc)||{transform:node.style.transform,opacity:node.style.opacity};
    scope.play(node,[start,{transform:node.style.transform,opacity:node.style.opacity}],normal);
  }
  scope.play(root.querySelector('.fp-chart-content'),[{opacity:.82},{opacity:1}],{duration:180,delay:40,easing:'linear'});
}
