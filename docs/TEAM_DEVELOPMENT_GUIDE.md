# Smart Home AI 团队开发规范文档

## 1. 文档目的

本文档用于规范 Smart Home AI 项目的团队协作、模块分工、接口契约、消息格式、开发流程与验收标准，并统一项目在创新比赛中的目标表达。

适用对象：

- 项目成员
- 使用 OpenCode / Codex / Trae 等 AI 编程工具的开发者
- 后续维护或接手本项目的成员

本文档不包含具体代码实现，只规定开发边界与协作规则。

---

## 2. 项目概述

### 2.1 项目名称

Smart Home AI：面向传统红外家电的 AI 智能化改造系统

### 2.2 项目定位

本项目面向不支持智能家居协议的传统红外家电，目标是通过 AI 大模型、红外学习/发射模块和设备状态管理，让旧空调、旧电视、旧风扇、旧投影仪等传统设备获得自然语言控制和场景化智能能力。

项目不是要求用户更换全套智能家电，而是以低成本改造方式，为已有家电赋能。

核心链路如下：

```text
传统红外家电
→ 红外学习 / 红外发射
→ 设备能力抽象
→ AI 理解自然语言和场景
→ 用户确认
→ 执行控制
→ 记录并展示设备状态
```

### 2.3 项目核心目标

系统需要实现以下能力：

1. 管理已配对的传统红外家电；
2. 描述每个设备的可控能力，例如开关、温度、模式、风速、输入源等；
3. 感知或模拟当前环境信息；
4. 理解用户自然语言输入，并判断是知识问答、闲聊还是设备控制；
5. 结合环境、设备状态和设备能力生成控制建议；
6. 在用户确认后执行设备动作；
7. 更新并展示设备状态；
8. 后续扩展红外学习、红外发射、状态推测、语音交互和主动提醒能力。

### 2.4 创新比赛价值

本项目用于创新比赛展示，重点体现以下价值：

1. **低成本改造**：不替换旧家电，通过红外模块复用已有设备。
2. **普适性强**：大量空调、电视、风扇、投影仪等设备仍使用红外遥控。
3. **自然语言交互**：降低遥控器和复杂 App 的使用门槛，适合老人、儿童和普通家庭场景。
4. **AI 场景决策**：AI 不只做按钮映射，而是结合温湿度、时间、设备状态和用户表达生成建议。
5. **安全可控**：设备动作必须经过后端校验和用户确认。
6. **可持续价值**：延长旧家电生命周期，减少不必要的电子设备更换。

### 2.5 当前阶段目标

当前阶段为 V2 系列：AI 决策软件原型。

当前阶段只实现软件闭环，不直接接入真实红外硬件。系统使用虚拟设备模拟未来红外家电，用于验证自然语言输入、AI 决策、动作校验、用户确认和状态更新流程。

当前核心流程：

```text
用户输入“睡觉前帮我调舒服一点”
→ 后端读取环境信息和虚拟设备状态
→ AI 结合设备能力生成控制建议
→ 后端校验建议动作是否合法
→ 前端显示建议动作
→ 用户点击确认执行
→ 后端更新虚拟设备状态
→ 前端刷新并展示最新状态
```

后续硬件阶段会把虚拟执行层替换为：

```text
后端执行命令
→ 红外控制服务
→ ESP32 / 红外发射模块
→ 传统家电响应
```

---

## 3. 技术栈规范

### 3.1 前端

使用：

```text
HTML
CSS
JavaScript
```

V1 阶段不使用：

```text
React
Vue
Next.js
复杂 UI 框架
```

原因：V1 的目标是快速跑通系统闭环，降低环境配置和协作复杂度。

### 3.2 后端

使用：

```text
Node.js
Express
```

### 3.3 AI 决策模块

当前阶段支持 OpenAI-compatible 大模型决策，并保留规则模式作为本地开发兜底。

可接入：

```text
MiniMax
GLM
Qwen
OpenAI-compatible API
```

### 3.4 设备控制模块

当前阶段使用虚拟设备模拟器，用内存状态模拟传统红外家电。

后续硬件阶段会替换为：

```text
ESP32 → 红外模块 → 老旧家电
```

注意：传统红外家电通常不会主动回传真实状态，后续设备状态模型需要区分：

```text
assumedState：系统推测状态
lastCommand：最后一次红外命令
confidence：状态可信度
sensorEvidence：温湿度、电流或用户反馈等辅助证据
```

---

## 4. 项目目录结构

项目目录建议如下：

