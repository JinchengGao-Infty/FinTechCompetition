# 当前入口

当前默认已升级为Kokoro1.1 FP32中文女声zf_001；启动与许可优先见[女声升级](VOICE-FEMALE-UPGRADE.md)。下文VITS/Matcha仅保留原始适配器和性能对照，不作为当前默认或已认可音质。正常页面只显示输入框右侧一个麦克风，没有声音来源/声纹下拉选项。

# FinPilot 双向语音演示模块

> 2026-10-29 女声升级：用户试听后已否定原 VITS 声音；当前独立服务默认改为 Kokoro 中文 1.1 FP32 女声。新样本、实际延迟、启动命令与未验证的听感边界见 [VOICE-FEMALE-UPGRADE.md](VOICE-FEMALE-UPGRADE.md)。本页 VITS/Matcha 数字保留为历史对照，不代表用户认可其听感。

本模块只负责输入、播报及发出待核心复核的语音确认事件，不执行交易。没有修改 `app.js`、既有 CSS、engine/runtime、共享配置、凭证或现有服务。主集成负责把小型语音控件放回现有液态玻璃对话框。

## 实际完成与演示边界

- **已实现并实跑**：两个离线中文神经 TTS 方案、可选独立 loopback 服务、真实 WAV 样本及计时证据；仅提取 JSON 顶层 `speak`；取消、替换、防重复、重听、敏感号码/验证码/密码遮蔽；浏览器语音输入适配及文本回退；绑定具体确认卡片的单次语音确认请求。
- **有可运行的浏览器路径，尚未实机验麦**：Web Speech 语音输入、说“停一下”打断、播报期间只接收打断词、播报后回声抑制与连续输入恢复。自动测试使用浏览器 API 替身；麦克风权限与真实识别准确率必须在用户点击启用后验证。Web Speech 可能把音频发送给浏览器提供方，不能称为离线 ASR。
- **明确为演示**：`matched / mismatched / unknown` 声纹状态，无声纹采集、训练、存储、比对模型或生物身份认证。`matched` 也不会产生身份凭据；事件始终携带 `verified:false, source:'demo', requiresCoreVerification:true`。
- **尚待主集成**：对话内麦克风/停止/重听控件、当前确认卡片快照、核心授权门控、后端 JSON 合同的可选 `speak` 字段。现有严格 planner 合同不接受 `speak`，需主任务扩展合同，或由程序根据真实状态构造 `{speak}`，不能直接朗读 `reply`。
- **未接入**：收费 API、第三方账号、新密钥、真实交易或消息发送。浏览器 `speechSynthesis` 明确标为 `browser-system` 回退，不能称为已部署的小模型。

## 交付文件

| 文件 | 用途 |
|---|---|
| `web/voice-demo.mjs` | 无 DOM/CSS 侵入的前端模块 |
| `voice_service.py` | 可选 CPU 中文 TTS 服务、显式下载及样本命令 |
| `requirements-voice-demo.txt` | 隔离安装的可选 Python 依赖 |
| `tests/voice-demo.test.mjs` | 前端状态、输入、取消与授权边界测试 |
| `tests/test_voice_demo_service.py` | 使用假模型的真实 loopback HTTP 合同测试 |
| `docs/audio/voice-demo-local.wav` / `.json` | VITS 实跑样本及证据 |
| `docs/audio/voice-demo-natural.wav` / `.json` | Matcha/Vocos 实跑样本及证据 |
| `docs/audio/voice-demo-http.json` | 实际模型 HTTP 首响应与取消证据 |

## 实测数据

2026-10-29，Windows x64，Intel Family 6 Model 183，32 个逻辑 CPU，15.75 GiB RAM，资源检查时剩余 2.37 GiB。Python 3.9.21、sherpa-onnx 2.0.1、CPU 2 线程、速度 1.08。测试文本：“我会先核对收款人与金额，确认后再继续。”

| 路径 | 下载量 | 模型加载 | 首次整句合成 | 热态整句合成 | 首次音频 |
|---|---:|---:|---:|---:|---|
| VITS AISHELL3 | 31,559,701 B 模型压缩包 | 1,407.45 ms | 244.17 ms | 216.47 ms | 8 kHz，4.02 秒，64,438 B |
| Matcha 中文 + Vocos | 75,463,556 B + 53,884,024 B | 3,196.58 ms | 401.12 ms | 386.16 ms | 22.05 kHz，3.66 秒，161,648 B |

