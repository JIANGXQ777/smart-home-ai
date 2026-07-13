# ESP32 Firmware

当前固件位于 `esp32_ir_bridge/esp32_ir_bridge.ino`，支持两种通信通道：

- Wi-Fi WebSocket：正常运行时的主连接
- USB 串口：调试与网络故障兜底

两个通道复用同一套 JSON 命令：`health`、`ir_send`、`ir_learn`。WebSocket 消息额外使用 `requestId` 匹配命令和响应。

## 依赖

- Adafruit GFX Library
- Adafruit SSD1306
- DHT sensor library
- IRremoteESP8266
- WebSockets（arduinoWebSockets）

Arduino CLI 安装示例：

```powershell
arduino-cli lib install "WebSockets"
```

## 网络配置

复制配置模板：

```powershell
Copy-Item firmware/esp32_ir_bridge/secrets.example.h firmware/esp32_ir_bridge/secrets.h
```

然后在 `secrets.h` 中填写：

- Wi-Fi 名称与密码
- 后端电脑的局域网 IP
- 与后端 `.env` 中 `ESP32_WS_TOKEN` 相同的令牌

当前 WebSocketsClient 使用 URL 查询参数发送令牌。部署反向代理时应关闭 `/ws/esp32` 的查询参数访问日志，避免令牌写入日志。
- ESP32 设备 ID

`secrets.h` 已加入 `.gitignore`，不会提交 Wi-Fi 密码。

## 后端 → ESP32

```json
{"type":"command","requestId":"cmd-123","cmd":"health"}
```

```json
{"type":"command","requestId":"cmd-124","cmd":"ir_send","action":"turn_on","protocol":"COOLIX","code":"0xB21FB8","bits":24}
```

```json
{"type":"command","requestId":"cmd-125","cmd":"ir_learn"}
```

## ESP32 → 后端

```json
{"type":"response","requestId":"cmd-123","ok":true}
```

```json
{"type":"health","temperature":25.5,"humidity":60,"sensorReady":true,"wifiConnected":true,"websocketConnected":true,"ip":"192.168.1.88","rssi":-48}
```

固件每 5 秒通过可用通道上报一次健康状态。WebSocket 断线后每 5 秒重连，并启用协议心跳。

## 接线

- DHT22：`DAT -> GPIO6`、`VCC -> 3V3`、`GND -> GND`
- IR Receiver：`OUT -> GPIO5`、`VCC -> 3V3`、`GND -> GND`
- IR Transmitter：`DAT -> GPIO4`、`VCC -> 5V`、`GND -> GND`
- OLED：`SCL -> GPIO18`、`SDA -> GPIO17`、`VCC -> 3V3`、`GND -> GND`

## 编译

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32s3 --board-options FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,CDCOnBoot=cdc firmware/esp32_ir_bridge
```

烧录时指定实际串口，例如：

```powershell
arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32s3 --board-options FlashSize=16M,PSRAM=opi,PartitionScheme=app3M_fat9M_16MB,CDCOnBoot=cdc firmware/esp32_ir_bridge
```

完整部署步骤见 [网络连接说明](../docs/ESP32_NETWORK.md)。
