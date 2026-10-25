# FinPilot 演示运行说明

本分支保存 65271 使用的 R4 四项修订版与官方来源公司标识。推荐入口是 **`preview.py`**；旧的 `run.py --demo` 属于另一套应用启动流程，不能替代此预览。

## 环境与安装

- Git、**Python 3.12**（本次使用 3.12.14 验证）。无需 Node 构建或下载大模型；Node 仅用于开发测试。
- 仓库为私有，需要仓库读取权限。首次安装依赖需要联网。

```bash
git clone --branch 26fincom_v1 --single-branch https://github.com/gr-peng/FinTechathon.git
cd FinTechathon
```

Windows PowerShell：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-preview.txt
.\.venv\Scripts\python.exe scripts/init_preview.py
.\.venv\Scripts\python.exe preview.py --instance candidate --port 65271
```

macOS / Linux（需自行安装 Python 3.12；本次未在这两个系统实测）：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-preview.txt
.venv/bin/python scripts/init_preview.py
.venv/bin/python preview.py --instance candidate --port 65271
```

浏览器打开 **http://127.0.0.1:65271/#/home**。账本：`#/ledger`；图表：`#/visualization`；咨询：`#/assistant`。停止服务按 `Ctrl+C`。若端口被占用，将启动命令中的 `65271` 改成 `65272`，访问地址同步修改。

## 数据与重启

初始化使用固定种子 `2026110130`，生成 2025-11 至 2026-11 的 **1439 笔合成账单、4 笔虚构持仓**，包括用于演示的未来日期。原始账单生成器只解析商户字典，不执行其旧数据库写入流程。

数据库仅保存在被 Git 忽略的 `local-state/night-candidate/`。初始化只执行一次；重启时直接运行最后一条启动命令。已有目录时初始化会拒绝覆盖。要重置演示，请先停止本副本的服务、将该目录改名备份，再执行初始化。不要复制他人的 SQLite、虚拟环境或 `--deps` 目录。

## 常见问题

- 出现 `pydantic_core._pydantic_core`、DLL 或二进制版本错误：检查 `.venv` 中的 `python --version` 是否为 3.12。不要使用系统默认的其他 Python，也不要复用其他 Python 版本安装的依赖；用 3.12 新建虚拟环境并重新安装。
- 只有一笔初始账单：说明跳过了初始化。停止服务，备份已生成的 `local-state/night-candidate/`，再初始化。
- `Address already in use` / WinError 10048：使用其他本地端口，不要终止他人的预览实例。
- 页面日期与今天不一致：这是固定日期的演示数据，行情参考截至 2026-10-23，不是实时金融数据。

## 演示边界

账本、分类统计、预算和手工录入使用本地演示状态；语音识别是固定结果适配器，图片/OCR/文件上传入口在此预览中被阻止。咨询服务会返回未连接，银行执行未接通，不发生真实银行交易。此入口强制关闭模型服务，不需要 `.env` 或 API 密钥。

本次运行验证不代表全面安全审计，也不覆盖真实模型、真实识别、银行接口或生产部署。服务只监听本机回环地址，请勿当作线上金融服务。

公司标识、行情与研究资料保留原有来源记录，相关商标和版权属于权利人；公开下载不自动授予再分发许可，外部或商业再分发前需核实授权。`materials/` 与旧文档是历史材料，不是本次测试证明。验证结果见 [RELEASE-26fincom_v1.md](RELEASE-26fincom_v1.md)。