这些是**完整首句合成为内存 WAV 的耗时**，不包括 LLM、ASR、网络、浏览器自动播放策略或音频设备耗时，不是端到端首响。模型保持常驻后无需逐句重新加载。VITS 体积小、音质偏电话带宽；本次默认使用 VITS；Matcha 仅保留为需要单独确认许可的实验候选。自然度尚需真人试听确认，采样率本身不等于人类听感。

额外真实 HTTP 测试：Matcha 服务返回 200/PCM WAV，响应头到达耗时 401.20 ms，服务合成计时 390.30 ms。另一请求在实际推理期间关闭 socket，关闭操作耗时 0.177 ms；CPU 仍在关闭后约 397.10 ms 完成，随后 health 继续返回 200。该测试没有使用浏览器麦克风或扬声器，不能把 socket 关闭时间称为真人说话打断延迟；浏览器播放取消由前端适配器测试覆盖。

- VITS 样本 SHA-256：`8439acad54d995f2c8a1f51cd300e5dc67067db0387c0e1a7d88cddec2fffe82`
- Matcha 样本 SHA-256：`a4572cd9d664dd5986b19cfd266a48cb48f3d8e945b449290e6b6e7cf5c1d9c3`
- VITS 下载压缩包 SHA-256：`ab468db3a3308cdd861495e0db2f25d79418a0c00639f74944c7cdf5dd8c6ec1`

## 当前机器可直接复用的隔离环境

没有把模型或虚拟环境放进代码仓库。可移植目录示例（本机既有隔离环境由运行检查点记录）：

```text
.\.voice-demo-env\Scripts\python.exe
.voice-models\vits-icefall-zh-aishell3
.voice-models-hq\matcha-icefall-zh-baker
.voice-models-hq\vocos-22khz-univ.onnx
```

在项目目录启动独立服务（没有自动启动或重启现有 65321 预览）：

```powershell
& .\.voice-demo-env\Scripts\python.exe voice_service.py --engine vits --model-dir .voice-models\vits-icefall-zh-aishell3 --port 65323
```

若由 `Start-Process` 启动后台服务，使用 `-WindowStyle Hidden` 并保存返回的进程对象，便于主集成只停止自己启动的服务。

## 干净机器安装与复现

以下安装均为可选，不能改写核心运行时环境。不要将虚拟环境、模型压缩包或权重提交到仓库。

```powershell
python -m venv .voice-demo-env
& .\.voice-demo-env\Scripts\python.exe -m pip install -r requirements-voice-demo.txt

# 体积较小的 VITS 路径，下载最多 40 MiB。
python voice_service.py --engine vits --download-model .voice-models
& .\.voice-demo-env\Scripts\python.exe voice_service.py --engine vits --model-dir .voice-models\vits-icefall-zh-aishell3 --sample --output docs\audio\voice-demo-local.wav

# 更高采样率的 Matcha 路径：模型最多 90 MiB，vocoder 最多 60 MiB。
python voice_service.py --engine matcha --download-model .voice-models-hq
& .\.voice-demo-env\Scripts\python.exe voice_service.py --engine matcha --model-dir .voice-models-hq\matcha-icefall-zh-baker --vocoder .voice-models-hq\vocos-22khz-univ.onnx --sample --output docs\audio\voice-demo-natural.wav
```

下载命令只访问官方 GitHub release URL，校验体积、只提取所需固定文件，不展开 `rule.far` 或整个字典目录；压缩包内同名子目录文件不会覆盖顶层说明。没有下载大型训练数据。Python 在下载 Matcha 时出现过证书链错误；实测改用 Windows 原生 `Invoke-WebRequest` 正常校验证书完成下载，未关闭 TLS 验证、修改 CA/代理/网络设置。若重现该问题，应使用正常验证的系统下载工具获取同一官方文件，或报告环境问题，不添加 `verify=False`。

## JSON 与前端 API

建议主任务的响应包：

```json
{
  "reply": "餐厅和蛋糕的安排已准备好，请核对下方卡片。",
  "speak": "安排已准备好。请核对餐厅、蛋糕定金和定时转账卡片。",
  "cards": [],
  "actions": []
}
```

只允许顶层 `speak` 为字符串或 `null`，最长 600 字；模型应生成约 20–60 字的自然口语摘要。模块不回退朗读 `reply/cards/actions`，不解析 Markdown 包裹的 JSON，不执行任何 actions。屏幕文字仍由主程序独立渲染；TTS 失败只发事件，不阻断文字或任务状态。`speak` 的到账、成功等业务结论仍须主程序根据实际回执约束。

