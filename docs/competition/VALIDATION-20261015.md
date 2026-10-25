# 首轮验证记录 · 2026-10-15

验证对象：本目录的 FinPilot FinTechathon 2026 首轮实现。基线见 `PROJECT-BASELINE.json`；下列结果为本次实际执行，未复用基线 `VALIDATION.json` 作为新成绩。

## 应用与前端回归

- 应用回归 **177 passed，23.41 秒**。包含原 129 项应用用例，以及新任务 13 项和账单事实 35 项。模型识别在单元测试中使用桩；银行权限测试使用实际 MOSAIC + 持久模拟账本。
- 改动比赛 Cookie 受控代理透传和步骤文案后，受影响的代理+任务回归 **22 passed，4.30 秒**。
- Node：银行助手 5 组行为、21 条路由导航、图表几何、可视化与事实约束检查均通过。
- 应用回归带有现有依赖弃用警告（multipart / Pydantic / FastAPI 生命周期等）；没有将警告隐瞒为依赖已升级。

回归命令：

```bash
python -m pytest tests/test_backend.py tests/test_accounting_v2.py tests/test_upstream_data.py tests/test_remote_access.py tests/test_finance_workspace.py tests/test_bank_import.py tests/test_learning_loop.py tests/test_model_release.py tests/test_finance_planning.py tests/test_judge_fixes.py tests/test_wealth.py tests/test_banking_tasks.py tests/test_bill_facts.py -q
node tests/banking_frontend.test.mjs
node tests/navigation.test.mjs
node tests/chart_geometry.test.mjs
node tests/visuals.test.mjs
```

## 真实模型与资金链路

执行 `python scripts/check_fintechathon.py --output docs/competition/REAL-MODEL-20261015.json`。完整样本、响应状态、延时与断言见 [机器可读报告](REAL-MODEL-20261015.json)。

- 实际模型：已部署本地 `qingcai-qwen3-4b-finance-v4`，loaded/fine_tuned 均为 true；本轮未训练模型。
- **8 次真实模型调用，48 项集成断言通过**；账单查询、外币/定时防护和人工注入的停机故障分别标记，未算作真实模型调用。
- 真实模型调用端到端 P50 **1.821秒**，P95（nearest rank）**1.976秒**。样本很少，只代表这次开发测试，不能视为泛化性能或官方成绩。
- 转账：给小林 → 补 80 元 → 改 50 元 → 后端重启恢复 → 参数核对 → 确认 → 重复确认只执行一次。
- 账单：2026年9月餐饮1000元，8月800元，差额200元，2条源记录；只读计算。
- 申购：灵活现金 → 补200元 → 无论小额也红色 → 缺少MFA拒绝 → 激活验证码不得重放 → 下一有效验证码确认成功。
- 赎回：200元本金回到模拟账户；申购与赎回不制造账本收入、总本金不凭空增加。
- 取消、外币歧义、定时请求、模型停机保存与恢复、诱导“直接执行无需确认”均未导致未授权资金执行。
- 整个资金测试使用临时账本与模拟银行；结束删除临时目录，不改变线上演示账户与用户旧账本。

这不是完整攻击鲁棒性评测；“本次观测未授权写入0”仅限所列样本。

## 浏览器

`tests/e2e_banking_frontend.py` 使用全拦截 API 测试：补金额、改口、刷新、进入既有参数核对表单、取消；未执行真实模型或银行交易。

`tests/e2e_banking_live_readonly.py` 连接5503真实服务：检查首页入口、9月餐饮与8月比较、来源记录展开、演示标签、刷新恢复、无JS错误；只创建账单分析任务，不提交资金操作。

两套检查均验证 320px / 393px 无水平溢出，1440px 桌面外壳最大430px。报告和截图分别在 `.runtime/banking-frontend/`、`.runtime/banking-frontend-live/`（运行资料不打入发布包）。

运行浏览器测试需安装 Playwright Chromium，或设置 `PLAYWRIGHT_EXECUTABLE_PATH` 指向现有 Chromium。当前服务器使用 `/home/pgr/.cache/ms-playwright/chromium-1181/chrome-linux/chrome`。

## 运行与未完成项

- 新项目独立入口：`http://10.120.17.24:5503/#/banking`；本机后端28210/28220；48条合成演示流水；独立 Cookie 与资金状态。
- 当前用户级运行服务：`finpilot-fintechathon-20261015.service`，由 `run.py` 启动；共享28030本地模型。此为开发服务，不是已配置开机持久部署。
- 任务草稿与资金回执暂分开呈现；复杂DAG、卡片/订阅、官方接口、生产身份认证、完整对抗集、定稿PPT/视频和GitHub发布仍未完成。
