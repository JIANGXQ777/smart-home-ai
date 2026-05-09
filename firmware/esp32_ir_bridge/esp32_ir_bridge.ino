#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

namespace {
const char* WIFI_SSID = "JIANGXQ";
const char* WIFI_PASSWORD = "15599115549";

constexpr uint16_t HTTP_PORT = 80;
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
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
constexpr unsigned long SENSOR_REFRESH_MS = 3000;
constexpr unsigned long STATUS_BANNER_MS = 2500;

WebServer server(HTTP_PORT);
IRsend irsend(IR_SEND_PIN);
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
DHT dht(DHT_PIN, DHT_TYPE);

bool displayReady = false;
bool serviceStarted = false;
bool acAssumedOn = false;
bool sensorReady = false;
float lastTemperatureC = NAN;
float lastHumidity = NAN;
unsigned long lastSensorReadAt = 0;
unsigned long lastWifiReconnectAt = 0;
String transientBanner = "";
unsigned long bannerExpireAt = 0;

void showBanner(const String& message) {
  transientBanner = message;
  bannerExpireAt = millis() + STATUS_BANNER_MS;
}

String formatWifiStatus() {
  return WiFi.status() == WL_CONNECTED ? "OK" : "LOST";
}

String formatServiceStatus() {
  return serviceStarted ? "ON" : "BOOT";
}

String formatAcStatus() {
  return acAssumedOn ? "ON" : "OFF";
}

String formatTempHumidityLine() {
  if (!sensorReady || isnan(lastTemperatureC) || isnan(lastHumidity)) {
    return "T:--.-C H:--%";
  }

  return "T:" + String(lastTemperatureC, 1) + "C H:" + String(static_cast<int>(lastHumidity + 0.5f)) + "%";
}

void refreshSensorReadings() {
  const unsigned long now = millis();
  if (now - lastSensorReadAt < SENSOR_REFRESH_MS) {
    return;
  }

  lastSensorReadAt = now;
  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();

  if (!isnan(temperature) && !isnan(humidity)) {
    lastTemperatureC = temperature;
    lastHumidity = humidity;
    sensorReady = true;
    Serial.printf("DHT ok: %.1fC %.1f%%\n", lastTemperatureC, lastHumidity);
  } else {
    Serial.println("DHT read failed");
  }
}

void renderDisplay() {
  if (!displayReady) {
    return;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  if (transientBanner.length() > 0 && millis() < bannerExpireAt) {
    display.println("Smart Home AI");
    display.println(transientBanner);
    display.println("WiFi:" + formatWifiStatus());
    display.println("AC:" + formatAcStatus());
    display.display();
    return;
  }

  transientBanner = "";
  display.println("WiFi: " + formatWifiStatus());
  display.println("IR API: " + formatServiceStatus());
  display.println(formatTempHumidityLine());
  display.println("AC: " + formatAcStatus());
  display.display();
}

void initDisplay() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED init failed");
    displayReady = false;
    return;
  }

  displayReady = true;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Smart Home AI");
  display.println("Booting...");
  display.display();
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void sendJson(int statusCode, const String& body) {
  addCorsHeaders();
  server.send(statusCode, "application/json; charset=utf-8", body);
}

void handleOptions() {
  addCorsHeaders();
  server.send(204);
}

void handleHealth() {
  refreshSensorReadings();

  String body = "{";
  body += "\"success\":true,";
  body += "\"device\":\"esp32-ir-bridge\",";
  body += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  body += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  body += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  body += "\"serviceStarted\":" + String(serviceStarted ? "true" : "false") + ",";
  body += "\"sensorReady\":" + String(sensorReady ? "true" : "false") + ",";
  body += "\"acAssumedOn\":" + String(acAssumedOn ? "true" : "false") + ",";

  if (sensorReady && !isnan(lastTemperatureC) && !isnan(lastHumidity)) {
    body += "\"temperature\":" + String(lastTemperatureC, 1) + ",";
    body += "\"humidity\":" + String(lastHumidity, 1);
  } else {
    body += "\"temperature\":null,";
    body += "\"humidity\":null";
  }

  body += "}";

  sendJson(200, body);
}

bool requestAsksForKnownCoolixCode() {
  if (!server.hasArg("plain")) {
    return true;
  }

  const String payload = server.arg("plain");
  if (payload.length() == 0) {
    return true;
  }

  return payload.indexOf("B21FB8") >= 0 || payload.indexOf("b21fb8") >= 0;
}

void handleIrSend() {
  if (!requestAsksForKnownCoolixCode()) {
    showBanner("IR BAD REQUEST");
    sendJson(400, "{\"success\":false,\"message\":\"Only COOLIX 0xB21FB8 is supported in V3 minimal firmware\"}");
    return;
  }

  irsend.sendCOOLIX(COOLIX_POWER_CODE, COOLIX_BITS);
  acAssumedOn = !acAssumedOn;
  showBanner(acAssumedOn ? "IR SENT AC ON" : "IR SENT AC OFF");

  String body = "{";
  body += "\"success\":true,";
  body += "\"protocol\":\"COOLIX\",";
  body += "\"code\":\"0xB21FB8\",";
  body += "\"bits\":24,";
  body += "\"message\":\"IR command sent\"";
  body += "}";

  sendJson(200, body);
}

void handleNotFound() {
  sendJson(404, "{\"success\":false,\"message\":\"Not found\"}");
}

void connectToWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  showBanner("WiFi CONNECTING");
  renderDisplay();

  Serial.print("Connecting to Wi-Fi");
  const unsigned long startAt = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
    renderDisplay();
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    showBanner("WiFi CONNECTED");
  } else {
    Serial.println("Wi-Fi connection failed");
    Serial.println("Check SSID/password and restart the board.");
    showBanner("WiFi FAILED");
  }
}

void registerRoutes() {
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/ir/send", HTTP_POST, handleIrSend);
  server.on("/ir/power", HTTP_POST, handleIrSend);
  server.onNotFound(handleNotFound);

  server.on("/health", HTTP_OPTIONS, handleOptions);
  server.on("/ir/send", HTTP_OPTIONS, handleOptions);
  server.on("/ir/power", HTTP_OPTIONS, handleOptions);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("=== Smart Home AI ESP32 Boot ===");
  Serial.println("Stage 1: serial ready");

  initDisplay();
  Serial.println("Stage 2: display init finished");
  dht.begin();
  Serial.println("Stage 3: DHT init finished");
  irsend.begin();
  Serial.println("Stage 4: IR sender init finished");
  connectToWifi();
  Serial.println("Stage 5: Wi-Fi init finished");
  registerRoutes();
  Serial.println("Stage 6: routes registered");
  server.begin();
  serviceStarted = true;
  showBanner("IR API READY");

  Serial.println("HTTP IR bridge started");
  Serial.println("Endpoints:");
  Serial.println("  GET  /health");
  Serial.println("  POST /ir/send");
  Serial.println("  POST /ir/power");
}

void loop() {
  server.handleClient();
  refreshSensorReadings();
  renderDisplay();

  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiReconnectAt > 5000) {
    lastWifiReconnectAt = millis();
    Serial.printf("Wi-Fi status %d, reconnecting...\n", WiFi.status());
    WiFi.reconnect();
    showBanner("WiFi RECONNECT");
  }
}
