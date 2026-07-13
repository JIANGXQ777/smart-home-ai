const serialClient = require('./serialClient');
const websocketHub = require('./websocketHub');

function getTransportMode() {
  const configured = String(process.env.ESP32_TRANSPORT || 'auto').toLowerCase();
  return ['auto', 'websocket', 'serial'].includes(configured) ? configured : 'auto';
}

function isEnabled() {
  return process.env.ESP32_ENABLED !== 'false';
}

function isEsp32Configured() {
  if (!isEnabled()) return false;
  if (getTransportMode() === 'serial') return serialClient.isSerialConfigured();
  return true;
}

function getEsp32ConnectionTargets() {
  const mode = getTransportMode();
  const websocket = websocketHub.getConnectionTargets();
  const serial = serialClient.getConnectionTargets();
  const activeTransport = mode !== 'serial' && websocket.connected
    ? 'websocket'
    : mode !== 'websocket' && serial.connected
      ? 'serial'
      : null;

  return {
    mode,
    activeTransport,
    connected: Boolean(activeTransport),
    serialPath: serial.serialPath,
    baudRate: serial.baudRate,
    websocket,
    serial
  };
}

async function runWithPreferredTransport(websocketAction, serialAction) {
  const mode = getTransportMode();

  if (mode !== 'serial' && websocketHub.isConnected()) {
    try {
      return await websocketAction();
    } catch (error) {
      if (mode !== 'auto' || !serialClient.getConnectionTargets().connected) throw error;
    }
  }

  if (mode !== 'websocket' && serialClient.getConnectionTargets().connected) {
    return serialAction();
  }

  if (mode === 'websocket') throw new Error('ESP32 WebSocket 未连接');
  if (mode === 'serial') throw new Error('ESP32 串口未连接');
  throw new Error('ESP32 WebSocket 和串口均未连接');
}

function getHardwareHealth(options) {
  return runWithPreferredTransport(
    () => websocketHub.getHardwareHealth(options),
    () => serialClient.getHardwareHealth(options)
  );
}

function sendIrCommand(commandProfile, context) {
  return runWithPreferredTransport(
    () => websocketHub.sendIrCommand(commandProfile, context),
    () => serialClient.sendIrCommand(commandProfile, context)
  );
}

function learnIrCode() {
  return runWithPreferredTransport(
    () => websocketHub.learnIrCode(),
    () => serialClient.learnIrCode()
  );
}

async function initializeEsp32Connections(httpServer) {
  websocketHub.initializeWebSocketServer(httpServer);
  if (isEnabled() && getTransportMode() !== 'websocket' && serialClient.isSerialConfigured()) {
    await serialClient.connectSerial();
  }
}

async function reconfigureEsp32Connections(options = {}) {
  await serialClient.disconnectSerial();

  if (!isEnabled() || getTransportMode() === 'serial' || options.disconnectWebSocket) {
    websocketHub.disconnectClient('ESP32 connection configuration changed');
  }

  if (isEnabled() && getTransportMode() !== 'websocket' && serialClient.isSerialConfigured()) {
    await serialClient.connectSerial();
  }
}

module.exports = {
  getTransportMode,
  initializeEsp32Connections,
  isEsp32Configured,
  getEsp32ConnectionTargets,
  getHardwareHealth,
  sendIrCommand,
  learnIrCode,
  reconfigureEsp32Connections
};
