# Smart Home AI

面向传统红外家电的 AI 智能化改造系统。项目目标不是让用户更换全套智能家居设备，而是通过 **AI 决策 + 红外控制 + 状态管理**，让旧空调、旧电视、旧风扇、旧投影仪等不支持智能家居协议的设备，也能被自然语言理解、建议和控制。

![Smart Home AI 控制台预览](docs/images/smart-home-ai-console.png)

## 项目目的

大量家庭仍在使用传统红外遥控家电。这些设备功能正常，但无法联网、无法接入智能家居平台，也很难被老人、儿童或不熟悉遥控器的人便捷使用。

Smart Home AI 希望解决这个问题：

```text
传统红外家电
→ 红外学习 / 红外发射
→ 设备能力抽象
→ AI 理解自然语言和场景
→ 用户确认
→ 执行控制
→ 记录并展示设备状态
```

项目用于创新比赛展示，核心价值是 **用低成本硬件和 AI 软件能力，为旧家电赋能**。

## 创新点

- **旧家电智能化**：不要求用户购买新智能设备，通过红外模块改造已有家电。
- **自然语言控制**：用户可以说“我有点热”“睡觉前调舒服一点”，不用记遥控器按钮。
- **AI 场景决策**：结合温度、湿度、时间、设备状态和设备能力给出建议。
- **安全确认机制**：AI 只生成建议，涉及设备动作时必须由用户确认后执行。
- **状态推测模型**：传统红外设备通常不会回传状态，系统通过最后命令和环境信息维护推测状态。
- **可扩展硬件路线**：后续可接入 ESP32、红外发射/接收模块、温湿度传感器和功率检测模块。

## 当前完成度

当前版本仍是软件原型，暂未接入真实红外硬件，但已经跑通 AI 决策和设备控制闭环。

- **V1**：文字版软件闭环，规则模拟 AI，虚拟设备控制。
- **V2**：接入 OpenAI-compatible 大模型接口，升级为 AI 家居决策助手。
- **V2.1**：重设计前端页面，升级为智能家居 AI 控制台。
- **当前增强**：空调支持动态调温，设备状态中记录 `targetTemperature`。

## 当前系统流程

```text
用户输入自然语言
→ 后端读取环境信息和虚拟设备状态
→ AI 结合设备能力生成回复和建议动作
→ 后端校验动作是否合法
→ 前端展示 AI 回复和建议动作
→ 用户确认执行
→ 后端更新虚拟设备状态
→ 前端刷新展示结果
```

当前执行的是虚拟设备动作。后续硬件阶段会把执行层替换为：

```text
后端执行命令
→ 红外控制服务
→ ESP32 / 红外发射模块
→ 传统家电响应
```

## 核心能力

- 自然语言理解：支持“好热”“客厅太暗了”“空调温度设置为 25”等表达。
- 家居知识问答：可以回答空调原理、节能建议等非控制类问题。
- 环境感知：读取当前温度、湿度、时间、场景。
- 设备状态理解：知道设备是否开启、当前设定温度和支持动作。
- 动态调温：空调支持 `set_temperature + value`，温度范围为 16 到 30 度。
- 安全执行：AI 只生成建议，设备动作必须由用户确认后执行。
- 动作校验：后端校验大模型输出，避免执行不存在设备或不支持动作。
- 本地兜底：未启用大模型时，仍可使用 V1 规则模式演示。

## 技术栈

| 模块 | 技术 |
|---|---|
| 前端 | HTML + CSS + JavaScript |
| 后端 | Node.js + Express |
| AI | OpenAI-compatible Chat Completions API |
| 配置 | dotenv |
| 当前设备层 | 内存中的虚拟设备 |
| 后续硬件层 | ESP32 + 红外发射/接收模块 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置大模型

复制配置模板：

