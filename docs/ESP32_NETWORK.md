# ESP32 网络连接说明

当前架构采用“WebSocket 主连接、USB 串口兜底”：

```text
ESP32 -- Wi-Fi/WebSocket --> Node.js 后端
   \-------- USB 串口兜底 --------/
```

## 1. 配置后端

在项目 `.env` 中设置：

```env
ESP32_ENABLED=true
ESP32_TRANSPORT=auto
ESP32_WS_PATH=/ws/esp32
ESP32_WS_TOKEN=请替换为自己的随机令牌
SERIAL_PORT=COM3
SERIAL_BAUD_RATE=115200
```

连接方式可选：

- `auto`：优先 WebSocket，失败时使用已连接串口
- `websocket`：只允许网络连接
- `serial`：只使用 USB 串口

启动后端后，ESP32 接入地址为：

```text
ws://后端电脑局域网IP:5000/ws/esp32
```

不要在 ESP32 中填写 `localhost` 或 `127.0.0.1`，它们指向 ESP32 自己。可在 Windows 中运行 `ipconfig` 查找电脑的 IPv4 地址。

## 2. 配置固件

复制模板：

```powershell
Copy-Item firmware/esp32_ir_bridge/secrets.example.h firmware/esp32_ir_bridge/secrets.h
```

编辑 `secrets.h`：

```cpp
#define WIFI_SSID "你的WiFi"
#define WIFI_PASSWORD "你的WiFi密码"
#define BACKEND_HOST "192.168.1.100"
#define BACKEND_PORT 5000
#define ESP32_WS_PATH "/ws/esp32"
#define ESP32_WS_TOKEN "与后端完全相同的令牌"
#define ESP32_DEVICE_ID "esp32-living-room"
```

ESP32 和运行后端的电脑必须能在局域网中互相访问。若连接失败，检查 Windows 防火墙是否允许 Node.js 使用 TCP 5000 端口。

## 3. 安装与烧录

安装新增的 WebSocket 库：

```powershell
arduino-cli lib install "WebSockets"
```

编译并烧录：

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/esp32_ir_bridge
arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32s3 firmware/esp32_ir_bridge
```

## 4. 验证

打开控制台首页，ESP32 网关应显示：

- 状态：在线
- 连接：`WebSocket · esp32-living-room`
- 环境数据来源：实时传感器

如果 Wi-Fi 或 WebSocket 断开，而 USB 仍连接且后端使用 `auto` 模式，控制命令会自动转到串口。

## 安全说明

- 必须修改示例令牌，不要直接使用 `change-this-token`。
- 不要提交 `secrets.h` 或 `.env`。
- 当前使用局域网明文 `ws://`；如果跨公网部署，应通过反向代理升级为 `wss://`，并限制设备身份和访问来源。
