# FinPilot 主动提醒与跨 App 演示模块

本模块只新增 `web/proactive-demo.mjs`、`tests/proactive-demo.test.mjs` 和本文档。它不修改核心任务引擎、app、CSS、服务、凭证或配置，不自动安装或调用真实 MCP。所有外部操作、联系人和回执都是明确标记的本地演示数据。

## 已实现与演示边界

真实运行的本地逻辑包括：可注入时钟、显式触发队列、事件去重、存储快照、恢复检查、DAG依赖、逐步确认、参数版本绑定、授权期限、失败后显式重试、同一步骤幂等、并发点击合并、安全锁定与异步旧结果失效、取消未完成步骤、对话卡片数据和操作事件记录。

预置效果包括：房东邮件、月度订阅、通讯录关系、餐厅报价、蛋糕店与全部外部操作回执。没有真实邮件连接、商家消息、订餐、支付、MCP接通或声纹识别，也不会调用真实账本。`evidence.actual_external_effect` 恒为 `false`，`evidence.mcp_connected` 恒为 `false`，回执以 `DEMO:` 开头。

这不是关机后运行的全天候服务。模块没有后台轮询、`setTimeout`、浏览器存储或DOM操作。只有宿主显式调用 `tick()` 或 `run()` 才处理任务；`clock.set()` / `advance()` 只移动虚拟时间。宿主应持久化快照，在恢复会话/页面重新活跃时先恢复检查。演示控件必须写明“演示时钟”。本轮模块不含UI集成。

## 导出与接口

```js
import {
  createDemoClock, createLocalDemoAdapters, createProactiveDemo,
  proactivePlanCards, PROACTIVE_DEMO_FIXTURES, PROACTIVE_DEMO_DIALOGUES,
} from './proactive-demo.mjs';
```

`createDemoClock(start)` 返回 `{virtual:true, now(), set(iso), advance(milliseconds)}`。默认时间为 `2026-10-26T01:00:00Z`，即北京时间10月26日09:00。生日转账使用明确的 `+08:00` 时区，`2026-11-06T13:14:00+08:00` 等于 `2026-11-06T05:14:00Z`。

`createLocalDemoAdapters({fixtures?, failures?})` 返回本地适配器。`failures:{'cake.message':1}` 可预设一次失败；相同幂等键成功后再次执行返回相同回执，参数改变则报错。它只返回结构化数据，不打开真实App。

`createProactiveDemo({clock?, safetyGate, adapters?, fixtures?, snapshot?})` 返回以下API，所有读取结果均为脱离内部状态的副本：

| 方法 | 用途 |
| --- | --- |
| `createBirthdayPlan(fields={})` | 创建生日草稿，缺日期/预算/对象/城市/付款账户时只返回澄清数据，无可执行步骤 |
| `clarify(planId, patch)` | 合并补充信息；版本递增，所有未完成步骤的旧授权失效；无法偷偷改掉已完成步骤 |
| `ingestRentEmail(email=fixtures.rent_email)` | 根据已保存的租约生成提醒；相同邮件ID去重；正文不能写入指令或授权 |
| `scanSubscription()` | 在每月28日前三天至当月底生成当期提醒，每周期一次 |
| `authorize(planId, options)` | 记录当前版本、明确选择步骤、明确确认和有效期；本身不执行 |
| `run(planId)` | 按DAG执行就绪步骤；每步先重新调用宿主安全门；同任务并发调用合并 |
| `retryStep(planId, stepId)` | 将失败/暂停步骤显式恢复到待运行；随后另行调用run |
| `tick({execute:false})` | 显式扫描提醒与队列；只有 `execute:true` 才尝试执行 |
| `setLocked(true, reason)` | 暂停全部未完成步骤，使全部旧授权与在途结果失效 |
| `setLocked(false)` | 解除模块锁定；敏感步骤仍需重新授权 |
| `cancel(planId)` | 取消未完成步骤，清空授权；保留已完成回执，不宣称已经撤销外部动作 |
| `recover()` | 会话恢复，清空旧授权，逾期步骤等待重新确认，不自动补付款 |
| `reset()` | 清空本模块状态与适配器缓存；重新演示时另行 `clock.set(fixtures.start_at)` |
| `getPlan(planId)` / `snapshot()` | 获取计划/全部可序列化状态；宿主负责持久化 |
| `cards(planId)` | 生成对话内卡片数据 |
| `queue()` | 查看计划时间、是否已登记、当前授权是否有效、是否逾期 |

