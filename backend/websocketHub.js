const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

let webSocketServer = null;
let activeClient = null;
let latestHealth = null;
const pendingCommands = new Map();

function getWebSocketPath() {
  const configured = String(process.env.ESP32_WS_PATH || '/ws/esp32').trim();
  if (!configured) return '/ws/esp32';
  return configured.startsWith('/') ? configured : `/${configured}`;
}

function getExpectedToken() {
  return String(process.env.ESP32_WS_TOKEN || '').trim();
}

function getSuppliedToken(request, requestUrl) {
  const authorization = String(request.headers.authorization || '').trim();
  if (/^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }
  return requestUrl.searchParams.get('token') || '';
}

function tokensMatch(expected, supplied) {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function clearPending(error) {
  for (const pending of pendingCommands.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  pendingCommands.clear();
}

function safeRemoteAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return request.socket.remoteAddress || null;
}

function handleMessage(client, rawMessage, isBinary = false) {
  if (isBinary) return;
  let data;
  try {
    data = JSON.parse(rawMessage.toString());
  } catch (error) {
    return;
  }

  client.lastSeenAt = new Date().toISOString();

  if (data.type === 'hello') {
    client.deviceId = data.deviceId || client.deviceId;
    client.hostname = data.hostname || client.hostname;
    return;
  }

  if (data.type === 'health') {
    latestHealth = {
      ...data,
      deviceId: data.deviceId || client.deviceId,
      hostname: data.hostname || client.hostname || null,
      receivedAt: new Date().toISOString()
    };
    return;
  }

  if (data.type !== 'response') return;

  let requestId = data.requestId;
  if (!requestId && pendingCommands.size === 1) {
    requestId = pendingCommands.keys().next().value;
  }

  const pending = requestId ? pendingCommands.get(requestId) : null;
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingCommands.delete(requestId);
  pending.resolve(data);
}

function initializeWebSocketServer(httpServer) {
  if (webSocketServer) return webSocketServer;

  webSocketServer = new WebSocketServer({
    server: httpServer,
    path: getWebSocketPath(),
    maxPayload: 128 * 1024
  });

  webSocketServer.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const expectedToken = getExpectedToken();
    const suppliedToken = getSuppliedToken(request, requestUrl);

    if (expectedToken && !tokensMatch(expectedToken, suppliedToken)) {
      socket.close(1008, 'unauthorized');
      return;
    }

    if (activeClient && activeClient.socket.readyState === WebSocket.OPEN) {
      clearPending(new Error('ESP32 WebSocket 连接已被新连接替换'));
      activeClient.socket.close(1012, 'replaced by a newer ESP32 connection');
    }

    const client = {
      socket,
      deviceId: requestUrl.searchParams.get('deviceId') || 'esp32',
      hostname: null,
      remoteAddress: safeRemoteAddress(request),
      connectedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    client.sendText = (payload) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(payload);
      return true;
    };
    client.sendBinary = (payload) => {
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 512 * 1024) return false;
      socket.send(payload, { binary: true });
      return true;
    };
    activeClient = client;
    latestHealth = null;

    console.log(`ESP32 WebSocket 已连接：${client.deviceId} (${client.remoteAddress || 'unknown'})`);

    socket.on('message', (message, isBinary) => handleMessage(client, message, isBinary));
    socket.on('error', (error) => {
      console.error(`ESP32 WebSocket 错误：${error.message}`);
    });
    socket.on('close', () => {
      if (activeClient !== client) return;
      activeClient = null;
      latestHealth = null;
      clearPending(new Error('ESP32 WebSocket 已断开'));
      console.log(`ESP32 WebSocket 已断开：${client.deviceId}`);
    });
  });

  console.log(`ESP32 WebSocket 接入点已启用：${getWebSocketPath()}`);
  if (!getExpectedToken()) {
    console.warn('ESP32_WS_TOKEN 未配置，WebSocket 接入点当前未启用身份验证');
  }

  return webSocketServer;
}

function isConnected() {
  return Boolean(activeClient && activeClient.socket.readyState === WebSocket.OPEN);
}

function getConnectionTargets() {
  return {
    path: getWebSocketPath(),
    connected: isConnected(),
    authenticated: Boolean(getExpectedToken()),
    deviceId: activeClient ? activeClient.deviceId : null,
    hostname: activeClient ? activeClient.hostname : null,
    remoteAddress: activeClient ? activeClient.remoteAddress : null,
    connectedAt: activeClient ? activeClient.connectedAt : null,
    lastSeenAt: activeClient ? activeClient.lastSeenAt : null
  };
}

function sendCommand(command, timeoutMs) {
  const effectiveTimeout = Number(timeoutMs || process.env.ESP32_REQUEST_TIMEOUT_MS || 5000);

  return new Promise((resolve, reject) => {
    if (!isConnected()) {
      const error = new Error('ESP32 WebSocket 未连接');
      error.code = 'WEBSOCKET_DISCONNECTED';
      reject(error);
      return;
    }

    const requestId = crypto.randomUUID();
    const payload = { type: 'command', requestId, ...command };

    const timer = setTimeout(() => {
      pendingCommands.delete(requestId);
      const error = new Error('ESP32 WebSocket 命令超时');
      error.code = 'WEBSOCKET_TIMEOUT';
      reject(error);
    }, effectiveTimeout);

    pendingCommands.set(requestId, { resolve, reject, timer });
    activeClient.socket.send(JSON.stringify(payload), (error) => {
      if (!error) return;
      clearTimeout(timer);
      pendingCommands.delete(requestId);
      reject(error);
    });
  });
}

async function getHardwareHealth(options = {}) {
  const staleAfterMs = Number(process.env.ESP32_HEALTH_STALE_MS || 12000);
  if (latestHealth && Date.now() - Date.parse(latestHealth.receivedAt) <= staleAfterMs) {
    return latestHealth;
  }

  await sendCommand({ cmd: 'health' }, options.timeoutMs);
  if (latestHealth) return latestHealth;

  const error = new Error('ESP32 未返回 WebSocket 健康数据');
  error.code = 'WEBSOCKET_HEALTH_MISSING';
  throw error;
}

async function sendIrCommand(commandProfile, context = {}) {
  const response = await sendCommand({
    cmd: 'ir_send',
    action: context.command || null,
    value: context.value ?? null,
    protocol: commandProfile.protocol,
    code: commandProfile.code,
    bits: commandProfile.bits,
    endpoint: commandProfile.endpoint || '/ir/send'
  });

  if (!response.ok) throw new Error(response.error || '红外发送失败');
  return response;
}

async function learnIrCode() {
  const response = await sendCommand({ cmd: 'ir_learn' }, 15000);
  if (!response.ok) throw new Error(response.error || '未收到红外信号（超时）');
  return {
    protocol: response.protocol,
    code: response.code,
    bits: response.bits
  };
}

function disconnectClient(reason = 'server reconfiguration') {
  if (!activeClient) return;
  activeClient.socket.close(1012, reason);
}

module.exports = {
  disconnectClient,
  getConnectionTargets,
  getHardwareHealth,
  initializeWebSocketServer,
  isConnected,
  learnIrCode,
  sendIrCommand
};