```bash
cp .env.example .env
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```env
LLM_ENABLED=true
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://your-openai-compatible-base-url/v1
LLM_MODEL=your-model-name
LLM_TIMEOUT_MS=15000
```

如果暂时没有大模型 Key，可以保持：

```env
LLM_ENABLED=false
```

此时系统会使用 V1 规则模式，仍然可以完成基础演示。

> `.env` 已被 `.gitignore` 忽略，不要提交真实 API Key。

### 3. 启动后端

```bash
npm start
```

后端服务地址：

```text
http://localhost:5000
```

### 4. 打开前端

直接在浏览器中打开：

```text
frontend/index.html
```

推荐测试输入：

```text
睡觉前帮我调舒服一点
空调温度设置为25
客厅太暗了
空调的原理是什么
你能控制什么
```

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 获取当前环境信息和设备列表 |
| POST | `/api/chat` | 提交自然语言输入，获取 AI 回复和控制建议 |
| POST | `/api/execute` | 用户确认后执行设备动作 |

### POST /api/chat 响应示例

```json
{
  "reply": "当前卧室温度29度，睡前会偏热。我建议把卧室空调设置为25度，需要我帮你设置吗？",
  "intent": "comfort_sleep",
  "needConfirm": true,
  "action": {
    "deviceId": "bedroom_ac",
    "command": "set_temperature",
    "value": 25
  }
}
```

### POST /api/execute 请求示例

```json
{
  "deviceId": "bedroom_ac",
  "command": "set_temperature",
  "value": 25
}
```

## 当前虚拟设备

| 设备 ID | 名称 | 位置 | 当前模拟能力 |
|---|---|---|---|
| `bedroom_ac` | 卧室空调 | 卧室 | 打开、关闭、设置温度 |
| `livingroom_fan` | 客厅风扇 | 客厅 | 打开、关闭 |
| `livingroom_light` | 客厅灯 | 客厅 | 打开、关闭 |

这些设备用于模拟未来的红外家电。真实硬件阶段会为每个动作绑定对应红外码。

## 项目结构

```text
smart-home-ai/
├── backend/
│   ├── server.js              # Express 服务和 API 路由
│   ├── devices.js             # 虚拟设备和环境状态
│   ├── aiAgent.js             # AI 决策入口
│   ├── llmClient.js           # OpenAI-compatible 大模型客户端
│   ├── decisionValidator.js   # 大模型决策校验
│   ├── ruleAgent.js           # V1 规则模式
│   └── executor.js            # 虚拟设备动作执行
├── frontend/
│   ├── index.html             # 控制台页面结构
│   ├── style.css              # 控制台样式
│   └── app.js                 # 前端交互逻辑
├── docs/
│   ├── API.md
│   ├── TEAM_DEVELOPMENT_GUIDE.md
│   ├── V1_ACCEPTANCE.md
│   └── V2_DEVELOPMENT_PLAN.md
├── .env.example
├── package.json
└── README.md
```

## 大模型决策策略

V2 的大模型不是只做意图分类，而是作为旧家电智能化助手：

1. 理解用户自然语言。
2. 判断是知识问答、闲聊，还是设备控制需求。
3. 结合环境信息、设备状态和设备能力。
4. 生成自然语言解释。
5. 输出一个可选的建议动作。
6. 后端校验动作是否合法。
7. 前端等待用户确认后再执行。

如果 `LLM_ENABLED=true` 但模型调用失败、超时、返回非 JSON 或返回非法动作，系统会返回安全的无动作提示，不会直接执行任何设备控制。

## 验收场景

| 输入 | 预期 |
|---|---|
| `睡觉前帮我调舒服一点` | 结合环境建议调整卧室空调 |
| `空调温度设置为25` | 生成 `bedroom_ac/set_temperature/25` 建议动作 |
| `客厅太暗了` | 建议打开客厅灯 |
| `空调的原理是什么` | 回答家电知识，不要求执行设备动作 |
| `你能控制什么` | 返回设备能力说明，不需要确认 |
| `打开不存在的设备` | 不生成非法动作 |
| 后端未启动 | 前端显示连接异常，不弹出浏览器 alert |

## 版本路线

| 版本 | 内容 |
|---|---|
| V1 | 文字版 Demo，规则模拟 AI，虚拟设备，完成软件闭环 |
| V2 | 接入 OpenAI-compatible 大模型，增加决策校验和安全无动作返回 |
| V2.1 | 重设计前端控制台，增加连接状态、快捷入口、对话气泡和响应式布局 |
| V2.2 | 设备能力模型升级，区分虚拟动作、红外动作、参数范围和状态可信度 |
| V3 | 接入 ESP32 + 红外发射/接收模块，支持红外学习和真实家电控制 |
| V4 | 场景自动化、状态推测、用户偏好和主动提醒 |

## 后续硬件规划

最小硬件 Demo 建议：

```text
ESP32
红外发射模块
红外接收 / 学习模块
温湿度传感器
一个可红外控制的旧空调、旧风扇或旧电视
```

硬件接入后，系统需要进一步处理红外设备的单向控制问题：

- `assumedState`：系统根据最后一次命令推测出的设备状态。
- `lastCommand`：最后一次发送的红外命令。
- `confidence`：当前状态可信度。
- `sensorEvidence`：温湿度、电流或用户反馈等辅助证据。

## 文档

- [API 文档](docs/API.md)
- [团队开发规范](docs/TEAM_DEVELOPMENT_GUIDE.md)
- [V1 验收记录](docs/V1_ACCEPTANCE.md)
- [V2 开发说明](docs/V2_DEVELOPMENT_PLAN.md)

## 许可证

MIT
