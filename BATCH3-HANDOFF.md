# 第三批候选：投资页只做一条理财主任务

状态：实现与必要合成回归已完成，等待独立审核。沿用显式 Standard 和同一累积候选；不部署、不开展安全显性第四批。

候选：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026/artifacts/candidates/ui-batch1-20261018`。原项目与 live 服务未覆盖，未推 GitHub，未修改后端、凭证、权限、网络或真实金融账户。

## 核心任务和依据

唯一主任务：**比较两款现有理财方案 → 看懂风险/建议期限/取用方式 → 核对当前适配条件 → 交给银行助手补金额并受控申购**。

依据项目保存于 2026-10-15 的 `docs/competition/REQUIREMENTS.md`：“理财操作”明确列出推荐和比较产品、风险评估、申购赎回；至少覆盖六类中的三类，典型能力表不是逐项强制清单。项目保存的差距分析也将方向收敛为银行助手，而非继续扩展交易终端。本批只使用已保存规则及最新源码，没有声称重新核验当前官网或已满足全部赛事要求。包内附原始规则与差距分析副本供审核，均未改写。

最新 `/finance/overview` 的真实产品字段：`id/name/risk/liquidity/horizon_months/fee/purpose/holding_minor/eligible`。目前仅“灵活现金”和“长期均衡”两款，风险为 R1/R3，建议期限为0/12个月，资料列示费用均为0元；**没有收益率字段**，因此不制造收益预测、不借用回测收益或承诺收益。

## 删减与保留理由

| 原信息/能力 | 本批处理 | 理由 |
| --- | --- | --- |
| 当月账本收入、支出、结余与月份控件 | 从投资首屏移除，账本与图表能力保留 | 前两批已有明确职责，避免再复制首页/账本 |
| 月均资金规划、目标预留、应急金等成组指标 | 下沉到“目标与资金计划”“资产总览”入口 | 主任务先看方案，计算和目标管理按需进入 |
| 投资研究、历史组合、更多比较 | 收入“资金计划与更多工具”折叠入口 | 保留能力，不在首次进入时摊成复杂终端 |
| 当前持仓与候选方案 | 分开呈现 | 候选方案不显示为已买；“持仓现状”只汇总实际已持有本金 |
| 风险、建议期限、取用方式 | 作为三个关键比较维度 | 字段真实可用，直接支持选择；建议期限不等于锁定期 |
| 费用、收益率缺失、适配依据 | 产品详情内按需展开 | 保留关键事实和口径，不堆满首屏 |
| 申购、赎回、风险/MFA/幂等/核实能力 | 全部保留 | 申购交给现有银行助手，赎回仍可从持仓管理进入；没有删后端或改弱验证 |

## 最终交互

首次进入 `#/investment`：短目标引导、简洁账户余额行、两款候选方案及一个“查看所选方案”主按钮。必须主动选择；没有默认把某款标成推荐或已持有。选择是本地查看状态，不创建申购。

方案详情显示当前条件核对和可安排金额。适配采用服务端 `eligible`，金额沿用现有逻辑：R1 使用账户可用余额，长期方案使用 `investable_minor`。没有另造个人推荐算法；尤其没有把尚未填风险偏好一概改成 R1 禁止办理。条件不足时，主按钮进入实际的计划/偏好、账户或操作保护页面，不伪造通过状态。

“去银行助手继续”只预填“申购灵活现金”等已选产品文字，不自动发送，不代填金额，不调用 review/confirm。用户发送后由现有任务流程补金额，核对并按实际状态完成确认/MFA。返回投资页时选项保留，重新读取实际账户数据。

“持仓现状”单独显示已持有本金与产品明细；账户总额为可用余额加持仓本金，不是收益。候选方案、未执行需求和研究中的历史组合都不计入。空持仓明确告知没有持仓，返回方案即可。

## 操作复验

