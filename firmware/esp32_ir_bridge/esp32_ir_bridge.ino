#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

namespace {
constexpr uint16_t IR_SEND_PIN = 4;
constexpr uint8_t DHT_PIN = 6;
constexpr uint8_t DHT_TYPE = DHT22;
constexpr uint8_t OLED_SDA_PIN = 17;
constexpr uint8_t OLED_SCL_PIN = 18;
constexpr uint8_t OLED_WIDTH = 128;
constexpr uint8_t OLED_HEIGHT = 32;
constexpr uint8_t OLED_ADDRESS = 0x3C;
constexpr uint32_t COOLIX_POWER_CODE = 0x00B21FB8;
constexpr uint16_t COOLIX_BITS = 24;
constexpr unsigned long SENSOR_REFRESH_MS = 3000;
constexpr unsigned long HEALTH_INTERVAL_MS = 5000;
constexpr uint32_t SERIAL_BAUD = 115200;

IRsend irsend(IR_SEND_PIN);
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
DHT dht(DHT_PIN, DHT_TYPE);

bool displayReady = false;
bool sensorReady = false;
bool acAssumedOn = false;
float lastTemperatureC = NAN;
float lastHumidity = NAN;
unsigned long lastSensorReadAt = 0;
unsigned long lastHealthSentAt = 0;

String inputBuffer = "";

void initDisplay() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("{\"type\":\"log\",\"message\":\"OLED init failed\"}");
    displayReady = false;
    return;
  }
  displayReady = true;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Smart Home AI");
  display.println("Serial Mode");
  display.display();
}

void renderDisplay() {
  if (!displayReady) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Serial: OK");
  display.println("Sensor: " + String(sensorReady ? "OK" : "NO"));
  if (sensorReady && !isnan(lastTemperatureC) && !isnan(lastHumidity)) {
    display.println("T:" + String(lastTemperatureC, 1) + "C H:" + String(static_cast<int>(lastHumidity + 0.5f)) + "%");
  } else {
    display.println("T:--.-C H:--%");
  }
  display.println("AC: " + String(acAssumedOn ? "ON" : "OFF"));
  display.display();
}

void refreshSensorReadings() {
  unsigned long now = millis();
  if (now - lastSensorReadAt < SENSOR_REFRESH_MS) return;
  lastSensorReadAt = now;

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (!isnan(temperature) && !isnan(humidity)) {
    lastTemperatureC = temperature;
    lastHumidity = humidity;
    sensorReady = true;
  }
}

void sendHealthReport() {
  String json = "{\"type\":\"health\",\"temperature\":";
  json += isnan(lastTemperatureC) ? "null" : String(lastTemperatureC, 1);
  json += ",\"humidity\":";
  json += isnan(lastHumidity) ? "null" : String(lastHumidity, 1);
  json += ",\"sensorReady\":";
  json += sensorReady ? "true" : "false";
  json += ",\"acAssumedOn\":";
  json += acAssumedOn ? "true" : "false";
  json += ",\"serviceStarted\":true";
  json += "}";
  Serial.println(json);
}

String extractValue(const String& input, const String& key) {
  String search = "\"" + key + "\"";
  int keyIndex = input.indexOf(search);
  if (keyIndex < 0) return "";

  int colonIndex = input.indexOf(':', keyIndex + search.length());
  if (colonIndex < 0) return "";

  int start = colonIndex + 1;
  while (start < (int)input.length() && input[start] == ' ') start++;

  if (start >= (int)input.length()) return "";

  if (input[start] == '"') {
    int end = input.indexOf('"', start + 1);
    if (end < 0) return "";
    return input.substring(start + 1, end);
  }

  int end = start;
  while (end < (int)input.length() && input[end] != ',' && input[end] != '}' && input[end] != ' ') end++;
  return input.substring(start, end);
}

void handleIrSend(const String& protocol, const String& code, uint16_t bits) {
  if (protocol == "COOLIX" || code.indexOf("B21FB8") >= 0) {
    irsend.sendCOOLIX(COOLIX_POWER_CODE, COOLIX_BITS);
    acAssumedOn = !acAssumedOn;
    sendHealthReport();
  } else {
    String resp = "{\"type\":\"response\",\"success\":false,\"message\":\"Unsupported protocol\"}";
    Serial.println(resp);
  }
}

void processCommand(const String& line) {
  if (line.indexOf("\"cmd\"") < 0) {
    Serial.println("{\"type\":\"response\",\"success\":false,\"message\":\"Missing cmd\"}");
    return;
  }

  String cmd = extractValue(line, "cmd");

  if (cmd == "health") {
    refreshSensorReadings();
    sendHealthReport();
  } else if (cmd == "ir_send") {
    String protocol = extractValue(line, "protocol");
    String code = extractValue(line, "code");
    String bitsStr = extractValue(line, "bits");
    uint16_t bits = bitsStr.length() > 0 ? (uint16_t)bitsStr.toInt() : 24;
    handleIrSend(protocol, code, bits);
  } else {
    String resp = "{\"type\":\"response\",\"success\":false,\"message\":\"Unknown cmd\"}";
    Serial.println(resp);
  }
}

void readSerialCommands() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }
}
}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  Serial.println("{\"type\":\"log\",\"message\":\"Smart Home AI Serial Mode booting\"}");

  initDisplay();
  dht.begin();
  irsend.begin();

  Serial.println("{\"type\":\"log\",\"message\":\"Ready\"}");
  sendHealthReport();
}

void loop() {
  readSerialCommands();
  refreshSensorReadings();
  renderDisplay();

  unsigned long now = millis();
  if (now - lastHealthSentAt >= HEALTH_INTERVAL_MS) {
    lastHealthSentAt = now;
    sendHealthReport();
  }
}
