# 第一批增量：账单详情与编辑描述

只修独立审核指出的文案缺口，不部署、不开展第二批。

候选仍为 `/home/bld/data/data4/admin/fintechcom/finpilot-fintechathon-2026/artifacts/candidates/ui-batch1-20261018`。本增量基于修正前候选，前一审阅包 Library ID：`libfile_4035e266ef088191a82f245dceeb3010`。

## 行为

- 列表、详情和编辑框统一调用现有的来源限定展示格式化：只有 synthetic 来源且以已知开发标记结尾时才去掉后缀；没有对全部用户文本做替换。
- 详情“记录信息”保留记录号，不再显示“比赛样本账本”或带开发后缀的原始描述，也不声称其来自银行。
- 编辑框显示清洁描述。若提交的描述等于打开编辑时的展示值，PUT 仍发送原始 description；只改分类不会悄悄清洗底层文本。用户明确输入新描述时，才按输入保存。
- 不修改 source，不迁移/清洗存量数据，不改后端或 API。格式化和打开详情/编辑不产生写请求。

## 文件与补丁

相对第一批候选仅两份业务源码和一份测试变化：

1. `AI_accounting_agent/frontend/liquid-glass/primary-pages.js`：移除详情开发来源/原始描述展示；加入未改描述时保留原文的保存辅助函数。
2. `AI_accounting_agent/frontend/liquid-glass/app.js`：编辑框复用展示格式化，以打开编辑时的记录快照决定 description 保存值。
3. `tests/primary_pages.test.mjs`：增加一个详情和编辑回归组，运行实际 app 编辑函数和 submit 处理代码，使用 VM 与轻量 DOM/FormData 容器，不冒充浏览器点击。

更新 `BATCH1-HANDOFF.md` 的相关说明。增量补丁为 `description-fix.patch`，并附修正后的三份源码/测试与日志。原完整 Library 审阅包保持不变；将本增量叠加即可审核本次修正。

## 验证

在候选根目录执行并通过：

```sh
node --check AI_accounting_agent/frontend/liquid-glass/app.js
node --check AI_accounting_agent/frontend/liquid-glass/primary-pages.js
node tests/primary_pages.test.mjs
```

页面回归现为 10 组，包含原有 9 组。新增组验证同一条“午餐 · 虚构演示”记录的列表、详情和编辑展示均为“午餐”；打开无写入；只改分类时保留原始 description 与版本约束；明确改写后提交新文字；手工记录“午餐 · 示例”及普通正文不截断；不提交伪造来源。

本增量无浏览器实测或新截图；390px、200% 缩放、实际焦点和动效仍待验收。没有重试已受限的 Chromium 路径或换运行时绕过。
