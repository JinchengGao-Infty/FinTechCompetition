# 26fincom_v1 发布核验

## 内容与来源

- 基于正在运行的 65271 R4 四项修订版；914 个原始文件的路径/内容聚合 SHA256 为 `f7b8522ac876794b0040a1730dcad8fd6d94971b634f7cff1f2f79242af2b75e`，本次重新计算一致。
- 原业务源码和 UI 资源保持原样。新增根目录预览入口（仅将 `source/` 路径改为仓库根目录）、运行依赖锁定、初始化脚本、Python 版本和运行说明；README 增加入口，忽略规则补充本地状态。
- 新分支继承已有仓库 main 提交 `f861d034b6d928b2dd8c8148157fd1253a0474af`，分支内容以本次快照为准，不夹带旧分支的模型目录和旧样稿。
- 账本用现有 `synthetic_ledger.py` 固定种子重建，1439 行与原预览逐条一致；规范 JSONL SHA256：`0c59e73e0d7869f027c35e249b26f88539ada08bd58a1911050013176f9617cc`。四笔持仓为原演示的虚构持仓，不是个人金融数据。
- 未提交 `.env`、SQLite、缓存、日志、虚拟环境或机器专用二进制。`.env.example` 为配置模板。源码扫描未发现常见令牌/私钥模式；这不等于全面安全审计。

## 本次通过

- Windows，Python 3.12.14；独立全新虚拟环境只安装 `requirements-preview.txt` 后成功启动。开发环境 `pip check` 通过。
- 随机空闲端口隔离启动，24 个 HTTP 请求全部 200：四个页面入口、会话、健康、分析、预算、概览、持仓、观察列表与静态资源。页面入口是 SPA shell 响应，不等于浏览器端全部交互测试。
- 确认1439笔账单、4笔持仓；首页和10个公司标识字节与仍在运行的65271完全一致。验证完成仅停止新验证进程。
- 当前预览模块测试：41项通过（分析、录入存储、持仓、预算存储）。
- R4及关键页面前端测试：37项通过；`navigation.test.mjs`、`banking_frontend.test.mjs` 通过。

```bash
python -m pip install -r tests/requirements.txt
python -m pytest -q AI_accounting_agent/backend/test_analysis_summary.py AI_accounting_agent/backend/test_capture_store.py AI_accounting_agent/backend/test_personal_positions.py AI_accounting_agent/backend/test_budget_store.py
node --test tests/r4_four_refinement.test.mjs tests/approved_research_risk.test.mjs tests/approved_trends.test.mjs tests/approved_ledger.test.mjs tests/approved_keypages.test.mjs
node tests/navigation.test.mjs
node tests/banking_frontend.test.mjs
```

## 失败与未运行

- 旧 README 后端组合 `test_banking_tasks.py`、`test_bill_facts.py`、`test_finance_workspace.py`、`test_finance_planning.py`：42通过、2失败、62初始化错误。失败和初始化错误均为旧银行模块导入 Unix `fcntl`，Windows 不提供该模块；未为本次发布改造银行功能。首次尝试另遇默认临时目录权限问题，指定独立 `--basetemp` 后已消除该原因。
- 未运行完整浏览器E2E、真实语音/OCR、真实模型咨询、银行执行、全面安全审计，以及 macOS/Linux 实机验证。
- Git diff 保留原始 CRLF 与历史空白，避免为清理格式改变已核验的业务源码字节。
- 公司标识及公开研究材料的外部再分发授权未全面核实；保留来源与权利声明，不代表获得商业使用许可。

启动步骤及模拟能力边界见 [RUNNING.md](RUNNING.md)。
