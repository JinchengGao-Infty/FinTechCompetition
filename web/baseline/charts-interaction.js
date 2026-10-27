// Scoped listeners are aborted on every repaint/navigation by the host.
export function mountChartsInteraction(root,{onSelectTrend=()=>{},onSelectCategory=()=>{}}={}){
 if(!root)return ()=>{};
 const controller=new AbortController(),options={signal:controller.signal};
 let pending=null,frame=0,gesture=null,lastCategory=null;
 const selectCategory=category=>{
  const matches=[...root.querySelectorAll('[data-chart-category]')];
  const selected=matches.find(node=>node.dataset.chartCategory===category);
  if(!selected||category===lastCategory)return;lastCategory=category;
  matches.forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.chartCategory===category)));
  const tooltip=root.querySelector('[data-chart-tooltip]');
  if(tooltip)tooltip.textContent=category+' · '+selected.dataset.chartValue;
  const detail=root.querySelector('[data-chart-detail]');
  if(detail){detail.dataset.category=category;detail.setAttribute('aria-label','查看'+category+'明细');}
  const label=root.querySelector('[data-chart-center-label]'),value=root.querySelector('[data-chart-center-value]');
  if(label)label.textContent=category;if(value)value.textContent=selected.dataset.chartValue;
  const row=matches.find(node=>node.dataset.chartCategory===category&&node.querySelector?.('[data-chart-category-icon]'));
  const rowIcon=row?.querySelector('[data-chart-category-icon]'),centerIcon=root.querySelector('[data-chart-center-icon]');
  if(rowIcon&&centerIcon){centerIcon.replaceChildren(...[...rowIcon.childNodes].map(node=>node.cloneNode(true)));centerIcon.style.color=rowIcon.style.color;}
  const card=root.querySelector('[data-chart-selected-card]');
  if(card){
   card.dataset.category=category;
   const cardLabel=card.querySelector('[data-chart-card-label]'),cardPercent=card.querySelector('[data-chart-card-percent]'),cardIcon=card.querySelector('[data-chart-card-icon]');
   if(cardLabel)cardLabel.textContent=category;
   const cardAmount=card.querySelector('[data-chart-card-amount]');if(cardAmount)cardAmount.textContent=selected.dataset.chartValue;card.setAttribute('aria-label',category+' '+selected.dataset.chartValue+' 查看明细');
   if(cardPercent&&row)cardPercent.textContent=row.querySelector('[data-chart-category-percent]')?.textContent||'';
   if(cardIcon&&rowIcon){cardIcon.replaceChildren(...[...rowIcon.childNodes].map(node=>node.cloneNode(true)));cardIcon.style.color=rowIcon.style.color;}
  }
  onSelectCategory(category);
 };
 const target=event=>event.target.closest?.('[data-chart-category]');
 root.addEventListener('pointerover',event=>{const node=target(event);if(node&&event.pointerType!=='touch')selectCategory(node.dataset.chartCategory);},options);
 root.addEventListener('focusin',event=>{const node=target(event);if(node)selectCategory(node.dataset.chartCategory);},options);
 root.addEventListener('click',event=>{const node=target(event);if(node){selectCategory(node.dataset.chartCategory);event.preventDefault();}},options);
 root.addEventListener('keydown',event=>{const node=target(event);if(node&&['Enter',' '].includes(event.key)){event.preventDefault();selectCategory(node.dataset.chartCategory);}},options);
 const chart=root.querySelector('[data-chart-trend]');
 const commit=index=>{pending=index;if(!frame)frame=requestAnimationFrame(()=>{frame=0;const value=pending;pending=null;if(!controller.signal.aborted)onSelectTrend(value);});};
 if(chart){
  const count=Number(chart.dataset.count),left=Number(chart.dataset.chartLeft)||10,right=Number(chart.dataset.chartRight)||310,indexAt=clientX=>{const rect=chart.getBoundingClientRect();return Math.max(0,Math.min(count-1,Math.round((((clientX-rect.left)/rect.width*320)-left)/(right-left)*(count-1))));};
  chart.addEventListener('pointerdown',event=>{if(event.button!==0||!count)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY};chart.setPointerCapture?.(event.pointerId);},options);
  chart.addEventListener('pointerup',event=>{if(!gesture||gesture.id!==event.pointerId)return;const start=gesture;gesture=null;if(Math.abs(event.clientY-start.y)<24)commit(indexAt(event.clientX));},options);
  chart.addEventListener('pointercancel',()=>{gesture=null;},options);
  chart.addEventListener('keydown',event=>{if(!count)return;let index=Number(chart.getAttribute('aria-valuenow'));if(event.key==='ArrowLeft')index--;else if(event.key==='ArrowRight')index++;else if(event.key==='Home')index=0;else if(event.key==='End')index=count-1;else return;event.preventDefault();commit(Math.max(0,Math.min(count-1,index)));},options);
 }
 return ()=>{controller.abort();if(frame)cancelAnimationFrame(frame);frame=0;pending=null;gesture=null;};
}
