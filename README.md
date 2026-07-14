# Smart Home AI

Smart Home AI 是一个面向传统红外家电的智能化改造系统。它通过 Vue 控制台、Node.js 后端和 ESP32-S3 红外网关，让不具备联网能力的空调、风扇、电视等设备获得自然语言控制、状态管理和远程访问能力。

系统坚持“AI 生成建议、用户确认、后端校验、硬件执行”的控制流程，避免模型直接操作真实设备。

## 核心能力

- Vue 3 控制台：环境状态、设备管理、红外学习、AI 助手和模型配置
- 自然语言决策：规则快速路径与 OpenAI-compatible 大模型
- 浏览器语音：麦克风采集、ASR 转写、TTS 播放
- 安全执行：设备能力校验和用户确认
- ESP32 双通道：WebSocket/WSS 主连接，USB 串口兜底
- 红外收发：学习并发送 COOLIX、NEC、SONY、SAMSUNG、RC5 等协议
- 环境感知：DHT22 温湿度与 OLED 本地状态显示
- SQLite 持久化：设备、红外码、模型配置、推测状态和执行记录
- 控制台登录：HttpOnly Cookie 会话和登录失败限流
- 远程访问：Docker、Tailscale Funnel 与局域网入口

## 系统架构

```text
浏览器控制台
  -> 登录认证
  -> 文字或语音输入
  -> 规则引擎 / 大模型决策
  -> 动作与设备能力校验
  -> 用户确认
  -> WebSocket 或 USB 串口
  -> ESP32-S3
  -> 红外家电

ESP32-S3
  -> DHT22 / 红外接收 / OLED
  -> 周期性健康状态
  -> Node.js 后端
  -> Vue 控制台
```

传统红外设备通常不会回传真实状态，因此系统保存的是最近一次成功命令推导出的 `assumedState`，并通过 `stateConfidence` 明确标记其可信度。

## 技术栈

| 部分 | 技术 |
|---|---|
| 前端 | Vue 3、Vite、Pinia、Vue Router、Lucide |
| 后端 | Node.js 20+、Express、WebSocket |
| 数据 | SQLite、better-sqlite3 |
| 硬件 | ESP32-S3、IRremoteESP8266、DHT22、SSD1306 OLED |
| 部署 | Docker Compose、Tailscale Funnel |
| AI/语音 | OpenAI-compatible LLM、ASR、TTS 接口 |

## 快速开始

### 1. 安装依赖

需要 Node.js 20 或更高版本。

```powershell
npm install
```

### 2. 创建配置

```powershell
Copy-Item .env.example .env
```

至少修改登录配置：

```env
APP_AUTH_USERNAME=admin
APP_AUTH_PASSWORD=设置一个至少16位的随机密码
APP_SESSION_SECRET=设置一个至少32位的随机字符串
```

常用运行配置：

```env
APP_MODE=demo
DATABASE_PATH=./data/smart-home.db

LLM_ENABLED=false

ESP32_ENABLED=true
ESP32_TRANSPORT=auto
ESP32_WS_PATH=/ws/esp32
ESP32_WS_TOKEN=设置一个至少32位的随机令牌
SERIAL_PORT=COM3
SERIAL_BAUD_RATE=115200
```

LLM、ASR 和 TTS 的环境变量只用于数据库首次初始化。服务启动后，建议在控制台“模型配置”页面管理，保存后立即生效。

### 3. 检查项目

```powershell
npm run check
```

该命令依次执行后端语法检查、自动化测试和 Vue 生产构建。

### 4. 启动

```powershell
npm start
```

访问：

```text
http://localhost:5000
```

Windows 下也可以双击 `start-smart-home-ai.bat`，或运行：

```powershell
npm run launch
```

一键启动会构建前端、重启本项目后端并打开控制台。

### 前端开发模式

分别启动后端和 Vite：

```powershell
npm run dev:backend
npm run dev:frontend
```

开发地址为 `http://localhost:5173`，生产构建由后端在 `http://localhost:5000` 提供。

## 运行模式

| 模式 | 行为 |
|---|---|
| `demo` | 使用模拟环境和模拟设备执行，适合无硬件演示 |
| `hybrid` | 可使用模型决策，并在模拟执行与硬件之间切换 |
| `hardware` | 使用 ESP32 执行真实红外控制 |

## ESP32 硬件

当前引脚：

| 模块 | ESP32-S3 引脚 |
|---|---|
| 红外发射 | GPIO4 |
| 红外接收 | GPIO5 |
| DHT22 | GPIO6 |
| OLED SDA | GPIO17 |
| OLED SCL | GPIO18 |

已验证的空调电源码：

- 协议：`COOLIX`
- 码值：`0xB21FB8`
- 位数：`24`

固件支持 `health`、`ir_send` 和 `ir_learn` 三类命令。详细配置、依赖和烧录步骤见 [固件说明](firmware/README.md)。

编译固件：

```powershell
npm run firmware:compile
```

## 数据与配置

| 路径 | 说明 | 是否提交 |
|---|---|---|
| `.env` | 密钥、登录信息和运行配置 | 否 |
| `data/smart-home.db` | 当前 SQLite 运行数据 | 否 |
| `data/*.example.json` | 数据结构示例 | 是 |
| `firmware/**/secrets.h` | Wi-Fi 与 ESP32 连接密钥 | 否 |
| `frontend/dist/` | 前端构建结果 | 否 |
| `artifacts/` | 本地日志和检查产物 | 否 |

数据库启用了 WAL。设备定义、红外码、模型配置和执行记录都保存在 SQLite 中。备份和部署注意事项见 [部署说明](docs/DEPLOYMENT.md)。

## 项目结构

```text
smart-home-ai/
├── backend/                 # API、认证、决策、数据和硬件连接
│   ├── routes/
│   └── services/
├── data/                    # 示例数据和本地 SQLite 运行数据
├── device-simulator/        # ESP32/设备通信模拟器
├── docs/                    # API、部署、网络和语音文档
├── firmware/
│   └── esp32_ir_bridge/     # ESP32-S3 固件
├── frontend/
│   ├── src/                 # Vue 应用源码
│   ├── index.html
│   └── vite.config.js
├── scripts/                 # Windows 启动与远程访问脚本
├── tests/                   # Node.js 自动化测试
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm start` | 启动生产后端 |
| `npm run launch` | Windows 一键构建并启动 |
| `npm run dev:backend` | 启动开发后端 |
| `npm run dev:frontend` | 启动 Vite 开发服务器 |
| `npm run build` | 构建 Vue 前端 |
| `npm test` | 运行自动化测试 |
| `npm run check` | 完整项目检查 |
| `npm run firmware:compile` | 编译 ESP32 固件 |

## 文档

- [文档索引](docs/README.md)
- [API 文档](docs/API.md)
- [部署说明](docs/DEPLOYMENT.md)
- [远程访问](docs/REMOTE_ACCESS.md)
- [ESP32 网络连接](docs/ESP32_NETWORK.md)
- [浏览器语音](docs/VOICE.md)
- [固件说明](firmware/README.md)

## 已知边界

- 红外设备通常是单向控制，页面状态可能与原遥控器操作后的真实状态不一致。
- `turn_on` 和 `turn_off` 如果共用电源切换码，只能维护推测状态。
- 不同温度、模式和风速需要分别学习对应红外码。
- 真实控制 API 不应在无认证、无 HTTPS 的情况下暴露到公网。

## License

MIT
