# Smart Home AI API 文档

本文档描述 Smart Home AI 当前阶段的后端 HTTP API。

## 基础信息

- 服务地址：`http://localhost:5000`
- 数据格式：`JSON`
- 请求头：`Content-Type: application/json`

## 接口总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 获取轻量服务和数据库健康状态 |
| GET | `/api/state` | 获取当前环境、设备与系统状态 |
| GET | `/api/events` | 获取最近的持久化设备执行记录 |
| GET | `/api/voice/status` | 获取硬件语音连接、VAD 和处理状态 |
| POST | `/api/voice/capture` | 启用或暂停 ESP32 麦克风上传 |
| POST | `/api/voice/manual-recording` | 开始或结束一次由页面控制的硬件麦克风录音，请求体为 `{"enabled": true/false}` |
| POST | `/api/voice/test-tone` | 在 MAX98357A 扬声器播放测试音 |
| POST | `/api/voice/test-speech` | 使用当前 TTS 配置合成并播放测试语音 |
| GET | `/api/voice/browser-audio` | 获取等待电脑播放的最新 WAV 音频 |
| POST | `/api/voice/browser-audio/:id/finished` | 通知后端电脑播放结束并恢复麦克风采集 |
| POST | `/api/chat` | 提交自然语言输入，获取 AI 回复和建议动作 |
| POST | `/api/execute` | 用户确认后执行设备动作 |
| GET/POST | `/api/config` | 读取或保存运行配置 |
| GET/PUT | `/api/models` | 读取或保存 SQLite 中的 LLM、ASR、TTS 配置 |
| GET/POST | `/api/devices` | 获取或添加设备 |
| PUT/DELETE | `/api/devices/:id` | 更新或删除设备 |
| GET | `/api/device-types` | 获取设备类型预设 |
| POST | `/api/ir-learn/start` | 开始红外学习 |
| POST | `/api/ir-learn/save` | 保存学习结果 |
| GET/DELETE | `/api/ir-learn/codes` | 获取或删除红外码 |

## 数据模型

### Environment

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `temperature` | number | `22.9` | 当前温度，单位摄氏度 |
| `humidity` | number | `61.6` | 当前湿度，百分比 |
| `time` | string | `"16:57"` | 当前时间，由后端实时生成 |
| `source` | string | `"esp32"` | 环境数据来源，`esp32` 或 `simulated` |

### System

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `backendConnected` | boolean | `true` | 后端服务是否正常运行 |
| `appMode` | string | `"demo"` | 当前运行模式：`demo`、`hybrid` 或 `hardware` |
| `aiDecisionEnabled` | boolean | `true` | 是否启用大模型决策 |
| `storage` | object | `{ "type": "sqlite", "persistent": true }` | 当前持久化存储摘要 |
| `esp32Configured` | boolean | `true` | 是否已启用并配置 ESP32 通信 |
| `esp32Connected` | boolean | `true` | 后端能否通过 WebSocket 或串口访问 ESP32 |
| `refreshedAt` | string | `"2026-05-09T08:57:00.000Z"` | 状态聚合时间 |
| `esp32Connection` | object | `{ "mode": "auto", "activeTransport": "websocket" }` | 配置方式和当前实际通信通道 |
| `esp32` | object 或 null | `{ "transport": "websocket", "ip": "192.168.1.88" }` | ESP32 健康状态摘要 |

### Device

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `id` | string | `"bedroom_ac"` | 设备唯一 ID |
| `name` | string | `"卧室空调"` | 设备显示名称 |
| `type` | string | `"air_conditioner"` | 设备类型 |
| `location` | string | `"卧室"` | 设备所在位置 |
| `controlType` | string | `"ir"` | 控制方式，当前为红外 |
| `status` | string | `"unknown"` | 当前状态，`on`、`off` 或 `unknown` |
| `assumedState` | string | `"unknown"` | 系统根据最后命令推测出的状态，首次启动为未知 |
| `targetTemperature` | number 或 null | `26` | 空调设定温度 |
| `lastCommand` | object 或 null | `{ "command": "turn_on" }` | 最后一次执行记录 |
| `stateConfidence` | string | `"assumed"` | 状态可信度 |
| `paired` | boolean | `true` | 是否已配对 |
| `actions` | string[] | `["turn_on", "turn_off"]` | 支持的动作列表 |
| `capabilities` | object | `{ "power": true }` | 设备能力模型 |
| `irProfile` | object | `{ "brand": "unknown" }` | 红外档案与已学习红外码 |

### Action

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `deviceId` | string | `"bedroom_ac"` | 目标设备 ID |
| `command` | string | `"turn_on"` | 目标动作 |
| `value` | number | `26` | 可选参数，`set_temperature` 时使用 |

## GET /api/health

用于容器和反向代理健康检查，不触发 ESP32 或 LLM 探测。

```json
{
  "ok": true,
  "storage": "sqlite",
  "timestamp": "2026-07-13T12:00:00.000Z"
}
```

## GET /api/events

返回最近的设备执行记录，支持 `limit=1..100`，默认 20 条。

## GET /api/state

获取当前环境、设备和系统状态。

响应还包含 `recentEvents`，用于展示 SQLite 中最近的设备执行记录。

### 成功响应

状态码：`200`

