#include <Wire.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>
#include "driver/i2s_std.h"
#include "esp_heap_caps.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

const uint8_t IR_SEND_PIN = 4;
const uint8_t IR_RECV_PIN = 5;
const uint8_t DHT_PIN = 6;
const uint8_t OLED_SDA_PIN = 17;
const uint8_t OLED_SCL_PIN = 18;

#ifndef VOICE_I2S_BCLK_PIN
#define VOICE_I2S_BCLK_PIN 12
#endif
#ifndef VOICE_I2S_WS_PIN
#define VOICE_I2S_WS_PIN 13
#endif
#ifndef VOICE_MIC_DATA_PIN
#define VOICE_MIC_DATA_PIN 14
#endif
#ifndef VOICE_SPEAKER_DATA_PIN
#define VOICE_SPEAKER_DATA_PIN 15
#endif
#ifndef VOICE_SPEAKER_SD_PIN
#define VOICE_SPEAKER_SD_PIN 21
#endif
#ifndef VOICE_MIC_RIGHT_CHANNEL
#define VOICE_MIC_RIGHT_CHANNEL 0
#endif
#ifndef WS_HANDSHAKE_DIAGNOSTIC
#define WS_HANDSHAKE_DIAGNOSTIC 0
#endif
#ifndef VOICE_AUDIO_DIAGNOSTIC_DISABLE
#define VOICE_AUDIO_DIAGNOSTIC_DISABLE 0
#endif

const uint32_t VOICE_SAMPLE_RATE = 16000;
const size_t VOICE_FRAME_MS = 20;
const size_t VOICE_FRAME_SAMPLES = VOICE_SAMPLE_RATE * VOICE_FRAME_MS / 1000;
const size_t VOICE_FRAME_BYTES = VOICE_FRAME_SAMPLES * sizeof(int16_t);
const size_t VOICE_PLAYBACK_BUFFER_BYTES = 256 * 1024;

IRsend irsend(IR_SEND_PIN);
IRrecv irrecv(IR_RECV_PIN, 1024);
Adafruit_SSD1306 display(128, 32, &Wire, -1);
DHT dht(DHT_PIN, DHT22);
WebSocketsClient webSocket;
i2s_chan_handle_t i2sTxChannel = nullptr;
i2s_chan_handle_t i2sRxChannel = nullptr;

enum CommandSource {
  SOURCE_SERIAL,
  SOURCE_WEBSOCKET
};

bool displayReady = false;
bool sensorReady = false;
bool acAssumedOn = false;
bool webSocketConnected = false;
bool networkConfigured = false;
bool audioReady = false;
bool voiceCaptureEnabled = false;
bool voicePlaybackActive = false;
bool voicePlaybackStopRequested = false;
bool voiceSpeakerEnabled = false;
uint8_t webSocketHandshakeStage = 0;
float lastTemperatureC = NAN;
float lastHumidity = NAN;
unsigned long lastSensorReadAt = 0;
unsigned long lastHealthSentAt = 0;
unsigned long lastDisplayAt = 0;
unsigned long webSocketConnectedAt = 0;
String inputBuffer = "";
String webSocketPath = "";

uint8_t* voicePlaybackBuffer = nullptr;
size_t voicePlaybackBufferCapacity = 0;
size_t voicePlaybackReadIndex = 0;
size_t voicePlaybackWriteIndex = 0;
size_t voicePlaybackBufferedBytes = 0;
int32_t voiceI2sRxFrame[VOICE_FRAME_SAMPLES * 2];
int32_t voiceI2sTxFrame[VOICE_FRAME_SAMPLES * 2];
int16_t voicePcmFrame[VOICE_FRAME_SAMPLES];

bool learningMode = false;
unsigned long learnDeadline = 0;
static const unsigned long LEARN_TIMEOUT_MS = 10000;
decode_results learnResults;
CommandSource learningSource = SOURCE_SERIAL;
String learningRequestId = "";

String jsonEscape(const String& value) {
  String escaped = "";
  escaped.reserve(value.length() + 8);
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '\\' || c == '"') escaped += '\\';
    if (c == '\n') escaped += "\\n";
    else if (c == '\r') escaped += "\\r";
    else escaped += c;
  }
  return escaped;
}

String urlEncode(const String& value) {
  const char* hex = "0123456789ABCDEF";
  String encoded = "";
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }
  return encoded;
}

