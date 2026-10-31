# FinPilot 返工验收

> 以下为2026-10-29历史验收。2026-10-30复合流程、预算与底栏修复见 [当前验收](ITERATION-30-ACCEPTANCE.md)。历史真实模型成功记录不代表本轮连接可用。

版本 R9-refined-local.3，2026-10-29。本地未提交、未推送、未部署；原65281与.env未修改。完成后冻结，后续独立盲评不自动触发改代码。

## 当前入口与启动

- 展示：`http://127.0.0.1:65321/showcase.html?session=judge-morning#/bot`
- 直开：`http://127.0.0.1:65321/?session=judge-morning&app=1#/bot`
- 主服务：`python -u -B server.py --port 65321 --allow-api --agent-validation`，只监听回环。
- 声音：65323，Kokoro1.1 FP32，中文女声zf_001，speaker3，8线程，speed1.0。既有环境与模型目录外置、不入仓库，启动见VOICE-FEMALE-UPGRADE.md。

当前真实模型连接已经失效，重启后未重新填写凭据。用户须在当前65321页面的“我的 → 模型与连接”建立自己的现有连接。没有读取、导出、迁移或新建key；不能把未配置状态当作真实LLM全流程通过。

## 盲评前必要语音补丁

上一轮只实测侧车，漏掉主服务白名单未接纳Kokoro，网页同源health因此会返回502。此处明确纠正，不能沿用“侧车成功等于网页语音成功”的结论。

本补丁仅在server.py固定引擎集合加入sherpa-onnx-kokoro；仍固定127.0.0.1:65323，不接受任意backend/URL/引擎请求参数，不放宽同源、会话、CSRF、离线health、响应字段、RIFF/WAV或大小校验。新增3项代理HTTP防回归；代理套件16/16，完整回归Node428/428与Python115/115通过。

正常重启主服务后，实际通过网页同源/api/voice/health和/api/voice/tts取得Kokoro WAV：两接口HTTP200，engine=sherpa-onnx-kokoro，model=kokoro-multi-lang-v1_1，24kHz单声道16bit，4.97秒、238784字节；整句HTTP2162.4ms，模型指标2152.16ms。这是实际本地模型经主服务取音，不是mock或直接绕到侧车。证据为相邻companion-qa/kokoro-same-origin.wav/json。

测试使用全新无模型key的本地测试会话，没有读取既有Cookie或提供方凭据，没有配置模型；前后模型连接均为未配置。真人麦克风、实际浏览器设备播放、主观女声听感仍未验，不能称端到端真人语音体验已通过。

## 定向回退与保留

返工前完整源码备份位于工作区相邻 `r9-before-ui-rollback-20261029`；更早 `finpilot-before-companion-core-20261029` 保留本轮开始前UI/API修复。没有git reset。

恢复既有液态玻璃、头像、字体间距与composer，移除Bot常驻场景目录、演示控制、声纹/声音选项、全局审计面板。只在实际需要时出现对话内卡片；DAG收在“查看安排”，主卡仍显示对象、日期、付款账户与授权期限。创建过的长线记录可从原“任务”页继续，不是预置场景菜单。输入框仅一个麦克风，点击开始/停止，识别文字回填后核对发送；文字始终可用。

保留绿黄红门控、独立挑战、锁定恢复、所有写边界检查、旧回调失效、参数绑定、幂等、程序回执与同源代理。新收款核查和可信举报分开。文字取消/暂停当前计划有专门plan_control协议，不能只隐藏卡而保留执行；恢复必须重新授权，第三方事件不能控制计划。

## 实际通过

