import {investmentNavigation} from './investment-shell.js';

import {stockIdentity} from './stock-identity.js?v=r4-four-final-20261025';

const CALENDAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v3m10-3v3M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>';
const QUOTES='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>';
const SECURITY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="4"/><path d="m7 15 4-5 3 3 3-6"/></svg>';
export function researchQuoteStatus(stock){
 const q=stock?.quality||{};
 return {label:q.status==='unavailable'?'待核对':q.status==='partial'?'部分行情':q.status==='verified'?(q.latest_valid_date||'日期未提供'):'时点待核对',date:typeof q.latest_valid_date==='string'?q.latest_valid_date:'',status:q.status||'unknown'};
}
export function researchPlanning(overview){
 const p=overview?.planning,observed=Number(p?.basis?.observed_months??overview?.cashflow?.observed_months??0);
 return {ready:observed>=3&&p?.ready!==false&&Number.isSafeInteger(p?.after_goal_minor),afterGoal:p?.after_goal_minor};
}
export function createApprovedResearch(ctx){
 const {state,prefs,esc,money,icon,modal}=ctx;let current=null;
 const cash=minor=>prefs.mask?'••••':money(minor/100,'CNY');
 function planning(overview){const p=researchPlanning(overview);return `<button type="button" class="ap-r-plan" data-action="${!overview?'refresh':p.ready?'investment-section':'journey-profile'}" ${p.ready?'data-value="investment"':''}><span class="ap-r-plan-icon">${CALENDAR}</span><span><small>${p.ready?'目标预留后月均结余':'月度规划'}</small><strong>${!overview?'暂时无法读取':p.ready?cash(p.afterGoal):'先补齐月度收支'}</strong></span></button>`;}
 function row(stock){const code=String(stock.code??''),name=String(stock.name??code),quality=researchQuoteStatus(stock),favorite=(state.favorites||[]).map(String).includes(code);
  return `<button type="button" class="ap-r-stock" data-action="stock" data-code="${esc(code)}" data-name="${esc(name)}" ${String(state.selectedCode??'')===code?'aria-current="true"':''} aria-label="${esc(name+' '+code+(quality.date?' 历史行情 '+quality.date:' '+quality.label))}"><span class="ap-r-logo">${stockIdentity(code)||SECURITY}</span><span class="ap-r-stock-copy"><strong>${esc(name)}</strong><small><span>${esc(code)}</span><span>${esc(quality.label)}</span></small></span>${quoteHTML(stock)}${favorite?`<span class="ap-r-favorite" aria-label="本机已关注">${icon('star')}</span>`:''}${icon('next')}</button>`;
 }
 function quoteHTML(stock){const q=stock?.quote;if(!q||q.status==='unavailable'||q.price===null||q.price===undefined||!Number.isFinite(Number(q.price)))return '';const change=q.change_pct;return `<span class="ap-r-price"><strong>${prefs.mask?'••••':Number(q.price).toFixed(2)}</strong><small>${change===null||change===undefined?'涨跌待核对':`${Number(change)>0?'+':''}${Number(change).toFixed(2)}%`}</small></span>`;}
 function html({planning:overview=null,watchlist,portfolio=null,error=null,historyHTML=''}={}){
  current={overview,watchlist,portfolio};const history=state.investmentTab==='持仓';
  const favorites=(state.favorites||[]).map(String),rows=Array.isArray(watchlist)?[...watchlist].sort((a,b)=>Number(favorites.includes(String(b.code)))-Number(favorites.includes(String(a.code)))):[];
  const content=error?`<section class="ap-r-list ap-r-message" role="alert"><strong>研究数据暂未加载</strong><button type="button" data-action="refresh">重新读取</button></section>`:history?`<div class="ap-r-history">${historyHTML||'<section class="ap-r-list ap-r-message">暂无历史组合</section>'}</div>`:`<section class="ap-r-list"><div class="ap-r-list-head"><button type="button" class="ap-r-quotes" data-action="ap-research-quotes">${QUOTES}<span>历史行情</span></button></div>${rows.length?rows.map(row).join(''):'<div class="ap-r-message">暂无研究列表</div>'}</section>`;
  return `<div class="ap-research">${investmentNavigation('research')}<div class="ap-r-tabs" role="tablist" aria-label="研究内容">${[['自选','自选研究'],['持仓','历史组合']].map(([value,label])=>`<button type="button" role="tab" data-action="investment-tab" data-value="${value}" aria-selected="${history?value==='持仓':value==='自选'}">${label}</button>`).join('')}</div>${content}</div>`;
 }
 function quotes(){const rows=Array.isArray(current?.watchlist)?current.watchlist:[];modal('行情与标识来源',`<div class="ap-r-quote-details"><p>公司标识仅用于证券识别，来源和使用范围保存在资料记录中。</p>${rows.length?rows.map(stock=>{const q=researchQuoteStatus(stock);return `<div><span><strong>${esc(stock.name||stock.code)}</strong><small>${esc(stock.code)}</small></span><span><strong>${esc(stock.quote?.source|| (q.status==='verified'?'已核对':q.label))}</strong><time>${esc(stock.quote?.as_of||q.date||'日期未提供')}</time></span></div>`;}).join(''):'<p>暂无可用行情</p>'}<button type="button" data-action="close-sheet">关闭</button></div>`);}
 return {html,actions:{'ap-research-quotes':quotes}};
}
