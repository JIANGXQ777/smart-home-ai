# Smart Home AI API 文档

本文档描述 Smart Home AI V1 阶段的后端 HTTP API。当前版本为文字版 Demo，设备和环境数据均为内存模拟数据。

## 基础信息

- 服务地址：`http://localhost:5000`
- 数据格式：JSON
- 请求头：`Content-Type: application/json`
- 跨域：后端当前允许所有来源访问

## 接口总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 获取当前环境信息和设备列表 |
| POST | `/api/chat` | 提交用户自然语言输入，获取 AI 建议 |
| POST | `/api/execute` | 用户确认后执行设备动作 |

## 数据模型

### Environment

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `temperature` | number | `29` | 当前温度，单位摄氏度 |
| `humidity` | number | `72` | 当前湿度，百分比 |
| `time` | string | `"22:30"` | 当前模拟时间 |
| `presence` | boolean | `true` | 当前场景是否有人 |
| `scene` | string | `"bedroom"` | 当前模拟场景 |

### Device

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `id` | string | `"bedroom_ac"` | 设备唯一 ID |
| `name` | string | `"卧室空调"` | 设备显示名称 |
| `type` | string | `"air_conditioner"` | 设备类型 |
| `location` | string | `"卧室"` | 设备所在位置 |
| `status` | string | `"off"` | 设备当前状态，取值为 `on` 或 `off` |
| `paired` | boolean | `true` | 设备是否已配对 |
| `actions` | string[] | `["turn_on", "turn_off"]` | 设备支持的动作列表 |

### Action

| 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|
| `deviceId` | string | `"bedroom_ac"` | 目标设备 ID |
| `command` | string | `"turn_on"` | 目标动作命令 |

## 设备与命令枚举

### 当前设备

| 设备 ID | 名称 | 类型 | 位置 | 初始状态 | 支持动作 |
|---|---|---|---|---|---|
| `bedroom_ac` | 卧室空调 | `air_conditioner` | 卧室 | `off` | `turn_on`, `turn_off`, `set_temp_26` |
| `livingroom_fan` | 客厅风扇 | `fan` | 客厅 | `off` | `turn_on`, `turn_off` |
| `livingroom_light` | 客厅灯 | `light` | 客厅 | `off` | `turn_on`, `turn_off` |

### 当前动作

| 命令 | 说明 | 执行后的状态 |
|---|---|---|
| `turn_on` | 打开设备 | `on` |
| `turn_off` | 关闭设备 | `off` |
| `set_temp_26` | 将空调设置为 26 度 | `on` |

## GET /api/state

获取当前系统状态，包括环境信息和所有已配对设备。

### 请求

无请求体。

### 成功响应

状态码：`200`

```json
{
  "environment": {
    "temperature": 29,
    "humidity": 72,
    "time": "22:30",
    "presence": true,
    "scene": "bedroom"
  },
  "devices": [
    {
      "id": "bedroom_ac",
      "name": "卧室空调",
      "type": "air_conditioner",
      "location": "卧室",
      "status": "off",
      "paired": true,
      "actions": ["turn_on", "turn_off", "set_temp_26"]
    },
    {
      "id": "livingroom_fan",
      "name": "客厅风扇",
      "type": "fan",
      "location": "客厅",
      "status": "off",
      "paired": true,
      "actions": ["turn_on", "turn_off"]
    },
    {
      "id": "livingroom_light",
      "name": "客厅灯",
      "type": "light",
      "location": "客厅",
      "status": "off",
      "paired": true,
      "actions": ["turn_on", "turn_off"]
    }
  ]
}
```

### curl 示例

```bash
curl http://localhost:5000/api/state
```

## POST /api/chat

提交用户自然语言输入，由后端规则版 AI 返回回复和建议动作。AI 只生成建议，不直接执行设备控制。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | 是 | 用户输入内容 |

```json
{
  "message": "好热"
}
```

### 成功响应：需要用户确认

状态码：`200`

```json
{
  "reply": "当前室温29度，卧室空调处于关闭状态，建议打开卧室空调，需要我帮你打开吗？",
  "intent": "cooling",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "turn_on"
  }
}
```