- 浏览器已可靠识别127.0.0.1地址，使用受支持Chrome扩展，没有绕过此前原生Chrome URL安全限制。
- 320×740：scrollWidth316，无横向溢出，单mic；390×844：scrollWidth386，单mic、无composer下拉。实际截图已逐张查看，头像、输入区、导航和卡片可见。
- 灰色原生滚动条4px，无宽灰槽，CSS thumb:hover使用Radix indigo；Firefox thin/主题色分支已实现，未在Firefox实机验收。
- 真实模型：普通hi自然回答；完整生日提示生成本地DAG提案；云音乐取消下次续费生成正确提案并执行本地取消；邮件注入展示拦截依据。不是mock或预置前端整段回复。
- 邮件注入首条“会怎么处理”实际发生invalid_contract，脱敏错误为nonproposal cannot prepare actions；补充合法协议示例后，以明确检查提示重试成功。没有把第一次失败隐藏成全通过；没有放宽授权或执行schema。
- 实际生日页面：餐厅预订、联系人核对、蛋糕预订消息、50元定金有本地回执，520元保持等待；固定生日时钟事件通过同源队列到达；刷新导致旧授权失效，重新授权后只完成剩余520，摘要与本地流水为50+520=570元，非1036元报价全额已扣。已完成步骤不重做。
- 主动事件实际页面收到房租与28日订阅提醒（未连接时明确提示连接后继续），无需场景按钮；同源事件投递与页面消费已实测。
- 实际订阅取消：本期权益保留，下次续费关闭，不退款；续费25元、取消后改选、在途变更与重复事件由模块和controller测试覆盖。
- 新侧车实际HTTP200、engine=sherpa-onnx-kokoro，24000Hz PCM WAV；本次无敏感短句4.96秒音频合成约2211ms（整句HTTP，非端到端或流式首包）。无云API、无新凭据。

## 测试证据

最终完整回归：Node 428/428、Python 115/115，0失败。日志位于相邻工作区companion-kokoro-node-final.log与companion-kokoro-python-final.log。干净源码副本启动、清单与敏感文件扫描以最终RELEASE-MANIFEST.json为准。子场景和具体断言见COMPANION-COVERAGE.md；不能只据总数宣称全部实际使用通过。

- Node：任务状态/财务/投资/写边界/策略/声音/计划/订阅/收款核查/最小Bot交互全套。
- Python：模型协议、代理、连接隔离、语音服务、固定事件同源/CSRF/去重和真实回环HTTP测试。
- controller受控边界测试：普通输入不本地截获、字段续填保留、新任务清卡、多个识别片段停止后只回填、取消/锁定后旧ASR回调无效、全部风险案例、收款人红挑战、在途取消零落账、计划文字取消/暂停/恢复、固定时钟不越权。

## 尚未实机验证及限制

- 会话失效后，房租事件到真实LLM、订阅续费分支真实LLM、陌生收款/密码/声纹各分支真实LLM、模糊任务全程及新plan_control真实LLM均未补跑。对应源码/程序状态和受控契约测试通过不等于真实provider通过。
- 真人麦克风、实际设备播放、中文女声自然度与ASR端到端体验未验；没有趁用户睡觉录音。Kokoro只是已跑通且明确女性的候选，需要用户试听。Web Speech输入可能依赖浏览器联网，不能称完全离线双向语音。
- 第三方商家、通讯录、风险报告、声纹、验证码均为有来源说明的本地演示适配器/fixture。没有真实银行、MCP商家服务、生产身份认证或开放通用欺诈检测。
- 页面关闭/电脑休眠后没有全天候后台服务。定时执行由明确演示时钟和当前页面推进，恢复不自动补做。
- 没有执行模型生成代码，不宣称容器级沙箱或赛事全部合规。
- 用户参考截图的官方本机物化助手在Windows因os.setxattr不存在而失败；没有换下载路线绕过。当前页面实际像素截图已独立采集和查看。附件官方上传此前仍在prepare之前报告不可用，confirmed library_file_ids为空，未换路线重试。

## 截图证据

截图保存在相邻工作区 `companion-qa/`，不进入源码或发布候选：

- 返工前：voice-bound-card-desktop.jpg、showcase-challenge-1440.jpg（旧常驻控件）。
- 返工后：rework-birthday-320.jpg、rework-bot-390.jpg、rework-showcase-current.jpg；rework-showcase-1440.jpg为1440×900实际画面，scrollWidth1436、外层滚动条4px；测试视口已reset为1707×880。
- 新声音真实输出：rework-female-local.wav/json；可交付候选女声样本在docs/audio/voice-female-zf_001-conversation.wav。

所有实际支付、消息、预订证据均为本地合成结果。最终交付不自动上传或公开分享。
