const API_BASE = '';
const STATE_REFRESH_MS = 5000;

const deviceNameMap = {
  bedroom_ac: '卧室空调',
  livingroom_fan: '客厅风扇',
  livingroom_light: '客厅灯'
};

const commandTextMap = {
  turn_on: '打开',
  turn_off: '关闭',
  set_temperature: '设置温度'
};

const uiState = {
  chatLoading: false,
  executeLoading: false
};

let pendingAction = null;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateControls();
  loadState();
  window.setInterval(loadState, STATE_REFRESH_MS);
});

function setupEventListeners() {
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('confirm-btn').addEventListener('click', confirmExecute);

  document.getElementById('user-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.getElementById('user-input').addEventListener('input', () => {
    updateControls();
  });

  document.querySelectorAll('.quick-prompt').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('user-input');
      input.value = button.dataset.prompt || '';
      input.focus();
      sendMessage();
    });
  });
}

async function loadState() {
  try {
    const response = await fetch(`${API_BASE}/api/state`);
    if (!response.ok) {
      throw new Error(`state request failed: ${response.status}`);
    }

    const data = await response.json();
    renderEnvironment(data.environment);
    renderDevices(data.devices || []);
    renderSystemStatus(data.system);
    setConnectionStatus(true);
    showStatus('');
  } catch (error) {
    console.error('加载状态失败:', error);
    setConnectionStatus(false);
    renderEnvironment(null);
    renderDevices([]);
    renderSystemStatus(null);
    showStatus('无法连接到后端服务，请确认 Node.js 服务已经启动。');
  }
}

function renderEnvironment(environment) {
  const container = document.getElementById('env-info');

  if (!environment) {
    container.innerHTML = '<div class="empty-state">暂无环境数据</div>';
    return;
  }

  const sourceNote = environment.source === 'esp32' ? '来自 ESP32 + DHT22' : '当前为模拟值';

  container.innerHTML = [
    createEnvItem('温度', `${formatNumber(environment.temperature)}°C`, sourceNote),
    createEnvItem('湿度', `${formatNumber(environment.humidity)}%`, sourceNote),
    createEnvItem('时间', environment.time || '--:--', '由后端实时刷新')
  ].join('');
}

function createEnvItem(label, value, note = '') {
  return `
    <div class="env-item">
      <span class="label">${label}</span>
      <span class="value">${value}</span>
      ${note ? `<span class="note">${note}</span>` : ''}
    </div>
  `;
}

function renderSystemStatus(system) {
  const aiStatus = document.getElementById('ai-status');
  const connectionStatus = document.getElementById('connection-status');
  const hardwareStatus = document.getElementById('hardware-status');
  const refreshText = document.getElementById('refresh-text');
  const systemPanel = document.getElementById('system-status');

  if (!system) {
    aiStatus.textContent = 'AI 状态未知';
    aiStatus.className = 'status-pill warn';
    connectionStatus.textContent = '后端未连接';
    connectionStatus.className = 'status-pill offline';
    hardwareStatus.textContent = '硬件状态未知';
    hardwareStatus.className = 'status-pill warn';
    refreshText.textContent = '刷新失败';
    systemPanel.innerHTML = '<div class="empty-state">暂无系统状态</div>';
    return;
  }

  const llmStatus = system.llmStatus;
  if (!llmStatus) {
    aiStatus.textContent = 'AI 检测中...';
    aiStatus.className = 'status-pill warn';
  } else if (llmStatus.reachable && !llmStatus.authError) {
    aiStatus.textContent = llmStatus.model ? `AI 已就绪 (${llmStatus.model})` : 'AI 已就绪';
    aiStatus.className = 'status-pill online';
  } else if (llmStatus.reachable && llmStatus.authError) {
    aiStatus.textContent = 'AI API Key 无效';
    aiStatus.className = 'status-pill offline';
  } else {
    aiStatus.textContent = llmStatus.reason || 'AI 不可用';
    aiStatus.className = 'status-pill offline';
  }

  connectionStatus.textContent = system.backendConnected ? '后端已连接' : '后端未连接';
  connectionStatus.className = `status-pill ${system.backendConnected ? 'online' : 'offline'}`;

  if (!system.esp32Configured) {
    hardwareStatus.textContent = '硬件未配置';
    hardwareStatus.className = 'status-pill warn';
  } else if (system.esp32Connected) {
    hardwareStatus.textContent = '硬件在线';
    hardwareStatus.className = 'status-pill online';
  } else {
    hardwareStatus.textContent = '硬件离线';
    hardwareStatus.className = 'status-pill offline';
  }

  refreshText.textContent = `最近刷新：${formatRefreshTime(system.refreshedAt)}`;

  systemPanel.innerHTML = [
    createSystemItem('AI 模型', formatLlmStatus(system)),
    createSystemItem('后端连接', system.backendConnected ? '正常' : '异常'),
    createSystemItem('硬件', formatEsp32Status(system)),
    createSystemItem('发现方式', formatEsp32Discovery(system)),
    createSystemItem('硬件细节', formatHardwareDetails(system)),
    createSystemItem('最近刷新', formatRefreshTime(system.refreshedAt))
  ].join('');
}

