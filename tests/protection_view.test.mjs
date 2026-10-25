import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {protectionReason,operationRecordHTML,protectionPageHTML} from '../AI_accounting_agent/frontend/liquid-glass/protection.js';
import {createJourney} from '../AI_accounting_agent/frontend/liquid-glass/journey.js';
import {createPrimaryPages} from '../AI_accounting_agent/frontend/liquid-glass/primary-pages.js';

const data=name=>JSON.parse(readFileSync(`.runtime/protection-view/${name}.json`,'utf8'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const output='review/security-batch4',checks=[];mkdirSync(output,{recursive:true});
const check=text=>{checks.push(text);console.log('PASS:',text);};
function fixture({snapshot=data('empty'),op=data('needs-confirmation'),confirmed=data('reconciled')}={}) {
  const calls=[],pages=[],saved=new Map(),fields=new Map(),toasts=[];
  let html='',dialog=null,failRead=false,recovery={locked:false,unresolved:0,challenge:'deterministic-recovery-challenge'};
  const ctx={state:{route:'security',epoch:1,filter:{}},prefs:{mask:false},esc,storage:{get:(k,d)=>saved.get(k)??d,set:(k,v)=>saved.set(k,v)},money:value=>ctx.prefs.mask?'••••':'¥'+Number(value).toFixed(2),number:String,icon:()=>'<svg aria-hidden="true"></svg>',card:(body,cls='')=>`<section class="surface-card ${cls}">${body}</section>`,btn:(label,action,cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`,loading:()=>'<p>读取中</p>',modal:(title,body)=>{dialog={title,body};},closeSheet:()=>{dialog=null;},toast:text=>toasts.push(text),render:()=>{},go:route=>pages.push(route)};
  globalThis.document={getElementById:id=>({value:fields.get(id)||''}),activeElement:null,querySelectorAll:()=>[],querySelector:()=>null};
  const request=async(path,options)=>{
    calls.push({path,options:structuredClone(options)});
    if(path==='/overview'){if(failRead)throw new Error('<账户概况读取失败>');return structuredClone(snapshot);}
    if(path==='/protection/recovery')return structuredClone(recovery);
    if(path===`/operations/${op.handle}`)return {...structuredClone(op),challenge:'deterministic-operation-challenge'};
    if(path===`/operations/${op.handle}/confirm`){assert.equal(options.body.challenge,'deterministic-operation-challenge');if(op.status==='needs_mfa')assert.equal(options.body.code,'123456');return {...structuredClone(confirmed),handle:op.handle};}
    if(path===`/operations/${op.handle}/reconcile`)return {...data('reconciled'),handle:op.handle};
    throw new Error('unexpected '+path);
  };
  const journey=createJourney(ctx,{request});
  const paint=value=>{html=value;};
  async function submit(values={}) {
    for(const [k,v] of Object.entries(values))fields.set(k,v);
    const feedback={textContent:'',isConnected:true},button={disabled:false,isConnected:true};
    await journey.onSubmit({target:{id:'finance-confirm-form',querySelector:selector=>selector==='button[type="submit"]'?button:feedback},preventDefault(){}});
    return feedback.textContent;
  }
  return {ctx,journey,calls,pages,paint,submit,toasts,get html(){return html;},get dialog(){return dialog;},set failRead(v){failRead=v;},set recovery(v){recovery=v;}};
}
function snapshot(name,body,route='security') {
  writeFileSync(`${output}/${name}.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>静态证据 · 操作保护</title>${['tokens','app','features','journey','glass','banking','protection'].map(n=>`<link rel="stylesheet" href="../../AI_accounting_agent/frontend/liquid-glass/${n}.css">`).join('')}<body><div id="app" class="app-shell" data-route="${route}"><main class="page-content ${route}-page">${body}<p class="hint">真实模块静态输出；无交互脚本，非截图，未做浏览器视觉验收。</p></main></div></body></html>`);
}

{
  const f=fixture(),primary=createPrimaryPages(f.ctx);primary.actions['protection-open']();assert.deepEqual(f.pages,['security']);
  const home=readFileSync('AI_accounting_agent/frontend/liquid-glass/primary-pages.js','utf8');
  assert.match(home,/btn\('操作保护','protection-open','small'/);
  await f.journey.pages.security(f.paint);
  for(const text of ['查询不多一步','动用资金，先核对','结果不明，先查询','配置动态验证码','还没有资金操作记录','不代表已执行检查'])assert.ok(f.html.includes(text),text);
  assert.doesNotMatch(f.html,/全程安全|银行级|认证通过|已拦截\d|已通过\d|操作保护.*%/);
  assert.ok(f.calls.every(c=>!c.options));snapshot('01-empty-first-entry',f.html);
  check('首页紧凑次级入口直达保护说明；空记录只描述已有能力和实际设置，不伪造保护次数或已通过检查，查询无资金确认。');
}
{
  const f=fixture();await f.journey.openOperation(data('needs-confirmation').handle);
  assert.match(f.dialog.body,/本人确认|核对对象与金额|等待本人确认|尚未执行/);assert.doesNotMatch(f.dialog.body,/finance-code/);
  snapshot('02-confirmation-reason',f.dialog.body,'banking');
  const g=fixture({snapshot:data('after-mfa'),op:data('needs-mfa'),confirmed:data('mfa-succeeded')});await g.journey.openOperation(data('needs-mfa').handle);
  assert.match(g.dialog.body,/理财申购需要核对产品与金额|finance-code|等待动态验证码与本人确认|验证并确认/);
  assert.doesNotMatch(g.dialog.body,/本人确认与动态验证码已核对/);snapshot('03-verification-reason',g.dialog.body,'banking');
  assert.equal(await g.submit({'finance-code':'123456'}),'');
  assert.match(g.dialog.body,/本人确认与动态验证码已核对|已完成/);snapshot('04-actual-verification-record',g.dialog.body,'banking');
  const legacy=operationRecordHTML(f.ctx,{...data('mfa-succeeded'),confirmation_record:undefined});assert.match(legacy,/未提供独立确认明细/);assert.doesNotMatch(legacy,/本人确认与动态验证码已核对/);
  check('本人确认与动态验证码按实际状态说明原因；真实确认事实才显示完成记录，旧记录不补造通过信息；现有 challenge/code 传递不变。');
}
{
  const f=fixture();f.ctx.prefs.mask=true;await f.journey.openOperation(data('needs-confirmation').handle);
  assert.match(f.dialog.body,/显示完整参数/);assert.match(f.dialog.body,/<button type="submit"[^>]*disabled/);
  assert.doesNotMatch(f.dialog.body,/小林|\$|￥10|CNY|核对完整参数已完成/);
  const record=operationRecordHTML(f.ctx,data('reconciled'),{hidden:true});assert.ok(!record.includes(data('reconciled').handle));
  f.journey.actions['journey-reveal']();assert.doesNotMatch(f.dialog.body,/<button type="submit"[^>]*disabled/);assert.match(f.dialog.body,/小林|10\.00/);
  assert.equal(f.calls.filter(c=>c.options).length,0);snapshot('05-mask-before-reveal',record);
  check('隐藏模式不泄露对象/金额/操作编号，执行按钮先禁用；显示完整参数仅改变展示，不提交或伪造核对结果。');
}
{
  const unknown=data('unknown'),f=fixture({snapshot:data('pending-with-older-operation'),op:unknown});
  await f.journey.pages.security(f.paint);assert.ok(f.html.includes(unknown.handle));assert.match(f.html,/先核实待定结果|结果待核实/);snapshot('06-older-unresolved-operation',f.html);
  await f.journey.openOperation(unknown.handle);assert.match(f.dialog.body,/尚未核实|不要重新发起|核实操作结果|不能认定失败/);
  assert.doesNotMatch(f.dialog.body,/finance-confirm-form|data-action="protection-new"|journey-edit-operation/);snapshot('07-unknown-recovery',f.dialog.body,'banking');
  await f.journey.actions['journey-reconcile']({disabled:false});assert.match(f.dialog.body,/账户持久记录核实|已按账户记录核实/);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/reconcile')).length,1);assert.ok(!f.calls.some(c=>c.path.endsWith('/confirm')||c.path.endsWith('/review')));
  f.recovery={locked:true,unresolved:1};await f.journey.actions['journey-recovery']();assert.match(f.dialog.body,/核实不会重新发起扣款/);assert.doesNotMatch(f.dialog.body,/finance-recovery-form|验证并恢复/);
  assert.ok(!f.calls.some(c=>c.path.endsWith('/recover')));
  check('超过最近12条的未决操作仍可找到；未知结果只核实同一笔，恢复先列待核实操作，不重试扣款、不展示恢复捷径。');
}
{
  // Explicitly synthetic blocked renderer fixture; not a claim of a new detected attack.
  const blocked={...data('needs-confirmation'),status:'blocked',message:'可用余额不足，请核对账户条件'};
  const f=fixture({op:blocked});await f.journey.openOperation(blocked.handle);
  assert.match(f.dialog.body,/可用余额不足|重新查询状态|核对账户条件|重新说明需求/);assert.doesNotMatch(f.dialog.body,/finance-confirm-form|>继续执行<|忽略限制/);snapshot('08-blocked-conditions',f.dialog.body,'banking');
  assert.match(protectionReason({...blocked,message:'non-user-facing reason'}),/执行前条件未满足/);
  const appSource=readFileSync('AI_accounting_agent/frontend/liquid-glass/app.js','utf8');
  const actionSource=appSource.match(/'protection-new':(\(\)=>\{[^\n]+\}),/)[1];
  let opened=0,closed=0,busy=false;
  const newIntent=runInNewContext(`(${actionSource})`,{banking:{start:text=>{assert.equal(text,'');opened++;return !busy;}},closeSheet:()=>{closed++;}});
  newIntent();assert.equal(opened,1);assert.equal(closed,1,'same banking route must also close the old blocked sheet');
  busy=true;newIntent();assert.equal(closed,1,'busy guard retains the current sheet');
  const g=fixture();await g.journey.pages.security(g.paint);g.failRead=true;await g.journey.pages.security(g.paint);
  assert.match(g.html,/暂时无法读取|重新查询|&lt;账户概况读取失败&gt;/);assert.doesNotMatch(g.html,/当前未暂停|已配置/);snapshot('09-read-error',g.html);
  g.failRead=false;g.recovery={locked:false,unresolved:0};await g.journey.actions['journey-recovery']();assert.equal(g.dialog,null);assert.match(g.toasts.at(-1),/当前未暂停/);
  check('受阻理由保留实际条件并给查询/修改出口，无绕过确认；读取失败不显示旧设置为通过，未暂停时不增加恢复验证码。');
}
{
  const f=fixture();await f.journey.openOperation(data('needs-confirmation').handle);f.failRead=true;
  assert.equal(await f.submit(),'');assert.match(f.dialog.body,/已完成|按账户持久记录核实/);assert.match(f.toasts.at(-1),/操作结果已返回/);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/confirm')).length,1);
  check('确认已经返回结果时，随后账户概况读取失败不会掩盖该真实结果，也不会触发重试。');
}
writeFileSync(`${output}/checks.json`,JSON.stringify({checks,fixture:'real temporary API records; blocked variant and browser/DOM transport are explicitly deterministic stubs',browser_validation:'pending; browser path not retried',live_operations:false},null,2));
console.log(`PASS: ${checks.length} visible protection groups.`);