```text
smart-home-ai/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── backend/
│   ├── server.js
│   ├── devices.js
│   ├── environment.js
│   ├── aiAgent.js
│   └── executor.js
│
├── device-simulator/
│   └── device.js
│
├── docs/
│   ├── TEAM_DEVELOPMENT_GUIDE.md
│   ├── API.md
│   └── PROMPT.md
│
├── README.md
├── .gitignore
└── package.json
```

---

## 5. 模块职责划分

### 5.1 frontend 模块

目录：

```text
frontend/
```

职责：

1. 页面结构；
2. 页面样式；
3. 用户输入；
4. 调用后端接口；
5. 展示环境信息；
6. 展示设备状态；
7. 展示 AI 回复；
8. 展示建议动作；
9. 触发确认执行；
10. 展示执行结果。

前端只能通过后端接口获取或修改系统状态，不直接修改后端数据文件。

---

### 5.2 backend 模块

目录：

```text
backend/
```

职责：

1. 提供 HTTP API；
2. 接收前端请求；
3. 读取设备数据；
4. 读取环境数据；
5. 调用 AI 决策模块；
6. 调用执行模块；
7. 返回统一 JSON 格式结果。

---

### 5.3 device-simulator 模块

目录：

```text
device-simulator/
```

职责：

1. 模拟设备执行动作；
2. 模拟空调、风扇、灯等设备状态变化；
3. 返回执行结果；
4. 为后续硬件接入预留替换位置。

---

### 5.4 docs 模块

目录：

```text
docs/
```

职责：

1. 保存团队协作规范；
2. 保存接口文档；
3. 保存 AI Prompt 文档；
4. 保存演示流程和后续设计说明。

---

## 6. 团队分工规范

### 6.1 A：前端负责人

负责文件：

```text
frontend/index.html
frontend/style.css
frontend/app.js
```

主要任务：

1. 设计并实现页面结构；
2. 展示环境信息；
3. 展示设备列表和设备状态；
4. 实现用户输入框和发送按钮；
5. 调用 `POST /api/chat`；
6. 展示 AI 回复内容；
7. 展示建议动作；
8. 实现确认执行按钮；
9. 调用 `POST /api/execute`；
10. 执行成功后调用 `GET /api/state` 刷新状态。

不得修改：

```text
backend/
device-simulator/
```

除非经过团队确认。

---

### 6.2 B：后端接口负责人

负责文件：

```text
backend/server.js
backend/executor.js
```

主要任务：

1. 创建 Express 后端服务；
2. 实现 `GET /api/state`；
3. 实现 `POST /api/chat`；
4. 实现 `POST /api/execute`；
5. 接收并解析前端 JSON 请求；
6. 调用 `devices.js` 获取设备数据；
7. 调用 `environment.js` 获取环境数据；
8. 调用 `aiAgent.js` 获取 AI 决策；
9. 调用 `executor.js` 执行动作；
10. 按接口文档返回统一 JSON。

不得随意修改：

```text
接口路径
请求字段名
返回字段名
```

---

### 6.3 C：设备与状态负责人

负责文件：

```text
backend/devices.js
device-simulator/device.js
```

主要任务：

1. 定义已配对设备列表；
2. 定义设备 ID；
3. 定义设备名称；
4. 定义设备类型；
5. 定义设备位置；
6. 定义设备初始状态；
7. 定义设备支持动作；
8. 模拟设备执行动作；
9. 更新设备状态；
10. 返回执行结果。

当前软件原型至少包含以下虚拟设备，用于模拟未来可通过红外控制的传统家电：

| 设备 ID | 设备名称 | 类型 | 初始状态 |
|---|---|---|---|
| bedroom_ac | 卧室空调 | air_conditioner | off |
| livingroom_fan | 客厅风扇 | fan | off |
| livingroom_light | 客厅灯 | light | off |

当前动作：

```text
turn_on
turn_off
set_temperature(value: 16-30)
```

---

### 6.4 D：AI 决策负责人

负责文件：

```text
backend/aiAgent.js
docs/PROMPT.md
```

主要任务：

1. 接收用户输入；
2. 接收设备列表；
3. 接收环境信息；
4. 判断用户意图；
5. 判断是否需要控制设备；
6. 选择目标设备；
7. 选择控制动作；
8. 生成 AI 回复；
9. 返回固定格式 JSON；
10. 持续优化大模型提示词和设备能力理解。

AI 决策模块不得直接执行设备动作，只能返回建议动作。

---

### 6.5 队长职责

队长负责项目整体协调，不必独自完成所有代码。

