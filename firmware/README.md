# ESP32 Firmware

这个目录用于放 Smart Home AI 的硬件侧固件。

## 当前固件

- `esp32_ir_bridge/esp32_ir_bridge.ino`

这是 V3 最小验证版固件，目标只有两个：

1. 让 ESP32-S3 连上 Wi-Fi
2. 让后端可以通过 HTTP 触发空调电源红外码

当前版本额外支持：

- 0.91 寸 SSD1306 I2C OLED 状态面板
- DHT22 温湿度显示
- 空调推测状态显示

## 已支持接口

- `GET /health`
- `POST /ir/send`
- `POST /ir/power`

当前只支持一个已验证的红外码：

- protocol: `COOLIX`
- code: `0xB21FB8`
- bits: `24`

## 额外依赖库

除了你已安装的库，还需要：

- `Adafruit GFX Library`
- `Adafruit SSD1306`

## OLED 接线

固件默认使用这些引脚：

- `OLED GND` -> `GND`
- `OLED VCC` -> `3V3`
- `OLED SCL` -> `GPIO18`
- `OLED SDA` -> `GPIO17`

如果你想换脚位，可以改 `esp32_ir_bridge.ino` 里的：

- `OLED_SCL_PIN`
- `OLED_SDA_PIN`

## 屏幕显示

因为 128x32 屏幕比较小，当前采用固定四行面板，不做滚动：

1. `WiFi: OK/LOST`
2. `IR API: ON/BOOT`
3. `T:22.2C H:56%`
4. `AC: ON/OFF`

在这些事件发生时，屏幕会短暂显示提示：

- 启动中
- Wi-Fi 连接中 / 已连接 / 失败 / 重连中
- 红外服务已启动
- 红外发送成功
- 请求参数错误

## 使用方式

1. 在 `esp32_ir_bridge.ino` 中填入你的 Wi-Fi 名称和密码。
2. Arduino IDE 选择：
   - Board: `ESP32S3 Dev Module`
   - Port: `COM3`
3. 编译并烧录。
4. 打开串口监视器，波特率 `115200`。
5. 记下串口打印的局域网 IP。

## 测试

健康检查：

```bash
curl http://ESP32_IP/health
```

发射电源码：

```bash
curl -X POST http://ESP32_IP/ir/power
```

或者：

```bash
curl -X POST http://ESP32_IP/ir/send \
  -H "Content-Type: application/json" \
  -d "{\"protocol\":\"COOLIX\",\"code\":\"0xB21FB8\",\"bits\":24}"
```

## 说明

这是 V3 最小固件，不负责 AI、状态管理或设备编排。
这些逻辑仍然由电脑上的 Node.js 后端负责。
