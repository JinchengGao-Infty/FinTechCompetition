# 第二批候选：银行助手的信息层级与交互

状态：实现及必要合成回归完成，等待独立审核；不部署、不开展第三批。第一批及文案小补丁保留在同一累积候选，浏览器待验标记继续保留。

候选：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026/artifacts/candidates/ui-batch1-20261018`。

本次仍在显式 Standard 委派任务通过受支持的 hft SSH CLI 执行，没有启动原会话推理。原项目源码和 live 服务未覆盖，未推 GitHub、未改后端、凭证、网络或权限。

## 首屏和当前一步

首次进入按“一句短引导 → 输入框 → 查账单/转账/办理理财三个入口”排列。入口只填入需求，不自动发送。输入支持 Enter 发送、Shift+Enter 换行及输入法组合输入。

有任务后只突出当前需要注意的一步：补问、待核对的对象/金额、查询结果或实际资金操作状态。完整对话、流程、任务编号、来源依据及回执默认折叠，仍可按需查看。查询结果以相关金额为主，其他金额及来源账单展开查看。

就绪任务从卡片上的对象和金额进入现有 operations/review，再进入现有的确认/MFA流程，省掉再次原样展示参数表单的一步；“返回修改”才打开参数表单。任务本身仍不能执行资金操作，最终执行仍需现有独立 confirm 与后端验证。

银行助手上下文中的“确认后执行”“需身份验证”“已拦截”“已完成”等取自实际操作响应。确认请求无法取得结果时显示“结果待核实”，不宣称成功。没有根据任务类型或前端金额推断 MFA。申购/赎回展示实际产品风险级别；金额、对象及返回的关键失败原因保持可见。不展示重复的模拟/合成横幅，也不声称真实银行连接或第三方认证。

## 三条任务的操作步骤

1. **首次发起查询**：打开 `#/banking` → 选择“查账单”或输入“本月收支是多少” → 发送 → 查看主要金额 → 按需展开金额/来源，或进入对应账本。查询不创建资金操作；空区间有换区间或补账单的出口。
2. **修改需要确认的操作**：输入“给小林转80元” → 补齐必要信息 → 核对对象/金额 → “核对并继续” → 按实际响应进入确认或身份验证 → “返回修改” → 旧确认先取消 → 在参数表单改为50元 → 重新核对 → 按返回状态确认/验证 → 查看结果及下一步。取消失败不会进入可重新确认的新表单；已完成或待核实的操作不能走此返回修改入口。
3. **失败恢复不重复执行**：任务请求失败时，输入保留，显式“重试这一步”复用原正文和请求 ID。若是 confirm 后无法取得结果，界面显示待核实，刷新后通过同一任务关联的操作 handle 读取实际状态；“核实结果”走原 read/reconcile，不新建 review 或重新 confirm。执行结果未明时不自动重试资金操作。

请求或取消处理中继续输入的新文字不会被完成回调清空。普通状态更新不调用滚动或新焦点；仅恢复本来正在编辑的输入焦点，或响应用户主动选择入口/修改时 focus，使用 preventScroll。保留原有取消、新需求、返回修改和显式失败重试路径。

## 具体变更文件

业务源码仅以下四份：

- `AI_accounting_agent/frontend/liquid-glass/banking.js`：输入优先首屏、当前一步、折叠信息、真实操作状态回接、同一操作恢复、输入和焦点保留。
- `AI_accounting_agent/frontend/liquid-glass/banking.css`：银行助手及其确认弹窗的作用域布局、短过渡、窄屏和 reduced-motion。
- `AI_accounting_agent/frontend/liquid-glass/journey.js`：银行助手上下文的确认呈现/返回修改/状态回调；复用原 review、confirm、cancel、reconcile 和 MFA。其他 Journey 页面保留默认呈现；请求参数、风险策略与后端协议没有改动。
- `AI_accounting_agent/frontend/liquid-glass/app.js`：把现有 Journey 的操作详情入口传给银行助手。

测试：调整 `tests/banking_frontend.test.mjs` 的展示断言及目录读请求夹具；新增 `tests/banking_flow.test.mjs`，直接联调实际 Banking/Journey 模块，使用确定性请求和轻量 DOM 容器。另有本说明、候选批次定位、增量补丁和静态证据，无后端/API实现修改。

## 验证与证据边界

已通过：

- 三份 JS 的 Node 语法检查。
- 既有银行助手前端 5 组回归：稳定请求身份、显式幂等重试、版本改口、事实转义与隐私、过期任务与迟到列表。
- 新增 5 组联调：首次查询、确认前返回修改再确认、未知结果刷新恢复并核实、实际 needs_mfa 的验证码路径、处理中输入保留。
- 第一批页面 10 组回归仍通过。
- 9 项既有隔离后端测试通过，覆盖任务多轮修改/幂等/模型中断/只读查询、参数绑定与持久幂等、累计金额 MFA、取消与 challenge 绑定、未知结果核实、产品本金口径。未增加安全协议审计。

在候选根目录复验：

```sh
node --check AI_accounting_agent/frontend/liquid-glass/banking.js
node --check AI_accounting_agent/frontend/liquid-glass/journey.js
node --check AI_accounting_agent/frontend/liquid-glass/app.js
node tests/banking_frontend.test.mjs
node tests/banking_flow.test.mjs
node tests/primary_pages.test.mjs
/home/bld/data/data4/admin/fintechcom/.venv/bin/python -m pytest -q tests/test_banking_tasks.py tests/test_finance_workspace.py -k 'multiturn_edit_persistence or idempotent_replay_and_versions or model_outage_keeps_latest_correction or bills_are_read_only or confirmation_binding_idempotency or cumulative_large_transfer or cancel_and_other_action_challenge or post_commit_fault_is_unknown_until_read_only_reconciliation or products_move_principal'
```

完整日志和机器结果见 `review/banking-batch2/`。静态 HTML 由实际模块输出，包含首次进入、查询结果、确认80元、完成50元、结果待核实。这些输出没有运行脚本或完整 App 外框，只作为结构证据；增量包附未改动的基础 CSS 以便打开预览，不将它们列为业务改动。

**没有真实浏览器交互实测，没有新截图。** 未重试此前受限的 hft Chromium 路径，未换运行时绕过。390px、200% 缩放、实际键盘/焦点、短动画与 reduced-motion 仍待独立浏览器验收。前端联调的资金效果计数是合成接口行为，后端资金语义由上述独立 TestClient 测试核对；均不是 live 金融操作。

增量叠加在已接受的第一批和描述小补丁之上：第一批 Library `libfile_4035e266ef088191a82f245dceeb3010`；描述小补丁 `libfile_dbcabc5c2ce88191b5bfd20ce0c57ea2`。本轮只交银行助手，等待独立审核后再安排第三批。
