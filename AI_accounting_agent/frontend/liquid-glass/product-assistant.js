// Uses existing Stitch mobile action-list composition; no fabricated task or market data.
export function assistantStartHTML({state,esc,icon}) {
 const mode=state.mode||'book';
 const actions=mode==='trader'?[['investment','个人持仓','mobile-investment'],['search','历史投资研究','assistant-investment'],['shield','银行理财','mobile-home-bank-holdings']]:mode==='finance'?[['shield','转账与理财','mobile-bank'],['calendar','我的计划','journey-profile'],['home','账户与操作记录','journey-bank']]:[['add','快速记账','product-capture-open'],['shield','转账与理财','mobile-bank'],['investment','投资研究','assistant-investment']];
 const prompts=mode==='book'?['本月支出','本月餐饮花了多少']:mode==='finance'?['如何安排应急金','看看当前资金规划']:['如何看持仓集中度','解读当前投资组合'];
 return `<section class="fp-assistant-start"><div class="fp-assistant-actions">${actions.map(([glyph,label,action])=>`<button type="button" class="fp-assistant-action" data-action="${action}"><span class="fp-assistant-action-icon">${icon(glyph)}</span><strong>${label}</strong>${icon('next')}</button>`).join('')}</div><div class="chips">${prompts.map(text=>`<button type="button" data-action="suggestion" data-value="${esc(text)}">${esc(text)}</button>`).join('')}</div></section>`;
}
