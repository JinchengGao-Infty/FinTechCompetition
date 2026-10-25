# FinPilot 第一批候选：三页职责与首屏

状态：实现及必要合成回归已完成，等待方向负责人独立审核。未部署，未开展第二批。

## 候选与执行路径

- 原项目：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026`
- 候选：`/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026/artifacts/candidates/ui-batch1-20261018`
- 本次基于读取时的现有工作树复制，保留原有未提交修改；排除 `.env`、`.runtime`、`artifacts`、缓存和 Git 元数据。没有复制 live 凭证或账本。
- 原会话 `01a11437-28ae-7a43-8f6e-000c7f5b3b6e` 的后台工具没有服务档位读写字段；`read_thread` 返回 MCP -32000，未取得聊天记忆。没有向该会话发送消息或启动推理。本次在显式 Standard 委派任务内通过已配置 hft SSH CLI 完成，关闭端口转发。
- live 为用户级 `finpilot-fintechathon-20261015.service`，原工作目录与 5503 服务未替换。候选没有启动 HTTP 服务。候选缺少 live `.env` 与账本，**不要以默认端口直接运行候选启动器**。
- 回退定位：live 始终仍使用原目录，无需回滚生产文件。独立审核通过前不应用补丁、不推 GitHub。

## 页面职责与最终行为

| 页面 | 首屏焦点 | 主要动作 | 按需展开 |
| --- | --- | --- | --- |
| 首页 | 明确日期区间、本期结余；收入支出是次要信息 | 查看本期最大支出分类；无支出时补充记录 | 次级入口到账本或图表 |
| 账本 | 搜索与记录本身；日期、分类、收支筛选；一行结果金额 | 记一笔 | 账单详情、编辑分类与明细、记录来源与删除、统计口径 |
| 图表 | 支出较上期变化、最大支出类别 | 查看最大支出对应账单 | 对比区间及金额、趋势逐项金额、其余分类 |

移除了这三页重复的银行助手入口、首页交易列表/趋势图、账本结余/规划卡、图表结余/目标卡。保留 430px 竖版与既有玻璃材质，没有改造其他页面。

账单详情是原生 dialog，关闭不重新加载列表，搜索、筛选与区间保留。清除搜索/分类时保留钻取日期；“按月查看”才退出自定义区间。现有导航仍负责返回、滚动及前进后退。

三页及其账单详情、编辑框不展示反复的模拟/合成标签。对 synthetic 来源且匹配已知末尾标记的描述，仅做展示格式化；详情不显示开发来源标签或原始标记文本，不替换为银行来源。编辑时未改展示描述则提交原始 description；用户明确改写才提交新值。手工记录及普通正文不做全局替换。没有宣称外部银行已连接、资金到账或获得第三方认证；比赛技术说明和账户页未改。

## 数据口径与可核验验证

复用 `/reports/aggregate`、`/bills` 及其真实字段，不增加资金操作。账本结果按整数分求和，和现有聚合一样排除 `metadata.movement` 为 `internal_transfer`/`principal` 的记录；收入包含已记录退款。图表上期是**本期之前的等长区间**，显示准确起止日期，不称为自然月环比。缺少上期收支时不显示虚构增减百分比。

隔离 TestClient 账本示例（测试数据，非 live 金额）：2026-09-01 至 09-30 收入 1,012.44、支出 138.78、结余 873.66；住房 100 为最大支出。上期 2026-08-02 至 08-31 支出 170。500 内部划转及 300 本金不计入收支；退款 12.34 计入收入。每个图表分类的金额均由相同日期/分类查询的账本记录求和核对。

在候选目录运行：

```sh
/home/bld/data/data4/admin/fintechcom/.venv/bin/python -m pytest -q tests/test_primary_pages_data.py tests/test_backend.py -k 'primary_page or empty_period or previous_period_comparison or filters_pagination_and_income or bad_dates_rejected'
node tests/primary_pages.test.mjs
node tests/navigation.test.mjs
node tests/chart_geometry.test.mjs
node tests/visuals.test.mjs
node tests/banking_frontend.test.mjs
```

结果：5 项 Python 测试通过；页面模块 9 组针对性检查通过；21 路由导航、图形几何、现有视觉计算与银行助手回归通过。`app.js`、`features.js`、`primary-pages.js` 的 Node 语法检查通过。详细日志在 `.runtime/ui-batch1-evidence/`，机器清单见 `review/validation.json` 与 `review/checks.json`。

页面模块检查使用真正隔离 API 导出的 fixture，加轻量 DOM 容器模拟；验证页面渲染、动作传参及状态保留，不冒充浏览器点击。覆盖一个主要动作、指定记录查找→详情→返回、无结果清除条件、空记录、错误出口、缺上期记录、金额隐藏、迟到响应不覆盖新页面。测试不调用模型，不操作 live 金融状态。

## 视觉、键盘与窄屏的证据边界

- `review/*.html` 是实际页面渲染函数输出、加载候选 CSS 的静态结构证据，包含正常、筛选、无结果、空记录、错误、分类对比。静态文件无交互脚本，外框控件是简化占位；不能替代实际 App 验收。
- 样式只对三页作用：窄屏控件可换行，账单长文本/金额可换行，超窄屏底栏折为两行；维持 430px 最大宽度。新增 200ms 进入过渡同时尊重系统和 App reduced-motion。使用现有语义按钮、原生 dialog、可见 focus、图表键盘读数；趋势另有可展开逐项金额。
- **没有浏览器页面实测，没有新截图。** 按约束未重试此前 `setsockopt EPERM → SIGTRAP` 的 hft Playwright Chromium，也未换运行时绕过。390px、200% 缩放、实际点击/焦点、动效与 reduced-motion 均待独立浏览器验收。
- 静态样式检查及模块交互检查已完成；浏览器限制不影响已交付源码与必要回归，但视觉验收不得标已通过。

## 改动定位

前端：`app.js` 接入三页模块及账本搜索；`features.js` 删除原图表页面渲染；`index.html` 加载作用域样式；新增 `primary-pages.js` 与 `primary-pages.css`。

测试：新增 `tests/test_primary_pages_data.py` 与 `tests/primary_pages.test.mjs`。补丁见 `review/batch1.patch`。没有修改后端、其他页面实现、权限、网络配置、凭证、运行账本或 GitHub。

2026-10-18 小补丁补齐上述详情/编辑一致性，并在原页面回归中新增一组用例：验证实际编辑表单/提交代码在只改分类时保留原文、明确改写才保存新文字、正常用户描述不截断、不伪造来源。两份源码语法检查及更新后的 10 组页面检查通过；增量说明见 `DESCRIPTION-FIX.md`，日志见 `review/description-fix/`。本批原有 5 项隔离 API 和其他既有回归的结果未变，未无故重跑或增加审计。

独立审核请先看三页职责/首屏，再分别核对交互与数据；截图仅作外观证据。若继续迭代，本批内修正即可，第二批仍待负责人安排。
