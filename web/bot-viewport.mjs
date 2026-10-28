export const nearBottom=(top,height,viewport,threshold=64)=>height-viewport-top<=threshold;
export const keyboardInset=(layoutHeight,visualHeight,offsetTop=0)=>Math.max(0,layoutHeight-visualHeight-offsetTop);
export const composerClearance=(viewportHeight,composerTop)=>Math.max(156,Math.ceil(viewportHeight-composerTop+16));
export function botActivity({busy=false,paused=false,tasks=[]}={}){
 if(paused)return 'idle';if(busy)return 'thinking';
 return tasks.some(t=>t.status==='executing')?'working':'idle';
}

// The app uses the document scrollport. Observe only the active Bot content;
// no polling, screenshot sampling, or permanent animation loop.
export function installBotViewport(app,{win=window,doc=document}={}){
 let active=false,pinned=true,forced=false,restoring=false,savedTop=0,hasSaved=false,frame=0;
 const root=()=>doc.scrollingElement||doc.documentElement;
 const metrics=()=>({top:win.scrollY,height:root().scrollHeight,viewport:win.innerHeight});
 const observer=new win.ResizeObserver(()=>schedule());
 function cancelFrame(){if(frame){win.cancelAnimationFrame(frame);frame=0;}}
 function scrollLatest(){
  if(!active)return;
  const visual=win.visualViewport;
  const inset=visual?keyboardInset(win.innerHeight,visual.height,visual.offsetTop):0;
  app.style.setProperty('--bot-keyboard-inset',inset+'px');
  app.style.setProperty('--bot-visual-top',Math.max(0,visual?.offsetTop||0)+'px');
  const composer=app.querySelector('.composer');
  if(composer)app.style.setProperty('--bot-bottom-clearance',composerClearance(win.innerHeight,composer.getBoundingClientRect().top)+'px');
  const target=forced||pinned?Math.max(0,root().scrollHeight-win.innerHeight):restoring?savedTop:win.scrollY;
  // Instant scrolling also respects reduced-motion and never queues animations.
  if(Math.abs(win.scrollY-target)>1)win.scrollTo({top:target,behavior:'auto'});
  forced=false;restoring=false;savedTop=win.scrollY;hasSaved=true;
 }
 function schedule(){if(active&&!frame)frame=win.requestAnimationFrame(()=>{frame=0;scrollLatest();});}
 function track(){if(!active||restoring)return;const m=metrics();if(!forced)pinned=nearBottom(m.top,m.height,m.viewport);savedTop=m.top;hasSaved=true;}
 function userUp(){if(active){cancelFrame();forced=false;restoring=false;pinned=false;savedTop=win.scrollY;}}
 const wheel=e=>{if(e.deltaY<0)userUp();};
 const key=e=>{if(['PageUp','Home','ArrowUp'].includes(e.key)&&!e.target?.closest?.('input,textarea,select'))userUp();};
 let touchY=null;
 const touchStart=e=>{touchY=e.touches[0]?.clientY??null;};
 const touchMove=e=>{const y=e.touches[0]?.clientY;if(touchY!==null&&y>touchY)userUp();touchY=y??null;};
 win.addEventListener('scroll',track,{passive:true});
 win.addEventListener('wheel',wheel,{passive:true});win.addEventListener('keydown',key);
 win.addEventListener('touchstart',touchStart,{passive:true});win.addEventListener('touchmove',touchMove,{passive:true});
 win.addEventListener('resize',schedule,{passive:true});
 win.visualViewport?.addEventListener('resize',schedule,{passive:true});
 win.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 return {
  beforeRender(){if(active){track();}observer.disconnect();cancelFrame();},
  afterRender(isBot){
   active=isBot;if(!active){restoring=false;return;}
   restoring=true;
   if(!hasSaved)pinned=true;
   for(const selector of ['.bot-page','.composer','.bot-topbar']){const el=app.querySelector(selector);if(el)observer.observe(el);}
   schedule();
  },
  forceBottom(){forced=true;pinned=true;schedule();},
  destroy(){cancelFrame();observer.disconnect();win.removeEventListener('scroll',track);win.removeEventListener('wheel',wheel);win.removeEventListener('keydown',key);win.removeEventListener('touchstart',touchStart);win.removeEventListener('touchmove',touchMove);win.removeEventListener('resize',schedule);win.visualViewport?.removeEventListener('resize',schedule);win.visualViewport?.removeEventListener('scroll',schedule);},
 };
}