授权选项：

```js
demo.authorize(plan.id, {
  revision: plan.revision,
  step_ids: ['restaurant.reserve', 'cake.message', 'cake.deposit',
    'birthday.schedule', 'birthday.transfer'],
  confirmed: true,
  expires_at: '2026-11-07T00:00:00+08:00', // 未来且不超过31天；省略则15分钟
  source: 'dialogue', // 或 voice，仅是确认来源，不是身份已验证的声明
});
```

`confirmed:true` 只能来自本轮用户在对话确认卡或语音确认的明确动作，不可从邮件、商家回复、模型任意字段直接映射。授权绑定 `plan_id + revision + step_id + app + operation + payload + dependencies + scheduled_for` 的稳定JSON。它是本地参数绑定，不是加密签名或金融机构的交易授权凭据。

## 接入主任务安全门

每一个步骤，包括只读查询，都会调用宿主传入的 `safetyGate(context)`。缺失、安全门异常、格式错误或任何非明确允许结果都会暂停，绝不静默放行。

```js
const clock = createDemoClock();
const demo = createProactiveDemo({
  clock,
  // 在这里调用主任务现有的锁定、风险、身份、参数与授权检查。
  safetyGate: async context => {
    // context = {phase:'before_execute', now, mode:'local_demo',
    //   plan_id, revision, step, grant, source, locked}
    const decision = await evaluateCurrentSafety(context);
    return {
      decision: decision.allowed ? 'allow' : 'pause',
      risk: decision.risk,               // green / yellow / red
      evaluation_id: decision.id,        // 非空，关联真实本地检查证据
      reason: decision.reason,
    };
  },
});
```

`evaluateCurrentSafety` 是宿主需要连接的函数，不是本模块提供的放行器。不要在产品里照抄测试文件中的全放行fixture。红色风险的强验证、声纹异常、密码失败次数和提示词注入分类由主任务的安全模块负责；本模块不伪称实现这些检测模型。宿主锁定时同时调用 `setLocked(true, reason)`；解锁要通过主任务人工接管规则，再调用 `setLocked(false)`。

安全门即使返回允许，模块仍会再次检查时效、锁定和版本，防止异步等待期间授权过期、修改、撤销或重置。定时转账执行时重新调用安全门；逾期超过一分钟而授权来自原定时间前时，要求重新确认，避免页面睡眠后自动补付款。

邮件正文完全不被作为执行指令解析。租金目标与金额来自保存的演示租约；邮件头/金额不匹配会给出 `step.payload.source_mismatch:true` 供主安全门升级或阻断。演示邮件头没有真正进行域名或签名认证。此结构展示外部数据与用户授权分离，不等于已经实现高级注入检测。

## DAG与对话卡片

生日需要明确五项信息：`birthday_date`（YYYY-MM-DD）、`budget_minor`（整数分，包含520元）、`partner_id`、`city`、`source_account`。预置完整输入见 `PROACTIVE_DEMO_FIXTURES.birthday`。不把“下周”猜成具体日期，也不把“她”猜成新联系人。

```text
restaurant.search ─→ restaurant.reserve ───────────┐
                                                  ├─→ birthday.schedule ─→ birthday.transfer（13:14）
cake.contact ─→ cake.message ─→ cake.deposit ───────┘
```

晚餐328元、蛋糕188元、转账520元，计划总额1036元。蛋糕定金50元已包含在188元内；本地当前执行付款只有50元定金与520元转账，不把总价重复算成定金外额外支出。这个固定报价演示只接受预算至少1036元，较低预算会要求换方案，不能假装动态比价成功。

状态包括 `pending`、`started`、`succeeded`、`failed`、`needs_confirmation`、`paused`、`cancelled`。适配器调用前记录 `step_started`，返回后保存带证据的 `step_succeeded/failed/...` 事件。`snapshot().source_events` 是提醒来源；`snapshot().events` 是状态事件；`snapshot().receipts` 是本地回执；`snapshot().journal` 是执行结果索引。重试复用 `planId:stepId:vRevision`，已成功步骤不重复运行。

