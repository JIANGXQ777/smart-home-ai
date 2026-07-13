const { getDevices, getEnvironment } = require('../devices');
const { getConfig, checkLlmHealth } = require('../llmClient');
const {
  isEsp32Configured,
  getHardwareHealth,
  getEsp32ConnectionTargets
} = require('../esp32Client');
const { getAppMode } = require('./configService');
const { getRecentCommandEvents } = require('../commandEventStore');
const { getVoiceStatus } = require('./voiceService');

let llmHealthCache = null;

function formatCurrentTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function toOptionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

async function refreshLlmHealth() {
  llmHealthCache = await checkLlmHealth();
  console.log('LLM 健康检查:', JSON.stringify(llmHealthCache));
  return llmHealthCache;
}

async function buildStateResponse() {
  const baseEnvironment = getEnvironment();
  const llmConfig = getConfig();
  const connection = getEsp32ConnectionTargets();
  const system = {
    appMode: getAppMode(),
    backendConnected: true,
    aiDecisionEnabled: llmConfig.enabled,
    llmStatus: llmHealthCache,
    storage: { type: 'sqlite', persistent: true },
    esp32Configured: isEsp32Configured(),
    esp32Connected: false,
    refreshedAt: new Date().toISOString(),
    esp32Connection: connection
  };

  let hardware = null;
  if (system.esp32Configured) {
    try {
      hardware = await getHardwareHealth({
        timeoutMs: Number(process.env.ESP32_HEALTH_TIMEOUT_MS || 1200)
      });
      system.esp32Connected = true;
      system.esp32 = {
        transport: connection.activeTransport,
        deviceId: hardware.deviceId || connection.websocket.deviceId || null,
        serialPath: connection.serialPath || null,
        wifiConnected: toOptionalBoolean(hardware.wifiConnected),
        websocketConnected: toOptionalBoolean(hardware.websocketConnected),
        serviceStarted: toOptionalBoolean(hardware.serviceStarted),
        sensorReady: toOptionalBoolean(hardware.sensorReady),
        audioReady: toOptionalBoolean(hardware.audioReady),
        voiceCapture: toOptionalBoolean(hardware.voiceCapture),
        voicePlaying: toOptionalBoolean(hardware.voicePlaying),
        psramBytes: typeof hardware.psramBytes === 'number' ? hardware.psramBytes : null,
        freePsramBytes: typeof hardware.freePsramBytes === 'number' ? hardware.freePsramBytes : null,
        hostname: hardware.hostname || null,
        ip: hardware.ip || null,
        rssi: typeof hardware.rssi === 'number' ? hardware.rssi : null
      };
    } catch (error) {
      system.esp32 = { error: error.message };
    }
  } else {
    system.esp32 = null;
  }

  const hasLiveSensorData = hardware &&
    typeof hardware.temperature === 'number' &&
    typeof hardware.humidity === 'number';

  return {
    environment: {
      ...baseEnvironment,
      temperature: hasLiveSensorData ? hardware.temperature : baseEnvironment.temperature,
      humidity: hasLiveSensorData ? hardware.humidity : baseEnvironment.humidity,
      time: formatCurrentTime(),
      source: hasLiveSensorData ? 'esp32' : 'simulated'
    },
    devices: getDevices(),
    recentEvents: getRecentCommandEvents(8),
    voice: getVoiceStatus(),
    system
  };
}

module.exports = { buildStateResponse, refreshLlmHealth };
