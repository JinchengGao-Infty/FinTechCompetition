# 核心集成合同

当前 R9-refined-local.2；核心集成不改.env、凭据、网络或原65281，不提交或推送。

- `app.js` 自由输入、表单续问均经 `/api/agent`。`source=llm`、provider.completed 和后端/前端双重schema验证通过后，`companion-planner.mjs`分发有界提案。正常输入不经关键词本地剧本。
- reply/speak/cards/actions分离；TTS只消费speak，模型动作只有声明式标记，不能自带授权、verified、HTML或工具代码。run_companion/run_event仅发送白名单上下文，没有账本、密钥、原始外部正文或权限记录。
- 核心拥有app/controller、权限门控、对话内卡片和原来源返回。UI保留旧液态玻璃；正常Bot只有单麦克风，实际任务才出现卡片，DAG按需展开，不存在companion-demo-controls。
- `voice-demo.mjs`、`voice_service.py`独立适配；声纹为verified:false演示信号。语音确认绑定当前对象、金额、版本、范围和时间，核心复核，TTS回声及泛化“好”不能授权。真人输入/听感未验不得声称通过。
- `proactive-demo.mjs`提供固定本地适配器和DAG；安全bridge在before/after执行两次核对，提交许可、回执、流水使用同一个未持久化clone。参数变更、暂停、锁定、刷新及代次变更使旧回调失效。gate.invalidate必须转发到bridge。
- `demo_events.py`是同源会话+CSRF的有界固定事件队列；工具投递不是授权。页面关闭后不继续运行，时钟推进只用明确固定事件。
- `recipient-review.mjs`只查可信合成fixture，未知不等于诈骗。核实新收款人仍红色强验证；举报/未核实风险不能被MFA洗掉。
- 任务、投资、账本录入及银行卡恢复均在实际提交边界检查锁与代次；恢复必须受控，不能复位绕过或自动重放。

所有现实预订、消息、支付副作用都未连接。生产检测、真实身份系统和容器级任意代码沙箱不在本轮范围。详见覆盖表与验收说明。
