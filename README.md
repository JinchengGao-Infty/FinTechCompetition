# 青财 · Liquid Glass

基于 FinTechathon 的记账与投资助手，采用 Liquid Glass 界面，连接原有记账和投研后端。

当前版本包含 11 个页面、收支可视化、分类对比、储蓄目标、聊天快捷输入、投资仪表盘和风险指标。分类规则、自然语言提取与统计共用后端，解析账单后由用户确认保存。

## 运行

需要 Python 3.10 或更新版本：

```bash
python run.py
```

前端无需构建。参考 `.env.example` 配置端口与模型；基础模式默认关闭模型，接入 AI 后再启用相应功能。

## 目录

- `AI_accounting_agent/frontend/liquid-glass/`：当前前端。
- `AI_accounting_agent/backend/`：记账、投研与模型适配。
- `scripts/`：数据合成、训练、评估、服务与连接工具。
- `tests/`：后端、数据规则、可视化及访问入口测试。

[开发说明](docs/DEVELOPMENT.md) · [版本范围](docs/VERSION-SNAPSHOT.md)

本分支保存代码；数据库、生成数据、模型权重、部署配置和访问凭据由使用者自行管理，不随代码上传。