function createSystemItem(label, value) {
  return `
    <div class="system-item">
      <span class="label">${label}</span>
      <span class="value">${value}</span>
    </div>
  `;
}

function formatLlmStatus(system) {
  if (!system.aiDecisionEnabled) {
    return '未启用';
  }

  const status = system.llmStatus;
  if (!status) {
    return '检测中...';
  }

  if (status.reachable && !status.authError) {
    return `已连接 (${status.model || 'OK'})`;
  }

  if (status.reachable && status.authError) {
    return 'API Key 无效';
  }

  return status.reason || '无法连接';
}

function formatEsp32Status(system) {
  if (!system.esp32Configured) {
    return '未配置';
  }

  if (!system.esp32Connected || !system.esp32) {
    return '离线';
  }

  const conn = system.esp32Connection;
  const parts = ['在线'];
  if (conn && conn.mode === 'serial' && conn.serialPath) {
    parts.push(conn.serialPath);
    parts.push(`${conn.baudRate}bps`);
  }
  if (conn && conn.mode === 'http' && conn.baseUrl) {
    parts.push(conn.baseUrl);
  }

  return parts.join(' / ');
}

function formatEsp32Discovery(system) {
  if (!system?.esp32Configured) {
    return '未配置';
  }

  if (!system?.esp32Connected) {
    return '离线';
  }

  const conn = system.esp32Connection;
  if (conn && conn.mode === 'serial') {
    return conn.connected ? 'USB 串口直连' : '串口断开';
  }
  if (conn && conn.mode === 'http') {
    return 'HTTP 局域网';
  }
  return '已连接';
}

function formatHardwareDetails(system) {
  if (!system?.esp32Configured) {
    return '未启用硬件桥接';
  }

  if (!system.esp32Connected || !system.esp32) {
    return '尚未获取到硬件健康状态';
  }

  const details = [];

  if (system.esp32.serviceStarted === true) {
    details.push('IR API 已启动');
  }
  if (system.esp32.sensorReady === true) {
    details.push('DHT22 就绪');
  }
  if (system.esp32.wifiConnected === true) {
    details.push('Wi-Fi 正常');
  }
  if (system.esp32.hostname) {
    details.push(system.esp32.hostname);
  }

  return details.length > 0 ? details.join(' / ') : '已连接';
}

function formatRefreshTime(isoString) {
  if (!isoString) {
    return '--:--:--';
  }

  return new Date(isoString).toLocaleTimeString('zh-CN', {
    hour12: false
  });
}

