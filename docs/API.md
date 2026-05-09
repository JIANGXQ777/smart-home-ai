# Smart Home AI API 文档

本文档描述 Smart Home AI 当前阶段的后端 HTTP API。

## 基础信息

- 服务地址：`http://localhost:5000`
- 数据格式：`JSON`
- 请求头：`Content-Type: application/json`

## 接口总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 获取当前环境、设备与系统状态 |
| POST | `/api/chat` | 提交自然语言输入，获取 AI 回复和建议动作 |
| POST | `/api/execute` | 用户确认后执行设备动作 |

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
| `aiDecisionEnabled` | boolean | `true` | 是否启用大模型决策 |
| `esp32Configured` | boolean | `true` | 是否已配置 ESP32 网关地址 |
| `esp32Connected` | boolean | `true` | 后端能否访问 ESP32 网关 |
| `refreshedAt` | string | `"2026-05-09T08:57:00.000Z"` | 状态聚合时间 |
| `esp32` | object 或 null | `{ "ip": "10.173.149.129" }` | ESP32 健康状态摘要 |

### Device

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `id` | string | `"bedroom_ac"` | 设备唯一 ID |
| `name` | string | `"卧室空调"` | 设备显示名称 |
| `type` | string | `"air_conditioner"` | 设备类型 |
| `location` | string | `"卧室"` | 设备所在位置 |
| `controlType` | string | `"ir"` | 控制方式，当前为红外 |
| `status` | string | `"off"` | 当前状态，`on` 或 `off` |
| `assumedState` | string | `"off"` | 系统根据最后命令推测出的状态 |
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

## GET /api/state

获取当前环境、设备和系统状态。

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
    "esp32": {
      "ip": "10.173.149.129",
      "rssi": -13,
      "serviceStarted": true,
      "sensorReady": true,
      "wifiConnected": true
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
