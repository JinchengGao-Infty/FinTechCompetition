// Route/tab/scroll provenance belongs to the view, not to the Bot or executor.
export function createViewNavigation({win,read,apply,render,clearOverlay,restoreOverlay}){
 let consumed=false,handled=null,afterBack=null,activeView=null;const sheets=new Map();
 const key=()=>Math.random().toString(36).slice(2);
 const snapshot=()=>({...read(),route:win.location.hash||'#/today',scroll:win.scrollY||0});
 const entry=()=>win.history.state?.fpR8;
 function replace(view){win.history.replaceState({...win.history.state,fpR8:view},'',win.location.href);return view;}
 function remember(){const old=entry();return replace({...old,...snapshot(),key:old?.key||key()});}
 function show(v){const keepDom=activeView?.overlay&&!v.overlay&&activeView.route===v.route&&activeView.financial===v.financial&&activeView.investment===v.investment;
  apply(v);clearOverlay();if(!keepDom)render();win.requestAnimationFrame(()=>win.scrollTo(0,v.scroll||0));if(v.overlay&&sheets.has(v.overlay))restoreOverlay(sheets.get(v.overlay));handled=v.key;activeView=v;}
 function restore(){let v=entry();if(!v||v.route!==win.location.hash)v=replace({...snapshot(),scroll:0,key:key()});if(handled===v.key)return;show(v);const callback=afterBack;afterBack=null;callback?.();}
 function go(route,options={}){remember();const v={...snapshot(),...options,route,scroll:options.scroll||0,key:key()};
  const method=options.replace||consumed?'replaceState':'pushState';consumed=false;win.history[method]({...win.history.state,fpR8:v},'',route);show(v);return v;
 }
 function back(fallback,callback=null){const v=entry();if(v?.returnTo&&['operation','detail'].includes(v.kind)){afterBack=callback;win.history.back();return;}
  go(fallback?.route||'#/bot/tasks',{...fallback,replace:true});callback?.();
 }
 function openOverlay(content){const old=remember();const id=old.overlay||key();sheets.set(id,content);const v={...old,overlay:id,key:old.overlay?old.key:key()};
  win.history[old.overlay||consumed?'replaceState':'pushState']({...win.history.state,fpR8:v},'',win.location.href);consumed=false;handled=v.key;activeView=v;
 }
 function dismissOverlay({consume=false}={}){const v=entry();if(!v?.overlay)return;if(consume){replace({...v,overlay:null});consumed=true;}else win.history.back();}
 const initial=entry();
 if(initial?.route===win.location.hash){apply(initial);replace({...initial,overlay:null});}
 activeView=remember();
 win.addEventListener('popstate',restore);win.addEventListener('hashchange',restore);
 return {snapshot,remember,go,back,openOverlay,dismissOverlay,current:entry,restore,
  dispose(){win.removeEventListener('popstate',restore);win.removeEventListener('hashchange',restore);}};
}
