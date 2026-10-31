# 中文女声升级：Kokoro 1.1

用户实际试听后否定原 8 kHz VITS，认为呆板、机械，并明确要求女声。本次因此更换模型及固定音色，不再把原 VITS 作为默认成品，独立模块阶段没有更改主页面、CSS、主controller、共享配置或服务进程；主集成的切换记录见下文。

**本次本地首选技术方案：Kokoro-82M-v1.1-zh，FP32，中文女声 `zf_001`（speaker ID 3），CPU 8 线程，速度 1.0。** `zf_040`（ID 25）提供第二份试听对照。这是按中文女声、明确模型许可、实测可运行和延迟作出的暂定选择，不是主观音质冠军判定。

## 听感验证边界

我没有实际听过音频。尝试把生成的 WAV 交给音频输入入口时，工具明确返回不支持音频输入；不能据文件采样率、波形或合成时间声称“更自然”或“像真人”。下面音频均真实生成，需由用户实际试听确认停顿、重音、咬字、音色及是否仍有机械感。没有模仿或克隆特定真人，没有上传真实用户声音。

| 同一音色 | 短句 | 日常对话 |
|---|---|---|
| `zf_001`，明确中文女声 | [短句样本](audio/voice-female-zf_001-short.wav) | [对话样本](audio/voice-female-zf_001-conversation.wav) |
| `zf_040`，明确中文女声 | [短句样本](audio/voice-female-zf_040-short.wav) | [对话样本](audio/voice-female-zf_040-conversation.wav) |

短句与此前基线相同：“我会先核对收款人与金额，确认后再继续。”

日常对话：“好，我先把餐厅和蛋糕安排好。定时转账的收款人和金额，还需要你确认一下。”

## 实际性能与比较

Windows x64，CPU 推理，sherpa-onnx 2.0.1。设备有 RTX 4050 Laptop GPU 6 GiB，但本次没有用 GPU，也未为 GPU 安装另一个运行时。独立实测进程峰值工作集约 **701 MiB**，模型加载约 **3.06 秒**；常驻后不需要每句话重新加载。

| 已运行路径 | 线程 | 首次整句合成 | 热态整句合成 | 对应音频时长 | 判断依据 |
|---|---:|---:|---:|---:|---|
| 原 VITS AISHELL3 | 2 | 0.244 s | 0.216 s | 4.02 s | 用户已否定听感 |
| 既有 Matcha Baker 女声 | 2 | 0.401 s | 0.386 s | 3.66 s | 可作试听对照；数据有非商业限制 |
| Kokoro INT8 `zf_001` | 2 | 8.081 s | 8.005 s | 4.38 s | 等待过长，本次不选默认 |
| Kokoro INT8 `zf_018` | 8 | 8.503 s | 8.445 s | 5.27 s | 增加线程未解决问题 |
| Kokoro FP32 `zf_001` 短句 | 8 | **1.930 s** | **1.804 s** | 4.39 s | 本次暂定默认 |
| Kokoro FP32 `zf_040` 短句 | 8 | 2.221 s | 2.055 s | 5.29 s | 第二个女声候选 |
| Kokoro FP32 `zf_001` 对话 | 8 | 2.901 s | 3.004 s | 7.34 s | 实际长句对照 |
| Kokoro FP32 `zf_040` 对话 | 8 | 3.533 s | 3.517 s | 9.41 s | 实际长句对照 |

表中时间是**完整一句生成到内存 PCM WAV 的时间**，不是流式首个音频包，也不包括 LLM、ASR、浏览器或音频设备延迟。当前服务返回完整 WAV，因此不能宣传成亚秒级双向实时语音。`speak` 应保持简短自然，不通过无意义填充语音掩盖等待。

证据在 [voice-female-comparison.json](audio/voice-female-comparison.json) 及每个 WAV 对应的 JSON。还运行了实际模型的临时 loopback HTTP 请求和取消测试，见 [voice-female-http.json](audio/voice-female-http.json)。实际 HTTP 关闭客户端不会强行杀死正在执行的 CPU 推理，完成后不会自动恢复旧音频播放。

## 已实现的独立变更

- `voice_service.py` 增加 Kokoro 路径，CLI 默认 `--engine kokoro --precision fp32`，默认女声 ID 3、速度 1.0、8 线程。模型路径未配置或权重缺失时明确报错，不悄悄回退到旧 VITS。
- Kokoro 只接受官方映射中 **3–57** 的中文女性 speaker ID；英语音色、男性音色、越界值不会被作为本演示的女声使用。音色由服务启动参数固定，LLM 或 `/tts` 请求无法改音色。
- health 返回实际 `voice`、模型和 engine；前端本地适配器接受 `sherpa-onnx-kokoro`。没有给 UI 加面板。
- 只提取 `speak`、遮蔽敏感号码/验证码、取消/替换/重听、绑定具体卡片的语音确认、播报/回声防误授权、失败文字回退保持原合同。`reply/cards/actions` 不会变成可执行语音授权。
- 保留主集成对 Windows 早期拒绝请求 body 读取的修复；没有覆盖主 controller 的麦克风交互。

## 本机可直接复用

