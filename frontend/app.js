// 前端逻辑脚本
// 实现：获取状态 -> 发送对话 -> 显示回复 -> 确认执行 -> 刷新状态

const API_BASE = 'http://localhost:5000';

let pendingAction = null;

const deviceNameMap = {
  bedroom_ac: '卧室空调',
  livingroom_fan: '客厅风扇',
  livingroom_light: '客厅灯'
};

const commandTextMap = {
  turn_on: '打开',
  turn_off: '关闭',
  set_temperature: '调节温度'
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadState();
});

function setupEventListeners() {
  document.getElementById('send-btn').addEventListener('click', sendMessage);

  document.getElementById('user-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  document.getElementById('confirm-btn').addEventListener('click', confirmExecute);

  document.querySelectorAll('.quick-prompt').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById('user-input');
      input.value = button.dataset.prompt;
      input.focus();
      sendMessage();
    });
  });
}

async function loadState() {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    if (!res.ok) {
      throw new Error(`state request failed: ${res.status}`);
    }

    const data = await res.json();
    renderEnvironment(data.environment);
    renderDevices(data.devices);
    setConnectionStatus(true);
    showStatus('');
  } catch (err) {
    console.error('加载状态失败:', err);
    setConnectionStatus(false);
    renderEnvironment(null);
    renderDevices([]);
    showStatus('无法连接到后端服务，请确认服务器已启动。');
  }
}

function renderEnvironment(env) {
  const container = document.getElementById('env-info');

  if (!env) {
    container.innerHTML = '<div class="empty-state">暂无环境数据</div>';
    return;
  }

  container.innerHTML = [
    createEnvItem('温度', `${env.temperature}°C`),
    createEnvItem('湿度', `${env.humidity}%`),
    createEnvItem('时间', env.time),
    createEnvItem('场景', formatScene(env.scene))
  ].join('');
}

function createEnvItem(label, value) {
  return `
    <div class="env-item">
      <span class="label">${label}</span>
      <span class="value">${value}</span>
    </div>
  `;
}

function renderDevices(devices) {
  const list = document.getElementById('devices-list');
  const count = document.getElementById('device-count');

  count.textContent = `${devices.length} 台`;

  if (!devices || devices.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无设备数据</div>';
    return;
  }

  list.innerHTML = devices.map(device => `
    <div class="device-item">
      <div class="device-info">
        <span class="device-name">${device.name}</span>
        <span class="device-location">${device.location} · ${formatDeviceType(device.type)}</span>
        ${renderDeviceDetails(device)}
      </div>
      <span class="device-status ${device.status}">${device.status === 'on' ? '已开启' : '已关闭'}</span>
    </div>
  `).join('');
}

function renderDeviceDetails(device) {
  const details = [];

  if (device.type === 'air_conditioner' && device.status === 'on' && device.targetTemperature) {
    details.push(`设定温度：${device.targetTemperature} 度`);
  }

  details.push(`可用动作：${device.actions.map(formatCommand).join(' / ')}`);

  return details.map(detail => `<span class="device-meta">${detail}</span>`).join('');
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();

  if (!message) return;

  setLoading('chat', true);
  showStatus('');
  hideActionSuggestion();
  hideExecuteResult();
  appendMessage('user', message);
  showThinking();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!res.ok) {
      throw new Error(`chat request failed: ${res.status}`);
    }

    const data = await res.json();
    setConnectionStatus(true);
    const reply = data.reply || '我暂时没有可展示的回复。';
    appendMessage('assistant', reply);

    if (data.needConfirm && data.action) {
      pendingAction = data.action;
      showActionSuggestion(data.action);
      hideReplyArea();
    } else {
      pendingAction = null;
      hideReplyArea();
    }

    input.value = '';
  } catch (err) {
    console.error('发送消息失败:', err);
    setConnectionStatus(false);
    hideReplyArea();
    appendMessage('assistant', '抱歉，AI 助手暂时无法响应。');
    showStatus('请求失败，请确认后端服务和大模型配置正常。');
    pendingAction = null;
  } finally {
    setLoading('chat', false);
  }
}

function showReply(text, label = '当前建议') {
  const replyArea = document.getElementById('reply-area');
  const replyText = document.getElementById('reply-text');
  const replyLabel = replyArea.querySelector('.reply-label');

  replyArea.classList.remove('thinking');
  replyLabel.textContent = label;
  replyText.textContent = text;
  replyArea.hidden = false;
}

function showThinking() {
  const replyArea = document.getElementById('reply-area');
  const replyText = document.getElementById('reply-text');

  replyArea.classList.add('thinking');
  replyText.textContent = 'AI 正在结合环境和设备状态生成建议...';
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

  const deviceName = formatDeviceName(action.deviceId);
  const actionText = formatAction(action);

  suggestionText.textContent = `${deviceName} · ${actionText}`;
  actionDiv.hidden = false;
  confirmBtn.hidden = false;
}

function hideActionSuggestion() {
  document.getElementById('action-suggestion').hidden = true;
  document.getElementById('confirm-btn').hidden = true;
}

async function confirmExecute() {
  if (!pendingAction) return;

  const { deviceId, command, value } = pendingAction;

  setLoading('execute', true);
  showStatus('');

  try {
    const res = await fetch(`${API_BASE}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, command, value })
    });

    if (!res.ok) {
      throw new Error(`execute request failed: ${res.status}`);
    }

    const data = await res.json();
    setConnectionStatus(true);
    showExecuteResult(data);
    pendingAction = null;
    hideActionSuggestion();
    await loadState();
  } catch (err) {
    console.error('执行失败:', err);
    setConnectionStatus(false);
    showExecuteResult({ success: false, message: '执行失败，请稍后重试。' });
  } finally {
    setLoading('execute', false);
  }
}

function showExecuteResult(data) {
  const resultDiv = document.getElementById('execute-result');
  const resultText = document.getElementById('result-text');

  resultDiv.classList.remove('success', 'error');
  resultDiv.classList.add(data.success ? 'success' : 'error');
  resultText.textContent = data.message;
  resultDiv.hidden = false;
}

function hideExecuteResult() {
  document.getElementById('execute-result').hidden = true;
}

function setLoading(type, loading) {
  const sendBtn = document.getElementById('send-btn');
  const confirmBtn = document.getElementById('confirm-btn');
  const input = document.getElementById('user-input');

  sendBtn.disabled = loading;
  confirmBtn.disabled = loading;
  input.disabled = loading;

  if (loading && type === 'chat') {
    sendBtn.textContent = '发送中';
  } else {
    sendBtn.textContent = '发送';
  }

  if (loading && type === 'execute') {
    confirmBtn.textContent = '执行中';
  } else {
    confirmBtn.textContent = '确认执行';
  }
}

function setConnectionStatus(online) {
  const status = document.getElementById('connection-status');
  status.classList.toggle('online', online);
  status.classList.toggle('offline', !online);
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

function formatAction(action) {
  if (action.command === 'set_temperature') {
    return `设置为 ${action.value} 度`;
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

function formatScene(scene) {
  const sceneMap = {
    bedroom: '卧室',
    livingroom: '客厅'
  };

  return sceneMap[scene] || scene;
}
