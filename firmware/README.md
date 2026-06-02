# ESP32 Firmware

这个目录用于存放 Smart Home AI 的硬件侧固件。

## 当前固件

- `esp32_ir_bridge/esp32_ir_bridge.ino`

这是串口版固件，负责：

1. 通过 USB 串口接收 Node.js 后端的命令
2. 发射已验证的红外码
3. 读取 DHT22 温湿度
4. 定期通过串口上报传感器数据
5. 在 OLED 上显示本地状态面板

## 通信协议

采用 JSON 行协议，每行一个 JSON 对象，以 `\n` 结尾。

### 后端 → ESP32

| 命令 | 格式 | 说明 |
|------|------|------|
| 查询健康 | `{"cmd":"health"}` | 获取温湿度、系统状态 |
| 发射红外 | `{"cmd":"ir_send","protocol":"COOLIX","code":"0xB21FB8","bits":24}` | 发射红外码 |

### ESP32 → 后端

| 消息 | 格式 | 说明 |
|------|------|------|
| 健康上报 | `{"type":"health","temperature":25.5,"humidity":60,"sensorReady":true,"acAssumedOn":false}` | 定期自动上报 + 回复 health 命令 |
| 命令响应 | `{"type":"response","success":true,"message":"..."}` | 命令执行结果 |

## 当前已验证红外码

- protocol: `COOLIX`
- code: `0xB21FB8`
- bits: `24`

## 依赖库

- `Adafruit GFX Library`
- `Adafruit SSD1306`
- `DHT sensor library`
- `IRremoteESP8266`

## 接线

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

- `OLED GND -> GND`
- `OLED VCC -> 3V3`
- `OLED SCL -> GPIO18`
- `OLED SDA -> GPIO17`

## OLED 显示内容

当前采用固定四行面板：

1. `Serial: OK/NO`
2. `Sensor: OK/NO`
3. `T:22.2C H:56%`
4. `AC: ON/OFF`

## 使用方式

1. 打开 `esp32_ir_bridge.ino`
2. Arduino IDE 选择：
   - Board: `ESP32S3 Dev Module`
   - Port: `COM3`（选择实际串口）
3. 编译并烧录
4. 打开串口监视器，波特率 `115200`

## 后续升级

当前为串口版本，后续上云时固件只需添加 WebSocket 客户端，现有串口协议可直接复用。
