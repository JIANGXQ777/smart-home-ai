#pragma once

// Copy this file to secrets.h and fill in the values for your local network.
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Public WSS endpoint. Set BACKEND_USE_TLS to 0 only for a trusted LAN ws:// endpoint.
#define BACKEND_HOST "smart-home-ai.tail29b726.ts.net"
#define BACKEND_PORT 443
#define BACKEND_USE_TLS 1
#define ESP32_WS_PATH "/ws/esp32"
#define ESP32_WS_TOKEN "generate-a-random-token-at-least-32-characters"
#define ESP32_DEVICE_ID "esp32-living-room"

// Browser voice is used by default. Keep the ESP32 microphone and speaker disabled.
#define VOICE_AUDIO_DIAGNOSTIC_DISABLE 1

// Optional voice I2S pin overrides. The defaults match docs/VOICE.md.
#define VOICE_I2S_BCLK_PIN 12
#define VOICE_I2S_WS_PIN 13
#define VOICE_MIC_DATA_PIN 14
#define VOICE_SPEAKER_DATA_PIN 15
#define VOICE_SPEAKER_SD_PIN 21
#define VOICE_MIC_RIGHT_CHANNEL 0
