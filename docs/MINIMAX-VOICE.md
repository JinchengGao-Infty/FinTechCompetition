# MiniMax 中文女声流式适配交付

此交付只新增独立传输模块和测试，不改页面、ASR、主控制器、共享服务或环境变量。主集成的路由与临时 Key 会话规则见 `MINIMAX-INTEGRATION-CONTRACT.md`。

## 已实现与未验证

- 服务端固定连接中国站 `https://api.minimax.cn/v1/t2a_v2`，模型 `speech-2.8-hd`，系统音色 `Chinese (Mandarin)_Warm_Bestie`（温暖闺蜜）。不克隆真人、不创建收费音色。
- 一次提交完整且已验证的短 `speak`，保留句子韵律；HTTP SSE 音频边到边转为本地 NDJSON，浏览器边读边排入 Web Audio 播放队列，不等待整个文件下载。使用 mono、32 kHz、PCM signed 16-bit little-endian。
- 支持 Abort、旧请求失效、阻塞读取取消、错误文字回退、同一请求去重、完整短音频的内存重听缓存。不会自动重试或静默调用旧模型。
- 当前全部合成测试使用网络替身和虚构 Key，**真实合成请求为 0，付费消耗为 0**。没有测得 MiniMax 的真实首响延迟，没有实际听过此接入的样音，不能把模型名称或采样率当作自然度证明。PCM 实际格式、音量、韵律和端到端延迟仍须用户在 App 内主动试听验收。