原隔离 Python 环境继续使用，没有新增 Python 依赖或改动 `.env`：

```powershell
& $VoicePython voice_service.py --engine kokoro --precision fp32 --model-dir $VoiceModelDir --speaker 3 --threads 8 --speed 1.0 --port 65323
```

路径名称保留最初下载的 INT8 包名，但此目录现在还包含已验证的 `model.onnx` 浮点权重；显式 `--precision fp32` 决定实际使用哪个文件。换另一女声只需由主集成把 `--speaker 3` 改为 `--speaker 25`，不向用户增加选择面板。

**集成补记：主集成已切换65323常驻服务为Kokoro FP32女声，并通过实际HTTP/WAV检查，见验收说明。** 上述变量分别指向既有隔离Python和已下载模型目录；权重不入仓库。复用旧的显式 `--engine vits` 启动命令仍会得到旧声音。

## 下载与来源

本轮仅下载同一个 Kokoro 模型的一个 INT8 资源包和一个浮点权重文件：INT8 实测不达交互延迟后，依据上游同类性能问题进行了一次有针对性的精度对照，没有继续试下载其他模型或 GPU 运行时。

- INT8 官方压缩包：**147,052,523 B**，SHA-256 `259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c`。
- 官方维护者的 FP32 `model.onnx`：**325,561,476 B**，SHA-256 `99db0bc8fd0c5033d249fe922db16768b71b4a6b26cfd93d206fbf66c76efb5f`。复用 INT8 包中相同版本的 103 份音色、token 和词典。
- 本次已下载文件的大小和 SHA 均通过核对；正常验证 TLS，未关闭证书验证或更改代理/CA。

干净机器可直接使用官方完整 FP32 包（约 365 MB；本次未重复下载这个完整包）：

```powershell
python voice_service.py --engine kokoro --precision fp32 --download-model .voice-female-models
& .\.voice-demo-env\Scripts\python.exe voice_service.py --engine kokoro --precision fp32 --model-dir .voice-female-models\kokoro-multi-lang-v1_1 --speaker 3 --threads 8 --port 65323
```

安装命令使用固定官方 URL、准确文件大小及发布 SHA 验证，并检查解压路径、符号链接和解压体积。Python CA 环境有问题时，可以使用正常验证 TLS 的系统下载工具获取同一个官方包，再通过 `--archive 文件路径 --download-model 目标目录 --precision fp32` 进行本地校验和解压，不需要关闭安全检查。

## 官方许可与数据

- [Kokoro-82M-v1.1-zh 官方模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)明确标注 **Apache-2.0**；说明中文训练数据来自 LongMaoData 授权的专业数据，新增 100 位中文说话人。不能把“100 位说话人”理解成可随意仿冒某个现实人物。
- [sherpa 官方 Kokoro 说明](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html)提供 INT8/FP32 包；[官方音色映射](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html)明确 `zf` 为 Chinese female，ID 3–57。
- [维护者的 FP32 权重及发布 SHA](https://huggingface.co/csukuangfj/kokoro-multi-lang-v1_1/blob/main/model.onnx)与本次文件一致，已下载资源包内也含 Apache-2.0 LICENSE 和上游 README。
- 这一路径没有 Baker 数据明确的非商业限制；商业分发时仍需保留适用的 LICENSE/NOTICE、核查完整依赖和实际用途，不能把模型许可扩大成整项金融产品的认证结论。
- INT8 不保证更快。[上游性能问题记录](https://github.com/thewh1teagle/kokoro-onnx/issues/112)是本次定向比较 FP32 的线索；表中性能结论来自本机实跑，并未照抄他人的硬件结果。

## 官方 API 备选及真实阻塞

若用户试听这两种本地女声后仍不满意，下一条优先 API 路径是 **Azure Speech 的 `zh-CN-XiaoxiaoNeural` 女声**，可测试 `chat / friendly / gentle` 风格；支持的地域也可评估 `zh-CN-Xiaoxiao:DragonHDFlashLatestNeural`。这些是官方系统音色，不是克隆特定真人。[官方音色与风格表](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)

**API 目前没有调用、没有生成样本、没有接通，也没有配置凭据。** 必要用户动作是提供/授权使用自己的 Azure Speech 资源及对应 key + region/endpoint，或有权限的 Microsoft Entra 身份；用户自行决定计费资源。后续应通过本地服务使用凭据，不放在浏览器或 LLM 输出中。[官方 REST 前提和认证说明](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)

没有使用 `edge-tts`、消费者端点的非官方免密调用、付费服务试购或其他未经授权的第三方 API。当前本地 Kokoro 推理无需持续外网或云 API；浏览器 ASR 可能仍使用浏览器厂商的联网服务，不能称为完全离线双向语音。

## 验证

```powershell
node --test tests/voice-demo.test.mjs
python -B -m unittest discover -s tests -p test_voice_demo_service.py -v
```

已通过 26 项 JS、17 项 Python 测试，并实际生成四份 FP32 女声 WAV。自动测试检查女性音色映射、男性/未知音色拒绝、未验证模型包拒绝、Kokoro health 握手、原有仅 speak/敏感遮蔽/打断/取消/授权绑定/文字回退边界；它们不证明主观听感达标。
