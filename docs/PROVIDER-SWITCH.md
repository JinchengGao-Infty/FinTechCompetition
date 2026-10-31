# 对话服务切换接入记录

2026-10-31，本地实现，无真实供应商调用、无服务重启、无凭据读取或迁移。

- MiniMax官方：中国站 `https://api.minimax.cn/v1`，`MiniMax-M3.1-Flash`，`reasoning_effort=low`。
- Micu：项目既有合法地址 `https://www.micuapi.ai/v1`，既有模型 `deepseek-v4-flash-0731`。没有猜新地址或替换供应商。
- 对话与TTS独立；原官方对话RAM槽保留原位，Micu仅在用户自行填写时保存到独立RAM槽。旧未绑定凭据不被自动采用。切换只选择配置，不发送供应商请求；未配置的目标不回退到另一服务。
- 在途请求未结束时，切换/保存/断开返回409。冷却按provider保存，切走再切回不消除Retry-After。断开仅清当前对话provider。

## UI合同

`GET /api/session` 返回白名单 `provider/model/base_url/configured/enabled/agent_enabled/provider_switch/providers` 及CSRF；providers包含固定id/名称/地址/模型和是否已连接，不包含Key。

`POST /api/config {provider,mode:'select'}` 选择已有配置或未连接目标；保存使用 `{provider,mode:'api',base_url,model,key}`；地址与模型必须属于该provider。`DELETE /api/config`只清当前连接。所有写操作保留现有会话、来源和CSRF校验。

前端 `web/model-connection.mjs` 导出 `CHAT_PROFILES`、`selectModelProvider(provider,{loadSession,fetchImpl})`、`saveModelConnection({provider,baseURL,model,key},{loadSession,fetchImpl})`。返回状态严格白名单，不能spread后端凭据字段到UI。

## 现场加载边界

原固定正常`/api/agent`模块刷新可采用新profile installer v2，保留RAM和事件QUEUE；未新增维护路由、特殊请求头或无认证刷新接口。现有`GET /api/agent/contract`只读内存，无reload。若现有对话连接已过期，必须用户自行在原官方入口连接后发送一条正常请求，或另行允许正常服务重启。不能假称磁盘代码已经在旧进程生效。

## 验证

全量Python195/195通过；前端连接模块10/10通过。新增测试覆盖独立配置、无隐式Key迁移、固定地址/模型、断开范围、在途拒绝、冷却保留；隔离HTTP mock实测未配置Micu不请求上游、MicuKey只发Micu、切回官方只用原官方Key、TTS槽保持。历史SSE解析测试仍为显式旧模型mock夹具，配置入口使用当前官方默认地址，不代表生产允许旧未绑定路径。

真实Micu连接、主进程切换UI及真实官方模型复测由核心任务单独记录；本模块没有替用户填写Key。
