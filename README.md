> **26fincom_v1 预览运行：请先阅读 [RUNNING.md](RUNNING.md)。此分支复现 65271 的 preview.py 演示；下方启动与安全描述保留为历史记录，不代表本次验证。**

# FinPilot · FinTechathon 2026 银行智能体

基于 2026-10-04 FinPilot 发布版，面向 **2026 深圳国际金融科技大赛 · 微众银行金融科技大学生挑战赛（人工智能国内赛道）** 的独立开发项目。基线、复制范围及提交哈希见 [PROJECT-BASELINE.json](PROJECT-BASELINE.json)。原 FinPilot 和财知有度目录不随本项目改变。

首轮重点是把现有能力串成可核对的银行任务：转账、账单分析、理财操作；保持 430px 竖版单列和 Liquid Glass。所有资金均为本地模拟银行本金，账本演示记录明确标记为虚构。未接真实银行，也不是官方提供的沙箱。

- [官方要求](docs/competition/REQUIREMENTS.md) · [差距分析与开发顺序](docs/competition/FINTECHATHON-GAP-ANALYSIS.md)
- [本轮技术与安全说明](docs/competition/FINTECHATHON-TECHNICAL-SECURITY.md)
- [验证记录](docs/competition/VALIDATION-20261015.md)

## 首轮优化

1. 新增统一银行助手 `#/banking`：持久任务、补槽、金额改口、取消、刷新后恢复、版本冲突和请求幂等。模型生成的草稿必须进入原参数表单，另行确认。
2. 账单事实由服务端以整数分计算，展示区间、分类、上期对比及源账单；退款单列，内部划转和投资本金排除，空区间明确为没有记录。
3. 独立比赛策略：小额转账日累计不超过 1000 元需确认，超过需多因子验证；**每笔理财申购均需多因子验证**。沿用动态口令、参数绑定、重放防护、未知结果核账及防重复扣款。
4. 独立端口、账本、资金状态和浏览器 Cookie；保留同源请求及过期只读会话恢复修复。

这只是首轮可运行版本。复杂 DAG、多场景协作、卡片/订阅、官方银行接口及完整对抗评测仍待实现或确认；目前任务完成状态仅表示查询完成，资金草稿整理完成不等于交易成功。交易以独立操作记录为准。

## 运行

Python 3.11+，无需 Node 构建。首次启动自动安装基础依赖：

```bash
python run.py --demo
```

本机入口 `http://127.0.0.1:5503/#/banking`。后端只监听本机 `28210/28220`；前端可用 `--host` 指定服务器局域网地址。`--demo` 使用 `.runtime/demo-bookkeeper` 独立账本，写入当前月及之前六个月的虚构流水，重复启动不会重复导入。

已安装依赖可运行 `python run.py --demo --no-install --no-browser`。基础模式的模型默认关闭，账单确定性查询和手工操作仍可使用；资金自然语言理解会明确提示模型不可用。

启用模型：复制 `.env.example` 为 `.env`，设置 `LLM_PROVIDER=api`、`LLM_BASE_URL`（含 `/v1`）和 `LLM_MODEL`；需要时填写服务端密钥。当前开发服务器连接已部署的本地 `qingcai-qwen3-4b-finance-v4` 服务，没有重新训练；仓库含历史 LoRA 适配器，基座模型另备。不要把 `.env`、账本或 `.runtime` 放入发布包。

## 测试

```bash
python -m pip install -r AI_accounting_agent/backend/requirements-core.txt -r tests/requirements.txt
python -m pytest -q tests/test_banking_tasks.py tests/test_bill_facts.py tests/test_finance_workspace.py tests/test_finance_planning.py
node tests/navigation.test.mjs
node tests/banking_frontend.test.mjs
```

本轮测试结果和真实模型验证范围见验证记录。`VALIDATION.json`、`materials/` 内 PPT/PDF/压缩包、旧 `docs/competition/TECHNICAL.md` 等为 **10 月 4 日基线历史材料，不是本届新版本提交材料或新验证结果**；没有执行赛事提交或推送新的 GitHub 仓库。

源自 [FinPilot](https://github.com/gr-peng/gonghang) 和 [FinTechathon](https://github.com/gr-peng/FinTechathon)，保留 [原始归属与许可](docs/competition/ATTRIBUTION.md)；MOSAIC Guard、Qwen 等第三方组件不宣称为自研算法。原 README 保存在 [历史目录](docs/legacy/README-FINPILOT-20261004.md)。