function renderDevices(devices) {
  const list = document.getElementById('devices-list');
  const count = document.getElementById('device-count');

  count.textContent = `${devices.length} 台`;

  if (!devices.length) {
    list.innerHTML = '<div class="empty-state">暂无设备数据</div>';
    return;
  }

  list.innerHTML = devices.map((device) => `
    <div class="device-item">
      <div class="device-info">
        <span class="device-name">${device.name}</span>
        <span class="device-location">${device.location} / ${formatDeviceType(device.type)}</span>
        ${renderDeviceDetails(device)}
      </div>
      <span class="device-status ${device.status}">${device.status === 'on' ? '已开启' : '已关闭'}</span>
    </div>
  `).join('');
}

function renderDeviceDetails(device) {
  const details = [];

  if (device.controlType) {
    details.push(`控制方式：${formatControlType(device.controlType)}`);
  }

  if (device.stateConfidence) {
    details.push(`状态来源：${formatStateConfidence(device.stateConfidence)}`);
  }

  if (device.type === 'air_conditioner' && device.status === 'on' && device.targetTemperature) {
    details.push(`设定温度：${device.targetTemperature}°C`);
  }

  if (device.lastCommand) {
    details.push(`最近命令：${formatCommand(device.lastCommand.command)}`);
  }

  details.push(`能力：${formatCapabilities(device)}`);

  return details.map((detail) => `<span class="device-meta">${detail}</span>`).join('');
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();

  if (!message || uiState.chatLoading) {
    return;
  }

  setChatLoading(true);
  showStatus('');
  hideActionSuggestion();
  hideExecuteResult();
  appendMessage('user', message);
  showThinking('AI 正在结合环境与设备状态生成建议...');

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`chat request failed: ${response.status}`);
    }

    const data = await response.json();
    setConnectionStatus(true);
    appendAssistantDecision(data);
    input.value = '';
  } catch (error) {
    console.error('发送消息失败:', error);
    setConnectionStatus(false);
    hideReplyArea();
    appendMessage('assistant', '抱歉，AI 助手暂时无法响应。');
    showStatus('请求失败，请确认后端服务和大模型配置正常。');
    pendingAction = null;
  } finally {
    setChatLoading(false);
  }
}

function appendAssistantDecision(data) {
  appendMessage('assistant', data.reply || '我暂时没有可展示的回复。');

  if (data.needConfirm && data.action) {
    pendingAction = data.action;
    showActionSuggestion(data.action);
    hideReplyArea();
  } else {
    pendingAction = null;
    hideActionSuggestion();
    hideReplyArea();
  }
}

function showThinking(text) {
  const replyArea = document.getElementById('reply-area');
  const replyText = document.getElementById('reply-text');

  replyArea.classList.add('thinking');
  replyText.textContent = text;
  replyArea.hidden = false;
}

function hideReplyArea() {
  const replyArea = document.getElementById('reply-area');
  replyArea.classList.remove('thinking');
  replyArea.hidden = true;
}

function appendMessage(role, text) {
  const stream = document.getElementById('chat-stream');
  const welcome = document.getElementById('welcome-card');
  const message = document.createElement('div');
  const label = document.createElement('span');
  const body = document.createElement('p');

  welcome.hidden = true;
  message.className = `message-bubble ${role}`;
  label.className = 'message-label';
  label.textContent = role === 'user' ? '你' : 'AI';
  body.textContent = text;

  message.appendChild(label);
  message.appendChild(body);
  stream.appendChild(message);
  stream.scrollTop = stream.scrollHeight;
}

function showActionSuggestion(action) {
  const actionDiv = document.getElementById('action-suggestion');
  const suggestionText = document.getElementById('suggestion-text');
  const confirmBtn = document.getElementById('confirm-btn');

  suggestionText.textContent = `${formatDeviceName(action.deviceId)} / ${formatAction(action)}`;
  actionDiv.hidden = false;
  confirmBtn.hidden = false;
}

function hideActionSuggestion() {
  document.getElementById('action-suggestion').hidden = true;
  document.getElementById('confirm-btn').hidden = true;
}

