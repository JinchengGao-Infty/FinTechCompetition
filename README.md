# FinPilot R8-rc1.2-home

以日常委托 Bot 为中心的本地财务交互演示。五页为今天、Bot、财务、投资、我的；首页保留原液态玻璃和蓝色伙伴，以 32/20/14/12px 建立金额、标题、正文与辅助信息层次。账户页为紫、黑、银三张纵向叠放银行卡，保留金属反射与可读降级。

## 干净克隆启动

需要 Python 3.12（仅标准库）。运行不需要 Node、npm 安装或前端构建。

```sh
git clone --branch 26fincom_v2 --single-branch https://github.com/gr-peng/FinTechCompetition.git
cd FinTechCompetition
python -B tools/init_demo.py
python -u -B server.py --port 65281
```

打开 <http://127.0.0.1:65281/?session=demo#/today>。服务只监听 127.0.0.1；终端保持运行。端口已被占用时选择其他端口，不要关闭不明进程。

初始化从 `demo/positions.synthetic.json` 新建 4 项明确合成持仓；重复运行保留已有数据库，不复制用户私人 SQLite。账本、联系人、订阅、卡尾号与账户余额均为合成演示，浏览器会话通过 `session=` 参数隔离；历史行情与报告保留其参考日期，不是实时价格。

## R6—R8 更新

- Bot 支持结构化只读查询、任务方案、补充卡、参数编辑、任务切换与历史回执；旧草稿与权限不会泄漏到新任务。
- 普通任务通过独立业务页授权与确认；高风险/需要身份验证的操作保留验证步骤。返回、取消、修改使旧确认失效，结果未知时核对执行日志，重复提交不重复记账。
- 账本、余额、收支和图表来自同一合成数据源；退款、内部转移与本金流转分开计算。历史账本紧凑存储并保留手工数据与回执。
- 财务账户包含三卡选择、消费暂停/恢复、信用卡提醒和明细；投资含理财、合成个人持仓、十股历史研究/K线/报告和风险分析。
- 首页删去重复口号，收紧问候区；主金额、房租金额、进度与辅助标签有明确层次。320/390 与桌面居中已在原工作版本检查。

本应用没有真实银行、券商或外部订阅执行接口。OCR/图片采集入口属于既有演示能力，不宣称通用视觉识别。

## 可选外部模型

默认启动不调用外部模型。需要实际 Bot 模型理解时，按原模式显式启动：

```sh
python -u -B server.py --port 65281 --allow-api --agent-validation
```

在“我的 → 模型与连接”中由用户提交本次连接。固定提供方为 Micu，模型为 `deepseek-v4-flash-0731`；密钥仅存服务进程 RAM，连接过期或进程结束后失效。仓库中的 `API-CONFIG.example.json` 仅为无密钥说明，服务器不自动读取它。不要把真实凭据写入文件、URL、日志或提交记录。未连接或请求失败时明确显示状态，不把固定回答冒充真实模型。

可照着输入的五任务、十问题及合成快照口径见 [15 个演示输入](DEMO-15.zh-CN.md)。其中真实模型历史验收记录属于 2026-10-27 的原工作版本；本次发布检查不重新消耗模型调用。

## 验证

测试需要 Node.js 22.12+（原工作版本用 Node 24 验证）和 Python 3.12，不需要 npm/pip 依赖。

```sh
node --test tests/*.test.mjs
python -B -m unittest discover -s tests -p "test_*.py"
```

在另一个尚未初始化的新克隆中验证启动；发布文件扫描可在任意克隆运行：

```sh
python -B tools/verify_clean_clone.py
python -B tools/check_release.py
```

现有回归为 104 项 Node + 28 项 Python，覆盖权限、幂等、账本一致性、草稿隔离、采集确认、业务返回、卡片状态、材质数学和资源调度。`verify_clean_clone.py` 仅在未初始化的新克隆使用：验证合成初始化、重复初始化不覆盖数据库，并在随机空闲端口检查启动和资源；最后停止自己的测试进程，不影响 65281。

运行细节见 [RUNNING.md](RUNNING.md)，来源与范围见 [SOURCE-PROVENANCE.md](SOURCE-PROVENANCE.md)。旧仓库地址 `gr-peng/FinTechathon` 当前由 GitHub 重定向到同一仓库 `gr-peng/FinTechCompetition`。发布仅针对 `26fincom_v2`。
