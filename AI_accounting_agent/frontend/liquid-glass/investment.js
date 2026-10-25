import {finance} from './finance-api.js';

export function productAvailability(snapshot,product) {
  const capacity=product.risk===1?snapshot.cash_minor:snapshot.investable_minor;
  if(snapshot.protection_locked)return {ready:false,capacity,reason:'资金操作已暂停，请先查看操作保护。',route:'security',action:'查看操作保护'};
  if(product.eligible!==true) {
    const reason=!snapshot.risk_completed?'请先完善风险偏好，再核对这款方案。':product.risk>snapshot.risk_level?`产品风险 R${product.risk} 高于当前偏好等级 R${snapshot.risk_level}。`:snapshot.planning?.ready!==true?'长期资金安排还需核对收支资料。':'应急金与目标预留后，当前没有可用于这款方案的资金。';
    return {ready:false,capacity,reason,route:'profile',action:'核对目标与偏好'};
  }
  if(!(capacity>0))return {ready:false,capacity,reason:'当前账户没有可用于这款方案的余额。',route:'bank',action:'查看账户'};
  return {ready:true,capacity,reason:'目前满足系统的方案条件，可进入办理核对；办理时会重新检查资金与风险条件。'};
}
export const holdingPeriod=product=>product.horizon_months>0?`${product.horizon_months}个月以上`:'随时使用';
export const liquidityLabel=product=>product.liquidity==='体验中即时赎回'?'当前系统即时赎回':product.liquidity||'未提供';