主要职责：

1. 维护 `docs/API.md`；
2. 确认接口契约不被随意修改；
3. 分配开发任务；
4. 检查每日提交；
5. 组织联调；
6. 负责阶段验收；
7. 控制需求范围，避免功能失控。

---

## 7. 接口契约总则

接口契约包括以下内容：

1. 请求方法；
2. 接口路径；
3. 请求体格式；
4. 返回体格式；
5. 字段名称；
6. 字段含义。

任何成员不得私自修改接口契约。

如需新增、删除或修改接口，必须先更新 `docs/API.md`，并经过团队确认。

---

## 8. 核心接口定义

当前阶段保留三个核心接口：

```text
GET  /api/state
POST /api/chat
POST /api/execute
```

---

## 8.1 GET /api/state

### 作用

获取当前系统状态，包括环境信息和设备状态。

### 请求方法

```text
GET
```

### 接口路径

```text
/api/state
```

### 请求体

无。

### 返回格式

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
      "actions": ["turn_on", "turn_off", "set_temperature"]
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

### 字段说明

| 字段 | 含义 |
|---|---|
| environment | 当前环境信息 |
| temperature | 当前温度 |
| humidity | 当前湿度 |
| time | 当前时间 |
| presence | 是否有人 |
| scene | 当前场景或房间 |
| devices | 已配对设备列表 |
| id | 设备唯一 ID |
| name | 设备显示名称 |
| type | 设备类型 |
| location | 设备位置 |
| status | 设备状态 |
| paired | 是否已配对 |
| actions | 设备支持动作 |

---

## 8.2 POST /api/chat

### 作用

前端发送用户输入，由后端调用 AI 决策模块返回建议。

### 请求方法

```text
POST
```

### 接口路径

```text
/api/chat
```

### 请求体格式

```json
{
  "message": "好热"
}
```

### 请求字段说明

| 字段 | 含义 | 必填 |
|---|---|---|
| message | 用户输入内容 | 是 |

### 返回格式：需要控制设备

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

### 返回格式：不需要控制设备

```json
{
  "reply": "我目前可以控制卧室空调、客厅风扇和客厅灯。",
  "intent": "capability_query",
  "needConfirm": false,
  "action": null
}
```

### 返回字段说明

| 字段 | 含义 |
|---|---|
| reply | AI 给用户的自然语言回复 |
| intent | 用户意图 |
| needConfirm | 是否需要用户确认 |
| action | 建议动作，没有动作时为 null |
| deviceId | 目标设备 ID |
| command | 目标动作 |

---

## 8.3 POST /api/execute

### 作用

用户确认后，前端调用该接口执行设备动作。

### 请求方法

```text
POST
```

### 接口路径

```text
/api/execute
```

### 请求体格式

```json
{
  "deviceId": "bedroom_ac",
  "command": "turn_on"
}
```

### 请求字段说明

| 字段 | 含义 | 必填 |
|---|---|---|
| deviceId | 要控制的设备 ID | 是 |
| command | 要执行的动作 | 是 |

### 返回格式：执行成功

```json
{
  "success": true,
  "message": "卧室空调已打开",
  "deviceId": "bedroom_ac",
  "status": "on"
}
```

### 返回格式：执行失败

```json
{
  "success": false,
  "message": "设备不存在或动作不支持"
}
```

### 返回字段说明

| 字段 | 含义 |
|---|---|
| success | 是否执行成功 |
| message | 执行结果说明 |
| deviceId | 被执行设备 ID |
| status | 设备最新状态 |

---

## 9. 消息格式规范

### 9.1 数据格式

前后端通信统一使用 JSON。

请求头应使用：

```text
Content-Type: application/json
```

### 9.2 命名规范

字段名统一使用 camelCase。

正确示例：

```text
deviceId
needConfirm
```

错误示例：

```text
device_id
need_confirm
```

### 9.3 设备 ID 规范

设备 ID 使用英文小写和下划线。

示例：

```text
bedroom_ac
livingroom_fan
livingroom_light
```

### 9.4 动作命令规范

动作命令使用英文小写和下划线。

当前固定命令名：

```text
turn_on
turn_off
set_temperature
```

不得混用以下写法：

```text
on
open
turnOn
turn_on
```

统一使用：

```text
turn_on
```

---

## 10. AI 决策规则 V1

V1 阶段使用规则模拟 AI。

### 10.1 降温需求

如果用户输入包含以下关键词：

```text
热
好热
太热
闷
闷热
不舒服
```

