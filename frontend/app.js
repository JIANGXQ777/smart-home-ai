// 前端逻辑脚本
// 实现：获取状态 -> 发送对话 -> 显示回复 -> 确认执行 -> 刷新状态

const API_BASE = 'http://localhost:5000';

// 当前待执行的建议动作
let pendingAction = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
  // 发送按钮点击
  document.getElementById('send-btn').addEventListener('click', sendMessage);

  // 输入框回车发送
  document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // 确认执行按钮点击
  document.getElementById('confirm-btn').addEventListener('click', confirmExecute);
}

// ============================================
// 加载系统状态
// ============================================
async function loadState() {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    const data = await res.json();

    // 渲染环境信息
    renderEnvironment(data.environment);

    // 渲染设备列表
    renderDevices(data.devices);
  } catch (err) {
    console.error('加载状态失败:', err);
    showTip('无法连接到后端服务，请确保服务器已启动');
  }
}

// 渲染环境信息
function renderEnvironment(env) {
  const html = `
    <span class="env-item">
      <span class="label">温度：</span>
      <span class="value">${env.temperature}°C</span>
    </span>
    <span class="env-item">
      <span class="label">湿度：</span>
      <span class="value">${env.humidity}%</span>
    </span>
    <span class="env-item">
      <span class="label">时间：</span>
      <span class="value">${env.time}</span>
    </span>
    <span class="env-item">
      <span class="label">场景：</span>
      <span class="value">${env.scene}</span>
    </span>
  `;
  document.getElementById('env-info').innerHTML = html;
}

// 渲染设备列表
function renderDevices(devices) {
  if (!devices || devices.length === 0) {
    document.getElementById('devices-list').innerHTML = '<div class="empty-tip">暂无设备</div>';
    return;
  }

  const html = devices.map(device => `
    <div class="device-item">
      <div class="device-info">
        <span class="device-name">${device.name}</span>
        <span class="device-location">${device.location}</span>
      </div>
      <span class="device-status ${device.status}">${device.status === 'on' ? '已开启' : '已关闭'}</span>
    </div>
  `).join('');

  document.getElementById('devices-list').innerHTML = html;
}

// ============================================
// 发送消息给 AI
// ============================================
async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();

  if (!message) return;

  // 显示加载状态
  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    // 显示 AI 回复
    showReply(data.reply);

    // 如果需要确认，显示建议动作
    if (data.needConfirm && data.action) {
      pendingAction = data.action;
      showActionSuggestion(data);
    } else {
      pendingAction = null;
      hideActionSuggestion();
    }

    // 清空输入框
    input.value = '';
  } catch (err) {
    console.error('发送消息失败:', err);
    showReply('抱歉，发生了错误，请稍后重试');
    hideActionSuggestion();
  } finally {
    setLoading(false);
  }
}

// 显示 AI 回复
function showReply(text) {
  const replyArea = document.getElementById('reply-area');
  replyArea.innerHTML = `<div class="reply-text">${text}</div>`;
  replyArea.style.display = 'block';
}

// 显示建议动作
function showActionSuggestion(data) {
  const actionDiv = document.getElementById('action-suggestion');
  const suggestionText = document.getElementById('suggestion-text');

  // 根据设备ID获取设备名称
  const deviceName = data.action.deviceId === 'bedroom_ac' ? '卧室空调' :
                     data.action.deviceId === 'livingroom_fan' ? '客厅风扇' :
                     data.action.deviceId === 'livingroom_light' ? '客厅灯' : '设备';

  const actionText = data.action.command === 'turn_on' ? '打开' :
                     data.action.command === 'turn_off' ? '关闭' : '设置';

  suggestionText.textContent = `建议${actionText}${deviceName}`;
  actionDiv.classList.add('show');

  // 显示确认执行按钮
  document.getElementById('confirm-btn').style.display = 'inline-block';
}

// 隐藏建议动作
function hideActionSuggestion() {
  document.getElementById('action-suggestion').classList.remove('show');
  document.getElementById('confirm-btn').style.display = 'none';
}

// ============================================
// 确认执行设备动作
// ============================================
async function confirmExecute() {
  if (!pendingAction) return;

  const { deviceId, command } = pendingAction;

  // 显示加载状态
  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, command })
    });

    const data = await res.json();

    // 显示执行结果
    showExecuteResult(data);

    // 清空待执行动作
    pendingAction = null;
    hideActionSuggestion();

    // 刷新状态
    await loadState();
  } catch (err) {
    console.error('执行失败:', err);
    showExecuteResult({ success: false, message: '执行失败，请稍后重试' });
  } finally {
    setLoading(false);
  }
}

// 显示执行结果
function showExecuteResult(data) {
  const resultDiv = document.getElementById('execute-result');
  const resultText = document.getElementById('result-text');

  resultDiv.classList.remove('success', 'error');
  resultDiv.classList.add(data.success ? 'success' : 'error');
  resultText.textContent = data.message;
  resultDiv.classList.add('show');
}

// ============================================
// 工具函数
// ============================================

// 设置加载状态
function setLoading(loading) {
  const sendBtn = document.getElementById('send-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  if (loading) {
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    confirmBtn.disabled = true;
  } else {
    sendBtn.disabled = false;
    sendBtn.textContent = '发送';
    confirmBtn.disabled = false;
  }
}

// 显示提示
function showTip(message) {
  alert(message);
}