export function createInvestment(ctx,{request=finance,startBanking}={}) {
  const {state,prefs,esc,money,card,btn,icon,loading,range,go,closeSheet,modal,render,toast}=ctx;
  const cash=value=>money(value/100);
  let snapshot=null,paintCurrent;
  const selected=()=>snapshot?.products?.find(p=>p.id===state.investmentChoice);
  const dimensions=product=>`<dl class="investment-dimensions"><div><dt>风险</dt><dd>R${esc(product.risk)}</dd></div><div><dt>建议期限</dt><dd>${esc(holdingPeriod(product))}</dd></div><div><dt>取用方式</dt><dd>${esc(liquidityLabel(product))}</dd></div></dl>`;
  function moreTools() {
    return `<details class="investment-more"><summary>资金计划与更多工具</summary><div class="investment-tool-list">${[['profile','目标与资金计划'],['wealth','资产总览'],['holdings','持仓管理与赎回'],['research','投资研究'],['compare','更多方案比较']].map(([route,label])=>btn(label,'investment-tool','small',`data-route="${route}"`)).join('')}</div><p class="investment-note">研究中的历史数据与当前账户持仓分别展示。</p></details>`;
  }
  function draw() {
    const products=Array.isArray(snapshot.products)?snapshot.products:[];
    if(!products.some(p=>p.id===state.investmentChoice))state.investmentChoice=null;
    const choice=selected();
    const options=products.map(p=>`<label class="investment-option"><input type="radio" name="investment-product" value="${esc(p.id)}" ${choice?.id===p.id?'checked':''}><span class="investment-option-content"><strong>${esc(p.name)}</strong><span class="investment-purpose">${esc(p.purpose)}</span>${dimensions(p)}</span></label>`).join('');
    paintCurrent(`<div class="investment-focus"><div class="investment-intro"><span class="investment-eyebrow">候选方案</span><h2>为这笔钱，选个合适的去处</h2><p>${snapshot.profile?.goal_name?'当前目标：'+esc(snapshot.profile.goal_name):'先按资金用途选方案，再核对是否适配。'}</p></div><div class="investment-account-line"><span>账户可用余额</span><strong class="money">${cash(snapshot.cash_minor)}</strong>${btn('持仓现状','investment-current-holdings','small')}</div>${products.length?`<fieldset class="investment-options"><legend class="sr-only">选择要了解的理财方案</legend>${options}</fieldset>${btn('查看所选方案','investment-details','primary finance-wide',`id="investment-view" ${choice?'':'disabled'}`)}<p class="investment-note">选择仅用于查看，不代表已申购。收益率资料未提供，不作收益预测。</p>`:card(`<div class="empty"><h3>暂无可查看的方案</h3><p>可以重新读取，或查看现有持仓。</p>${btn('重新读取','investment-refresh','primary')}</div>`,'investment-empty')}${moreTools()}</div>`);
  }
  function errorHTML(error) {
    return `<div class="investment-focus">${card(`<div role="alert"><h2>暂时无法读取理财方案</h2><p class="investment-note">当前选择会保留，请稍后重试。</p></div>${btn('重新读取','investment-refresh','primary finance-wide')}<details class="investment-more"><summary>查看原因</summary><p class="break">${esc(error.message||error)}</p></details>`,'investment-empty')}${btn('返回首页','investment-home','small')}</div>`;
  }
  async function investmentPage(paint) {
    paintCurrent=paint;const epoch=state.epoch;
    paint(`<div class="investment-focus">${loading()}</div>`);
    try {
      const data=await request('/overview');if(epoch!==state.epoch)return;
      snapshot=data;state.investmentMonthRange={...range('month')};state.investmentBasis=data.planning?.basis;draw();
    }catch(error){if(epoch===state.epoch)paint(errorHTML(error));}
  }
  function details() {
    const product=selected();if(!product){toast('请先选择一个方案');return;}
    const fit=productAvailability(snapshot,product);
    const fee=product.fee!=null&&product.fee!==''&&Number.isFinite(Number(product.fee))?money(Number(product.fee)):'未提供';
    const reasons=(snapshot.reasons||[]).map(r=>`<li>${esc(r.text)}</li>`).join('');
    modal(product.name,`<div class="investment-product-detail"><p class="investment-eyebrow">候选方案 · 尚未发起申购</p>${dimensions(product)}<h3>当前条件核对</h3><p class="investment-detail-copy">${esc(fit.reason)}</p>${fit.ready?`<p class="investment-capacity">本方案当前可安排 <strong>${cash(fit.capacity)}</strong></p>`:''}<details class="investment-more"><summary>费用、风险与资料口径</summary><dl class="investment-detail-data"><div><dt>资料列示费用</dt><dd>${fee}</dd></div><div><dt>收益率</dt><dd>当前资料未提供，不作收益预测</dd></div></dl><p class="investment-note">期限为建议持有期，取用方式按当前系统能力展示。风险等级不等于本金或收益保证。</p><p class="investment-note">方案与适配条件来自当前系统账户资料。可安排金额与账本月均结余分别统计，办理时重新核对。</p></details>${reasons?`<details class="investment-more"><summary>资金安排依据</summary><ul class="investment-reasons">${reasons}</ul>${snapshot.planning?.basis?`<p class="investment-note">收支依据：${esc(snapshot.planning.basis.start_date)} — ${esc(snapshot.planning.basis.end_date)}</p>${btn('查看依据账单','investment-basis-ledger','small')}`:''}</details>`:''}<p class="investment-note">${fit.ready?'下一步由银行助手补齐金额，再单独核对与验证。':'可先查看并完善相关条件，不会自动办理。'}</p><p id="investment-next-error" class="field-feedback" role="alert"></p>${btn(fit.ready?'去银行助手继续':fit.action,'investment-next','primary finance-wide')}<div class="investment-detail-return">${btn('返回选择','close-sheet','small')}</div></div>`);
  }
  function holdings() {
    if(!snapshot)return;
    const held=(snapshot.products||[]).filter(p=>p.holding_minor>0),total=held.reduce((sum,p)=>sum+p.holding_minor,0);
    modal('持仓现状',`<div class="investment-product-detail"><p class="investment-eyebrow">当前账户 · 已持有本金</p><strong class="investment-holding-total money">${cash(total)}</strong><p class="investment-note">仅统计当前账户的产品本金，不含候选方案、未执行需求或研究中的历史组合。</p>${held.length?held.map(p=>`<div class="investment-held-row"><span>${esc(p.name)}</span><strong>${cash(p.holding_minor)}</strong></div>`).join(''):'<p class="investment-detail-copy">当前没有持仓。查看方案不会改变持仓。</p>'}<details class="investment-more"><summary>账户口径与管理</summary><dl class="investment-detail-data"><div><dt>可用余额</dt><dd>${cash(snapshot.cash_minor)}</dd></div><div><dt>账户总额</dt><dd>${cash(snapshot.assets_minor)}</dd></div></dl><p class="investment-note">账户总额由可用余额与当前产品本金组成，不是历史收益。</p>${btn('持仓管理与赎回','investment-tool','small','data-route="holdings"')}</details>${btn('返回方案','close-sheet','primary finance-wide')}</div>`);
  }
  async function next() {
    const product=selected();if(!product)return;
    const fit=productAvailability(snapshot,product);
    if(!fit.ready){closeSheet();go(fit.route);return;}
    try{const opened=await startBanking(`申购${product.name}`);if(opened!==false)closeSheet();}
    catch(error){const el=typeof document==='undefined'?null:document.getElementById('investment-next-error');if(el)el.textContent='暂时无法打开银行助手，请重试。';else toast(error.message);}
  }
  function openLedger(dates){if(!dates)return;state.monthInitialized=true;state.ledgerRange={start_date:dates.start_date,end_date:dates.end_date};state.filter={category:'',type:'',q:''};closeSheet();go('ledger');}
  // Retain the old integration point without putting its planning card on this page.
  async function homeBlock() {
    const s=await request('/overview'),p=s.planning;if(!p)return '';
    return card(`<div class="row between"><h2>结余规划</h2>${btn('投资 '+icon('next'),'investment','small')}</div><div class="plan-preview"><span>目标预留后月均结余</span><strong>${p.ready===true?cash(p.after_goal_minor):'待核对收支'}</strong></div><div class="feature-links"><button data-action="journey-profile">${icon('calendar')}目标与偏好</button><button data-action="wealth-open">${icon('investment')}资产总览</button></div>`,'plan-card');
  }
  return {pages:{investment:investmentPage},homeBlock,errorHTML,onChange:event=>{
    const el=event.target;if(el.name!=='investment-product'||!el.checked||!snapshot?.products.some(p=>p.id===el.value))return;
    state.investmentChoice=el.value;const button=typeof document==='undefined'?null:document.getElementById('investment-view');if(button)button.disabled=false;
  },actions:{
    'investment-details':details,'investment-current-holdings':holdings,'investment-next':next,
    'investment-refresh':()=>render(),'investment-home':()=>go('home'),
    'investment-tool':button=>{if(!['wealth','profile','holdings','research','compare'].includes(button.dataset.route))return;closeSheet();go(button.dataset.route);},
    'investment-section':button=>{if(!['wealth','investment','research','holdings'].includes(button.dataset.value))return;closeSheet();go(button.dataset.value);},
    'investment-ledger':()=>openLedger(state.investmentMonthRange),'investment-basis-ledger':()=>openLedger(state.investmentBasis),
    'investment-chart':()=>{state.visualPeriod='month';state.visualRange=null;go('visualization');},
    'investment-holdings':()=>{closeSheet();go('holdings');}
  }};
}