### 成功响应：不需要控制设备

状态码：`200`

```json
{
  "reply": "我目前可以控制卧室空调、客厅风扇和客厅灯。卧室空调支持开关和设置温度，客厅风扇支持开关，客厅灯支持开关。",
  "intent": "capability_query",
  "needConfirm": false,
  "action": null
}
```

### 成功响应：无法理解

状态码：`200`

```json
{
  "reply": "我目前可以控制卧室空调、客厅风扇和客厅灯。你可以试试说'好热'、'好冷'、'打开空调'等。",
  "intent": "unknown",
  "needConfirm": false,
  "action": null
}
```

### 错误响应：缺少 message

状态码：`400`

```json
{
  "error": "缺少 message 字段"
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `reply` | string | 返回给用户展示的自然语言回复 |
| `intent` | string | 识别出的用户意图 |
| `needConfirm` | boolean | 是否需要用户确认执行 |
| `action` | Action 或 null | 建议动作；没有动作时为 `null` |

### 当前支持的意图

| intent | 说明 |
|---|---|
| `cooling` | 降温需求 |
| `warming` | 偏冷需求 |
| `capability_query` | 能力查询 |
| `direct_control` | 明确设备控制指令 |
| `unknown` | 未识别意图 |

### 当前规则示例

| 用户输入示例 | 条件 | 返回动作 |
|---|---|---|
| `好热`、`太热`、`闷` | 温度大于等于 28 度，卧室空调已配对 | `bedroom_ac` / `turn_on` |
| `好冷`、`太冷` | 卧室空调状态为 `on` | `bedroom_ac` / `turn_off` |
| `打开空调`、`开空调` | 卧室空调存在 | `bedroom_ac` / `turn_on` |
| `关闭空调`、`关空调` | 卧室空调状态为 `on` | `bedroom_ac` / `turn_off` |
| `打开风扇`、`开风扇` | 客厅风扇状态为 `off` | `livingroom_fan` / `turn_on` |
| `开灯`、`打开灯` | 客厅灯状态为 `off` | `livingroom_light` / `turn_on` |
| `你能控制什么`、`有哪些设备` | 无 | 返回能力说明，不返回动作 |

### curl 示例

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"好热\"}"
```

## POST /api/execute

用户确认后执行设备动作。后端会校验设备是否存在、动作是否被该设备支持，然后更新内存中的设备状态。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `deviceId` | string | 是 | 要控制的设备 ID |
| `command` | string | 是 | 要执行的动作命令 |

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
  "status": "on"
}
```

### 错误响应：缺少字段

状态码：`400`

```json
{
  "success": false,
  "message": "缺少 deviceId 或 command 字段"
}
```

### 错误响应：设备不存在

状态码：`200`

```json
{
  "success": false,
  "message": "设备不存在"
}
```

### 错误响应：设备不支持该动作

状态码：`200`

```json
{
  "success": false,
  "message": "设备不支持该动作"
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | boolean | 是否执行成功 |
| `message` | string | 执行结果说明 |
| `deviceId` | string | 被控制的设备 ID，成功时返回 |
| `status` | string | 设备最新状态，成功时返回 |

### curl 示例

```bash
curl -X POST http://localhost:5000/api/execute \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"bedroom_ac\",\"command\":\"turn_on\"}"
```

## 前端联调流程

1. 启动后端服务。

```bash
npm install
npm start
```

1. 打开前端页面。

```text
frontend/index.html
```

1. 输入 `好热`。
2. 页面应显示 AI 建议打开卧室空调。
3. 点击确认执行。
4. 页面应显示执行成功结果。
5. 设备列表中卧室空调状态应刷新为 `已开启`。

## V1 限制

- 当前数据保存在 Node.js 进程内存中，服务重启后会恢复初始状态。
- 当前 AI 决策为关键词规则模拟，不调用真实大模型。
- 当前设备执行为虚拟执行，不控制真实硬件。
- 所有设备控制动作都需要用户确认后才执行。
