// Preserve existing controls and focus; only semantic navigation belongs left.
export function installHeaderNavigation(...roots){
 const backSelector='[aria-label^="返回"],[data-action="back"],[data-risk-action="back"]';
 function arrange(root){
  for(const header of root.querySelectorAll('header')){
   const back=header.querySelector(backSelector);if(!back)continue;
   if(back.closest('header')!==header)continue;
   header.classList.add('has-back-navigation');
   if(header.firstElementChild!==back){const focused=header.ownerDocument.activeElement;header.insertBefore(back,header.firstChild);if(back===focused||back.contains(focused))focused.focus({preventScroll:true});}
  }
  for(const sheet of root.querySelectorAll('.sheet')){
   const heading=sheet.querySelector(':scope > .row.between');if(!heading)continue;
   if(heading.querySelector('.header-return'))continue;
   const back=[...sheet.querySelectorAll('button,a')].find(e=>!heading.contains(e)&&/^返回/.test((e.getAttribute('aria-label')||e.textContent||'').trim()));
   if(!back)continue;
   const focused=sheet.ownerDocument.activeElement,label=(back.getAttribute('aria-label')||back.textContent).trim();
   back.setAttribute('aria-label',label);if(back.tagName==='BUTTON')back.type='button';back.classList.add('header-return');
   back.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m15 5-7 7 7 7"/></svg>';
   heading.classList.add('sheet-header','has-back-navigation');heading.insertBefore(back,heading.firstChild);
   if(back===focused||back.contains(focused))back.focus({preventScroll:true});
  }
 }
 const observers=roots.map(root=>{const observer=new MutationObserver(()=>arrange(root));observer.observe(root,{childList:true,subtree:true});arrange(root);return observer;});
 return ()=>observers.forEach(o=>o.disconnect());
}
