# 开发与运行

需要 Python 3.10 或更新版本。前端为原生 HTML、CSS 和 JavaScript，无需前端构建工具。

```bash
python run.py
```

启动器创建独立虚拟环境并安装基础依赖，启动前端、记账 API 和投研 API。端口与模型设置参考项目根目录 `.env.example`，将个人配置保存在不提交的 `.env` 中。默认仅监听回环地址。

## 功能

- Liquid Glass 界面的首页、账本、录入、聊天、图表、财务分析、投资、个股、仪表盘、风险和设置。
- 可切换周期的收支图、分类对比、储蓄目标，以及记账和投研快捷输入。
- 记账类别与金额校验；自然语言解析先生成草稿，确认后才保存。
- 可接入兼容 Chat Completions 的 API，或通过可选本地依赖加载模型。

前端通过同源 `/api/book/` 和 `/api/trader/` 请求后端。服务器场景下，浏览器与运行进程可能位于不同电脑；开发者应提供可访问的入口，不能直接把服务器的 localhost 当作客户端地址。仓库不提供任何已部署实例的访问凭据。

## 数据与模型

原项目已跟踪的示例数据继续保留。新的账本、训练集、权重和评估输出不随代码上传。

- `scripts/rebuild_accounting_data.py`：审计输入并在独立目录生成新账本及训练/验证/测试数据；拒绝覆盖已有输出。
- `scripts/train_accounting_lora.py`：LoRA 训练；用 `--base`、`--data`、`--output` 指定各目录。
- `scripts/evaluate_accounting_adapter.py`：评估适配器。
- `scripts/serve_accounting_model.py`：为两个业务后端提供共享模型接口；需准备模型与通过评估的适配器。

基础模式不需要 GPU。训练和本地推理需要另行准备兼容的 PyTorch、Transformers、PEFT、Accelerate、基础模型及计算设备；检出代码不会自动获得训练好的权重。所有生成产物写入被 Git 忽略的目录。

## 测试

安装 `tests/requirements.txt` 后运行：

```bash
python -m pytest -q tests/test_backend.py tests/test_upstream_data.py tests/test_accounting_v2.py tests/test_remote_access.py
node tests/visuals.test.mjs
```

后端测试使用临时账本。浏览器验收脚本适用于已准备好对应测试数据的本地实例；通过 `PLAYWRIGHT_EXECUTABLE_PATH` 选择自备 Chromium，否则使用 Playwright 默认浏览器。涉及录入的验收应在独立测试实例运行。

不要提交 `.env`、运行时配置、数据库、用户账本、模型权重、审计报告或访问日志。
