# 后端

`app.py` 提供账单录入、查询、统计和聊天接口；`investment_app.py` 提供投研数据与聊天接口。`accounting_schema.py` 定义分类和提取规范，`llm_runtime.py` 管理模型提供方配置。

从项目根目录运行 `python run.py` 启动应用。`requirements-core.txt` 为基础依赖；本地模型依赖按需安装。

环境变量示例位于项目根目录 `.env.example`。请使用独立数据目录进行开发与测试，不要覆盖已有账本。

详见 [开发文档](../../docs/DEVELOPMENT.md)。
