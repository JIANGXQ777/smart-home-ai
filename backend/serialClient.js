const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let port = null;
let parser = null;
let connected = false;
let pendingResolve = null;
let pendingTimeout = null;
let responseBuffer = [];

const RECONNECT_DELAY_MS = 3000;
const COMMAND_TIMEOUT_MS = 5000;

function buildSerialPath() {
  return (process.env.SERIAL_PORT || '').trim();
}

function getBaudRate() {
  return Number(process.env.SERIAL_BAUD_RATE || 115200);
}

function getHardwareId() {
  return 'esp32-serial';
}

function isSerialConfigured() {
  return process.env.ESP32_ENABLED !== 'false' && Boolean(buildSerialPath());
}

function handleData(line) {
  try {
    const data = JSON.parse(line);

    if (data.type === 'response' && pendingResolve) {
      const resolve = pendingResolve;
      const timer = pendingTimeout;
      pendingResolve = null;
      pendingTimeout = null;
      if (timer) clearTimeout(timer);
      resolve(data);
      return;
    }

    if (data.type === 'health') {
      responseBuffer.push(data);
      if (responseBuffer.length > 5) responseBuffer.shift();
      return;
    }

    responseBuffer.push(data);
    if (responseBuffer.length > 10) responseBuffer.shift();
  } catch (error) {
    // ignore non-JSON lines
  }
}

function getLatestHealth() {
  for (let i = responseBuffer.length - 1; i >= 0; i -= 1) {
    if (responseBuffer[i].type === 'health') {
      return responseBuffer[i];
    }
  }
  return null;
}

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    if (!port || !connected) {
      reject(new Error('串口未连接'));
      return;
    }

    if (pendingResolve) {
      reject(new Error('上一条命令尚未完成'));
      return;
    }

    const json = JSON.stringify(command) + '\n';
    pendingResolve = resolve;
    pendingTimeout = setTimeout(() => {
      pendingResolve = null;
      pendingTimeout = null;
      reject(new Error('串口命令超时'));
    }, COMMAND_TIMEOUT_MS);

    port.write(json, (error) => {
      if (error) {
        if (pendingTimeout) clearTimeout(pendingTimeout);
        pendingResolve = null;
        pendingTimeout = null;
        reject(error);
      }
    });
  });
}

async function connectSerial() {
  if (connected && port) return;

  const serialPath = buildSerialPath();
  if (!serialPath) {
    console.log('串口未配置，请设置 SERIAL_PORT');
    return;
  }

  try {
    port = new SerialPort({
      path: serialPath,
      baudRate: getBaudRate(),
      autoOpen: false
    });

    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', handleData);

    await new Promise((resolve, reject) => {
      port.open((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    connected = true;
    console.log(`串口已连接: ${serialPath} @ ${getBaudRate()}bps`);
  } catch (error) {
    connected = false;
    console.error(`串口连接失败: ${error.message}`);
    throw error;
  }

  port.on('close', () => {
    connected = false;
    console.log('串口已断开，尝试重连...');
    setTimeout(connectSerial, RECONNECT_DELAY_MS);
  });

  port.on('error', (error) => {
    console.error(`串口错误: ${error.message}`);
  });
}

async function disconnectSerial() {
  if (port) {
    try {
      port.close();
    } catch (error) {
      // ignore
    }
    port = null;
    parser = null;
  }
  connected = false;
}

async function getHardwareHealth(options = {}) {
  const timeoutMs = options.timeoutMs || COMMAND_TIMEOUT_MS;

  const cached = getLatestHealth();
  if (cached) {
    return cached;
  }

  if (!connected) {
    const error = new Error('硬件串口未连接');
    error.code = 'SERIAL_DISCONNECTED';
    throw error;
  }

  try {
    await sendCommand({ cmd: 'health' });
  } catch (error) {
    // ignore timeout, try cache
  }

  const health = getLatestHealth();
  if (health) {
    return health;
  }

  const error = new Error('等待硬件数据超时');
  error.code = 'SERIAL_TIMEOUT';
  throw error;
}

async function sendIrCommand(commandProfile) {
  const payload = {
    cmd: 'ir_send',
    protocol: commandProfile.protocol,
    code: commandProfile.code,
    bits: commandProfile.bits,
    endpoint: commandProfile.endpoint || '/ir/send'
  };

  const response = await sendCommand(payload);
  return response;
}

function getConnectionTargets() {
  return {
    serialPath: buildSerialPath() || null,
    baudRate: getBaudRate(),
    connected
  };
}

module.exports = {
  connectSerial,
  disconnectSerial,
  getConnectionTargets,
  getHardwareHealth,
  isSerialConfigured,
  sendIrCommand
};