1. **首次选择**：投资 → 按资金用途选“灵活现金”或“长期均衡” → 查看所选方案 → 查看风险、期限、取用与费用/资料口径 → 返回选择。原选项仍在。
2. **适配到受控办理**：查看方案 → 展开资金安排依据 → 若条件满足，去银行助手继续 → 确认仅预填产品 → 用户发送 → 补金额 → 按现有流程核对、确认/验证。条件不足则进入相应真实资料/账户出口；本页不会直接执行申购。
3. **持仓与恢复**：投资 → 持仓现状 → 核对本金与账户口径 → 返回方案。空目录可重新读取，读取失败保留选择且可重试或返回首页；历史研究/持仓管理仍在更多工具。

## 文件范围

业务源码仅以下五份：

- `investment.js`：单一方案任务、详情/持仓区分、适配与口径、错误和空态；保留旧 `homeBlock` 接口及高级路由能力。
- `investment.css`：只对投资聚焦区及其详情增加轻量布局、窄屏与 reduced-motion 样式。
- `investment-shell.js`：共享导航名称改为“理财方案”“持仓管理”，不重写高级页面。
- `app.js`：绑定方案选择事件和银行助手预填入口；投资页不再先读取无关的账本 health/聚合再显示方案。
- `banking.js`：仅新增 `start(text)` 适配，复用已有新需求状态并预填；忙碌时拒绝切换。没有改动第二批执行、恢复或确认流程。

均位于 `AI_accounting_agent/frontend/liquid-glass/`。新增测试 `tests/test_investment_focus_data.py` 与 `tests/investment_focus.test.mjs`。其余新增文件为本说明、候选定位、补丁、已有规则副本和测试证据。没有后端/API实现改动，`journey.js` 本批未改。

## 检查结果与边界

已通过：4份 JS 语法检查；投资页6组任务检查；新目录字段/账户口径2项隔离API检查和10项既有金融/规划回归，共12项 Python 测试；第一批10组页面、第二批5组既有前端+5组任务流，以及21路由导航回归。新增API测试初次漏导入依赖fixture，已修正并重跑通过。

复验命令（候选根目录）：

```sh
/home/bld/data/data4/admin/fintechcom/.venv/bin/python -m pytest -q tests/test_investment_focus_data.py tests/test_banking_tasks.py tests/test_finance_workspace.py tests/test_finance_planning.py -k 'investment_catalog or plan_uses_ledger_monthly_flow or multiturn_edit_persistence or idempotent_replay_and_versions or model_outage_keeps_latest_correction or bills_are_read_only or confirmation_binding_idempotency or cumulative_large_transfer or cancel_and_other_action_challenge or post_commit_fault_is_unknown_until_read_only_reconciliation or products_move_principal'
node tests/investment_focus.test.mjs
node tests/banking_frontend.test.mjs
node tests/banking_flow.test.mjs
node tests/primary_pages.test.mjs
node tests/navigation.test.mjs
```

API检查会在 `.runtime/investment-focus/overview.json` 写入临时 TestClient 目录的真实响应供前端测试使用；没有读取 live 账本或调用真实模型。非零持仓的前端用例是明确标记的合成变体，以123.45+45.67=169.12元验证本金口径，不冒充 live 持仓。

详细日志、机器结果与静态 HTML 在 `review/investment-batch3/`，包含首屏、方案详情、持仓、空目录及错误。静态证据为实际模块输出，无交互脚本，增量包附未修改的基础样式便于打开；它们不是截图或视觉验收。

**真实浏览器交互、390px、200%缩放、实际键盘/焦点、动效与 reduced-motion 仍待验，无新截图。** 未重试此前受限 Chromium 路径，未换运行时绕过。既有 `e2e_investment.py` 针对旧资金规划首屏，本批未运行，也未改成假通过；未来浏览器验收应按本批新任务更新其断言。

本增量叠加于已接受的第一批、描述小补丁和第二批。对应 Library：第一批 `libfile_4035e266ef088191a82f245dceeb3010`；描述补丁 `libfile_dbcabc5c2ce88191b5bfd20ce0c57ea2`；第二批 `libfile_0b65337dc6488191ba303359df1f78bc`（版本1）。本批交付后等待独立审核，不开始第四批。
