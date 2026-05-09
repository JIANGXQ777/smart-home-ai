# Smart Home AI

用 AI + 红外控制改造旧家电，让传统红外家电获得自然语言控制能力。

![Smart Home AI 首页在线态截图](docs/images/smart-home-ai-homepage-live.png)

当前项目已经进入 `V3 硬件接入阶段`，主链路已经从“软件模拟执行”升级为“后端调用 ESP32，ESP32 发射真实红外码，旧家电真实响应”。

## 项目定位

大量家庭仍在使用传统红外家电，比如旧空调、旧风扇、旧电视。这些设备功能正常，但无法联网，也无法直接接入现代智能家居平台。

Smart Home AI 的目标不是让用户整套更换设备，而是通过：

- AI 决策
- 红外控制
- 设备能力建模
- 推测状态管理

让旧家电也能被理解、建议和控制。

## 当前版本

当前主线进度如下：

- `V1`：文字版软件闭环，规则模拟 AI，虚拟设备控制
- `V2`：接入大模型决策、后端校验、用户确认执行
- `V2.1`：前端控制台重设计
- `V2.2`：红外设备能力模型升级
- `V3`：ESP32 硬件接入，真实红外执行、实时温湿度、OLED 本地状态面板

## V3 已完成能力

当前已经跑通的能力：

- Node.js 后端调用 ESP32 HTTP 接口
- ESP32 发射真实红外码控制旧家电
- DHT22 温湿度实时读取
- 控制台实时展示温度、湿度、时间、系统状态
- OLED 本地显示：
  - `WiFi`
  - `IR API`
  - `温湿度`
  - `AC 状态`
- 后端记录：
  - `assumedState`
  - `lastCommand`
  - `stateConfidence`

## 当前硬件

- `ESP32-S3` 开发板：`YD-ESP32-S3`
- `DHT22 / AM2302` 温湿度模块
- 红外接收模块
- 红外发射模块
- `0.91"` OLED 显示屏，I2C，`SSD1306`

## 当前接线

### DHT22

- `DAT -> GPIO6`
- `VCC -> 3V3`
- `GND -> GND`

### IR Receiver

- `OUT -> GPIO5`
- `VCC -> 3V3`
- `GND -> GND`

### IR Transmitter

- `DAT -> GPIO4`
- `VCC -> 5V`
- `GND -> GND`

### OLED

- `GND -> GND`
- `VCC -> 3V3`
- `SCL -> GPIO18`
- `SDA -> GPIO17`

## 已验证红外码

当前已验证成功的空调电源码：

- 协议：`COOLIX`
- 码值：`0xB21FB8`
- 位数：`24`

当前空调的 `turn_on` 和 `turn_off` 暂时共用同一条电源切换码，因此系统现在维护的是推测状态，而不是真实回传状态。

## 系统架构

```text
用户输入自然语言
-> 前端控制台
-> Node.js 后端
-> AI 决策 / 规则兜底
-> 后端校验动作
-> 用户确认执行
-> 后端调用 ESP32 HTTP 接口
-> ESP32 发射红外码
-> 旧家电响应
-> 后端更新 assumedState / lastCommand / stateConfidence
```

## 当前控制台能力

网页控制台当前支持：

- 实时温度
- 实时湿度
- 实时时间
- AI 决策启用状态
- 后端连接状态
- ESP32 在线状态
- ESP32 RSSI / IP / 硬件状态
- 已配对设备状态展示
- 快捷控制入口

## 设备模型

当前红外设备模型已经支持：

- `controlType=ir`
- `capabilities`
- `irProfile`
- `assumedState`
- `lastCommand`
- `stateConfidence`

这让系统可以明确区分：

- 真实传感器数据
- 后端已执行过的命令
- 基于红外控制推测出的设备状态

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制模板：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

按需编辑 `.env`：

```env
LLM_ENABLED=true
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://your-openai-compatible-base-url/v1
LLM_MODEL=your-model-name
LLM_TIMEOUT_MS=15000

ESP32_ENABLED=true
ESP32_BASE_URL=http://your-esp32-ip
ESP32_REQUEST_TIMEOUT_MS=5000
```

如果暂时不启用大模型，可以设置：

```env
LLM_ENABLED=false
```

### 3. 启动后端

```bash
npm start
```

默认地址：

```text
http://localhost:5000
```

### 4. 打开前端控制台

直接打开：

```text
frontend/index.html
```

## ESP32 固件

固件位于：

- [firmware/esp32_ir_bridge/esp32_ir_bridge.ino](firmware/esp32_ir_bridge/esp32_ir_bridge.ino)

固件说明位于：

- [firmware/README.md](firmware/README.md)

当前固件提供的核心接口：

- `GET /health`
- `POST /ir/send`
- `POST /ir/power`

## API 概览

### `GET /api/state`

返回：

- `environment`
- `devices`
- `system`

其中 `environment` 当前包含：

- `temperature`
- `humidity`
- `time`
- `source`

### `POST /api/chat`

提交自然语言输入，返回：

- AI 回复
- 是否需要确认
- 建议执行动作

### `POST /api/execute`

用户确认后执行设备动作。

当前已经支持真实联动：

- `bedroom_ac / turn_on`
- `bedroom_ac / turn_off`

## 项目结构

```text
smart-home-ai/
├── backend/
│   ├── aiAgent.js
│   ├── decisionValidator.js
│   ├── devices.js
│   ├── esp32Client.js
│   ├── executor.js
│   ├── llmClient.js
│   ├── ruleAgent.js
│   └── server.js
├── firmware/
│   ├── README.md
│   └── esp32_ir_bridge/
│       └── esp32_ir_bridge.ino
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── docs/
│   ├── API.md
│   ├── TEAM_DEVELOPMENT_GUIDE.md
│   ├── V1_ACCEPTANCE.md
│   ├── V2_DEVELOPMENT_PLAN.md
│   └── V3_HARDWARE_NOTES.md
├── .env.example
├── package.json
└── README.md
```

## 当前已知边界

这套方案已经适合 `V3 验证和展示`，但仍有两个客观限制：

### 1. 红外设备通常是单向控制

系统无法天然获知“用户是否用原遥控器改过状态”，所以当前状态主要是：

- 后端已执行命令
- 结合设备模型维护出的推测状态

### 2. 红外码录入仍需继续扩展

当前已经跑通：

- 空调开关机

后续建议继续补：

- `set_temperature`
- `mode`
- `fanSpeed`

## 下一步建议

最值得继续推进的方向：

1. 录入空调调温红外码，打通 `set_temperature`
2. 录入模式和风速控制
3. 做红外学习流程，减少手工录码成本
4. 进一步增强状态可信度模型

## 文档

- [API 文档](docs/API.md)
- [团队开发规范](docs/TEAM_DEVELOPMENT_GUIDE.md)
- [V3 硬件记录](docs/V3_HARDWARE_NOTES.md)

## License

MIT
