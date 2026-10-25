/** Presentation-only receipt gate. Never executes, retries or cancels a money operation. */
export class ReceiptGate {
  constructor(){this.run=null;this.destroyed=false;this.revision=0;}
  begin({requestId,objectId}) {
    if(this.destroyed)throw new Error('Disposed motion controller');
    if(!requestId||!objectId)throw new TypeError('requestId and objectId are required');
    // Repeated clicks on the same pending request must not start a second visual run.
    if(this.run?.requestId===requestId&&this.run?.objectId===objectId&&!this.run.controller.signal.aborted)return this.run;
    this.cancel(); const controller=new AbortController();
    this.run={requestId,objectId,revision:++this.revision,controller,signal:controller.signal,terminal:false};return this.run;
  }
  accept(event) {
    const r=this.run;
    if(this.destroyed||!r||r.signal.aborted||r.terminal||event.requestId!==r.requestId||event.objectId!==r.objectId)return false;
    if(!['pending','unknown','succeeded','failed'].includes(event.status))return false;
    // Only receipt-backed terminal events can display a terminal state.
    if(['succeeded','failed'].includes(event.status)&&!event.receiptId)return false;
    if(['succeeded','failed'].includes(event.status))r.terminal=true;
    return true;
  }
  cancel(){this.run?.controller.abort();this.run=null;}
  dispose(){this.cancel();this.destroyed=true;}
}

export class MotionScope {
  constructor(root,{reducedMotion}={}) {
    this.root=root;this.animations=new Set();this.cleanups=new Set();this.override=reducedMotion;this.destroyed=false;
    this.media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.change=()=>{if(this.reduced)this.cancel();};this.media?.addEventListener('change',this.change);
  }
  get reduced(){return this.override===true||!!this.media?.matches;}
  play(el,frames,options={}) {
    if(!el||this.destroyed||this.reduced||!el.animate)return null;
    const a=el.animate(frames,{duration:250,easing:'cubic-bezier(.22,.8,.2,1)',fill:'backwards',...options});
    this.animations.add(a);a.finished.then(()=>{this.animations.delete(a);a.cancel();},()=>this.animations.delete(a));return a;
  }
  setReducedMotion(value){this.override=value;this.change();}
  cleanup(fn){this.cleanups.add(fn);return fn;}
  cancel(){for(const a of this.animations)a.cancel();this.animations.clear();for(const fn of this.cleanups)fn();this.cleanups.clear();}
  dispose(){this.cancel();this.destroyed=true;this.media?.removeEventListener('change',this.change);}
}
