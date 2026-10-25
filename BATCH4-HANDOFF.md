# 第四批候选：可理解的操作保护

状态：第四批实现和必要回归完成，等待独立跨页审核。前三批已接受；浏览器交互与视觉仍待验。本任务保持显式 Standard，通过配置好的 hft SSH CLI 操作同一累积候选，未向无法确认服务档位的原会话启动推理。

完整候选：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026/artifacts/candidates/ui-batch1-20261018`。

原项目：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026`。live 服务 `finpilot-fintechathon-20261015.service` 只读核对仍为 active，MainPID=2207383，WorkingDirectory 仍指向原项目。没有部署、重启服务、推送 GitHub、删除数据或改变权限/网络/凭证；所有资金效果仅发生在临时合成测试账户。

## 本批只统一三个触点

1. **执行前为什么需要确认/验证**：银行助手及同一资金确认弹层按真实 `needs_confirmation/needs_mfa` 状态给出短解释。理财申购说明产品、金额和动态验证码；其他资金操作说明可能涉及日累计规则。主动作、返回修改、取消仍调用原接口。金额隐藏时先显示完整参数，再核对；不额外要求低风险账单查询做资金确认。
2. **受阻/未知结果下一步做什么**：未知结果只提供核实同一笔，明确不能把未知当失败重发；受阻显示服务端条件原因，给重新查询、核对账户、重新说明需求出口，失效则重新说明。重新说明仅重置本地输入，不代发需求或资金请求。同路由也关闭旧弹层；忙碌时保留当前任务。恢复条件有未决操作时展示实际列表，不给恢复捷径。
3. **保护在哪里、发生了什么**：首页加一个紧凑的次级“操作保护”入口，不改变原主要动作。保护页先说明已有能力，再展示实际验证码配置/暂停状态及操作记录。确认弹层将确认事实、执行状态、审计回执和原始原因折叠展示；未产生事件时不编造次数，旧记录缺少独立确认明细时明确说未提供。

没有新增“全程安全”“银行级认证”、假注入拦截次数或假检查通过标记。审计 hash 明确是审计回执，不代表到账；执行结果与账户核实分别按服务端实际字段呈现。没有改造其他页面或扩张权限体系。

## 现有能力 → 可见状态/事件映射

| 能力 | 实际来源 | 本批展示与边界 |
| --- | --- | --- |
| 风险分级与对象/金额核对 | 既有 `finance_workspace.review/confirmation_view`、`configs/fintechathon_policy.yaml`，操作 `level/status/params` | 根据返回状态显示确认/验证原因，对象和整数分金额沿用实际参数。策略版本2026.1.0的规则在详情列出：转账按日累计不超过1000元需确认、超过需验证码；申购任意金额需验证码；赎回沿用累计资金口径并仍受限额约束。没有改规则或伪造某笔已完成检查。 |
| 本人确认/MFA | 既有 challenge、`verify_code`、绑定的 `gateway.approve` | **新增事实字段** `confirmation_record={confirmed_at,method}`，只在既有所有所需审批成功后、原本写入 unknown 的同一次更新中记录。方法为 confirmation/dynamic_code；错误、未配置或已消耗验证码不产生该字段。旧记录不回填；不存验证码/密钥，也不把字段当授权证明。 |
| 金额与对象隐私 | 既有 `prefs.mask` 与会话内 `revealed` | 隐藏金额、对象、操作编号、审计标识和原始原因；资金确认按钮仍沿用显示完整参数后才能用的约束。这是显示控制，没有声称加密或安全认证。 |
| 未决结果与恢复 | 既有 unknown、`reconcile`、circuit 暂停及恢复 challenge/MFA | **新增只读聚合字段** `overview.unresolved_operations`：列出已有实际 unknown 操作，不受最近12条限制，不包含 challenge。恢复仍必须先核实未决、满足既有验证码与恢复条件；核实不新发扣款。没有新端点、数据库表或恢复权限。 |
| 执行/审计记录 | 既有 `created_at/status/receipt_hash/evidence/message` | 按需显示实际记录。`receipt_hash` 标为审计回执；`backend_reconciliation` 标为账户记录核实；confirmation_record 缺失时不推断已验证。两者不冒充银行到账证明。 |
| 助手输入与权限/注入边界 | 既有受控草稿、来源绑定及确认边界 | 仅说明助手建议不能直接授权资金操作。当前公开操作接口没有独立“注入已检测”事件，本批不编造此类徽章、计数或检测结论，也未开展注入攻击/协议探测测试。 |
| 持续失败的支持出口 | 实际操作编号、原始返回原因 | 提示保留编号交系统维护人员核查；没有假造客服电话、支持工单服务或保证恢复。 |

