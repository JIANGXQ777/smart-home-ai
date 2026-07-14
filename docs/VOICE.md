# 控制台浏览器语音

当前语音交互全部集中在控制台的“AI 助手”页面。ESP32 不再承担麦克风录音、VAD 或扬声器播放，只继续负责红外控制、温湿度传感器和设备状态。

## 架构

```text
麦克风
-> 浏览器 Web Audio API
-> 16 kHz / 16-bit / 单声道 PCM
-> POST /api/voice/transcribe
-> ASR 转文字
-> 现有 /api/chat AI 对话与动作确认
-> POST /api/voice/synthesize
-> WAV
-> 默认扬声器
```

语音输入和文字输入共用同一套 AI 决策、动作校验和用户确认流程。语音层不能绕过 `decisionValidator` 或直接执行设备动作。

## 浏览器要求

- 推荐使用固定 HTTPS 地址：`https://smart-home-ai.tail29b726.ts.net`
- `localhost` 也可使用麦克风。
- 普通局域网 HTTP 地址可以控制设备，但浏览器通常不会向非安全来源开放麦克风。
- 首次点击麦克风时需要允许浏览器访问设备麦克风。
- 录音会启用浏览器回声消除、降噪和自动增益。

## 音频格式

- 16000 Hz
- 16-bit little-endian
- 单声道
- 浏览器采集后在本地重采样
- 默认录音时长范围：0.4 秒至 30 秒
- AI 助手页面会在 20 秒时自动结束一次录音

## 模型配置

在“模型配置”页面分别启用并配置 ASR 和 TTS。下面的环境变量只用于 SQLite 首次初始化：

```env
VOICE_ENABLED=true
VOICE_API_KEY=your_voice_api_key
VOICE_BASE_URL=https://api.example.com
VOICE_ASR_ENDPOINT_PATH=/v1/audio/transcriptions
VOICE_TTS_ENDPOINT_PATH=/v1/audio/speech
VOICE_STT_MODEL=gpt-4o-mini-transcribe
VOICE_TTS_MODEL=gpt-4o-mini-tts
VOICE_TTS_VOICE=alloy
VOICE_SAMPLE_RATE=16000
BROWSER_VOICE_MIN_MS=400
BROWSER_VOICE_MAX_MS=30000
```

Xiaomi MiMo 配置仍使用 `api-key`、Base64 WAV 和 Chat Completions 消息协议；OpenAI 兼容服务继续使用音频接口。

## 接口

### `GET /api/voice/status`

返回浏览器语音模式、ASR/TTS 配置状态、采样率和最近处理状态。

### `POST /api/voice/transcribe`

- `Content-Type: application/octet-stream`
- `X-Audio-Sample-Rate: 16000`
- 请求体：16 kHz 单声道 16-bit PCM

成功响应：

```json
{
  "success": true,
  "text": "打开空调",
  "audio": {
    "durationMs": 1800,
    "sampleRate": 16000,
    "bytes": 57600
  }
}
```

### `POST /api/voice/synthesize`

请求体：

```json
{ "text": "好的，需要我现在执行吗？" }
```

成功时返回 `audio/wav`，由 AI 助手页面直接通过默认音频设备播放。

## 使用流程

1. 在模型配置中确认 ASR 和 TTS 已启用。
2. 打开 AI 助手页面。
3. 点击麦克风并允许浏览器权限。
4. 说完后再次点击麦克风；最长 20 秒会自动停止。
5. 检查识别文字和 AI 回复。
6. 需要设备动作时，在页面中点击“确认执行”。
7. 可在 AI 助手语音控制条中关闭语音回复或调整播放音量。
