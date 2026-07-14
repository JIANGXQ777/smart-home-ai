# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start backend on http://localhost:5000
npm run launch     # One-click: start backend + open frontend (Windows PowerShell)
npm run check      # Syntax checks + database tests + Vue production build
```

The frontend is Vue 3 + Vite + Pinia + Vue Router. Production assets are built into `frontend/dist` and served by Express.

## Architecture

```
User input → Vue frontend → POST /api/chat → aiAgent.js
  → ruleAgent.js (fast path: keyword→type matching for explicit commands)
  → llmClient.js (fallback: OpenAI-compatible LLM endpoint)
  → decisionValidator.js (schema + capability check)
  → frontend shows suggestion + confirm button
  → POST /api/execute → executor.js
  → esp32Client.js → WebSocket or USB serial → ESP32 → IR LED
```

**Decision pipeline** (`aiAgent.js:decide`): rule engine runs first, matches device types dynamically (空调/风扇/灯/电视), falls through to LLM when no rule matches. Multi-device scenarios auto-list options. LLM responses validated against device capabilities. Hardware offline → all device-control actions rejected.

**Serial protocol**: JSON lines (`\n` delimited) over USB at 115200 bps. Three command types:
- `{"cmd":"health"}` → ESP32 responds with `{"type":"response","ok":true}` + periodic `{"type":"health",...}` every 5s
- `{"cmd":"ir_send","protocol":"NEC","code":"0x00FF","bits":32}` → multi-protocol dispatch in firmware
- `{"cmd":"ir_learn"}` → ESP32 enters IR receive mode (10s timeout), returns decoded `{"type":"response","ok":true,"protocol":"NEC","code":"0x00FF906F","bits":32}`

**State model**: Device definitions and runtime state are persisted in SQLite (`data/smart-home.db`). New devices start with `status=unknown`; successful IR commands update the persisted assumed state and confidence. Live sensor data from ESP32 replaces simulated defaults in `/api/state`.

**IR codes**: Learned codes are persisted in SQLite via `irCodeStore.js`. Existing `data/devices.json` and `data/ir_codes.json` are imported once during upgrade. Command results are stored in `command_events` and returned as `recentEvents`.

**LLM client**: `llmClient.js` speaks OpenAI-compatible Chat Completions. `response_format: { type: 'json_object' }` forces structured output. `checkLlmHealth()` sends a 1-token probe every 60s. Both `Authorization: Bearer` and `api-key` headers sent for compatibility.

**Frontend**: Vue 3 single-page app with Pinia stores and Vue Router. The dashboard polls `/api/state`; recent command activity comes from the persistent SQLite event log.

## Hardware (ESP32-S3: YD-ESP32-S3)

| Peripheral | GPIO | Notes |
|---|---|---|
| IR LED (transmit) | 4 | `IRsend` via IRremoteESP8266 — multi-protocol: COOLIX, NEC, SONY, SAMSUNG, RC5 |
| IR receiver | 5 | `IRrecv` for learning mode, auto-decodes protocol+code+bits |
| DHT22 | 6 | May need external pull-up resistor |
| OLED SDA | 17 | SSD1306 128×32 I2C, addr 0x3C |
| OLED SCL | 18 | |

DHT22 reads every 3s, health JSON sent every 5s. OLED shows 4-line status: temp/humidity, AC state + IR status, sensor + service, brand. IR learning mode runs in `loop()` via non-blocking poll — captures signal or times out in 10s.

## Key backend modules

| Module | Role |
|---|---|
| `server.js` | Express routes, state aggregation, config hot-reload, LLM health polling |
| `aiAgent.js` | Decision orchestrator: dynamic type matching → LLM fallback, multi-device handling, hardware-offline guard |
| `ruleAgent.js` | Type-based fast path for Chinese commands — traverses all device types dynamically |
| `llmClient.js` | OpenAI-compatible LLM client, system prompt, JSON parsing with markdown stripping |
| `decisionValidator.js` | Schema validation + capability check on LLM output |
| `executor.js` | Validates command, looks up `irProfile.learnedCodes`, sends IR via WebSocket/serial, persists assumed device state |
| `database.js` | SQLite connection, schema migration, WAL and metadata |
| `deviceStore.js` | Device definitions and runtime-state repository |
| `irCodeStore.js` | SQLite IR code repository and legacy JSON import |
| `commandEventStore.js` | Persistent device command audit/event log |
| `serialClient.js` | SerialPort wrapper: connect/reconnect, command/response pairing with configurable timeout, `learnIrCode()` |
| `esp32Client.js` | Thin facade over serialClient, `learnIrCode()` forwarding |
| `devices.js` | Loads device defs from deviceStore, attaches runtime state, merges IR codes from irCodeStore |

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Lightweight service/database health check |
| GET/POST | `/api/auth/status`, `/api/auth/login`, `/api/auth/logout` | Console session authentication |
| GET | `/api/state` | Environment + devices + system status |
| GET | `/api/events` | Recent persisted command events |
| POST | `/api/chat` | AI chat decision |
| POST | `/api/execute` | Execute device action |
| GET | `/api/devices` | List device definitions |
| POST | `/api/devices` | Add device |
| PUT | `/api/devices/:id` | Update device definition |
| DELETE | `/api/devices/:id` | Remove device |
| GET | `/api/device-types` | Type presets (actions + capabilities) |
| POST | `/api/ir-learn/start` | Trigger IR learning on ESP32 |
| POST | `/api/ir-learn/save` | Save learned code to device |
| GET | `/api/ir-learn/codes` | List all learned codes |
| DELETE | `/api/ir-learn/codes` | Delete a learned code |
| GET | `/api/config` | Read config |
| POST | `/api/config` | Write config (hot-reloads `.env`) |
| GET/PUT | `/api/models` | Read or update SQLite-backed LLM/ASR/TTS config |
| GET/POST | `/api/voice/status`, `/api/voice/transcribe`, `/api/voice/synthesize` | Browser voice status, ASR and TTS |

## Data files

| File | Purpose |
|---|---|
| `data/smart-home.db` | SQLite database for devices, runtime state, IR codes and events |
| `data/*.example.json` | Example data formats; runtime JSON files are migration input only |

## Config

`.env` file at project root. System and transport settings are stored there; LLM/ASR/TTS settings are persisted in SQLite after first initialization. POST `/api/config` writes `.env` and hot-reloads `process.env` without restart. Important env vars:

- `APP_MODE`, `DATABASE_PATH`
- `APP_AUTH_USERNAME`, `APP_AUTH_PASSWORD`, `APP_SESSION_SECRET`
- `LLM_ENABLED`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_ENDPOINT_PATH`, `LLM_MODEL`
- `VOICE_ENABLED`, `VOICE_API_KEY`, `VOICE_BASE_URL`, ASR/TTS endpoint and model variables
- `ESP32_ENABLED`, `ESP32_TRANSPORT`, `ESP32_WS_PATH`, `ESP32_WS_TOKEN`
- `SERIAL_PORT`, `SERIAL_BAUD_RATE`, `ESP32_REQUEST_TIMEOUT_MS`

When `LLM_ENABLED=false`, all decisions go through `ruleAgent.js` only.
