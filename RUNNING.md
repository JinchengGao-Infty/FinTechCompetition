# 运行与预览

## 本地启动

```sh
python tools/init_demo.py
python server.py --port 65281
```

正常入口：<http://127.0.0.1:65281/?session=demo#/today>

原材质回退：<http://127.0.0.1:65281/?session=demo&material=off#/today>

首轮初始化生成4条明确合成的持仓，不复制任何用户SQLite；重复运行不会覆盖既有数据库。删除或更改自己的数据之前应自行备份，初始化脚本不提供强制重置。

## 桌面预览居中

App最大宽390px，桌面按页面可用宽度居中，外围纯白。若物理窗口很宽而页面仍贴在左侧，先检查是否遗留浏览器的移动测试视口覆盖：本次问题实测外窗1707但innerWidth390，页面zoom/visualViewport.scale均1；App/导航/画布在390内实际居中。使用支持的viewport API显式恢复1707×932后，三层中心均845.333，与clientWidth/2差不到1px，无需改CSS。

页面代码不会擅自改变浏览器窗口或清除开发者工具设置。响应式测试必须在finally收尾中恢复正常桌面视口，并重新检查innerWidth及App/导航/画布中心。仅调用reset但innerWidth仍390不算恢复成功；本轮reset返回成功却没有效果，随后通过受支持的显式桌面设置恢复。不要为测试覆盖问题改页面缩放或偏移内容。

iframe中的App相对于iframe自己的视口居中。320/390窄屏保留原布局、导航与触控区域。不要保留 `material-audit=1`、`material-fail=webgl` 或 `material-fail=compile` 作为正常演示入口。

## 可选连接

不加额外参数时仅本地场景。仅在独立配置外部模型时使用 `python server.py --port 65281 --allow-api`；不要在命令行、文件或URL中放API key。模型不能直接执行资金工具；没有真实金融接口。

## 测试

```sh
node --test tests/*.test.mjs
python -m unittest discover -s tests -p "test_*.py"
```

`.runtime/` 中生成的SQLite与预算、浏览器localStorage及密钥均不属于源码。`.gitignore` 只允许该目录中的空占位文件进入版本控制。首次干净克隆中默认保守预算为0；这不代表任何提供商可用余额。
