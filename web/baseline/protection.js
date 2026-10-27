const labels={needs_confirmation:'确认后执行',needs_mfa:'需身份验证',succeeded:'已完成',unknown:'结果待核实',blocked:'已拦截',cancelled:'操作已取消',expired:'确认已失效'};
export const protectionStatus=op=>labels[op.status]||'状态待查询';
export function protectionReason(op,{hidden=false}={}) {
  if(op.status==='needs_confirmation')return '这一步会变更账户资金，请先核对对象与金额，再由你确认。';
  if(op.status==='needs_mfa')return op.kind==='subscribe'?'理财申购需要核对产品与金额，并用动态验证码确认。':'本次资金操作需要额外验证，规则也会考虑当天累计金额。';
  if(op.status==='unknown')return '本次结果尚未核实。先查询这笔结果，不要重新发起同一笔操作。';
  if(op.status==='blocked')return hidden?'操作已拦截。详细原因已隐藏，显示完整参数后再查看。':/[\u3400-\u9fff]/.test(op.message||'')?op.message:'执行前条件未满足，操作已停止。请核对当前条件或重新查询状态。';
  if(op.status==='expired')return '旧确认已失效。请重新说明需求并核对，不沿用这份旧授权。';
  if(op.status==='cancelled')return '已取消，本次没有继续执行。';
  if(op.status==='succeeded')return op.evidence==='backend_reconciliation'?'已按账户持久记录核实此操作。':'本次操作已返回完成结果，可查看记录或核对账户。';
  return '状态还不明确，请重新查询本次操作。';
}
const timeLabel=value=>Number.isFinite(value)&&value>0?new Date(value*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未提供时间';
export function operationRecordHTML(ctx,op,{hidden=false}={}) {
  const {esc,btn}=ctx,record=op.confirmation_record;
  const recorded=Number.isFinite(record?.confirmed_at)&&record.confirmed_at>0;
  const confirmation=recorded?(record.method==='dynamic_code'?'本人确认与动态验证码已核对':'已记录本人确认'):op.status==='needs_mfa'?'等待动态验证码与本人确认':op.status==='needs_confirmation'?'等待本人确认':'这条记录未提供独立确认明细';
  const execution={needs_confirmation:'尚未执行',needs_mfa:'尚未执行',unknown:'结果待核实，不能认定失败',succeeded:'已返回完成结果',blocked:'已拦截，未继续执行',cancelled:'已取消，未继续执行',expired:'旧确认已失效'}[op.status]||'请重新查询状态';
  const receipt=op.evidence==='backend_reconciliation'?'已按账户记录核实':op.receipt_hash?'已提供审计回执标识':'尚未提供审计回执标识';
  return `<details class="protection-record"><summary>本次确认与结果记录</summary><dl class="protection-record-list"><div><dt>核对记录</dt><dd>${op.handle?'已生成操作记录':'未提供操作编号'}<small>${esc(timeLabel(op.created_at))}</small></dd></div><div><dt>确认与验证</dt><dd>${esc(confirmation)}${recorded?`<small>${esc(timeLabel(record.confirmed_at))}</small>`:''}</dd></div><div><dt>执行结果</dt><dd>${esc(execution)}</dd></div><div><dt>回执 / 核实</dt><dd>${esc(receipt)}</dd></div></dl><details class="protection-reference"><summary>操作编号与原始原因</summary><p>操作编号</p><code>${hidden?'已隐藏':esc(op.handle||'未提供')}</code>${op.receipt_hash?`<p>审计回执标识（不代表到账）</p><code>${hidden?'已隐藏':esc(op.receipt_hash)}</code>`:''}${op.message?`<p>返回说明</p><p>${hidden?'内容已隐藏':esc(op.message)}</p>`:''}</details>${['unknown','blocked'].includes(op.status)?'<p class="protection-note">持续无法核实时，请保留操作编号，交由维护此系统的人员核查，勿重复提交。</p>':''}${btn('查看操作保护','journey-security','small')}</details>`;
}
export function protectionRecoveryHTML(ctx,snapshot) {
  const {esc,money,btn,prefs}=ctx;
  const pending=Array.isArray(snapshot.unresolved_operations)?snapshot.unresolved_operations:(snapshot.operations||[]).filter(op=>op.status==='unknown');
  if(!pending.length)return '';
  return `<section class="protection-pending"><h3>待核实（${pending.length}）</h3>${pending.map(op=>`<button class="protection-operation-row" data-action="journey-operation" data-handle="${esc(op.handle)}"><span><strong>${prefs.mask?'对象已隐藏':esc(op.label||'资金操作')}</strong><small>结果待核实</small></span><strong>${money(op.params.amount_minor/100)}</strong></button>`).join('')}</section>`;
}
export function protectionPageHTML(ctx,snapshot) {
  const {esc,card,btn,money,prefs}=ctx;
  const pending=Array.isArray(snapshot.unresolved_operations)?snapshot.unresolved_operations:(snapshot.operations||[]).filter(op=>op.status==='unknown');
  const rows=(snapshot.operations||[]).map(op=>`<button class="protection-operation-row" data-action="journey-operation" data-handle="${esc(op.handle)}"><span><strong>${prefs.mask?'对象已隐藏':esc(op.label||'资金操作')}</strong><small>${esc(protectionStatus(op))}</small></span><strong>${money(op.params.amount_minor/100)}</strong></button>`).join('');
  const rules=snapshot.policy_version==='2026.1.0'?'<p>转账按日累计分级：不超过1000元需本人确认，超过需额外动态验证码；任意金额理财申购均需动态验证码。赎回沿用累计资金规则。</p><p>累计资金口径包含本系统的申购和赎回，仍受单笔与日限额约束。</p>':'<p>具体确认与验证要求以本次操作返回状态为准。</p>';
  return `<div class="protection-page-content">${protectionRecoveryHTML(ctx,snapshot)}${card(`<h2>账户保护</h2><div class="setting-row"><span>动态验证码</span>${snapshot.mfa_enabled?'<strong>已配置</strong>':btn('配置','journey-mfa','small')}</div><div class="setting-row"><span>资金操作</span><strong>${snapshot.protection_locked?'已暂停':'可用'}</strong></div>${snapshot.protection_locked?`${pending.length?'<p class="protection-note">有待核实操作</p>':''}${btn('查看恢复条件','journey-recovery',pending.length?'small':'primary finance-wide')}`:''}`)}${card(`<h2>操作记录</h2>${rows||'<p class="protection-note">暂无操作记录</p>'}`)}${card(`<details class="protection-reference"><summary>确认规则</summary>${rules}</details>`)}</div>`;
}
export function protectionErrorHTML(ctx,error) {
  return ctx.card(`<div role="alert"><h2>暂时无法读取操作保护</h2></div>${ctx.btn('重新查询','refresh','primary finance-wide')}<details class="protection-reference"><summary>查看原因</summary><p>${ctx.esc(error.message||error)}</p></details>`);
}