后端仅修改一份 `finance_workspace.py`，增加以上两个事实/聚合字段。审批、MFA、额度、challenge、执行、幂等、核实与恢复逻辑保持原语义。接口列表响应继续不暴露 challenge。

## 复验路径与证据

- **首次寻找保护**：首页 → 次级“操作保护” → 能力说明、当前设置、最近记录。无事件时仅描述可用能力，不假称检查已经发生。
- **确认/验证原因**：银行助手 → 既有资金草稿 → 核对。普通确认无验证码表单；实际 needs_mfa 才显示验证输入。参数隐藏时先显示；返回修改仍先取消旧确认，再用新 request_id 核对。
- **受阻恢复**：实际受阻状态 → 看短原因 → 重新查询同一操作/核对账户/重新说明；不能确认执行。前端受阻例使用明确标注的合成状态，未声称新检测到攻击。
- **未知恢复**：操作记录或“待核实”列表 → 同一 handle → 核实结果。即使该操作早于最近12条仍可找到；没有重新 review/confirm，不重复扣款。存在未决时恢复入口只给待核实清单。
- **读取错误**：保护页读失败有明确重查，不显示未读取的设置为通过。确认已经返回完成结果而后续 overview 失败时，仍呈现该操作真实结果，提示概况稍后查询。

`verification/results.json` 的13项命令全部退出0：

- 5个改动 JS 文件语法检查。
- 新增2项真实 TestClient API 测试：实际 MFA 确认事实、旧未决记录发现与只读核实。项目既有虚拟环境运行；系统Python缺FastAPI的初次收集失败已纠正，不计为通过证据。
- 新增 `protection_view.test.mjs` 6组确定性检查：真实模块 + 脱敏真实API记录 + 请求/DOM桩。检查了入口、原因、旧记录不伪造、隐私显示门槛、未知/受阻/恢复路径和概况读取失败。
- 已接受前三批的 `primary_pages`、`banking_frontend`、`banking_flow`、`investment_focus`、`navigation` 均通过。
- 必要后端组合回归15项通过，35项未选；覆盖前三批、真实确认与MFA、取消、未决核实、现有恢复边界。日志有依赖弃用警告，未引入本批功能失败。

`verification/*.html` 为真实模块生成的静态布局/状态证据，按钮没有运行脚本，**不是截图，不代表浏览器验收**。`verification/api/*.json` 来自临时TestClient，已排除 challenge、验证码密钥和otpauth URI；合成受阻状态与DOM/传输桩在测试内明确标注。

Chromium 历史 `setsockopt EPERM`/SIGTRAP 路径没有重试，没有更换运行时绕过。本批没有页面实测或截图。CSS 与原生 button/input/details 提供窄屏换行、键盘焦点与 reduced-motion 分支，但390px、200%缩放、实际键盘/读屏顺序、弹层滚动和真实动效均待受支持浏览器独立验证。

## 增量文件与回退

业务源码8份：前端 `primary-pages.js/banking.js/journey.js/app.js/index.html/protection.js/protection.css`，后端 `finance_workspace.py`。新增2份测试。其余文件为未改动依赖、静态证据、测试记录与交接，不作为业务变更。

`batch4.patch` 使用 POSIX 路径与LF换行，仅包含第四批，基线是已接受第三批。完整候选的 `git apply --check --reverse batch4.patch` 已退出0，证据见 `verification/rollback-dry-run.log`。实际恢复可先重复此检查，再反向应用；此处未执行回退。未触碰 live，审核后是否部署另行决定。

完成本批后停止实现，等待独立跨页审核；未宣称整体视觉通过，也不自行开展下一批。
