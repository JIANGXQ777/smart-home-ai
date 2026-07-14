# ESP32 网络连接说明

当前架构采用“公网 WSS 主连接、USB 串口兜底”：

```text
ESP32 -- Wi-Fi/WSS --> 公网固定域名 --> Node.js 后端
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

当前公网接入地址为：

```text
wss://smart-home-ai.tail29b726.ts.net/ws/esp32
```

ESP32 主动建立出站连接，因此硬件所在路由器不需要端口映射，也不需要和后端处于同一个局域网。

## 2. 配置固件

复制模板：

```powershell
Copy-Item firmware/esp32_ir_bridge/secrets.example.h firmware/esp32_ir_bridge/secrets.h
```

编辑 `secrets.h`：

```cpp
#define WIFI_SSID "你的WiFi"
#define WIFI_PASSWORD "你的WiFi密码"
#define BACKEND_HOST "smart-home-ai.tail29b726.ts.net"
#define BACKEND_PORT 443
#define BACKEND_USE_TLS 1
#define ESP32_WS_PATH "/ws/esp32"
#define ESP32_WS_TOKEN "与后端完全相同的令牌"
#define ESP32_DEVICE_ID "esp32-living-room"
```

固件会使用 NTP 校时并校验 Let's Encrypt 证书链。硬件只需连接一个可以访问互联网、且未拦截 TCP 443 的 Wi-Fi。

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
- 公网连接必须保持 `BACKEND_USE_TLS=1`，不要改成不校验证书的连接。
- 当前信任根为 ISRG Root X1；未来迁移到使用其他证书机构的服务器时，需要同步更新固件信任根。
