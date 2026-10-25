// Compact result: Stitch bd058aa349f34a7f9c0180d8bbef35db, SHA256 30409ed7e53dbd60772cba9d7b7e9bedc559478e109c3f5cb414211df2eb8a8e.
// Official Stitch native mobile structures, frozen in stitch-core-inputs:
// transfer-confirm C930C4796150B796B0C24CB4847F0B45FC2B3E4852AB4439C811006897F18518
// task-mfa 5647287DC262DA1F32D41C889A08B095011705DF30DDFFD21BD88CC431776ECC
// task-unknown 6ED8FEAD6B5D6F6C0256F0561FA2E6B71AA45824F5AF7FA52E6374FAD38E4417
// Presentation only. Existing journey owns reviews, challenges, TOTP, requests and reconciliation.
export function createProductTask(ctx){
 const {esc,icon}=ctx;
 const titles={needs_confirmation:'确认后执行',needs_mfa:'需身份验证',unknown:'待核实',succeeded:'已完成',blocked:'已拦截',cancelled:'交易已取消',expired:'确认已失效'};
 const button=(label,action,cls='',extra='')=>`<button type="button" class="fp-task-button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
 const time=value=>Number.isFinite(value)&&value>0?new Date(value*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):null;
 function render(op,{snapshot,hidden=false,accountName,reason=''}={}){
  const needs=['needs_confirmation','needs_mfa'].includes(op.status),mfa=op.status==='needs_mfa',success=op.status==='succeeded',unknown=op.status==='unknown';
  const title=titles[op.status]||'状态待查询',kind={transfer:'转账',subscribe:'理财申购',redeem:'理财赎回'}[op.kind]||'资金操作';
  const amount=hidden?'金额已隐藏':Number.isSafeInteger(op.params?.amount_minor)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(op.params.amount_minor/100):'—';
  const target=op.kind==='redeem'?'FinPilot账户':op.target_name||accountName?.(op.params?.to_account)||'待核对';
  const confirmLabel=(mfa?'验证并':'确认')+({transfer:'转账',subscribe:'申购',redeem:'赎回'}[op.kind]||'操作')+(hidden?'':` ${amount}`);
   const detail=hidden?'已隐藏':op.kind==='transfer'?(op.target_detail||''):'';
  const from=hidden?'已隐藏':accountName?.(op.params?.from_account)||'待核对';
  let next='';
  if(needs)next=`<form id="finance-confirm-form" class="fp-task-form">${mfa?(snapshot?.mfa_enabled?'<label for="finance-code">动态验证码</label><input id="finance-code" class="fp-task-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required placeholder="六位动态验证码">':button('设置动态验证码','journey-mfa','fp-task-primary')):''}<p id="finance-confirm-error" class="fp-task-error" role="alert"></p><button type="submit" class="fp-task-button fp-task-primary" ${hidden||mfa&&!snapshot?.mfa_enabled?'disabled':''}>${esc(confirmLabel)}</button><div class="fp-task-secondary">${button('返回修改','journey-edit-operation')}${button('取消交易','journey-cancel')}</div></form>`;
  else if(unknown)next=button('核实结果','journey-reconcile','fp-task-primary');
  else if(op.status==='blocked')next=button('重新查询状态','journey-operation','fp-task-primary',`data-handle="${esc(op.handle)}"`)+button('核对账户条件','journey-bank','fp-task-text');
  else if(op.status==='expired')next=button('重新说明需求','protection-new','fp-task-primary');
  else next=button('完成','journey-done','fp-task-primary');
  const mark=unknown?'?':success?'check':op.status==='blocked'?'close':'shield';
  const heading=mfa?'核对并验证这笔操作':unknown?'交易结果尚未确认':success?'操作已完成':op.status==='blocked'?'这笔操作已被拦截':op.status==='cancelled'?'这笔操作已取消':op.status==='expired'?'请重新核对参数':`确认${kind}`;
  const explanation='';
  const statusLabel=unknown?'待核实':success?'已完成':needs?'尚未执行':title;
  const product=snapshot?.products?.find(p=>p.id===op.product_id);
  const confirmed=op.confirmation_record,created=time(op.created_at),confirmedAt=time(confirmed?.confirmed_at);
  const record=`<details class="fp-task-record"><summary>${unknown?'查看记录':'操作详情'}</summary>${reason?`<p class="fp-task-reason">${esc(reason)}</p>`:''}${snapshot?.mode==='simulated_bank'?'<p class="fp-task-reason">账户范围：系统内账户</p>':''}<dl>${created?`<div><dt>创建时间</dt><dd>${esc(created)}</dd></div>`:''}${confirmedAt?`<div><dt>确认时间</dt><dd>${esc(confirmedAt)}</dd></div><div><dt>确认方式</dt><dd>${confirmed.method==='dynamic_code'?'参数确认和动态验证码':'参数确认'}</dd></div>`:''}<div><dt>结果</dt><dd>${esc(statusLabel)}</dd></div>${op.evidence==='backend_reconciliation'?'<div><dt>核实来源</dt><dd>系统账户持久记录</dd></div>':''}${op.receipt_hash?`<div><dt>审计回执标识</dt><dd class="fp-task-reference">${hidden?'已隐藏':esc(op.receipt_hash)}</dd></div>`:''}<div><dt>操作编号</dt><dd class="fp-task-reference">${hidden?'已隐藏':esc(op.handle||'未提供')}</dd></div>${op.action_digest?`<div><dt>参数摘要</dt><dd class="fp-task-reference">${hidden?'已隐藏':esc(op.action_digest)}</dd></div>`:''}</dl>${button('查看交易保护','journey-security','fp-task-text')}</details>`;
  const steps=unknown?`<ol class="fp-task-steps" aria-label="操作进度"><li class="${confirmedAt?'is-done':''}"><span>${confirmedAt?icon('check'):icon('send')}</span><small>${confirmedAt?'已提交':'已请求'}</small></li><li class="is-current" aria-current="step"><span><i></i></span><small data-task-step-current>待核实</small></li><li><span><i></i></span><small>待结果</small></li></ol>`:'';
  if(unknown)return {title:'结果待核实',html:`<div class="fp-task fp-task-unknown fp-task-compact" data-task-status="unknown"><div class="product-motion-task" data-task-motion data-motion-kind="task" data-motion-object="${esc(op.handle)}" aria-hidden="true"></div><div class="fp-task-pending-mark" aria-label="结果待核实"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/><path d="M12 7v5l3 2"/></svg><i></i></div><strong class="fp-task-compact-amount money">${esc(amount)}</strong><section class="fp-task-account-flow" aria-label="资金方向"><div><span class="fp-task-account-icon">${icon('home')}</span><span><small>转出</small><strong>${esc(from)}</strong></span></div><span class="fp-task-flow-arrow" aria-hidden="true">→</span><div><span><small>转入</small><strong>${hidden?'已隐藏':esc(target)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</span><span class="fp-task-account-icon">${icon('shield')}</span></div></section>${steps}<div class="fp-task-next">${next}</div>${record}</div>`};
  return {title,html:`<div class="fp-task ${unknown?'fp-task-unknown':success?'fp-task-success':''}" data-task-status="${esc(op.status)}"><div class="product-motion-task" data-task-motion data-motion-kind="task" data-motion-object="${esc(op.handle)}" aria-hidden="true"></div><div class="fp-task-intro"><span class="fp-task-mark">${unknown?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>':icon(mark)}</span><span class="sr-only">${heading}</span>${explanation?`<p>${explanation}</p>`:''}</div><section class="fp-task-card fp-task-amount"><span>${kind}金额</span><strong class="money">${esc(amount)}</strong>${unknown?'':`<span class="fp-task-status">${statusLabel}</span>`}</section><section class="fp-task-card"><dl class="fp-task-direction"><div><dt>转出账户</dt><dd>${esc(from)}</dd></div><div><dt>转入</dt><dd>${hidden?'已隐藏':esc(target)}${detail?`<small>${esc(detail)}</small>`:''}</dd></div>${product&&Number.isFinite(product.risk)?`<div><dt>产品风险</dt><dd>R${esc(product.risk)}</dd></div>`:''}</dl></section>${hidden?button('显示交易详情','journey-reveal','fp-task-text'):''}${steps}<div class="fp-task-next">${next}</div>${record}</div>`};
 }
 let currentOperation;
 function mount(root,op,{busy=false}={}){currentOperation=op;const step=root?.querySelector?.('[data-task-step-current]');if(step)step.textContent=busy?'核实中':'待核实';const anchor=root?.querySelector?.('[data-task-motion]');if(anchor)ctx.productMotion?.task(anchor,op,{busy});}
 function processing(form){if(!form||form.id!=='finance-confirm-form'||form.querySelector('.fp-task-processing'))return;mount(form.closest('.fp-task'),currentOperation,{busy:true});const notice=document.createElement('div');notice.className='fp-task-processing';notice.setAttribute('role','status');notice.innerHTML='<span class="fp-task-spinner" aria-hidden="true"></span><strong>正在核实操作结果</strong>';form.prepend(notice);form.setAttribute('aria-busy','true');}
 function endProcessing(form){if(form?.isConnected)mount(form.closest('.fp-task'),currentOperation,{busy:false});form?.querySelector?.('.fp-task-processing')?.remove?.();form?.removeAttribute?.('aria-busy');}
 return {render,processing,endProcessing,mount};
}


