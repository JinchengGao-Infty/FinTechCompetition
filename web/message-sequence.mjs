// Presentation only: no model, speech, authorization or execution dependencies.
export function createMessageSequence({now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,onChange=()=>{},gap=400}={}){
 let known=new Map(),timer=null,generation=0,last=-Infinity;
 function stop(){if(timer!==null)clearTimer(timer);timer=null;generation++;}
 function sync(keys,{history=false,historyKeys=new Set()}={}){
  stop();const time=now(),current=new Set(keys);
  for(const key of known.keys())if(!current.has(key))known.delete(key);
  last=Math.max(-Infinity,...known.values());
  for(const key of keys)if(!known.has(key)){
   const at=history||historyKeys.has(key)?time:Math.max(time,last+gap);known.set(key,at);last=Math.max(last,at);
  }
  const due=[...known.values()].filter(at=>at>time);
  if(due.length){const token=generation;timer=setTimer(()=>{if(token!==generation)return;timer=null;onChange();},Math.min(...due)-time);}
  return new Set(keys.filter(key=>known.get(key)<=time));
 }
 return {sync,reset(){stop();known.clear();last=-Infinity;},dispose:stop};
}

export function installMessageSequence(root,{onReveal=()=>{}}={}){
 let initial=true,epoch=null,animated=new Set();
 const queue=createMessageSequence({onChange:()=>paint()});
 function paint(history=false){
  for(const group of root.querySelectorAll('[data-bot-operation]'))[...group.children].forEach((el,i)=>{el.dataset.botStep=group.dataset.botOperation+':'+i;});
  const all=[...root.querySelectorAll('[data-bot-step]')];
  const nodes=all.filter(el=>!el.closest('details:not([open])'));
  for(const el of all)if(!nodes.includes(el)){animated.add(el.dataset.botStep);el.hidden=false;el.inert=false;}
  const visible=queue.sync(nodes.map(el=>el.dataset.botStep),{history,historyKeys:animated});let revealed=false;
  for(const el of nodes){const key=el.dataset.botStep,show=visible.has(key);
   el.hidden=!show;el.inert=!show;
   if(show&&!animated.has(key)){animated.add(key);if(!history){el.classList.add('bot-step-enter');revealed=true;}}
  }
  if(revealed)onReveal();
 }
 return {mount({active,scope}){
  if(scope!==epoch){queue.reset();animated.clear();epoch=scope;}
  if(!active){queue.reset();initial=true;return;}
  paint(initial);initial=false;
 },reset(){queue.reset();animated.clear();initial=false;},dispose(){queue.dispose();}};
}
