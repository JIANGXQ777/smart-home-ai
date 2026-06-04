#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

const uint8_t IR_SEND_PIN = 4;
const uint8_t DHT_PIN = 6;
const uint8_t OLED_SDA_PIN = 17;
const uint8_t OLED_SCL_PIN = 18;
const uint32_t COOLIX_POWER_CODE = 0x00B21FB8;

IRsend irsend(IR_SEND_PIN);
Adafruit_SSD1306 display(128, 32, &Wire, -1);
DHT dht(DHT_PIN, DHT22);

bool displayReady = false;
bool sensorReady = false;
bool acAssumedOn = false;
float lastTemperatureC = NAN;
float lastHumidity = NAN;
unsigned long lastSensorReadAt = 0;
unsigned long lastHealthSentAt = 0;
String inputBuffer = "";

void sendHealthReport() {
  Serial.print("{\"type\":\"health\",\"temperature\":");
  if (isnan(lastTemperatureC)) Serial.print("null");
  else Serial.print(lastTemperatureC, 1);
  Serial.print(",\"humidity\":");
  if (isnan(lastHumidity)) Serial.print("null");
  else Serial.print(lastHumidity, 1);
  Serial.print(",\"sensorReady\":");
  Serial.print(sensorReady ? "true" : "false");
  Serial.print(",\"ac\":");
  Serial.print(acAssumedOn ? "true" : "false");
  Serial.println(",\"serviceStarted\":true}");
}

String extractValue(const String& input, const String& key) {
  String s = "\"" + key + "\"";
  int i = input.indexOf(s);
  if (i < 0) return "";
  i = input.indexOf(':', i + s.length());
  if (i < 0) return "";
  i++;
  while (i < (int)input.length() && input[i] == ' ') i++;
  if (i >= (int)input.length()) return "";
  if (input[i] == '"') {
    int e = input.indexOf('"', i + 1);
    return e > 0 ? input.substring(i + 1, e) : "";
  }
  int e = i;
  while (e < (int)input.length() && input[e] != ',' && input[e] != '}') e++;
  return input.substring(i, e);
}

void processCommand(const String& line) {
  String cmd = extractValue(line, "cmd");
  if (cmd == "health") {
    sendHealthReport();
    Serial.println("{\"type\":\"response\",\"ok\":true}");
  } else if (cmd == "ir_send") {
    irsend.sendCOOLIX(COOLIX_POWER_CODE, kCoolixBits);
    acAssumedOn = !acAssumedOn;
    Serial.println("{\"type\":\"response\",\"ok\":true}");
    sendHealthReport();
  } else {
    Serial.println("{\"type\":\"err\",\"msg\":\"unknown cmd\"}");
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("{\"type\":\"log\",\"msg\":\"boot\"}");

  irsend.begin();
  dht.begin();

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    displayReady = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Smart Home AI");
    display.println("Serial OK");
    display.display();
  }

  Serial.println("{\"type\":\"log\",\"msg\":\"ready\"}");
  sendHealthReport();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' && inputBuffer.length() > 0) {
      processCommand(inputBuffer);
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }

  unsigned long now = millis();
  if (now - lastSensorReadAt >= 3000) {
    lastSensorReadAt = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      lastTemperatureC = t;
      lastHumidity = h;
      sensorReady = true;
    }
  }

  if (now - lastHealthSentAt >= 5000) {
    lastHealthSentAt = now;
    sendHealthReport();
  }

  if (displayReady) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    // 第 1 行：温湿度
    display.setCursor(0, 0);
    display.print("T:");
    display.print(sensorReady ? String(lastTemperatureC, 1) : "--.-");
    display.print("C  H:");
    display.print(sensorReady ? String(lastHumidity, 1) : "--.-");
    display.println("%");

    // 第 2 行：空调状态 + 红外状态
    display.print("AC:");
    display.print(acAssumedOn ? "ON " : "OFF");
    display.print(" IR:OK");

    // 第 3 行：传感器 + 服务状态
    display.setCursor(0, 16);
    display.print("SENS:");
    display.print(sensorReady ? "OK" : "ERR");
    display.print("  SRV:OK");

    // 第 4 行：品牌标识
    display.setCursor(0, 24);
    display.print("Smart Home AI");

    display.display();
  }
}
