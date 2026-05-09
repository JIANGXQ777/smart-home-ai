const DEFAULT_TIMEOUT_MS = Number(process.env.ESP32_REQUEST_TIMEOUT_MS || 5000);
const BASE_URL = (process.env.ESP32_BASE_URL || '').trim().replace(/\/+$/, '');
const HARDWARE_ENABLED = process.env.ESP32_ENABLED !== 'false';

function isEsp32Configured() {
  return HARDWARE_ENABLED && BASE_URL.length > 0;
}

async function postJson(path, payload) {
  return requestJson(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

async function requestJson(path, init = {}) {
  if (!isEsp32Configured()) {
    throw new Error('ESP32 hardware bridge is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers || {})
      }
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message = data && data.message ? data.message : `ESP32 request failed: ${response.status}`;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function sendIrCommand(commandProfile) {
  const endpoint = commandProfile.endpoint || '/ir/send';
  const payload = {
    protocol: commandProfile.protocol,
    code: commandProfile.code,
    bits: commandProfile.bits
  };

  return postJson(endpoint, payload);
}

async function getHardwareHealth() {
  return requestJson('/health', {
    method: 'GET'
  });
}

module.exports = {
  isEsp32Configured,
  sendIrCommand,
  getHardwareHealth
};
