require('dotenv').config({ quiet: true });

const express = require('express');
const path = require('path');

const { getDevices, getEnvironment } = require('./devices');
const { decide } = require('./aiAgent');
const { execute } = require('./executor');
const { getConfig } = require('./llmClient');
const { connectSerial } = require('./serialClient');
const {
  isEsp32Configured,
  getHardwareHealth,
  getEsp32ConnectionTargets
} = require('./esp32Client');

const app = express();

const STATE_HARDWARE_TIMEOUT_MS = Number(process.env.ESP32_HEALTH_TIMEOUT_MS || 1200);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

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

async function buildStateResponse() {
  const baseEnvironment = getEnvironment();
  const llmConfig = getConfig();
  const system = {
    backendConnected: true,
    aiDecisionEnabled: llmConfig.enabled,
    esp32Configured: isEsp32Configured(),
    esp32Connected: false,
    refreshedAt: new Date().toISOString(),
    esp32Connection: getEsp32ConnectionTargets()
  };

  let hardware = null;

  if (system.esp32Configured) {
    try {
      hardware = await getHardwareHealth({
        timeoutMs: STATE_HARDWARE_TIMEOUT_MS
      });
      system.esp32Connected = true;
      system.esp32 = {
        serialPath: hardware.serialPath || null,
        wifiConnected: toOptionalBoolean(hardware.wifiConnected),
        serviceStarted: toOptionalBoolean(hardware.serviceStarted),
        sensorReady: toOptionalBoolean(hardware.sensorReady),
        hostname: hardware.hostname || null
      };
    } catch (error) {
      system.esp32 = {
        error: error.message
      };
    }
  } else {
    system.esp32 = null;
  }

  const hasLiveSensorData = hardware &&
    typeof hardware.temperature === 'number' &&
    typeof hardware.humidity === 'number';

  const environment = {
    ...baseEnvironment,
    temperature: hasLiveSensorData ? hardware.temperature : baseEnvironment.temperature,
    humidity: hasLiveSensorData ? hardware.humidity : baseEnvironment.humidity,
    time: formatCurrentTime(),
    source: hasLiveSensorData ? 'esp32' : 'simulated'
  };

  return {
    environment,
    devices: getDevices(),
    system
  };
}

app.get('/api/state', async (req, res) => {
  try {
    const state = await buildStateResponse();
    res.json(state);
  } catch (error) {
    console.error('State aggregation failed:', error);
    res.status(500).json({
      error: '状态聚合失败。'
    });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少 message 字段。' });
  }

  try {
    const result = await decide(message);
    return res.json(result);
  } catch (error) {
    console.error('AI 决策失败:', error);
    return res.status(500).json({
      reply: '抱歉，AI 决策服务暂时不可用。',
      intent: 'error',
      needConfirm: false,
      action: null
    });
  }
});

app.post('/api/execute', async (req, res) => {
  const { deviceId, command, value } = req.body;

  if (!deviceId || !command) {
    return res.status(400).json({
      success: false,
      message: '缺少 deviceId 或 command 字段。'
    });
  }

  const result = await execute(deviceId, command, value);
  return res.json(result);
});

app.listen(5000, () => {
  console.log('服务器运行：http://localhost:5000');
  console.log('API 接口：');
  console.log('  GET  /api/state    - 获取系统状态');
  console.log('  POST /api/chat     - AI 文本对话');
  console.log('  POST /api/execute  - 执行设备动作');

  if (process.env.ESP32_ENABLED !== 'false') {
    connectSerial().catch((error) => {
      console.log(`串口连接失败（系统将继续运行）: ${error.message}`);
    });
  }
});