```json
{
  "environment": {
    "temperature": 22.9,
    "humidity": 61.6,
    "time": "16:57",
    "source": "esp32"
  },
  "devices": [
    {
      "id": "bedroom_ac",
      "name": "卧室空调",
      "type": "air_conditioner",
      "location": "卧室",
      "controlType": "ir",
      "status": "off",
      "assumedState": "off",
      "targetTemperature": null,
      "lastCommand": null,
      "stateConfidence": "assumed",
      "paired": true,
      "actions": ["turn_on", "turn_off", "set_temperature"],
      "capabilities": {
        "power": true,
        "temperature": {
          "min": 16,
          "max": 30,
          "step": 1,
          "unit": "celsius"
        },
        "mode": ["cool", "heat", "dry", "fan"],
        "fanSpeed": ["low", "medium", "high", "auto"]
      },
      "irProfile": {
        "brand": "unknown",
        "model": "unknown",
        "learnedCodes": {
          "turn_on": {
            "protocol": "COOLIX",
            "code": "0xB21FB8",
            "bits": 24,
            "endpoint": "/ir/power"
          }
        }
      }
    }
  ],
  "system": {
    "backendConnected": true,
    "aiDecisionEnabled": true,
    "esp32Configured": true,
    "esp32Connected": true,
    "refreshedAt": "2026-05-09T08:57:00.000Z",
    "esp32Connection": {
      "mode": "auto",
      "activeTransport": "websocket",
      "connected": true,
      "websocket": {
        "path": "/ws/esp32",
        "connected": true,
        "deviceId": "esp32-living-room"
      },
      "serial": {
        "serialPath": "COM3",
        "baudRate": 115200,
        "connected": true
      }
    },
    "esp32": {
      "transport": "websocket",
      "deviceId": "esp32-living-room",
      "ip": "192.168.1.88",
      "rssi": -48,
      "serviceStarted": true,
      "sensorReady": true,
      "wifiConnected": true,
      "websocketConnected": true
    }
  }
}
```

### curl 示例

```bash
curl http://localhost:5000/api/state
```

## POST /api/chat

提交自然语言输入，由后端返回 AI 回复和建议动作。AI 只生成建议，不直接执行设备控制。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | 是 | 用户输入内容 |

```json
{
  "message": "只打开空调"
}
```

### 成功响应

状态码：`200`

```json
{
  "reply": "好的，我可以帮你只打开卧室空调，不调整温度，需要我现在执行吗？",
  "intent": "direct_control",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "turn_on"
  }
}
```

### 错误响应

状态码：`400`

```json
{
  "error": "缺少 message 字段"
}
```

## POST /api/execute

用户确认后执行设备动作。对于已配置红外码的红外设备，后端会调用 ESP32 网关发射红外，再更新推测状态。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `deviceId` | string | 是 | 目标设备 ID |
| `command` | string | 是 | 要执行的动作 |
| `value` | number | 否 | `set_temperature` 时的目标温度 |

```json
{
  "deviceId": "bedroom_ac",
  "command": "turn_on"
}
```

### 成功响应

状态码：`200`

```json
{
  "success": true,
  "message": "卧室空调已打开",
  "deviceId": "bedroom_ac",
  "status": "on",
  "assumedState": "on",
  "targetTemperature": null,
  "stateConfidence": "assumed"
}
```

### 失败响应示例

```json
{
  "success": false,
  "message": "卧室空调 还没有录入 set_temperature 的红外码"
}
```

### curl 示例

```bash
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"bedroom_ac\",\"command\":\"turn_on\"}"
```

## 运行配置

### GET /api/config

返回可公开展示的系统、ESP32 和语音终端运行配置。

### POST /api/config

支持字段：`appMode`、`esp32Enabled`、`esp32Transport`、`esp32WsToken`、`serialPort`、`serialBaudRate`、`voiceEnabled`、`voiceVadThreshold`、`voiceSilenceMs`。

`esp32Transport` 可设为 `auto`、`websocket` 或 `serial`。接口不会返回令牌原文，只返回 `esp32WsTokenConfigured`。

配置保存采用增量更新，不会删除 `.env` 中未被本接口管理的字段。

## 模型配置

### GET /api/models

返回 SQLite 中的 `llm`、`asr`、`tts` 三类配置。API Key 原文永不返回，只提供 `apiKeyConfigured` 状态。

### PUT /api/models

请求体使用 `models` 包裹需要更新的配置。API Key 留空会保留数据库中的原密钥。

```json
{
  "models": {
    "asr": {
      "enabled": true,
      "provider": "openai-compatible",
      "baseUrl": "https://api.example.com",
      "apiKey": "your_api_key",
      "model": "gpt-4o-mini-transcribe",
      "settings": {
        "endpointPath": "/v1/audio/transcriptions",
        "language": "zh",
        "timeoutMs": 30000
      }
    }
  }
}
```

`baseUrl` 保存服务地址，`settings.endpointPath` 保存请求接口，两者都由用户填写。例如服务地址可填写 `https://api.xiaomimimo.com`，请求接口填写 `/v1/chat/completions`。后端只负责连接这两部分，不会预置或追加固定业务路径。模型配置保存后立即生效，不需要重启服务。

当 `provider` 为 `xiaomimimo`，或服务地址属于 `xiaomimimo.com` 时，ASR/TTS 自动使用 Xiaomi MiMo V2.5 的 `api-key`、Base64 音频和 Chat Completions 消息协议；其他服务商继续使用 OpenAI Audio 兼容协议。

## 设备管理

- `GET /api/devices`：设备定义列表
- `POST /api/devices`：添加设备
- `PUT /api/devices/:id`：更新设备
- `DELETE /api/devices/:id`：删除设备
- `GET /api/device-types`：获取类型对应的动作和能力预设

## 红外学习

### POST /api/ir-learn/save

普通开关动作提交 `deviceId`、`command` 和 `learned`。保存调温码时必须额外提交具体温度：

```json
{
  "deviceId": "bedroom_ac",
  "command": "set_temperature",
  "value": 26,
  "learned": {
    "protocol": "COOLIX",
    "code": "0xB2BF10",
    "bits": 24
  }
}
```

调温码按温度存储在 `variants` 中。旧版单条调温码会迁移为 `legacy`，不会被自动用于任意温度。