```js
import {
  createVoiceDemo, createLocalModelTTSAdapter,
  createBrowserTTSAdapter, createBrowserSpeechInput
} from './voice-demo.mjs';

const voice = createVoiceDemo({
  tts: createLocalModelTTSAdapter(), // 默认为 http://127.0.0.1:65323/tts
  fallbackTTS: createBrowserTTSAdapter(), // UI 必须显示“系统语音回退”
  input: createBrowserSpeechInput(),
  getConfirmationSnapshot: taskId => currentCoreConfirmation(taskId),
  onEvent: event => {
    if (event.type === 'voice-command') {
      // 只能进入普通指令/规划路径；notAuthorization:true，不能当确认点击。
      sendChatInstruction(event.text);
    }
    if (event.type === 'voice-confirmation-request') {
      // 交给主任务的现有核心门控复核。这里绝不能直接调用执行器。
      // 核心仍需校验当前任务、版本、参数、权限、风险、熔断状态及身份要求。
      coreReviewVoiceConfirmation(event);
    }
    renderVoiceState(event, voice.getState());
  }
});

// 仅放在真实用户点击回调里。说明浏览器识别服务后才开启。
micButton.onclick = event => voice.startListening({userGesture:event.isTrusted});
stopButton.onclick = () => voice.cancel();
replayButton.onclick = () => voice.replay();

// 先保留文字回复，再异步播报。messageId 应包含响应/参数版本以防旧响应重播。
renderAssistantMessage(envelope);
await voice.speak(envelope, {messageId:assistantMessageId});

// 核心卡片已在对话内可见、且播报完毕后调用。
// 同一已主动启用的麦克风会话支持免再次点击；否则需显式用户手势。
const armed = voice.armConfirmation(currentCoreConfirmation(taskId));
if (armed.status === 'armed') renderInlineVoiceConfirmation(armed);

// 无麦克风文本路径：始终发普通指令，不能伪装成语音授权。
voice.submitText('下个月28号前提醒我检查订阅');
// 离开页面、任务取消、退出或安全锁定时：
voice.dispose();
```

上面 host 函数为接入位置示意，不是本模块提供的交易方法。`enable({userGesture:true})` 仅打开播报；`startListening` 才启动识别。`retryListening` 用于用户点击重听。`getState()` 返回用于现有 UI 的纯数据，不创建子页面。

服务使用 `GET /health` 获取临时会话令牌，然后 `POST /tts` 发送 **仅含 speak** 的 JSON；成功返回 WAV 和实际 `X-Voice-First-Audio-Ms`。仅绑定 127.0.0.1，默认只允许 `http://127.0.0.1:65321` 与 `http://localhost:65321` 两个浏览器 origin。其他预览端口用重复 `--allowed-origin` 显式指定。不存在远程模型请求或 API key。前端 endpoint 只允许同源或 loopback，若主任务以后挂到 `/api/voice/tts`，配套 health 地址应为 `/api/voice/health`。

## 语音确认卡片合同

`getConfirmationSnapshot(taskId)` 必须是**同步读取核心当前状态**的函数，不得从 LLM 输出获取。输入及快照结构：

```js
{
  taskId:'task-520', revision:3, target:'小林', amountMinor:52000,
  currency:'CNY', action:'转账',
  parameterKey:'核心生成的完整参数规范化串或摘要：包含来源账户、日期等',
  expiresAt:Date.now()+30000
}
```

模块绑定所有上述业务字段，确认窗口取卡片与核心快照有效期的较短值且最多 45 秒。界面显示随机确认词，例如“确认向小林转账520元，确认词蓝鲸银杏”；接受相同金额的规范中文数字版本。**不要通过 TTS 朗读随机确认词或完整确认句。** 说“好”“确认”或错误对象/金额都不会授权。

授权仅限本轮启用的麦克风最终识别结果，不接受 partial、文本演示输入、过期卡片、任务版本/对象/金额/参数变化、未知或不匹配身份。确认请求只用一次。新回复、身份变化、停麦、取消、离开或销毁都会清除卡片。核心必须再次检查 fingerprint 与业务状态，不能把演示声纹当作实际身份验证通过。

## 输入、回声与取消的具体行为

- 默认不监听，不自动上传或保存声纹；用户先明确点击启用麦克风。浏览器识别可能联网，输入错误时停止并显示重听或文本入口；普通自然结束最多自动恢复 3 次。
- 播报期间麦克风只接受完整打断词“停一下 / 停止播报 / 打断一下 / 先等等 / stop”；其他内容被忽略，尤其不会接收确认。说停后再发下一句话，或直接点停止按钮。
- 停播后的 800 ms 忽略输入，5 秒内抑制与上一句播报相同的长文本。这是应用级时序防回声，**不是经过验证的声学回声消除**，不能宣称抵御录音回放攻击。
- `cancel()` 立即 abort 请求、pause 本地播放、清理 Blob URL、取消系统 utterance，并使旧响应失效。正在运行的本地 CPU 单句推理可能完成，但不会恢复播放；没有宣称即时终止 ONNX 内部计算。CPU 忙时服务返回 429，不排队积压长任务。
- 若浏览器权限、自动播放、TTS 或本地服务失败，文字回复仍然可用，UI 根据事件显示真实状态。系统语音回退必须给出明确标签。