且环境温度大于等于 28，且卧室空调存在并已配对，则返回建议打开卧室空调。

返回示例：

```json
{
  "reply": "当前室温较高，建议打开卧室空调，需要我帮你打开吗？",
  "intent": "cooling",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "turn_on"
  }
}
```

### 10.2 偏冷需求

如果用户输入包含以下关键词：

```text
冷
好冷
太冷
```

且卧室空调处于开启状态，则返回建议关闭卧室空调。

返回示例：

```json
{
  "reply": "如果你觉得冷，我可以帮你关闭卧室空调。",
  "intent": "warming",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "turn_off"
  }
}
```

### 10.3 能力查询

如果用户输入包含以下表达：

```text
你能控制什么
有哪些设备
你会干什么
能控制哪些家电
```

返回设备能力说明。

返回示例：

```json
{
  "reply": "我目前可以控制卧室空调、客厅风扇和客厅灯。卧室空调支持开关和设置温度，客厅风扇支持开关，客厅灯支持开关。",
  "intent": "capability_query",
  "needConfirm": false,
  "action": null
}
```

### 10.4 明确控制指令

如果用户输入包含：

```text
打开空调
开空调
```

返回空调开启建议。

返回示例：

```json
{
  "reply": "好的，我可以帮你打开卧室空调，需要现在执行吗？",
  "intent": "direct_control",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "turn_on"
  }
}
```

---

## 11. 设备状态规则

### 11.1 初始状态

V1 默认状态：

```text
bedroom_ac: off
livingroom_fan: off
livingroom_light: off
```

### 11.2 turn_on

执行 `turn_on` 后，设备状态变为：

```text
on
```

### 11.3 turn_off

执行 `turn_off` 后，设备状态变为：

```text
off
```

### 11.4 set_temperature

执行 `set_temperature` 且传入合法 `value` 后，卧室空调状态应保持或变为：

```text
on
```

系统会记录具体温度设定值到 `targetTemperature` 字段。

---

## 12. 开发顺序

### 12.1 第一步：设备数据与模拟执行

负责人：C

目标：

1. 定义设备列表；
2. 定义设备状态；
3. 定义设备支持动作；
4. 实现设备状态变化逻辑。

---

### 12.2 第二步：AI 规则决策

负责人：D

目标：

1. 输入“好热”返回空调开启建议；
2. 输入“好冷”返回空调关闭建议；
3. 输入“你能控制什么”返回设备能力说明；
4. 输出格式符合接口契约。

---

### 12.3 第三步：后端接口

负责人：B

目标：

1. 实现 `GET /api/state`；
2. 实现 `POST /api/chat`；
3. 实现 `POST /api/execute`；
4. 串联设备模块、环境模块、AI 模块、执行模块。

---

### 12.4 第四步：前端页面

负责人：A

目标：

1. 页面显示环境；
2. 页面显示设备状态；
3. 用户可输入文本；
4. 页面可显示 AI 回复；
5. 页面可显示建议动作；
6. 页面可确认执行；
7. 执行后状态刷新。

---

## 13. OpenCode 使用规范

### 13.1 总规则

使用 OpenCode 时，每次只处理一个模块或一个任务，不允许一次性重写整个项目。

每次向 OpenCode 提需求时，应明确：

1. 当前身份；
2. 允许修改的文件；
3. 不允许修改的文件；
4. 必须遵守的接口文档；
5. 本次任务目标。

---

### 13.2 A 前端负责人提示词

```text
你是前端负责人。
只允许修改 frontend/ 目录下的文件。
不允许修改 backend/、device-simulator/、docs/。
请严格遵守 docs/API.md 的接口定义。

任务：
实现前端页面，调用 GET /api/state 显示环境和设备状态，调用 POST /api/chat 获取 AI 回复，调用 POST /api/execute 执行动作。
不使用 React 或 Vue，只使用 HTML、CSS、JavaScript。
```

---

### 13.3 B 后端负责人提示词

```text
你是后端接口负责人。
主要修改 backend/server.js 和 backend/executor.js。
不允许修改 frontend/。
请严格遵守 docs/API.md 的接口定义。

任务：
实现 GET /api/state、POST /api/chat、POST /api/execute。
所有返回必须是 JSON。
不得修改接口路径和字段名。
```

---

### 13.4 C 设备负责人提示词

```text
你是设备与状态负责人。
主要修改 backend/devices.js 和 device-simulator/device.js。
不允许修改 frontend/ 和 backend/server.js。
请严格遵守 docs/API.md 中的 deviceId 和 command 命名。

任务：
定义 bedroom_ac、livingroom_fan、livingroom_light 三个设备，并实现 turn_on、turn_off、set_temperature 的虚拟执行逻辑。
```

