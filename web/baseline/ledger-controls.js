// Explicit month selection and mouse/trackpad parity for the native touch strip.
export function ledgerMonthOptions(){return ['2025-11','2025-12',...Array.from({length:11},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`)];}
export function monthSelectionRoute(state,month){
 if(!ledgerMonthOptions().includes(month))return null;
 const p=new URLSearchParams({month,category:state.filter?.category||'',type:state.filter?.type||''});
 if(state.productLedgerCashflowOnly)p.set('cashflow_only','1');
 if(state.productLedgerReturnTo)p.set('return_to',state.productLedgerReturnTo);
 return 'ledger?'+p;
}
export function mountLedgerStrip(strip){
 if(!strip)return ()=>{};
 let drag=null,ignoreClick=false,resetTimer;
 const reveal=button=>{const a=button.getBoundingClientRect(),b=strip.getBoundingClientRect();if(a.left<b.left+3)strip.scrollLeft-=b.left+3-a.left;else if(a.right>b.right-3)strip.scrollLeft+=a.right-b.right+3;};
 const down=e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,scroll:strip.scrollLeft,moved:false};};
 const move=e=>{if(!drag||e.pointerId!==drag.id)return;if(Math.abs(e.clientX-drag.x)>4){drag.moved=true;strip.classList.add('is-dragging');strip.setPointerCapture?.(e.pointerId);e.preventDefault();strip.scrollLeft=drag.scroll-(e.clientX-drag.x);}};
 const up=e=>{if(!drag||e.pointerId!==drag.id)return;ignoreClick=drag.moved;drag=null;strip.classList.remove('is-dragging');if(strip.hasPointerCapture?.(e.pointerId))strip.releasePointerCapture(e.pointerId);clearTimeout(resetTimer);resetTimer=setTimeout(()=>{ignoreClick=false;},0);};
 const cancel=()=>{drag=null;ignoreClick=false;strip.classList.remove('is-dragging');};
 const click=e=>{if(ignoreClick){e.preventDefault();e.stopImmediatePropagation();ignoreClick=false;}};
 const wheel=e=>{if(strip.scrollWidth<=strip.clientWidth)return;const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY,before=strip.scrollLeft;strip.scrollLeft+=delta;if(strip.scrollLeft!==before)e.preventDefault();};
 const key=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...strip.querySelectorAll('button')],current=buttons.indexOf(strip.ownerDocument.activeElement);if(current<0)return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,current+(e.key==='ArrowRight'?1:-1)));buttons[index].focus({preventScroll:true});reveal(buttons[index]);};
 const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['click',click,true],['wheel',wheel,{passive:false}],['keydown',key]];
 for(const [name,fn,opts] of listeners)strip.addEventListener(name,fn,opts);
 return ()=>{clearTimeout(resetTimer);for(const [name,fn,opts] of listeners)strip.removeEventListener(name,fn,opts);cancel();};
}
