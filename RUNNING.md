# 运行与演示

需要 Python 3.12，仅使用标准库；不需要 npm 安装或前端构建。

```sh
python -B server.py
```

首次启动自动创建 4 项合成持仓，已有数据库保持不变。打开 http://127.0.0.1:65281/：900px 及以上的顶层窗口进入桌面展示，窄窗口直接进入原 App。同源 iframe 和 `?app=1` 始终保留 App，不会反复跳回展示页。

- 桌面展示：`http://127.0.0.1:65281/?session=demo#/today`
- 单独 App：`http://127.0.0.1:65281/?app=1&session=demo#/today`
- 关闭材质作对照：在对应入口添加 `material=off`，展示页会保留该参数。
- 换端口：`python -B server.py --port 65300`，URL 中端口同步修改，不要关闭不明进程。

## 可选模型连接

```sh
python -u -B server.py --port 65281 --allow-api --agent-validation
```

由用户在“我的 → 模型与连接”提交本次连接。提供方、模型、权限和确认规则沿用 R8；不要通过修改网络、证书或提供方配置解决预览问题。默认不调用模型，未配置会明确提示。密钥只存服务 RAM，进程退出或连接过期后失效；不写入仓库、URL、日志或 localStorage。

## 演示与常见问题

展示页五步导航驱动同源 App，并跟随 App 当前路由高亮；手机框按宽高缩放。reset 只清当前 session 的演示状态，保留其他 session、API Cookie 与既有数据库。不同评委或排练使用不同 `session=`。

启动已使用 128 的监听 backlog 处理 ES modules/CSS 的并发加载。投资页保留 R8 的会话续期与本地投资 DTO/纸面持仓逻辑；首次数据库初始化由启动统一完成，不换回旧投资实现。诊断参数只用于测试，正常演示不用 `material-audit` 或 `material-fail`。

```sh
node --test tests/*.test.mjs
python -B -m unittest discover -s tests -p "test_*.py"
python -B tools/check_release.py
```

在尚未初始化的新克隆里运行 `python -B tools/verify_clean_clone.py`，验证一条命令首次启动、重复初始化保留数据库及核心资源。测试使用随机空闲端口，只停止自己的进程，不影响已运行服务。