---

### 13.5 D AI 负责人提示词

```text
你是 AI 决策负责人。
主要修改 backend/aiAgent.js 和 docs/PROMPT.md。
不允许修改 frontend/ 和 backend/server.js。
请严格遵守 docs/API.md 中 POST /api/chat 的返回格式。

任务：
实现规则版 AI 决策。输入“好热”建议打开 bedroom_ac；输入“好冷”建议关闭 bedroom_ac；输入“你能控制什么”返回设备能力说明。AI 只返回建议，不直接执行设备。
```

---

## 14. Git 协作规范

### 14.1 修改范围

每个成员只修改自己负责的文件范围。

| 成员 | 允许主要修改范围 |
|---|---|
| A | frontend/ |
| B | backend/server.js、backend/executor.js |
| C | backend/devices.js、device-simulator/ |
| D | backend/aiAgent.js、docs/PROMPT.md |

### 14.2 开发前流程

每次开始开发前，必须先同步最新代码。

```text
Pull 最新代码
```

### 14.3 提交流程

每次完成一个小功能后提交。

提交信息应明确说明本次改动。

推荐示例：

```text
实现前端状态展示
实现 api chat 接口
增加设备模拟逻辑
实现规则版 AI 判断
```

不推荐示例：

```text
修改
更新
test
111
```

### 14.4 接口修改规则

以下内容不得私自修改：

```text
/api/state
/api/chat
/api/execute
message
reply
intent
needConfirm
action
deviceId
command
success
status
```

如必须修改，需先修改 `docs/API.md` 并经过团队确认。

---

## 15. 联调流程

每次主要功能合并后，必须执行以下联调流程：

```text
1. 启动后端服务
2. 打开前端页面
3. 页面显示环境信息
4. 页面显示卧室空调、客厅风扇、客厅灯
5. 输入“好热”
6. AI 回复建议打开卧室空调
7. 页面出现确认执行按钮
8. 点击确认执行
9. 页面显示“卧室空调已打开”
10. 卧室空调状态变为 on
```

若以上流程通过，说明 V1 核心链路正常。

---

## 16. V1 验收标准

V1 完成时必须满足：

1. 后端可以正常启动；
2. 前端可以正常打开；
3. `GET /api/state` 能返回环境和设备状态；
4. `POST /api/chat` 能返回 AI 建议；
5. `POST /api/execute` 能执行设备动作；
6. 页面能显示 AI 回复；
7. 页面能显示建议动作；
8. 页面能显示确认执行按钮；
9. 点击确认后设备状态改变；
10. 执行后页面状态刷新；
11. 团队 4 人均可在本地运行项目。

---

## 17. 后续版本规划

### V2：AI 决策软件原型

接入 OpenAI-compatible 大模型，让系统能够结合环境、设备状态和设备能力生成建议。

要求：

1. 大模型输出 JSON；
2. 不编造设备；
3. 不直接执行动作；
4. 所有动作仍需用户确认；
5. 保留规则模式作为本地开发兜底。

### V2.2：红外设备能力模型版

实现：

1. 设备能力 schema；
2. 动作参数范围；
3. 红外动作占位；
4. 状态可信度字段；
5. AI 能读取设备能力并生成参数化动作。

### V3：红外硬件接入版

实现：

1. ESP32 接收后端指令；
2. 红外模块发射信号；
3. 红外接收模块学习遥控器码值；
4. 控制真实空调、风扇、电视或投影仪；
5. 保存设备动作和红外码映射。

### V4：自动化与主动智能版

实现：

1. 环境自动检测；
2. 多设备场景联动；
3. 主动提醒；
4. 用户习惯学习；
5. 状态推测和异常提示。

---

## 18. 安全规则

1. AI 不能直接执行设备动作；
2. AI 只能返回建议 action；
3. 所有设备动作当前阶段都需要用户确认；
4. 后端 executor 必须二次校验设备和动作是否合法；
5. 不允许控制不存在的设备；
6. 不允许执行设备不支持的动作；
7. 执行失败必须返回明确错误信息。

---

## 19. 项目核心原则

本项目采用模块化协作。

核心原则：

```text
前端负责交互
后端负责调度
AI 负责判断
设备模块负责状态和执行
接口负责连接
```

只要接口契约稳定，团队成员可以独立开发各自模块，并在联调阶段顺利合并。

