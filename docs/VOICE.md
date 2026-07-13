# ESP32-S3 硬件实时语音

## 架构

ESP32-S3 只负责 I2S 音频采集、播放和 WebSocket 传输。后端负责 VAD、语音识别、AI 决策、语音确认和 TTS。

```text
INMP441 -> ESP32-S3 -> WebSocket PCM -> Node 后端
MAX98357A <- ESP32-S3 <- WebSocket PCM <- Node 后端
```

第一版采用半双工：设备播放回复时暂停麦克风上传，避免扬声器回声再次触发识别。

## 接线

INMP441：

| INMP441 | ESP32-S3 |
|---|---|
| VDD | 3.3V |
| GND | GND |
| SCK | GPIO12 |
| WS | GPIO13 |
| SD | GPIO14 |
| L/R | GND（左声道） |

MAX98357A：

| MAX98357A | ESP32-S3 |
|---|---|
| VIN | 5V |
| GND | GND |
| BCLK | GPIO12 |
| LRC | GPIO13 |
| DIN | GPIO15 |
| SD | GPIO21（播放时启用，空闲时硬件静音） |
| SPK+ / SPK- | 4Ω 扬声器两端 |

MAX98357A 是桥接输出，扬声器任意一端都不能接 GND。

## 音频格式

- 16000 Hz
- 16-bit little-endian
- 单声道
- 每帧 20ms
- 每帧 320 个采样、640 字节

控制事件使用 JSON 文本消息，PCM 使用原始 WebSocket 二进制消息，不使用 Base64。

## N16R8 编译

```bash
npm run firmware:compile
```

等价 Arduino CLI 配置：

```text
Flash Size: 16MB
PSRAM: OPI PSRAM
Partition: 16M Flash (3MB APP/9.9MB FATFS)
USB CDC On Boot: Enabled
```

大容量播放缓冲区放在 PSRAM，I2S DMA 缓冲区仍由内部 SRAM 提供。

## 后端配置

推荐在控制中心的“模型配置”页面分别设置 ASR 和 TTS。下面的环境变量只用于 SQLite 模型记录首次初始化：

```env
VOICE_ENABLED=true
VOICE_API_KEY=your_voice_api_key
VOICE_ASR_ENDPOINT=https://api.example.com/v1/audio/transcriptions
VOICE_TTS_ENDPOINT=https://api.example.com/v1/audio/speech
VOICE_STT_MODEL=gpt-4o-mini-transcribe
VOICE_TTS_MODEL=gpt-4o-mini-tts
VOICE_TTS_VOICE=alloy
VOICE_SAMPLE_RATE=16000
VOICE_VAD_THRESHOLD=700
VOICE_SILENCE_MS=700
```

ASR、TTS 与文本 LLM 可分别配置服务商、完整请求接口、模型和 API Key，避免把语言模型密钥发送给语音服务。后端不会自动拼接接口路径。

## 调试顺序

1. 烧录固件并确认串口输出 `flash=16MB psram=8MB`。
2. 打开总览，确认“硬件语音”显示“音频在线”或“可对话”。
3. 在设置页点击“播放硬件测试音”，确认扬声器输出 440Hz 提示音。
4. 观察总览音量数值，正常说话时应明显高于安静环境。
5. 根据环境调整 `VOICE_VAD_THRESHOLD`，避免底噪误触发。
6. 配置语音 API Key 后再测试完整识别、确认和设备执行。

## 接口

- `GET /api/voice/status`
- `POST /api/voice/test-tone`
- `POST /api/voice/capture`，请求体：`{"enabled": true}`

设备控制仍经过原有 `aiAgent -> decisionValidator -> executor`，语音层不能绕过动作校验。
