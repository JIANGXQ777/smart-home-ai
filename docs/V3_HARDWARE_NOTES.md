# Smart Home AI V3 硬件验证记录

## V3 目标

V3 目标是把 V2.2 中的红外设备能力模型接入真实硬件，让后端执行设备动作时可以调用 ESP32-S3，由 ESP32-S3 发射红外信号控制传统旧家电。

目标链路：

```text
POST /api/execute
→ 后端识别红外设备动作
→ 后端请求 ESP32-S3
→ ESP32-S3 发射红外码
→ 传统红外家电响应
→ 后端记录 assumedState / lastCommand / stateConfidence
```

## 当前硬件

| 硬件 | 用途 |
|---|---|
| YD-ESP32-S3 开发板 | Wi-Fi 主控、红外收发控制 |
| DHT22 / AM2302 温湿度模块 | 读取真实环境温湿度 |
| 红外接收模块 | 学习原遥控器红外码 |
| 红外发射模块 | 向旧家电发送红外码 |
| 面包板 + 杜邦线 | 原型接线 |
| USB 供电 | 给 ESP32-S3 和模块供电 |

## 接线记录

| 模块 | 模块引脚 | ESP32-S3 引脚 |
|---|---|---|
| DHT22 / AM2302 | DAT | GPIO6 |
| DHT22 / AM2302 | VCC | 3V3 |
| DHT22 / AM2302 | GND | GND |
| 红外接收模块 | OUT | GPIO5 |
| 红外接收模块 | VCC | 3V3 |
| 红外接收模块 | GND | GND |
| 红外发射模块 | DAT | GPIO4 |
| 红外发射模块 | VCC | 5V |
| 红外发射模块 | GND | GND |

注意：

- ESP32-S3 使用 USB 供电。
- 所有模块必须共地。
- 红外接收模块接 3V3，避免 OUT 输出 5V 进入 ESP32-S3 GPIO。
- 红外发射模块接 5V，发射距离更稳定。

## Arduino 环境

| 项目 | 当前配置 |
|---|---|
| Arduino IDE | 2.3.8 |
| ESP32 core | esp32:esp32@2.0.17 |
| 开发板 | ESP32S3 Dev Module |
| 端口 | COM3 |
| USB CDC On Boot | Enabled |
| 串口波特率 | 115200 |

已安装库：

- DHT sensor library
- Adafruit Unified Sensor
- IRremoteESP8266

## 已完成验证

### 1. DHT22 温湿度读取

验证结果：成功。

示例读数：

```text
Temperature: 22.20 C, Humidity: 55.80 %
Temperature: 22.10 C, Humidity: 55.70 %
```

说明：

- ESP32-S3 烧录正常。
- USB 串口输出正常。
- DHT22 接线和 GPIO6 读取正常。

### 2. 红外接收

验证结果：成功。

使用原遥控器按键后，ESP32-S3 能读取红外协议和码值。

已读取到的开机信号：

```text
Protocol  : COOLIX
Code      : 0xB21FB8 (24 Bits)
```

对应 raw 记录：

```cpp
uint16_t rawData[99] = {
  4466, 4384, 546, 1614, 522, 570, 546, 1616, 524, 1628,
  522, 570, 546, 544, 548, 1628, 522, 570, 520, 568,
  548, 1628, 522, 570, 546, 544, 548, 1630, 524, 1628,
  522, 570, 544, 1616, 524, 570, 546, 542, 548, 570,
  546, 1616, 524, 1630, 524, 1628, 524, 1630, 522, 1630,
  524, 1628, 524, 1628, 524, 1628, 524, 570, 546, 544,
  548, 568, 546, 544, 548, 570, 544, 1618, 524, 570,
  544, 1618, 522, 1630, 522, 1630, 524, 568, 546, 542,
  548, 568, 546, 542, 548, 1628, 524, 570, 544, 546,
  548, 570, 520, 1644, 524, 1630, 524, 1628, 524
};
```

### 3. 红外发射

验证结果：成功。

使用以下代码发送 COOLIX 开机信号后，旧设备已响应：

```cpp
irsend.sendCOOLIX(0xB21FB8, 24);
```

注意：

- 曾错误尝试 `0xB21FF8`，设备无响应。
- 正确电源/开机信号为 `0xB21FB8`。
- 测试时需要让红外发射头靠近并对准设备红外接收窗。

## 最小发射测试代码

```cpp
#include <IRremoteESP8266.h>
#include <IRsend.h>

#define IR_SEND_PIN 4

IRsend irsend(IR_SEND_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);
  irsend.begin();
  Serial.println("IR sender test start");
}

void loop() {
  Serial.println("Send COOLIX power code: 0xB21FB8");
  irsend.sendCOOLIX(0xB21FB8, 24);
  delay(5000);
}
```

## 下一步

1. 为 ESP32-S3 编写 HTTP 服务。
2. 提供红外发射接口，例如 `POST /ir/send`。
3. 后端 `/api/execute` 判断红外设备动作后调用 ESP32-S3。
4. 将 `0xB21FB8` 记录到 `irProfile.learnedCodes`。
5. 继续学习更多遥控器按键，例如关机、温度加、温度减、模式、风速。