模型与流式参数参考 [官方 HTTP API](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)；音色 ID 参考 [官方系统音色表](https://platform.minimax.cn/docs/faq/system-voice-id)。此云 API 需要互联网与中国站 API Key，不是离线本地模型。

## 文件与依赖

| 文件 | 职责 |
| --- | --- |
| `minimax_voice.py` | Python 标准库 HTTPS/SSE、脱敏、估算、取消及安全错误 |
| `web/minimax-voice-stream.mjs` | 同源 NDJSON 消费、PCM 实时播放、打断、内存重听 |
| `tests/test_minimax_voice.py` | 20 项服务端 mock 测试 |
| `tests/minimax-voice-stream.test.mjs` | 19 项浏览器适配器 mock 测试 |

Python 无新增依赖；浏览器模块复用现有 `web/voice-demo.mjs` 的 `extractSpeech`。测试使用 Python unittest、Node 内置 test runner。无需安装模型或新 NPM 包。

## 服务端接口

```python
from minimax_voice import MinimaxVoiceClient, MinimaxVoiceError

client = MinimaxVoiceClient()  # 推荐每个内存会话复用；主路由另有请求去重
events = client.stream(
    {"speak": validated_speak},
    api_key=session_key,       # 仅由调用者从 RAM 传入
    request_id=request_id,
    cancel_event=cancel_event,
)
try:
    for event in events:
        # 主路由每次输出前重新核对 session、generation、TTL 和 cancel_event。
        # json.dumps(event, ensure_ascii=False) + "\n"，并立即 flush。
        emit_ndjson(event)
except MinimaxVoiceError as error:
    emit_ndjson(error.as_event(request_id))
finally:
    cancel_event.set()
    events.close()
```

`stream()` 是惰性 generator，首次迭代才校验和发起请求。主路由须先检查会话、CSRF、Origin、用户同意、额度上限和请求 ID，预留估算用量后再迭代。若每个请求新建 client，必须保留主会话级请求去重；单个 client 自身的去重不跨实例。失败和取消的请求 ID 仍占用，不自动重试。去重表达到 1024 条时拒绝继续请求，不删除旧记录来允许重复计费。

仅顶层字符串 `speak` 可播报；也接受包含 `speak` 的 JSON 字符串。不会从 `reply/cards/actions` 寻找替代字段，也不会执行其中操作。`masked_speak(envelope)` 对长度、结构做校验，屏蔽完整卡号、验证码、密码、链接以及模型生成的语音效果标签。1–600 字的上限使单次请求保持短且可打断。

参数固定：`stream=true`、`stream_options.exclude_aggregated_audio=true`、`language_boost=Chinese`、`text_normalization_mode=basic`、speed/vol=1、pitch=0。末包若仍提供整段音频，仅在 `audio_size` 与完整前缀共同证实时去掉已发部分，避免重播；重复静音等合法增量不会因字节相同而被丢弃。元数据错误会在对应音频发出前拒绝。较早已播放的流式片段无法撤回，后续错误立即停止剩余音频。

传输使用正常证书校验的 TLS，不读环境代理，不接受用户指定的目标主机，不跟随重定向，不记录 Key 或响应原文。HTTP 非 200 不读取错误正文；HTTP 200 仍校验 `base_resp.status_code`。所有公开错误都是静态文字，避免上游错误回显凭据或内容。

`cancel_event.set()` 会由后台观察器关闭上游连接，读取等待通常可在约 50 ms 观察周期后解除；该数值是轮询间隔，不是实测网络或音频延迟。连接阶段仍受 5 秒连接超时约束。默认读超时 10 秒，总时限 60 秒。主路由在客户端断开、Key generation 变化、会话过期时也必须置事件，并关闭 generator。浏览器的取消路由提供额外的取消信号，不能只依赖下一次向已断开客户端写数据才发现取消。

## NDJSON 事件合同

每行一个 JSON 对象。所有事件都带同一 `request_id`。

```json
{"type":"start","request_id":"r1","format":"pcm_s16le","sample_rate":32000,"channels":1,"model":"speech-2.8-hd","voice":"Chinese (Mandarin)_Warm_Bestie","estimate":{"billable_characters_estimate":4,"cny_estimate":0.0014,"cny_per_10000":3.5,"is_estimate":true}}
{"type":"audio","request_id":"r1","seq":0,"audio_base64":"AAABAP9/AIA="}
{"type":"end","request_id":"r1","frames":1,"audio_bytes":8,"elapsed_ms":123,"usage_characters":4,"estimate":{"billable_characters_estimate":4,"cny_estimate":0.0014,"cny_per_10000":3.5,"is_estimate":true}}
```

失败用 `MinimaxVoiceError.as_event()`，例如：

```json
{"type":"error","request_id":"r1","code":"invalid_key","message":"MiniMax 密钥无效或没有语音权限。","retryable":false,"text_unaffected":true}
```

`elapsed_ms` 是服务端本次上游请求经过时间，不是用户听到首音的时间。`usage_characters` 为上游返回的计量值或 null，`estimate` 始终只是本地估算。`seq` 从 0 连续递增；音频分片为偶数字节、最多约 100 ms 的 PCM。客户端核对固定模型/音色/格式、序号和最终字节总数；截断、非法 JSON/Base64、乱序及结束后的额外事件都会中止，保持文字回复可见。

## 浏览器接口与异步 CSRF

```js
import {createMinimaxVoiceStreamAdapter} from './minimax-voice-stream.mjs';

const voice = createMinimaxVoiceStreamAdapter({
  endpoint: '/api/voice/minimax/stream',
  cancelEndpoint: '/api/voice/minimax/cancel',
  headers: async () => ({'X-CSRF-Token': await obtainCurrentCsrf()}),
});

// 在受信任的麦克风/试听按钮点击中先 prepare，满足浏览器音频手势要求。
await voice.prepare();
await voice.speak({speak: validatedSpeak}, {
  signal: controller.signal,
  requestId: crypto.randomUUID(),
  onStart: info => markPlaybackScheduled(info),
});
voice.cancel();

// Key generation 变化、断开、退出账号：由主集成调用。
voice.cancel();
voice.clearCache();
// 永久弃用实例可 voice.dispose()，之后不能再次 speak。
```

`headers` 接受普通对象或异步函数；每次流式请求和取消通知都会重新获取。仅访问当前 origin，本模块不接受 provider Key；传入 Authorization / X-API-Key 等头会直接拒绝。流式 POST body 固定为 `{request_id,speak}`，取消 POST body 固定为 `{request_id}`，均带 `credentials:same-origin`。

返回对象：`kind:'minimax-stream'`、`supported`、`prepare()`、`speak()`、`sample()`、`cancel()`、`clearCache()`、`dispose()`。`sample()` 使用常量 `MINIMAX_SAMPLE_TEXT` 中的一句非敏感中文。纯文本参数只应用于调用方已经选取的播报文本；JSON 字符串会解析为结构化 envelope，不会把坏 JSON 或完整 `reply/actions` 念出。禁止将未经校验的 LLM 流式 delta 当作 `speak`。

`speak()` 成功返回 `{status:'spoken',requestId,frames,audioBytes}`，缓存重播返回 `{status:'spoken',requestId,cached:true}`。`onStart` 只在首个音频 buffer **排入播放**时调用一次，包含 `firstAudioMs` 和 `phase:'scheduled'`；这不是硬件实测首音。Promise 等到流完整结束且所有音频节点结束才完成，不能用首片结束提前解除主控制器的回声防护。

`cancel()` / Abort 会停止音频节点、取消读取、使旧 generation 失效，并尽力通知同源 cancel 路由。普通取消抛 AbortError；错误抛带安全 `code` 和 `textUnaffected=true` 的 MinimaxStreamError。不要自动重试或自动切换旧声音。文字回复仍由主界面正常呈现。

同请求 ID、同一时刻的重复点击均在异步处理前去重；相同 ID 不同文本被拒绝。未指定 ID 的短时间同文本请求会被抑制。只缓存最后一条已完整验证的 PCM（最多 8 MiB）用于重听，缓存不落盘、不存 Key；部分/失败流不缓存。**主 wrapper 必须透传 clearCache/dispose，并在 Key 变更或断开时清空缓存。**

## 语音授权边界

本模块不采集麦克风、不上传用户音频、不存储声纹，也不发交易或授权事件。原 ASR 与主控制器继续负责回声抑制、用户手势、确认任务/对象/金额/参数版本/有效窗口的绑定，以及 matched/mismatched/unknown 演示身份状态。TTS 自己的声音、背景中的“好”或未知声纹不能构成授权。

## 费用与隐私

`estimate_billable_characters` / `estimate_cost`（Python）以及 `estimateMinimaxCost`（JS）按汉字 2、其他 Unicode 码点 1 估算；价格快照为 3.50 元/万计费字符。60 个纯汉字约 0.042 元，100 次约 4.20 元，标点另计。参考 [官方定价与字符规则](https://platform.minimax.cn/docs/pricing/overview)，核对日期 2026-10-30；将来价格变化须同步调整。此估算不查询余额，不能把用户所说的 25 元画成已读取的实时余额。取消请求也可能已有服务端计费，不能承诺取消免费。

只向官方接口传递脱敏后的短 `speak`、固定合成参数和必要鉴权头，不传完整聊天历史、账本、真实银行卡、用户录音或声纹。云服务的数据处理和保存由其服务条款及账户约定决定，本交付不承诺上游零留存。本模块不读取、持久化或回显 Key；调用方负责 RAM 生命周期。Python 字符串无法保证物理内存安全擦除。

## 验证命令与剩余验收

```powershell
python -B -m unittest discover -s tests -p test_minimax_voice.py -v
node --test tests/minimax-voice-stream.test.mjs
```

2026-10-30：Python 20/20、Node 19/19 全通过。均为可重复的 mock 测试，无云合成调用，未使用真实 Key。覆盖首片先于终包、PCM 边界、元数据和序号、HTTP/业务错误码、截断/坏 JSON、超时、读阻塞取消、失效请求、即时去重、内存重听、异步 CSRF 和文本安全。

集成后在隔离预览验收：用户自己在“我的”填 Key 并同意云播报，主动点击固定短句试听；实际听女声、数字读法和句间节奏，记录首个 buffer 排入时间并区分可听时间；播报中点麦克风/停止，确认立即停止且不把回声当确认；再检查错误文字回退、断开后不能继续访问服务、缓存随断开清空。只有该试听成功才能称真实 MiniMax 接通，只有用户听感验收后才能称达到自然对话效果。