## 事件

| 事件 | 主要字段/用途 |
|---|---|
| `voice-input-state` | `listening`，更新麦克风状态 |
| `voice-interim` | 已遮蔽的临时文字，不能执行或授权 |
| `voice-command` | `text, source, notAuthorization:true`，普通规划输入 |
| `voice-input-error` | `code, textFallback:true`，显示重听/文本回退 |
| `voice-speech-state` | `preparing/speaking/completed`，实际 engine 和可用计时 |
| `voice-speech-cancelled` | 已打断/替换，旧音频不会继续 |
| `voice-tts-fallback / voice-tts-error` | 明示系统回退或保持文字 |
| `voice-confirmation-armed` | 界面显示绑定卡片、确认句及有效期 |
| `voice-confirmation-request` | 仅为待核心复核的请求，绝不是执行成功 |
| `voice-confirmation-rejected / cleared` | 具体拒绝/失效原因 |
| `voice-identity-signal` | 演示身份状态，`verified:false` |

## 测试与来源

```powershell
node --test tests/voice-demo.test.mjs
python -m unittest discover -s tests -p test_voice_demo_service.py -v
```

已通过 25 项 JS 测试、14 项 Python HTTP/数据边界测试；真实模型测试另见 WAV/JSON，HTTP 单元测试中的毫秒数为假模型固定值，不能当作推理性能。覆盖 malformed JSON、无 speak、继承/嵌套字段、敏感字段、重复/重听、取消/替换、服务忽略 abort 时宿主仍可取消、请求超时可恢复、失败不影响文字、系统回退、权限/输入错误、播报/回声保护、普通“好”不授权、一次性绑定、参数变更、过期、身份未知/不匹配、文本不能授权、精确 CORS/临时会话/错误响应边界。

官方来源与许可核查：

- [sherpa-onnx 官方项目及 Apache-2.0 许可](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)，[官方 Windows CPU Python 安装说明](https://k2-fsa.github.io/sherpa/onnx/python/install.html)，[PyPI 包](https://pypi.org/project/sherpa-onnx/)。
- [官方 VITS AISHELL3 模型说明](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html)，[AISHELL3 数据源标注 Apache-2.0](https://www.openslr.org/93/)。下载的 VITS 权重压缩包没有独立 LICENSE，不能仅据代码/数据许可承诺所有权重可商业再分发。
- [官方 Matcha 中文模型、Vocos 下载及非商业数据限制说明](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/matcha.html)。Matcha Baker 的压缩包 README 和 ONNX metadata 明确数据来源为 non-commercial use only；不能默认赛事就属于豁免，使用前需确认适用范围，因此它不是本次默认演示路径。[Vocos 22kHz 模型卡](https://huggingface.co/BSC-LT/vocos-mel-22khz) 标注 Apache-2.0。没有把任何权重纳入仓库或声称已完成商业许可审查。

本模块没有承诺端到端无人值守身份认证，也没有真实声纹防伪能力。演示时可真实展示“匹配/不匹配信号如何影响敏感操作”，并在说明中称为预设身份信号。

## 当前核心接入验收

2026-10-29 已由主程序挂载 `/api/voice/health` 与 `/api/voice/tts` 同源代理。仅转发到固定 loopback 65323，保留主程序会话、Origin 与 CSRF 检查，不向侧车传主程序 Cookie、CSRF 或模型凭据。CSP 只为音频增加 `media-src self blob:`。

默认常驻 VITS 实测经主代理 HTTP200，0.280秒返回62426字节，8kHz单声道31191帧，见 `audio/voice-demo-proxy.json` 与 `.wav`。主页面用户手势后可进入“正在听你说”，本地安全提示经历“正在准备声音”到“语音就绪”，浏览器未报告播放/CSP错误；停止可终止收音与确认窗口。该验证不等于真人已听到或已完成口语指令识别。

语音确认只显示一次性确认词，不朗读确认词。请求由核心再次核对对象、金额、版本、参数和更短的有效窗口；红色操作仍需要独立验证码。真实声音/噪声环境、误识别率、自然度与真人多轮口语尚未验收。浏览器 ASR 可能联网，不能声称完全离线双向语音。