void sendVoiceEvent(const String& type, const String& extraFields = "") {
  if (!webSocketConnected) return;
  String payload = "{\"type\":\"" + jsonEscape(type) + "\"";
  if (extraFields.length() > 0) payload += "," + extraFields;
  payload += "}";
  webSocket.sendTXT(payload);
}

void clearPlaybackBuffer() {
  voicePlaybackReadIndex = 0;
  voicePlaybackWriteIndex = 0;
  voicePlaybackBufferedBytes = 0;
}

void setVoiceSpeakerEnabled(bool enabled) {
  voiceSpeakerEnabled = enabled;
  digitalWrite(VOICE_SPEAKER_SD_PIN, enabled ? HIGH : LOW);
}

bool queuePlaybackAudio(const uint8_t* data, size_t length) {
  if (!voicePlaybackBuffer || length == 0) return false;
  if (length > voicePlaybackBufferCapacity - voicePlaybackBufferedBytes) {
    sendVoiceEvent("voice.error", "\"message\":\"playback buffer overflow\"");
    return false;
  }
  size_t firstLength = min(length, voicePlaybackBufferCapacity - voicePlaybackWriteIndex);
  memcpy(voicePlaybackBuffer + voicePlaybackWriteIndex, data, firstLength);
  if (length > firstLength) memcpy(voicePlaybackBuffer, data + firstLength, length - firstLength);
  voicePlaybackWriteIndex = (voicePlaybackWriteIndex + length) % voicePlaybackBufferCapacity;
  voicePlaybackBufferedBytes += length;
  return true;
}

size_t dequeuePlaybackAudio(uint8_t* destination, size_t length) {
  size_t available = min(length, voicePlaybackBufferedBytes);
  if (!available) return 0;
  size_t firstLength = min(available, voicePlaybackBufferCapacity - voicePlaybackReadIndex);
  memcpy(destination, voicePlaybackBuffer + voicePlaybackReadIndex, firstLength);
  if (available > firstLength) memcpy(destination + firstLength, voicePlaybackBuffer, available - firstLength);
  voicePlaybackReadIndex = (voicePlaybackReadIndex + available) % voicePlaybackBufferCapacity;
  voicePlaybackBufferedBytes -= available;
  return available;
}

