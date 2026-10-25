import {liquidityLabel} from './investment.js';
import {protectionStatus,protectionReason,operationRecordHTML,protectionPageHTML,protectionRecoveryHTML,protectionErrorHTML} from './protection.js';
import {helpButton} from './learning.js';
import {finance as financeRequest} from './finance-api.js';
import {investmentNavigation} from './investment-shell.js';

export function createJourney(ctx,{request=financeRequest}={}) {
  const finance=request;
  let bankingFlow=null;
  const {state,prefs,storage,esc,money,number,card,btn,icon,loading,modal,closeSheet,toast,go,render,ask,resetLedgerContext}=ctx;
  let snapshot, operation, pendingProfile, revealed=false, draftMessageIndex=null;
  let draft=storage.get('QINGCAI_FINANCE_DRAFT',null);
  const uuid=()=>globalThis.crypto?.randomUUID?.()||`q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const statuses={needs_confirmation:'等待确认',needs_mfa:'需要验证码',succeeded:'已完成',unknown:'待核实',blocked:'已拦截',cancelled:'已取消',expired:'已失效'};
  const stages={unknown:'选择目前阶段',student:'在校学习',early_career:'初入职场',freelance:'自由职业'};
  const cash=value=>money(value/100);
  const plainCash=value=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(value/100);
  const field=(label,id,options)=>`<label class="field-label" for="${id}">${esc(label)}</label>${options}`;
  const feedback=id=>`<p id="${id}" class="field-feedback" role="alert"></p>`;
  const input=(id,value,extra='')=>`<input class="field" id="${id}" value="${esc(value)}" ${extra}>`;
  let viewSequence=0;
  const sheetGeneration=()=>ctx.getSheetGeneration?.()??0;
  const leaseView=()=>({sequence:++viewSequence,route:state.route,generation:sheetGeneration()});
  const ownsView=lease=>lease.sequence===viewSequence&&lease.route===state.route&&lease.generation===sheetGeneration();
  async function load(lease=null) {const value=await finance('/overview');if(!lease||ownsView(lease))snapshot=value;return value;}
  const reasons=s=>s.reasons.map(r=>`<div class="plan-reason">${icon('check')}<span>${esc(r.text)}</span></div>`).join('');
  const protectedLink=()=>`<button class="protection-link" data-action="journey-security">${icon('shield')}操作保护${icon('next')}</button>`;

  async function holdingsPage(paint) {
    const epoch=state.epoch;
    paint(investmentNavigation('holdings')+loading());
    const s=await load();if(epoch!==state.epoch)return;
    if(ctx.approvedWealth){paint(investmentNavigation('holdings')+ctx.approvedWealth.html(s));return;}
    const products=s.products.map(p=>{
      const capacity=p.risk===1?s.cash_minor:s.investable_minor;
      const canBuy=p.eligible&&capacity>0;
      const reason=s.cash_minor<=0?'当前没有可用余额':!p.eligible?!s.risk_completed?'请先完善风险偏好':!s.planning.ready?s.planning.quality.message:'当前偏好或预留条件不满足':capacity<=0?'当前资金需留作应急与目标':'';
      return `<article class="finance-product" data-holding-product="${p.id}"><div class="row between"><h3>${esc(p.name)}</h3><span class="risk-pill">R${p.risk} ${helpButton('risk')}</span></div><p>${esc(p.purpose)}</p><div class="row between"><span>${esc(liquidityLabel(p))}</span><strong>${cash(p.holding_minor)}</strong></div><div class="product-capacity"><span>可用金额</span><strong>${cash(p.eligible?Math.max(0,capacity):0)}</strong></div>${reason?`<p class="product-unavailable">${esc(reason)}</p>`:''}<div class="actions">${btn('申购','journey-subscribe','primary small',`data-product="${p.id}" ${canBuy?'':'disabled'}`)}${p.holding_minor?btn('赎回','journey-redeem','glass small',`data-product="${p.id}"`):btn('查看资金条件','journey-profile','glass small')}</div></article>`;
    }).join('');
    paint(investmentNavigation('holdings')+card(`<div class="row between"><h2>账户资产</h2><button class="icon-button" data-action="mask" aria-label="${prefs.mask?'显示金额':'隐藏金额'}">${icon('eye')}</button></div><p class="hero-amount money">${cash(s.assets_minor)}</p><div class="finance-metrics"><div><span>可用余额</span><strong>${cash(s.cash_minor)}</strong></div><div><span>持有本金</span><strong>${cash(s.assets_minor-s.cash_minor)}</strong></div></div><div class="actions mt">${btn('账户','journey-bank','small glass')}${btn('操作记录','journey-security','small glass')}</div>`,'simulated-assets')+
      card(`<div class="row between"><h2>申购与赎回</h2>${btn('方案比较','journey-compare','small')}</div>${products}`,'holdings-products')+protectedLink());
  }

  async function profilePage(paint) {
    paint(loading());const s=await load(),p=s.profile,f=s.cashflow;
    const questions=[['资金用途','近期可能要用','一年内可留存','一年以上不用'],['投资经验','没有经验','了解一些产品','经历过涨跌'],['面对亏损','不能接受','能接受少量波动','能接受明显波动'],['偏好的方案','随时可用','稳中求进','更关注长期增长']];
    paint(card(`<div class="row between"><h2>账单告诉我的</h2><span class="tag">${f.observed_months} 个月</span></div><div class="finance-metrics"><div><span>月均收入</span><strong>${cash(f.monthly_income_minor)}</strong></div><div><span>月均支出</span><strong>${cash(f.monthly_expense_minor)}</strong></div><div><span>月均结余</span><strong>${cash(f.monthly_net_minor)}</strong></div><div><span>收入节奏</span><strong>${esc(f.income_stability)}</strong></div></div><p class="period-stamp">${esc(f.start_date)} — ${esc(f.end_date)}</p>`)+
      (s.bill_checks.length?card(`<h2 class="mb">待核对账单</h2>${s.bill_checks.map(item=>`<button class="finance-operation-row" data-action="journey-bill-check" data-date="${esc(item.event_date)}"><span class="operation-icon">${icon('ledger')}</span><span class="grow"><strong>${esc(item.category)}</strong><span>${esc(item.event_date)}</span></span><strong>${cash(item.amount_minor)}</strong></button>`).join('')}`):'')+
      card(`<form id="finance-profile-form"><h2 class="mb">我的计划</h2><label class="field-label" for="finance-scope">账本</label><select class="field" id="finance-scope"><option value="demo" ${p.ledger_scope==='demo'?'selected':''}>默认账本</option><option value="personal" ${p.ledger_scope==='personal'?'selected':''}>个人账本</option></select>${field('目前阶段','finance-stage',`<select class="field" id="finance-stage">${Object.entries(stages).map(([k,v])=>`<option value="${k}" ${p.stage===k?'selected':''}>${v}</option>`).join('')}</select>`)}<div class="finance-form-grid">${field('目标名称','finance-goal',input('finance-goal',p.goal_name,'maxlength="40" placeholder="旅行、学费、租房…"'))}${field('目标金额（元）','finance-goal-amount',input('finance-goal-amount',p.goal_amount,'inputmode="decimal" pattern="(0|[1-9][0-9]*)(\\.[0-9]{1,2})?" required'))}${field('规划月数','finance-months',input('finance-months',p.goal_months,'type="number" min="1" max="60" required'))}</div><details class="profile-section" open><summary>开销与还款</summary><div class="finance-form-grid">${field('应急金覆盖月数','finance-reserve',input('finance-reserve',p.reserve_months,'type="number" min="1" max="6" required'))}${field('每月生活开销下限（元）','finance-commitment',input('finance-commitment',p.commitment_amount,'inputmode="decimal" required'))}${field('未计入账单的每月还款（元）','finance-debt',input('finance-debt',p.debt_monthly_amount||'0','inputmode="decimal" required'))}</div><label class="cashflow-confirm"><input id="finance-confirmed" type="checkbox" ${p.cashflow_confirmed?'checked':''}><span>已核对月度收入、开销和还款，没有遗漏</span></label></details><details class="profile-section"><summary>风险偏好 · ${s.risk_completed?'已填写':'待完善'}</summary><div class="risk-questions">${questions.map(([q,...choices],i)=>`<fieldset><legend>${esc(q)}</legend>${choices.map((choice,v)=>`<label><input type="radio" name="risk-${i}" value="${v}" ${p.risk_answers[i]===v?'checked':''}>${esc(choice)}</label>`).join('')}</fieldset>`).join('')}</div></details>${feedback('finance-profile-error')}<button type="submit" class="btn primary finance-wide">保存计划</button></form>`));
  }

  function draftForm(kind='transfer',productId=null) {
    if(!snapshot)return;
    ++viewSequence;
    if(!draft || draft.kind!==kind || draft.product_id!==productId)draft={kind,product_id:productId,recipient_id:snapshot.recipients[0].id,amount:'',request_id:uuid()};
    const p=snapshot.products.find(p=>p.id===productId);
    const title=kind==='transfer'?'转账':`${kind==='subscribe'?'理财申购':'理财赎回'} · ${p?.name||''}`;
    const target=kind==='transfer'?field('收款人','finance-recipient',`<select class="field" id="finance-recipient">${snapshot.recipients.map(r=>`<option value="${esc(r.id)}" ${draft.recipient_id===r.id?'selected':''}>${esc(r.name)} · ${esc(r.remark)}</option>`).join('')}</select>`):`<div class="row between mb"><h3>${esc(p.name)}</h3><span class="risk-pill">R${p.risk} ${helpButton('risk')}</span></div>`;
    modal(title,`<form id="finance-operation-form">${target}${field('金额（元）','finance-amount',input('finance-amount',draft.amount,'inputmode="decimal" required autocomplete="off" placeholder="0.00" pattern="[0-9]+(\\.[0-9]{1,2})?"'))}${feedback('finance-operation-error')}${bankingFlow?'<p class="banking-copy">修改后重新核对，再确认执行。</p><details class="banking-technical"><summary>操作保护</summary>'+protectedLink()+'</details>':protectedLink()}<div class="actions">${btn('取消','close-sheet','','type="button"')}<button type="submit" class="btn primary">核对操作</button></div></form>`);
  }

  async function openDraft(data,flow=null) {
    const lease=leaseView();
    if(!data||!['transfer','subscribe','redeem'].includes(data.kind))throw new Error('操作草稿不受支持');
    await load(lease);if(!ownsView(lease))return;
    bankingFlow=flow;
    if(data.kind==='transfer'&&!snapshot.recipients.some(item=>item.id===data.recipient_id))throw new Error('请重新核对收款人');
    if(data.kind!=='transfer'&&!snapshot.products.some(item=>item.id===data.product_id))throw new Error('请重新核对理财产品');
    draftMessageIndex=null;
    draft={...data,product_id:data.product_id||null,request_id:data.request_id||uuid()};
    if(bankingFlow)await reviewDraft(lease);else draftForm(draft.kind,draft.product_id);
  }

  function confirmationView(op) {
    ++viewSequence;operation=op;bankingFlow?.onOperation?.(op);
    if(ctx.productTask){
      const accountName=id=>id==='acct-user'?'FinPilot账户':snapshot?.products?.find(row=>row.account===id)?.name||snapshot?.recipients?.find(row=>row.id===id)?.name||'待核对账户';
      const view=ctx.productTask.render(op,{snapshot,hidden:prefs.mask&&!revealed,accountName,reason:protectionReason(op,{hidden:prefs.mask&&!revealed})});
      modal(view.title,view.html);ctx.productTask.mount(document.querySelector('#sheet-content'),op);return;
    }
    const status=protectionStatus(op),needs=['needs_confirmation','needs_mfa'].includes(op.status),hidden=prefs.mask&&!revealed;
    const accountName=id=>id==='acct-user'?'FinPilot账户':id==='fund-reserve'?'灵活现金':id==='fund-growth'?'长期均衡':snapshot?.recipients.find(r=>r.id===id)?.name||'当前账户';
    const targetName=op.kind==='redeem'?'FinPilot账户':op.target_name,targetDetail=['subscribe','redeem'].includes(op.kind)?'本金划转':op.target_detail;
    const detail=hidden?'已隐藏':`${esc(targetName)}<br>${esc(targetDetail)}`;
    const product=snapshot?.products.find(p=>p.id===op.product_id),label={transfer:'转账',subscribe:'理财申购',redeem:'理财赎回'}[op.kind]||op.label;
    const confirmActions=`<button type="submit" class="btn primary finance-wide" ${hidden||op.status==='needs_mfa'&&!snapshot?.mfa_enabled?'disabled':''}>${op.status==='needs_mfa'?'验证并确认':'确认执行'}</button><div class="banking-secondary">${btn('返回修改','journey-edit-operation','','type="button"')}${btn('取消操作','journey-cancel','','type="button"')}</div>`;
    let next;
    if(needs)next=`<form id="finance-confirm-form">${op.status==='needs_mfa'?(snapshot?.mfa_enabled?field('动态验证码','finance-code',input('finance-code','','inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required')):btn('配置动态验证码','journey-mfa','glass finance-wide')):''}${feedback('finance-confirm-error')}${confirmActions}</form>`;
    else if(op.status==='unknown')next=btn('核实操作结果','journey-reconcile','primary finance-wide');
    else if(op.status==='blocked')next=btn('重新查询状态','journey-operation','primary finance-wide',`data-handle="${esc(op.handle)}"`)+`<div class="banking-secondary">${btn('核对账户条件','journey-bank','small')}${btn('重新说明需求','protection-new','small')}</div>`;
    else if(op.status==='expired')next=btn('重新说明需求','protection-new','primary finance-wide');
    else next=btn('完成','journey-done','primary finance-wide');
    modal(status,`<div class="protection-operation ${bankingFlow?'banking-operation-step':''}"><div class="confirmation-status ${op.status==='succeeded'?'good':''}"><strong>${esc(status)}</strong></div><p class="hero-amount center money">${hidden?'••••':plainCash(op.params.amount_minor)}</p><dl class="confirmation-details"><dt>操作</dt><dd>${esc(label)}</dd><dt>转出账户</dt><dd>${hidden?'已隐藏':esc(accountName(op.params.from_account))}</dd><dt>转入</dt><dd>${detail}</dd>${product?`<dt>风险等级</dt><dd>R${esc(product.risk)}</dd>`:''}</dl><p class="protection-reason">${esc(protectionReason(op,{hidden}))}${hidden&&needs?' 当前对象和金额已隐藏，请先显示完整参数后核对。':''}</p>${hidden?btn('显示完整参数','journey-reveal','glass finance-wide'):''}${next}${operationRecordHTML(ctx,op,{hidden})}</div>`);
  }

  async function reviewDraft(lease=leaseView()) {
        const reviewedDraft={...draft},messageIndex=draftMessageIndex;
        storage.set('QINGCAI_FINANCE_DRAFT',reviewedDraft);
        const body={kind:reviewedDraft.kind,amount:reviewedDraft.amount,request_id:reviewedDraft.request_id,...(reviewedDraft.feedback_ref?{feedback_ref:reviewedDraft.feedback_ref}:{}),...(reviewedDraft.kind==='transfer'?{recipient_id:reviewedDraft.recipient_id}:{product_id:reviewedDraft.product_id})};
        const result=await finance('/operations/review',{method:'POST',body});if(!ownsView(lease))return;
        operation=result;if(messageIndex!==null){state.chats.finance[messageIndex].action_draft={...reviewedDraft};storage.set('QINGCAI_CHATS',state.chats);}revealed=false;confirmationView(operation);
  }
  async function openOperation(handle,flow=null) {
    const lease=leaseView();await load(lease);if(!ownsView(lease))return;
    const op=await finance('/operations/'+encodeURIComponent(handle));if(!ownsView(lease))return;
    bankingFlow=flow;
    draft={kind:op.kind,recipient_id:op.kind==='transfer'?op.params.to_account:undefined,product_id:op.product_id||null,amount:(op.params.amount_minor/100).toFixed(2),request_id:uuid()};
    revealed=false;confirmationView(op);
  }

  async function bankPage(paint) {
    paint(loading());const s=await load();
    paint(card(`<div class="row between"><h2>FinPilot账户</h2><span class="tag">${s.mode==='simulated_bank'?'系统内账户':'账户'}</span></div><p class="hero-amount money">${cash(s.cash_minor)}</p>${s.mode==='simulated_bank'?'<details class="primary-details"><summary>账户范围</summary><p>当前余额与资金操作来自系统内账户，未连接外部银行，不表示外部银行到账。</p></details>':''}<div class="actions">${btn('转账','journey-transfer','primary')}${btn('导入流水','statement-import','glass')}</div>`)+
      card(`<h2 class="mb">常用收款人</h2>${s.recipients.map(r=>`<button class="finance-contact" data-action="journey-contact" data-recipient="${esc(r.id)}"><span class="stock-symbol">${esc(r.name[0])}</span><span class="grow"><strong>${esc(r.name)}</strong><span>${prefs.mask?'••••':esc(r.phone)}</span></span>${icon('next')}</button>`).join('')}`)+
      card(`<div class="row between mb"><h2>最近操作</h2>${btn('全部','journey-security','small')}</div>${operationRows(s.operations.slice(0,5))}`));
  }

  function operationRows(items) {
    return items.length?items.map(o=>`<button class="finance-operation-row" data-action="journey-operation" data-handle="${esc(o.handle)}"><span class="operation-icon">${icon(o.status==='succeeded'?'check':'shield')}</span><span class="grow"><strong>${esc(o.label)}</strong><span>${esc(statuses[o.status]||o.status)}</span></span><strong>${cash(o.params.amount_minor)}</strong></button>`).join(''):`<div class="empty">${icon('shield')}<p>还没有资金操作</p></div>`;
  }

  async function securityPage(paint) {
    paint(loading());try{const s=await load();paint(protectionPageHTML(ctx,s));}catch(error){paint(protectionErrorHTML(ctx,error));}
  }

  async function comparePage(paint) {
    paint(loading());const s=await load();
    paint(card(`<div class="row between mb"><h2>方案比较</h2>${btn('看懂术语','learn-library','small glass')}</div><div class="finance-table"><table><thead><tr><th>方案</th>${s.products.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${[['风险',p=>'R'+p.risk],['适合资金',p=>p.purpose],['建议期限',p=>p.horizon_months?'一年以上':'随时使用'],['赎回',p=>liquidityLabel(p)],['费用',p=>p.fee+' 元'],['当前持有',p=>cash(p.holding_minor)]].map(([label,value])=>`<tr><th>${label}${({'风险':'risk','赎回':'liquidity','费用':'fee'})[label]?helpButton(({'风险':'risk','赎回':'liquidity','费用':'fee'})[label]):''}</th>${s.products.map(p=>`<td>${esc(value(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="mt">${btn('试算涨跌与费用','learn-scenario','glass finance-wide')}</div>`)+card(`<h2 class="mb">账户适配</h2><dl class="funding-breakdown"><div><dt>目标预留后月均结余</dt><dd>${s.planning?.ready?cash(s.planning.after_goal_minor):'待核对'}</dd></div><div><dt>可安排金额</dt><dd>${s.planning?.ready?cash(s.investable_minor):'待核对'}</dd></div></dl>${reasons(s)}<div class="actions">${btn('调整计划','journey-profile','glass')}${btn('持仓管理','investment-holdings','primary')}</div>`));
  }

  async function setupMFA() {
    const lease=leaseView();const data=await finance('/mfa/setup',{method:'POST',body:{}});if(!ownsView(lease))return;
    modal('开启动态验证码',`<form id="finance-mfa-form"><p class="dialog-message">用验证器扫码，再输入六位验证码。</p><img class="mfa-qr" src="${esc(data.qr)}" alt="FinPilot动态验证码配置二维码"><details><summary>手动输入密钥</summary><code class="mfa-secret">${esc(data.secret)}</code></details>${field('验证码','finance-activation-code',input('finance-activation-code','','inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required'))}${feedback('finance-mfa-error')}<button type="submit" class="btn primary finance-wide">验证并开启</button></form>`);
  }

  async function submit(event) {
    const form=event.target;if(!['finance-profile-form','finance-operation-form','finance-confirm-form','finance-mfa-form','finance-recovery-form'].includes(form.id))return;
    event.preventDefault();const button=form.querySelector('button[type="submit"]');if(button.disabled)return;button.disabled=true;
    const error=form.querySelector('[role="alert"]');if(error)error.textContent='';
    const val=id=>document.getElementById(id)?.value||'';
    try {
      if(form.id==='finance-profile-form') {
        const answers=[0,1,2,3].map(i=>form.querySelector(`input[name="risk-${i}"]:checked`));
        if(answers.some(Boolean)&&!answers.every(Boolean))throw new Error('请完成全部四个风险偏好问题');
        const profile={...snapshot.profile,ledger_scope:val('finance-scope'),stage:val('finance-stage'),goal_name:val('finance-goal').trim(),goal_amount:val('finance-goal-amount'),goal_months:Number(val('finance-months')),reserve_months:Number(val('finance-reserve')),commitment_amount:val('finance-commitment'),debt_monthly_amount:val('finance-debt'),cashflow_confirmed:document.getElementById('finance-confirmed').checked,risk_answers:answers.every(Boolean)?answers.map(a=>Number(a.value)):[]};
        if(snapshot.profile.goal_name&&profile.goal_name!==snapshot.profile.goal_name){pendingProfile=profile;modal('目标已更换',`<p class="dialog-message">「${esc(snapshot.profile.goal_name)}」已记录 ${cash(Math.round(Number(snapshot.profile.goal_recorded_amount)*100))}。新目标「${esc(profile.goal_name||'未设置')}」如何处理进度？</p><div class="col">${btn('作为新目标，进度归零','journey-goal-replace','primary')}${profile.goal_name?btn('只是修改名称，保留进度','journey-goal-keep','glass'):''}${btn('返回修改','close-sheet')}</div>`);return;}
        await saveProfile(profile);
      } else if(form.id==='finance-operation-form') {
        const amount=val('finance-amount'),recipient=val('finance-recipient');
        if(draft.amount!==amount||draft.recipient_id!==recipient&&draft.kind==='transfer')draft.request_id=uuid();
        draft.amount=amount;if(draft.kind==='transfer')draft.recipient_id=recipient;
        await reviewDraft();
      } else if(form.id==='finance-confirm-form') {
        const reviewed=operation,owns=()=>operation?.handle===reviewed.handle&&form.isConnected&&document.querySelector('#sheet')?.open;
        const body={challenge:reviewed.challenge};if(reviewed.status==='needs_mfa')body.code=val('finance-code');
        ctx.productTask?.processing(form);
        try {const result=await finance(`/operations/${reviewed.handle}/confirm`,{method:'POST',body,timeout:25000});if(!owns())return;operation=result;}
        catch(e) {if(owns()&&(e.message.includes('超时')||e.message.includes('无法连接'))) {operation={...reviewed,status:'unknown',message:'确认请求未取得结果，请核实后再继续。'};confirmationView(operation);}throw e;}
        try{snapshot=await load();}catch{if(owns())toast('操作结果已返回，账户概况可稍后重新查询');}if(owns())confirmationView(operation);
      } else if(form.id==='finance-recovery-form') {
        await finance('/protection/recover',{method:'POST',body:{challenge:form.dataset.challenge,code:val('finance-recovery-code')}});closeSheet();toast('资金操作已恢复');render();
      } else {
        const lease=leaseView(),reviewed=operation;
        await finance('/mfa/activate',{method:'POST',body:{code:val('finance-activation-code')}});if(!ownsView(lease))return;
        await load(lease);if(!ownsView(lease))return;toast('动态验证码已开启');
        if(reviewed?.status==='needs_mfa'){const result=await finance(`/operations/${reviewed.handle}`);if(ownsView(lease)&&operation?.handle===reviewed.handle)confirmationView(result);}else {closeSheet();render();}
      }
    } catch(e) {const el=form.querySelector('[role="alert"]');if(el?.isConnected)el.textContent=e.message;else toast(e.message);}
    finally {ctx.productTask?.endProcessing(form);if(button.isConnected)button.disabled=false;}
  }

  async function saveProfile(profile){
    const keepMonth=profile.ledger_scope===snapshot.profile.ledger_scope;
    snapshot=await finance('/profile',{method:'POST',body:profile});pendingProfile=null;closeSheet();resetLedgerContext({keepMonth});toast('计划已保存');go('investment');
  }
  async function chooseGoal(button, action){
    if(button.disabled||!pendingProfile)return;button.disabled=true;
    try{await saveProfile({...pendingProfile,goal_action:action});}finally{if(button.isConnected)button.disabled=false;}
  }
  const actions={
    'journey-goal-replace':b=>chooseGoal(b,'replace'),
    'journey-goal-keep':b=>chooseGoal(b,'keep'),
    'journey-bill-check':b=>{state.month=b.dataset.date.slice(0,7);state.monthInitialized=true;state.ledgerRange={start_date:b.dataset.date,end_date:b.dataset.date};state.filter={category:'',type:'',q:''};go('ledger');},
    'journey-bank':()=>{closeSheet();go('bank');},
    'journey-profile':()=>{closeSheet();go('profile');},
    'journey-security':()=>{closeSheet();go('security');},
    'journey-compare':()=>go('compare'),
  'journey-fund-condition':b=>{if(!snapshot||!ctx.approvedWealth)return;const p=snapshot.products.find(p=>String(p.id)===String(b.dataset.product));if(p)modal(p.name,ctx.approvedWealth.product(snapshot,p.id));},
    'journey-research':()=>go('research'),
    'journey-transfer':()=>{bankingFlow=null;draftMessageIndex=null;draft=null;draftForm();},
    'journey-contact':b=>{bankingFlow=null;draftMessageIndex=null;draft={kind:'transfer',product_id:null,recipient_id:b.dataset.recipient,amount:'',request_id:uuid()};draftForm();},
    'journey-subscribe':async b=>{const lease=leaseView();await load(lease);if(!ownsView(lease))return;bankingFlow=null;draftMessageIndex=null;draft=null;draftForm('subscribe',b.dataset.product);},
    'journey-redeem':async b=>{const lease=leaseView();await load(lease);if(!ownsView(lease))return;bankingFlow=null;draftMessageIndex=null;draft=null;draftForm('redeem',b.dataset.product);},
    'journey-operation':async b=>{await openOperation(b.dataset.handle);},
    'journey-reveal':()=>{revealed=true;confirmationView(operation);},
    'journey-edit-operation':async()=>{if(!['needs_confirmation','needs_mfa'].includes(operation?.status))return;const lease=leaseView(),reviewed=operation,reviewedDraft={...draft},flow=bankingFlow;const linked=flow?.taskRequestId&&reviewedDraft.kind==='transfer';const cancelled=await finance(`/operations/${reviewed.handle}/cancel`,{method:'POST',body:linked?{keep_task:true}:{}});if(!ownsView(lease)||operation?.handle!==reviewed.handle)return;if(cancelled.status!=='cancelled'){confirmationView(cancelled);return;}operation=cancelled;flow?.onOperation?.(cancelled);draft={...reviewedDraft,request_id:linked?`${flow.taskRequestId}-edit-${uuid().slice(0,8)}`:uuid()};draftForm(draft.kind,draft.product_id);},
    'journey-cancel':async()=>{if(!operation)return;const lease=leaseView(),reviewed=operation;const result=await finance(`/operations/${reviewed.handle}/cancel`,{method:'POST',body:{}});if(!ownsView(lease)||operation?.handle!==reviewed.handle)return;operation=result;confirmationView(operation);},
    'journey-reconcile':async b=>{if(b.disabled)return;b.disabled=true;b.setAttribute('aria-busy','true');const reviewed=operation;ctx.productTask?.mount(b.closest('.fp-task'),reviewed,{busy:true});try{const result=await finance(`/operations/${reviewed.handle}/reconcile`,{method:'POST',body:{}});if(b.isConnected&&document.querySelector('#sheet')?.open&&operation?.handle===reviewed.handle){operation=result;confirmationView(operation);}}finally{b.disabled=false;b.removeAttribute('aria-busy');if(b.isConnected)ctx.productTask?.mount(b.closest('.fp-task'),operation,{busy:false});}},
    'journey-done':()=>{draft=null;storage.set('QINGCAI_FINANCE_DRAFT',null);closeSheet();render();},
    'journey-mfa':setupMFA,
    'journey-recovery':async()=>{operation=null;const data=await finance('/protection/recovery');if(data.unresolved){try{snapshot=await load();modal('先核实操作结果',protectionRecoveryHTML(ctx,snapshot)+btn('返回操作保护','journey-security','small'));}catch{modal('先核实操作结果',`<p class="protection-note">还有 ${esc(data.unresolved)} 笔结果待核实，暂时无法读取列表，请重新查询。</p>${btn('重新查询操作保护','journey-security','primary finance-wide')}`);}return;}if(!data.locked){toast('资金操作当前未暂停');render();return;}if(!snapshot?.mfa_enabled){toast('恢复需要动态验证码，请先配置');await setupMFA();return;}modal('恢复资金操作',`<form id="finance-recovery-form" data-challenge="${esc(data.challenge)}"><p class="dialog-message">当前没有待核实操作。输入动态验证码后恢复后续操作，历史操作不会重新执行。</p>${field('动态验证码','finance-recovery-code',input('finance-recovery-code','','inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required'))}${feedback('finance-recovery-error')}<button type="submit" class="btn primary finance-wide">验证并恢复</button></form>`);},
    'journey-ask-plan':()=>ask('请帮我看看目前的资金安排，目标和应急金该怎么兼顾？','finance'),
    'journey-chat-draft':async b=>{const lease=leaseView(),index=Number(b.dataset.index);const data=state.chats.finance[index]?.action_draft;if(!data)return;await load(lease);if(!ownsView(lease))return;bankingFlow=null;draftMessageIndex=index;if(!data.request_id){data.request_id=uuid();storage.set('QINGCAI_CHATS',state.chats);}draft={...data,product_id:data.product_id||null};draftForm(data.kind,data.product_id||null);},
    'journey-chat-template':b=>{closeSheet();ask(b.dataset.text,'finance');}
  };
  function showQuickInputs() {
    modal('资金规划快捷输入',`<div class="quick-links">${btn('账户','journey-bank','small glass')}${btn('我的计划','journey-profile','small glass')}${btn('方案比较','journey-compare','small glass')}</div><div class="template-list">${['转给小林 80 元','给房东转 500 元房租','存 200 元到灵活现金','从灵活现金赎回 100 元','应急金和旅行目标该怎么安排？'].map(t=>`<button class="template-item" data-action="journey-chat-template" data-text="${esc(t)}"><span>${esc(t)}</span>${icon('next')}</button>`).join('')}</div>`);
  }
  const chatTools=()=>`<div class="quick-links">${btn('我的计划','journey-profile','small glass')}${btn('我的资产','wealth-open','small glass')}${btn('方案比较','journey-compare','small glass')}${btn('看懂术语','learn-library','small glass')}</div>`;
  const chatDraftButton=(message,index)=>message.action_draft?btn('核对草稿','journey-chat-draft','small glass',`data-index="${index}"`):message.plan_next==='wealth'?btn('查看资产','wealth-open','small glass'):message.plan_next==='import'?btn('补充流水','statement-import','small glass'):message.plan_next==='profile'?btn('调整计划','journey-profile','small glass'):message.plan_next==='compare'?btn('比较方案','journey-compare','small glass'):'';
  return {pages:{holdings:holdingsPage,profile:profilePage,bank:bankPage,security:securityPage,compare:comparePage},actions,onSubmit:submit,chatTools,chatDraftButton,showQuickInputs,openDraft,openOperation};
}
