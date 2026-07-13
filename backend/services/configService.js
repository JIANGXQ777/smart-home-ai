const fs = require('fs');
const path = require('path');
const { getModelConfig } = require('../modelConfigStore');

const ENV_PATH = process.env.CONFIG_ENV_PATH
  ? path.resolve(process.env.CONFIG_ENV_PATH)
  : path.join(__dirname, '..', '..', '.env');

const FIELD_MAP = {
  appMode: 'APP_MODE',
  esp32Enabled: 'ESP32_ENABLED',
  esp32Transport: 'ESP32_TRANSPORT',
  esp32WsToken: 'ESP32_WS_TOKEN',
  serialPort: 'SERIAL_PORT',
  serialBaudRate: 'SERIAL_BAUD_RATE',
  voiceEnabled: 'VOICE_ENABLED',
  voiceVadThreshold: 'VOICE_VAD_THRESHOLD',
  voiceSilenceMs: 'VOICE_SILENCE_MS'
};

function booleanValue(value, fallback) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function getAppMode() {
  const configured = String(process.env.APP_MODE || '').toLowerCase();
  if (['demo', 'hybrid', 'hardware'].includes(configured)) return configured;
  if (process.env.ESP32_ENABLED === 'false' && !getModelConfig('llm').enabled) return 'demo';
  return process.env.ESP32_ENABLED === 'false' ? 'hybrid' : 'hardware';
}

function getEsp32Transport() {
  const configured = String(process.env.ESP32_TRANSPORT || 'auto').toLowerCase();
  return ['auto', 'websocket', 'serial'].includes(configured) ? configured : 'auto';
}

function getPublicConfig() {
  return {
    appMode: getAppMode(),
    esp32Enabled: booleanValue(process.env.ESP32_ENABLED, true),
    esp32Transport: getEsp32Transport(),
    esp32WsPath: process.env.ESP32_WS_PATH || '/ws/esp32',
    esp32WsTokenConfigured: Boolean(process.env.ESP32_WS_TOKEN),
    serialPort: process.env.SERIAL_PORT || '',
    serialBaudRate: Number(process.env.SERIAL_BAUD_RATE || 115200),
    voiceEnabled: booleanValue(process.env.VOICE_ENABLED, false),
    voiceVadThreshold: Number(process.env.VOICE_VAD_THRESHOLD || 700),
    voiceSilenceMs: Number(process.env.VOICE_SILENCE_MS || 700)
  };
}

function applyMode(body) {
  const mode = String(body.appMode || getAppMode()).toLowerCase();
  if (!['demo', 'hybrid', 'hardware'].includes(mode)) {
    throw new Error('运行模式必须是 demo、hybrid 或 hardware');
  }

  const next = { ...body, appMode: mode };
  if (mode === 'demo') {
    next.esp32Enabled = false;
  } else if (mode === 'hybrid') {
    next.esp32Enabled = body.esp32Enabled ?? false;
  } else {
    next.esp32Enabled = true;
  }
  return next;
}

function validateText(field, value, maxLength = 512) {
  const text = String(value);
  if (/\r|\n/.test(text)) throw new Error(`${field} 不能包含换行符`);
  if (text.length > maxLength) throw new Error(`${field} 长度不能超过 ${maxLength} 个字符`);
  return text;
}

function validateNumber(field, value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${field} 必须是 ${min}-${max} 之间的整数`);
  }
  return number;
}

function validateConfig(normalized) {
  if (normalized.serialPort !== undefined) validateText('串口地址', normalized.serialPort, 256);
  if (normalized.esp32WsToken !== undefined && normalized.esp32WsToken !== '') {
    const token = validateText('ESP32 WebSocket 令牌', normalized.esp32WsToken, 4096);
    if (token.length < 16) throw new Error('ESP32 WebSocket 令牌至少需要 16 个字符');
  }
  if (normalized.serialBaudRate !== undefined) {
    normalized.serialBaudRate = validateNumber('串口波特率', normalized.serialBaudRate, 1200, 4000000);
  }
  if (normalized.voiceVadThreshold !== undefined) {
    normalized.voiceVadThreshold = validateNumber('语音检测阈值', normalized.voiceVadThreshold, 50, 10000);
  }
  if (normalized.voiceSilenceMs !== undefined) {
    normalized.voiceSilenceMs = validateNumber('语音静音时间', normalized.voiceSilenceMs, 200, 3000);
  }
}

function updateEnvFile(updates) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates));
  const lines = existing.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });

  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  const nextContent = lines.join('\n').replace(/\n+$/, '') + '\n';
  const tempPath = `${ENV_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, nextContent, 'utf8');
  try {
    fs.renameSync(tempPath, ENV_PATH);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}

function saveConfig(body) {
  const normalized = applyMode(body || {});
  if (normalized.esp32Transport !== undefined &&
      !['auto', 'websocket', 'serial'].includes(String(normalized.esp32Transport).toLowerCase())) {
    throw new Error('ESP32 连接方式必须是 auto、websocket 或 serial');
  }
  validateConfig(normalized);
  const updates = {};

  for (const [field, envKey] of Object.entries(FIELD_MAP)) {
    if (normalized[field] === undefined || normalized[field] === null) continue;
    if (field === 'esp32WsToken' && normalized[field] === '') continue;
    updates[envKey] = String(normalized[field]);
  }

  updateEnvFile(updates);
  for (const [key, value] of Object.entries(updates)) process.env[key] = value;
  return getPublicConfig();
}

module.exports = { getAppMode, getPublicConfig, saveConfig };
