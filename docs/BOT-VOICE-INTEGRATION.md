# Bot 语音接入与四音色试听

状态：主服务已无重启采用新协议，Bot 真实短句自动播放通过，四音色入口已启用。2026-10-30。

## 已修复

此前“我的”试听播放器独立于 Bot，Bot 的 createVoiceDemo 默认 enabled=false，文字发送从未启用。现在真实用户发送手势启用并预热 AudioContext；经既有合同校验的 speak 进入同源流式接口。麦克风停止后的识别结果进入同一发送流程。没有自动开始录音，输入/授权回声保护和任务参数绑定保留。

回复下方只在有可朗读内容时显示“重听/停止播放”。新输入、停止、导航、断开连接和销毁都会使旧播放失效。重听使用 RAM PCM 缓存；密钥会话 generation 变化或过期会先清缓存，不直接重播旧会话内容。模型 reply/cards/actions 永不直接交给 TTS 执行。

## 速度参数

固定中国站 https://api.minimax.cn/v1/t2a_v2；speech-2.8-turbo；stream=true；exclude_aggregated_audio=true；PCM s16le，32000 Hz，单声道；speed=1，vol=1，pitch=0；language_boost=Chinese；text_normalization_mode=basic。保留温暖闺蜜为默认声音。

速度优化依靠 Turbo 与首片增量播放，未用提高语速冒充首音优化。speak 仍是已校验的一到两句完整短口语，不将未经校验的原始 LLM JSON/token 流发给供应商，也不逐字拆成多个计费请求。当前仍等待完整对话 JSON 验证，LLM 推理耗时是端到端延迟的组成部分。

官方资料（本轮已核对）：
- [中国站同步语音合成](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)
- [系统音色目录](https://platform.minimax.cn/docs/faq/system-voice-id)
- [定价](https://platform.minimax.cn/docs/pricing/overview)：Turbo 2元/万计费字符，汉字计2字符；本地只展示保守估算，不读取供应商余额。

## 四音色

在“我的 → 模型与连接 → 语音 MiniMax”逐个点击试听，统一短句，按钮可停止。试听不改变 Bot 声音；只有“用于 Bot”才切换，默认仍是温暖闺蜜。

| 中国站官方名称 | Voice ID |
|---|---|
| 温暖闺蜜 | Chinese (Mandarin)_Warm_Bestie |
| 温暖少女 | Chinese (Mandarin)_Warm_Girl |
| 甜美女声 | Chinese (Mandarin)_Sweet_Lady |
| 傲娇御姐 | Chinese (Mandarin)_Mature_Woman |

不创建/克隆声音，不批量自动试听，不自动充值或重试。后端严格限定这四个系统音色；任意音色或上游地址不被接受。

## 验证记录

- 全量 Node：502/502 通过；新增控制器启用/语音输入、配置缓存生命周期及音色白名单覆盖。
- 全量 Python：158 项，首次指定运行时有1项既有 test_connection 负向 Origin/CSRF 测试发生 Windows 10053 连接中止；单独复核该文件4/4通过。另一次 Anaconda 运行出现3个同类连接中止。没有修改网络、安全门或测试预期来掩盖该现象。
- MiniMax 相关 Python：33项，覆盖配置、会话、流式传输、取消、费用上限、四音色选择及秘密不回显。
- 隔离浏览器端口65327使用受控回复和静音 PCM，不发送任何外部 API 请求。验证自动播放、缓存重听、立即停止、导航取消、试听不改变当前声音。320/390宽度无横向溢出。截图在工作区 bot-voice-qa/。
- 受控计时示例：发送至首片排入 WebAudio 98ms，TTS适配器内首片39.2ms。这不是实际供应商首音、硬件扬声器输出或真人听感。
- 主服务65321 PID2320与原65281 PID23256未重启。用户连接恢复后，通过一条正常问候加载新代码。MiniMax估算字符从162变206；真实PCM重听及停止后仍为206，无新增合成用量。未读取或导出Key。
- 本轮真实DeepSeek短句1次、MiniMax Turbo温暖闺蜜合成1次，已观察自动播放、完成、缓存重听、打断。发送至首片排入WebAudio4225ms，适配器开始至首片1280.4ms；这是单次测量，不含扬声器输出测量，不代表延迟分布。其余三音色未自动产生费用，待用户自行点击试听；真人麦克风与主观听感未验。

## 已解除的运行时阻碍

TTS业务本身不依赖DeepSeek：语音路由只检查独立MiniMax会话。新增HTTP回归在对话未连接、对话调用被mock明确禁止的条件下，四音色均成功返回流；试听后默认声音未变化。

阻碍来自旧进程已缓存的固定HD/温暖闺蜜模块。旧协议不接受voice_id，也没有已加载的独立代码刷新入口。磁盘文件改变不会让Python模块自动重载。唯一既有刷新路径在正常已连接的对话请求内，因此不能仅靠刷新页面或重填MiniMax Key加载新代码，也不能通过读取RAM密钥、调试注入等方式绕过。

用户恢复对话连接后，本轮发出一条非敏感问候，沿正常路径刷新固定语音模块，保留RAM会话。主服务现在报告speech-2.8-turbo，四个试听按钮已实际启用。此后独立试听只需要MiniMax连接，不需要DeepSeek。保留严格的旧HD单音色兼容，未升级服务也不会丢失原本可用的当前声音试听。

可直接进入：

http://127.0.0.1:65321/?session=minimax-readiness&app=1#/me/model

未自动批量试听四声线，当前仍为温暖闺蜜。无GitHub推送、部署、真实金融操作、网络或.env更改。没有重试此前被拒的浏览器标记/关闭操作。