bool setupVoiceAudio() {
  pinMode(VOICE_SPEAKER_SD_PIN, OUTPUT);
  setVoiceSpeakerEnabled(false);

  Serial.printf("{\"type\":\"log\",\"msg\":\"flash=%uMB psram=%uMB\"}\n",
                ESP.getFlashChipSize() / 1024 / 1024,
                ESP.getPsramSize() / 1024 / 1024);

  voicePlaybackBuffer = static_cast<uint8_t*>(
    heap_caps_malloc(VOICE_PLAYBACK_BUFFER_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  voicePlaybackBufferCapacity = VOICE_PLAYBACK_BUFFER_BYTES;
  if (!voicePlaybackBuffer) {
    voicePlaybackBufferCapacity = 64 * 1024;
    voicePlaybackBuffer = static_cast<uint8_t*>(heap_caps_malloc(
      voicePlaybackBufferCapacity, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
  }
  if (!voicePlaybackBuffer) {
    Serial.println("{\"type\":\"log\",\"msg\":\"voice playback buffer allocation failed\"}");
    return false;
  }

  i2s_chan_config_t channelConfig = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  channelConfig.dma_desc_num = 16;
  channelConfig.dma_frame_num = VOICE_FRAME_SAMPLES;
  if (i2s_new_channel(&channelConfig, &i2sTxChannel, &i2sRxChannel) != ESP_OK) return false;

  i2s_std_config_t standardConfig = {};
  standardConfig.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(VOICE_SAMPLE_RATE);
  standardConfig.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
    I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO);
  standardConfig.gpio_cfg.mclk = I2S_GPIO_UNUSED;
  standardConfig.gpio_cfg.bclk = static_cast<gpio_num_t>(VOICE_I2S_BCLK_PIN);
  standardConfig.gpio_cfg.ws = static_cast<gpio_num_t>(VOICE_I2S_WS_PIN);
  standardConfig.gpio_cfg.dout = static_cast<gpio_num_t>(VOICE_SPEAKER_DATA_PIN);
  standardConfig.gpio_cfg.din = static_cast<gpio_num_t>(VOICE_MIC_DATA_PIN);
  standardConfig.gpio_cfg.invert_flags.mclk_inv = false;
  standardConfig.gpio_cfg.invert_flags.bclk_inv = false;
  standardConfig.gpio_cfg.invert_flags.ws_inv = false;

  if (i2s_channel_init_std_mode(i2sTxChannel, &standardConfig) != ESP_OK ||
      i2s_channel_init_std_mode(i2sRxChannel, &standardConfig) != ESP_OK ||
      i2s_channel_enable(i2sTxChannel) != ESP_OK ||
      i2s_channel_enable(i2sRxChannel) != ESP_OK) {
    return false;
  }

  clearPlaybackBuffer();
  return true;
}

void finishVoicePlayback() {
  setVoiceSpeakerEnabled(false);
  voicePlaybackActive = false;
  voicePlaybackStopRequested = false;
  clearPlaybackBuffer();
  sendVoiceEvent("voice.playback.finished");
}

void serviceVoicePlayback() {
  if (!audioReady || !voicePlaybackActive) return;
  if (voicePlaybackBufferedBytes < VOICE_FRAME_BYTES) {
    if (voicePlaybackStopRequested && voicePlaybackBufferedBytes == 0) finishVoicePlayback();
    return;
  }

  size_t pcmBytes = dequeuePlaybackAudio(reinterpret_cast<uint8_t*>(voicePcmFrame), VOICE_FRAME_BYTES);
  size_t sampleCount = pcmBytes / sizeof(int16_t);
  for (size_t index = 0; index < VOICE_FRAME_SAMPLES; index++) {
    int32_t sample = index < sampleCount ? static_cast<int32_t>(voicePcmFrame[index]) << 16 : 0;
    voiceI2sTxFrame[index * 2] = sample;
    voiceI2sTxFrame[index * 2 + 1] = sample;
  }
  size_t bytesWritten = 0;
  if (!voiceSpeakerEnabled) {
    setVoiceSpeakerEnabled(true);
    delay(3);
  }
  i2s_channel_write(i2sTxChannel, voiceI2sTxFrame, sizeof(voiceI2sTxFrame), &bytesWritten, 30);
}

void playVoiceLocalTone() {
  if (!audioReady || !i2sTxChannel) {
    sendVoiceEvent("voice.error", "\"message\":\"local tone audio unavailable\"");
    return;
  }

  voiceCaptureEnabled = false;
  voicePlaybackActive = false;
  voicePlaybackStopRequested = false;
  clearPlaybackBuffer();
  setVoiceSpeakerEnabled(true);
  delay(3);

  const size_t frameCount = 700 / VOICE_FRAME_MS;
  const float radiansPerSample = 2.0f * PI * 440.0f / VOICE_SAMPLE_RATE;
  size_t sampleIndex = 0;
  for (size_t frame = 0; frame < frameCount; frame++) {
    for (size_t index = 0; index < VOICE_FRAME_SAMPLES; index++, sampleIndex++) {
      int16_t pcm = static_cast<int16_t>(sinf(radiansPerSample * sampleIndex) * 5000.0f);
      int32_t sample = static_cast<int32_t>(pcm) * 65536;
      voiceI2sTxFrame[index * 2] = sample;
      voiceI2sTxFrame[index * 2 + 1] = sample;
    }
    size_t bytesWritten = 0;
    i2s_channel_write(i2sTxChannel, voiceI2sTxFrame, sizeof(voiceI2sTxFrame), &bytesWritten, 50);
  }

  setVoiceSpeakerEnabled(false);
  sendVoiceEvent("voice.local-tone.finished");
  if (webSocketConnected) voiceCaptureEnabled = true;
}

void serviceVoiceCapture() {
  if (!audioReady || !voiceCaptureEnabled || voicePlaybackActive || !webSocketConnected) return;
  size_t bytesRead = 0;
  esp_err_t result = i2s_channel_read(
    i2sRxChannel, voiceI2sRxFrame, sizeof(voiceI2sRxFrame), &bytesRead, 0);
  if (result != ESP_OK || bytesRead < sizeof(voiceI2sRxFrame)) return;

  const size_t channelOffset = VOICE_MIC_RIGHT_CHANNEL ? 1 : 0;
  for (size_t index = 0; index < VOICE_FRAME_SAMPLES; index++) {
    int32_t sample = voiceI2sRxFrame[index * 2 + channelOffset] >> 11;
    sample = constrain(sample, -32768, 32767);
    voicePcmFrame[index] = static_cast<int16_t>(sample);
  }
  webSocket.sendBIN(reinterpret_cast<uint8_t*>(voicePcmFrame), VOICE_FRAME_BYTES);
}

void sendPayload(String payload, CommandSource source) {
  if (source == SOURCE_SERIAL) {
    Serial.println(payload);
  } else if (webSocketConnected) {
    webSocket.sendTXT(payload);
  }
}

String buildHealthPayload() {
  String payload = "{\"type\":\"health\",\"temperature\":";
  payload += isnan(lastTemperatureC) ? "null" : String(lastTemperatureC, 1);
  payload += ",\"humidity\":";
  payload += isnan(lastHumidity) ? "null" : String(lastHumidity, 1);
  payload += ",\"sensorReady\":";
  payload += sensorReady ? "true" : "false";
  payload += ",\"ac\":";
  payload += acAssumedOn ? "true" : "false";
  payload += ",\"wifiConnected\":";
  payload += WiFi.status() == WL_CONNECTED ? "true" : "false";
  payload += ",\"websocketConnected\":";
  payload += webSocketConnected ? "true" : "false";
  payload += ",\"serviceStarted\":true";
  payload += ",\"audioReady\":";
  payload += audioReady ? "true" : "false";
  payload += ",\"voiceCapture\":";
  payload += voiceCaptureEnabled ? "true" : "false";
  payload += ",\"voicePlaying\":";
  payload += voicePlaybackActive ? "true" : "false";
  payload += ",\"psramBytes\":" + String(ESP.getPsramSize());
  payload += ",\"freePsramBytes\":" + String(ESP.getFreePsram());
  payload += ",\"deviceId\":\"" + jsonEscape(String(ESP32_DEVICE_ID)) + "\"";
  payload += ",\"hostname\":\"" + jsonEscape(String(ESP32_DEVICE_ID)) + "\"";
  payload += ",\"ip\":\"";
  payload += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  payload += "\",\"rssi\":";
  payload += WiFi.status() == WL_CONNECTED ? String(WiFi.RSSI()) : "null";
  payload += "}";
  return payload;
}

void sendHealthReport(CommandSource source) {
  sendPayload(buildHealthPayload(), source);
}

void publishHealthReport() {
  String payload = buildHealthPayload();
  Serial.println(payload);
  if (webSocketConnected) webSocket.sendTXT(payload);
}

void sendResponse(CommandSource source, const String& requestId, bool ok, const String& extraFields = "") {
  String payload = "{\"type\":\"response\"";
  if (requestId.length() > 0) {
    payload += ",\"requestId\":\"" + jsonEscape(requestId) + "\"";
  }
  payload += ",\"ok\":";
  payload += ok ? "true" : "false";
  if (extraFields.length() > 0) payload += "," + extraFields;
  payload += "}";
  sendPayload(payload, source);
}

String extractValue(const String& input, const String& key) {
  String searchKey = "\"" + key + "\"";
  int index = input.indexOf(searchKey);
  if (index < 0) return "";
  index = input.indexOf(':', index + searchKey.length());
  if (index < 0) return "";
  index++;
  while (index < (int)input.length() && input[index] == ' ') index++;
  if (index >= (int)input.length()) return "";

  if (input[index] == '"') {
    int end = input.indexOf('"', index + 1);
    return end > 0 ? input.substring(index + 1, end) : "";
  }

  int end = index;
  while (end < (int)input.length() && input[end] != ',' && input[end] != '}') end++;
  return input.substring(index, end);
}

void processCommand(const String& line, CommandSource source) {
  String cmd = extractValue(line, "cmd");
  String requestId = extractValue(line, "requestId");

  if (cmd == "health") {
    sendHealthReport(source);
    sendResponse(source, requestId, true);
    return;
  }

  if (cmd == "ir_send") {
    String action = extractValue(line, "action");
    String protocol = extractValue(line, "protocol");
    String codeStr = extractValue(line, "code");
    unsigned int bits = (unsigned int)extractValue(line, "bits").toInt();
    uint64_t code = strtoull(codeStr.c_str(), NULL, 16);

    if (protocol == "COOLIX") irsend.sendCOOLIX(code, bits);
    else if (protocol == "NEC") irsend.sendNEC(code, bits);
    else if (protocol == "SONY") irsend.sendSony(code, bits, 2);
    else if (protocol == "SAMSUNG") irsend.sendSAMSUNG(code, bits);
    else if (protocol == "RC5") irsend.sendRC5(code, bits);
    else {
      sendResponse(source, requestId, false, "\"error\":\"unsupported protocol\"");
      return;
    }

    if (action == "turn_on" || action == "set_temperature") acAssumedOn = true;
    else if (action == "turn_off") acAssumedOn = false;

    sendResponse(source, requestId, true);
    publishHealthReport();
    return;
  }

  if (cmd == "ir_learn") {
    if (learningMode) {
      sendResponse(source, requestId, false, "\"error\":\"learning already in progress\"");
      return;
    }
    learningMode = true;
    learningSource = source;
    learningRequestId = requestId;
    learnDeadline = millis() + LEARN_TIMEOUT_MS;
    irrecv.enableIRIn();
    return;
  }

  sendResponse(source, requestId, false, "\"error\":\"unknown command\"");
}

bool processVoiceMessage(const String& message) {
  String type = extractValue(message, "type");
  if (!type.startsWith("voice.")) return false;

  if (type == "voice.capture.start") {
    voiceCaptureEnabled = audioReady && !voicePlaybackActive;
  } else if (type == "voice.capture.stop") {
    voiceCaptureEnabled = false;
  } else if (type == "voice.playback.start") {
    voiceCaptureEnabled = false;
    setVoiceSpeakerEnabled(false);
    voicePlaybackActive = audioReady;
    voicePlaybackStopRequested = false;
    clearPlaybackBuffer();
  } else if (type == "voice.playback.stop") {
    voicePlaybackStopRequested = true;
    if (voicePlaybackBufferedBytes == 0) finishVoicePlayback();
  } else if (type == "voice.test.local-tone") {
    playVoiceLocalTone();
  }
  return true;
}

void sendWebSocketHello() {
  String payload = "{\"type\":\"hello\",\"deviceId\":\"";
  payload += jsonEscape(String(ESP32_DEVICE_ID));
  payload += "\",\"hostname\":\"";
  payload += jsonEscape(String(ESP32_DEVICE_ID));
  payload += "\"}";
  webSocket.sendTXT(payload);
}

void sendVoiceHello() {
  String voicePayload = "{\"type\":\"voice.hello\",\"sampleRate\":";
  voicePayload += String(VOICE_SAMPLE_RATE);
  voicePayload += ",\"frameMs\":" + String(VOICE_FRAME_MS);
  voicePayload += ",\"audioReady\":";
  voicePayload += audioReady ? "true" : "false";
  voicePayload += ",\"psramBytes\":" + String(ESP.getPsramSize());
  voicePayload += "}";
  webSocket.sendTXT(voicePayload);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      webSocketConnectedAt = millis();
      lastHealthSentAt = webSocketConnectedAt;
      webSocketHandshakeStage = 1;
      break;
    case WStype_DISCONNECTED:
      webSocketConnected = false;
      webSocketHandshakeStage = 0;
      voiceCaptureEnabled = false;
      voicePlaybackActive = false;
      setVoiceSpeakerEnabled(false);
      clearPlaybackBuffer();
      break;
    case WStype_TEXT:
      {
        String message = "";
        message.reserve(length);
        for (size_t i = 0; i < length; i++) message += (char)payload[i];
        if (!processVoiceMessage(message)) processCommand(message, SOURCE_WEBSOCKET);
      }
      break;
    case WStype_BIN:
      if (voicePlaybackActive) queuePlaybackAudio(payload, length);
      break;
    default:
      break;
  }
}

void setupNetwork() {
  const String ssid = String(WIFI_SSID);
  networkConfigured = ssid.length() > 0 && ssid != "YOUR_WIFI_SSID";
  if (!networkConfigured) return;

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(ESP32_DEVICE_ID);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  webSocketPath = String(ESP32_WS_PATH);
  webSocketPath += "?deviceId=" + urlEncode(String(ESP32_DEVICE_ID));
  if (String(ESP32_WS_TOKEN).length() > 0) {
    webSocketPath += "&token=" + urlEncode(String(ESP32_WS_TOKEN));
  }
  webSocket.begin(BACKEND_HOST, BACKEND_PORT, webSocketPath.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
#if WS_HANDSHAKE_DIAGNOSTIC != 2
  webSocket.enableHeartbeat(15000, 3000, 2);
#endif
}

void setup() {
  Serial.begin(115200);
  Serial.println("{\"type\":\"log\",\"msg\":\"boot\"}");

  irsend.begin();
  irrecv.setUnknownThreshold(50);
  dht.begin();
#if VOICE_AUDIO_DIAGNOSTIC_DISABLE
  audioReady = false;
#else
  audioReady = setupVoiceAudio();
#endif

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    displayReady = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Smart Home AI");
    display.println("Starting...");
    display.display();
  }

  setupNetwork();
  Serial.println("{\"type\":\"log\",\"msg\":\"ready\"}");
  sendHealthReport(SOURCE_SERIAL);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' && inputBuffer.length() > 0) {
      processCommand(inputBuffer, SOURCE_SERIAL);
      inputBuffer = "";
    } else if (c != '\r') {
      inputBuffer += c;
    }
  }

  if (networkConfigured) webSocket.loop();

  if (webSocketConnected && webSocketHandshakeStage > 0) {
    unsigned long connectedFor = millis() - webSocketConnectedAt;
#if WS_HANDSHAKE_DIAGNOSTIC == 1
    if (webSocketHandshakeStage == 1 && connectedFor >= 500) {
      webSocket.sendTXT("{\"type\":\"probe\"}");
      webSocketHandshakeStage = 0;
    }
#elif WS_HANDSHAKE_DIAGNOSTIC == 2
    if (webSocketHandshakeStage == 1 && connectedFor >= 500) webSocketHandshakeStage = 0;
#else
    if (webSocketHandshakeStage == 1 && connectedFor >= 250) {
      sendWebSocketHello();
      webSocketHandshakeStage = 2;
    } else if (webSocketHandshakeStage == 2 && connectedFor >= 500) {
      sendHealthReport(SOURCE_WEBSOCKET);
      webSocketHandshakeStage = 3;
    } else if (webSocketHandshakeStage == 3 && connectedFor >= 1000) {
      sendVoiceHello();
      webSocketHandshakeStage = 0;
    }
#endif
  }

  serviceVoicePlayback();
  serviceVoiceCapture();

  unsigned long now = millis();

  if (learningMode) {
    if (irrecv.decode(&learnResults)) {
      String protocol = typeToString(learnResults.decode_type, learnResults.repeat);
      String code = resultToHexidecimal(&learnResults);
      String extra = "\"protocol\":\"" + jsonEscape(protocol) + "\",\"code\":\"0x";
      extra += code + "\",\"bits\":" + String(learnResults.bits);
      sendResponse(learningSource, learningRequestId, true, extra);
      learningMode = false;
      irrecv.disableIRIn();
    } else if ((long)(millis() - learnDeadline) > 0) {
      sendResponse(learningSource, learningRequestId, false, "\"error\":\"timeout\"");
      learningMode = false;
      irrecv.disableIRIn();
    }
  }

  if (now - lastSensorReadAt >= 3000) {
    lastSensorReadAt = now;
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    if (!isnan(temperature) && !isnan(humidity)) {
      lastTemperatureC = temperature;
      lastHumidity = humidity;
      sensorReady = true;
    }
  }

  if (now - lastHealthSentAt >= 5000) {
    lastHealthSentAt = now;
    publishHealthReport();
  }

  if (displayReady && now - lastDisplayAt >= 500) {
    lastDisplayAt = now;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.print("T:");
    display.print(sensorReady ? String(lastTemperatureC, 1) : "--.-");
    display.print(" H:");
    display.print(sensorReady ? String(lastHumidity, 0) : "--");
    display.println("%");
    display.print("AC:");
    display.print(acAssumedOn ? "ON " : "OFF");
    display.println(" IR:OK");
    display.print("WiFi:");
    display.print(WiFi.status() == WL_CONNECTED ? "OK" : "NO");
    display.print(" WS:");
    display.println(webSocketConnected ? "OK" : "NO");
    display.print("MIC:");
    display.print(audioReady ? "OK" : "ERR");
    display.print(" V:");
    display.print(voicePlaybackActive ? "OUT" : voiceCaptureEnabled ? "IN" : "--");
    display.display();
  }
}
