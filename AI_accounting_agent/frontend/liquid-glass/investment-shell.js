const sections = [['investment','个人持仓'],['holdings','银行理财'],['research','投资研究']];

export function investmentNavigation(active) {
  return `<nav id="investment-sections" class="investment-sections segmented glass" aria-label="投资模块">${sections.map(([route,label])=>`<button type="button" data-action="investment-section" data-value="${route}" ${route===active?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;
}
