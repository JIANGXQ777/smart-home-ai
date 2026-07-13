#pragma once

// Copy this file to secrets.h and fill in the values for your local network.
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Use the LAN IP address of the computer running the Node.js backend.
#define BACKEND_HOST "192.168.1.100"
#define BACKEND_PORT 5000
#define ESP32_WS_PATH "/ws/esp32"
#define ESP32_WS_TOKEN "generate-a-random-token-at-least-32-characters"
#define ESP32_DEVICE_ID "esp32-living-room"

// Optional voice I2S pin overrides. The defaults match docs/VOICE.md.
#define VOICE_I2S_BCLK_PIN 12
#define VOICE_I2S_WS_PIN 13
#define VOICE_MIC_DATA_PIN 14
#define VOICE_SPEAKER_DATA_PIN 15
#define VOICE_SPEAKER_SD_PIN 21
#define VOICE_MIC_RIGHT_CHANNEL 0