卡片类型为 `proactive_task`、`clarification`、`task_graph`、`confirmation`、`local_schedule`。它们是纯JSON，主UI可以沿用液态玻璃卡片与原有按钮，不需要弹子页面、modal或新增全局样式。所有来源文本必须由现有 `esc()` 转义。确认卡的 `actions` 提供 `authorize/edit/cancel` 语义；主UI自行映射 `data-action`。`local_schedule.registered:false` 仅表示待授权提案，不能显示成已成功排程。

## 主任务最小集成步骤

1. 在app的本地演示分支导入本模块，创建一个实例；与安全模块共用锁定状态。初始化时读取专属模块快照传给 `snapshot`，不要合并或写入核心交易ledger。
2. 在对话里把明确的生日意图映射为 `createBirthdayPlan`，把多轮提取的已核对字段传给 `clarify`。主动提醒通过演示按钮调用 `ingestRentEmail` 和 `tick`，来源日期直接来自卡片数据。
3. 将 `cards(planId)` 映射为现有对话内卡片。确认按钮提交当前 `revision` 和勾选的 `step_ids`；语音授权也应回显同一张卡，并经过主任务身份检查。
4. 明确授权后调用 `run`，渲染完成/失败状态及回执。要逐步动画时可在安全门或本地适配器外围提供短暂UI等待；不要把动画时间直接当成功证据。
5. 用 `clock.set('2026-11-06T05:14:00Z')`、`tick({execute:true})` 演示长线任务。保留失效、锁定、逾期重新确认三种分支。恢复会话时构造带快照的新实例或先 `recover()`，再检查队列。
6. 每次授权、修改、取消、run/tick完成后持久化 `snapshot()`。演示重置时清空这个专属快照并 `reset(); clock.set(PROACTIVE_DEMO_FIXTURES.start_at)`。

## 两段评委演示自然对话

可机读脚本与动作提示均在 `PROACTIVE_DEMO_DIALOGUES`。

**主动提醒，约45秒**

Bot：“陈先生刚发来11月房租提醒，2800元，11月1日到期。和你保存的租约一致。要从生活账户支付这一个月吗？”

用户：“确认，只付这一个月。”

Bot：“这笔演示付款已完成，回执在这里。另外，28号云音乐会员将续费25元。这次还继续吗？”

用户：“这次不续。”

Bot：“好，这次续费提醒已取消。你没有授权我处理后续月份。”

展示房东邮件来源、租约记忆、范围清晰的确认卡、独立付款回执和订阅提醒。取消的只是本地续费提案，不能宣称已经取消真实平台自动扣费。

**生日跨场景，约90秒**

用户：“我女朋友下周生日，帮我订餐厅和蛋糕，当天13:14给她转520。”

Bot：“我记得林夏在通讯录里。先确认她的生日日期、用餐城市、总预算和付款账户。”

用户：“11月6日，在上海，总共1200以内，用生活账户，收款人就是林夏。”

Bot：“晚餐328元，蛋糕188元，转账520元，总计1036元。蛋糕先付50元定金。你可以在这里逐项确认，转账只限林夏、520元和当天13:14。”

用户：“确认这些安排。”

Bot：“餐厅和蛋糕的演示回执已保存，13:14的转账在本地队列里。到时我会重新检查授权和风险。”

演示人员明确推进“演示时钟”到11月6日13:14，展示正常回执。重置后可预设蛋糕联系人步骤失败、敏感步骤声纹异常触发宿主锁定，或直接恢复到14:00展示补办确认。失败不连带取消已完成餐厅，也不重复支付定金。

## 验证

在仓库根目录运行：

```powershell
node --check web/proactive-demo.mjs
node --test tests/proactive-demo.test.mjs
```

测试覆盖正常主动提醒、正文注入不变成授权、事件去重、选定步骤授权、参数修改失效、DAG失败与依赖阻断、显式重试、幂等与并发、13:14边界、授权异步过期、定时执行前重新风险检查、安全锁定、取消/重置期间旧结果失效、快照恢复与逾期重新确认、回执证据和JSON卡片输出。它们验证本地模块逻辑，不验证真实外部集成、声纹算法或浏览器UI。
