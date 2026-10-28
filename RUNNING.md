# 本地运行

```sh
python -B tools/init_demo.py
python -u -B server.py --port 65281
```

入口：<http://127.0.0.1:65281/?session=demo#/today>。Python 3.12 标准库即可；没有前端构建步骤。首次初始化只生成明确合成的 4 项持仓，已有数据库保持不变。不同 `session=` 使用不同浏览器演示状态。

需要真实模型对话时才显式启用 `--allow-api --agent-validation`，随后在应用设置页由用户提供连接。默认运行不调用模型，不通过更改提供方或网络设置修复预览。进程 RAM 中的连接不会随 Git 克隆或服务重启保留。

应用最大宽度为 390px，桌面外侧留白，320px 支持正常滚动。进行浏览器设备模拟后，应清除视口覆盖并刷新，核对实际 innerWidth 和应用中心；不要把测试覆盖残留当成 CSS 布局问题。诊断参数 `material-audit=1`、`material-fail=webgl`、`material-fail=compile` 只用于测试，不作为正常演示入口。

`.runtime/` 由本克隆生成，数据库、预算、缓存和凭据均不属于提交内容；仓库只跟踪 `.runtime/.gitkeep`。`tools/verify_clean_clone.py` 使用临时空闲端口完成启动冒烟，结束时只停止自己创建的测试进程。