async function confirmExecute() {
  if (!pendingAction || uiState.executeLoading) {
    return;
  }

  const { deviceId, command, value } = pendingAction;
  setExecuteLoading(true);
  showStatus('');

  try {
    const response = await fetch(`${API_BASE}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ deviceId, command, value })
    });

    if (!response.ok) {
      throw new Error(`execute request failed: ${response.status}`);
    }

    const data = await response.json();
    setConnectionStatus(true);
    showExecuteResult(data);
    pendingAction = null;
    hideActionSuggestion();
    await loadState();
  } catch (error) {
    console.error('执行失败:', error);
    setConnectionStatus(false);
    showExecuteResult({
      success: false,
      message: '执行失败，请稍后重试。'
    });
  } finally {
    setExecuteLoading(false);
  }
}

function showExecuteResult(data) {
  const resultDiv = document.getElementById('execute-result');
  const resultText = document.getElementById('result-text');

  resultDiv.classList.remove('success', 'error');
  resultDiv.classList.add(data.success ? 'success' : 'error');
  resultText.textContent = data.message || (data.success ? '执行成功。' : '执行失败。');
  resultDiv.hidden = false;
}

function hideExecuteResult() {
  document.getElementById('execute-result').hidden = true;
}

function setChatLoading(loading) {
  uiState.chatLoading = loading;
  updateControls();
}

function setExecuteLoading(loading) {
  uiState.executeLoading = loading;
  updateControls();
}

function updateControls() {
  const sendBtn = document.getElementById('send-btn');
  const confirmBtn = document.getElementById('confirm-btn');
  const input = document.getElementById('user-input');

  const isBusy = uiState.chatLoading || uiState.executeLoading;

  input.disabled = uiState.chatLoading || uiState.executeLoading;
  sendBtn.disabled = isBusy || !input.value.trim();
  confirmBtn.disabled = isBusy;

  sendBtn.textContent = uiState.chatLoading ? '发送中' : '发送';
  confirmBtn.textContent = uiState.executeLoading ? '执行中' : '确认执行';
}

function setConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  if (!status) {
    return;
  }

  status.classList.toggle('online', online);
  status.classList.toggle('offline', !online);
  status.classList.remove('warn');
  status.textContent = online ? '后端已连接' : '后端未连接';
}

function showStatus(message) {
  const status = document.getElementById('status-message');

  if (!message) {
    status.hidden = true;
    status.textContent = '';
    return;
  }

  status.textContent = message;
  status.hidden = false;
}

function formatDeviceName(deviceId) {
  return deviceNameMap[deviceId] || deviceId;
}

function formatCommand(command) {
  return commandTextMap[command] || command;
}

function formatCapabilities(device) {
  const capabilities = device.capabilities || {};
  const labels = [];

  if (capabilities.power) {
    labels.push('开关');
  }
  if (capabilities.temperature) {
    labels.push(`温度 ${capabilities.temperature.min}-${capabilities.temperature.max}°C`);
  }
  if (Array.isArray(capabilities.mode) && capabilities.mode.length > 0) {
    labels.push('模式');
  }
  if (Array.isArray(capabilities.fanSpeed) && capabilities.fanSpeed.length > 0) {
    labels.push('风速');
  }

  return labels.length > 0 ? labels.join(' / ') : (device.actions || []).map(formatCommand).join(' / ');
}

function formatControlType(controlType) {
  return controlType === 'ir' ? '红外' : controlType;
}

function formatStateConfidence(stateConfidence) {
  const confidenceMap = {
    assumed: '系统推测',
    reported: '设备上报'
  };

  return confidenceMap[stateConfidence] || stateConfidence;
}

function formatAction(action) {
  if (action.command === 'set_temperature') {
    return `设置为 ${action.value}°C`;
  }

  return formatCommand(action.command);
}

function formatDeviceType(type) {
  const typeMap = {
    air_conditioner: '空调',
    fan: '风扇',
    light: '灯光'
  };

  return typeMap[type] || type;
}

function formatNumber(value) {
  if (typeof value !== 'number') {
    return '--';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
