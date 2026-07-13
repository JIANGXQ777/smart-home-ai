// V1 规则决策模块
// 用于未启用大模型时的本地开发和演示模式

const { getDevices, getEnvironment } = require('./devices');

function containsKeywords(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function formatActionLabel(action) {
  const map = { turn_on: '开关', turn_off: '开关', set_temperature: '设置温度' };
  return map[action] || action;
}

// 从消息中尝试匹配具体设备（通过名称或位置）
function pickDevice(message, candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  for (const d of candidates) {
    if (message.includes(d.name)) return d;
  }
  for (const d of candidates) {
    if (d.location && message.includes(d.location)) return d;
  }
  return null;
}

function decideByRules(message) {
  const devices = getDevices();
  const env = getEnvironment();

  // ---- 体感温度 → 建议开关空调 ----

  if (containsKeywords(message, ['热', '好热', '太热', '闷', '闷热', '不舒服'])) {
    if (env.temperature >= 28) {
      const acs = devices.filter((d) => d.type === 'air_conditioner' && d.paired && d.status === 'off');
      const ac = pickDevice(message, acs) || acs[0];
      if (ac) {
        return {
          reply: `当前室温${env.temperature}度，${ac.name}处于关闭状态，建议打开${ac.name}，需要我帮你打开吗？`,
          intent: 'cooling',
          needConfirm: true,
          action: { deviceId: ac.id, command: 'turn_on' }
        };
      }
    }
  }

  if (containsKeywords(message, ['冷', '好冷', '太冷'])) {
    const acs = devices.filter((d) => d.type === 'air_conditioner' && d.paired && d.status === 'on');
    const ac = pickDevice(message, acs) || acs[0];
    if (ac) {
      return {
        reply: `如果你觉得冷，我可以帮你关闭${ac.name}。`,
        intent: 'warming',
        needConfirm: true,
        action: { deviceId: ac.id, command: 'turn_off' }
      };
    }
  }

  // ---- 能力查询 ----

  if (containsKeywords(message, ['你能控制什么', '有哪些设备', '你会干什么', '能控制哪些家电'])) {
    const parts = devices
      .filter((d) => d.paired)
      .map((d) => `${d.name}支持${(d.actions || []).map(formatActionLabel).join('和')}`);

    return {
      reply: parts.length > 0
        ? `我目前可以控制${parts.join('，')}。`
        : '当前还没有已配对的设备。',
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  // ---- 开关命令（遍历所有类型） ----

  const typeCommands = [
    { keywords: ['空调'], type: 'air_conditioner' },
    { keywords: ['风扇'], type: 'fan' },
    { keywords: ['灯', '灯光'], type: 'light' },
    { keywords: ['电视'], type: 'tv' }
  ];

  for (const { keywords, type } of typeCommands) {
    if (!containsKeywords(message, keywords)) continue;

    const isOpen = containsKeywords(message, ['打开', '开', '开启']);
    const isClose = containsKeywords(message, ['关闭', '关', '关掉']);
    if (!isOpen && !isClose) continue;

    const command = isOpen ? 'turn_on' : 'turn_off';
    const targetStatus = isOpen ? 'on' : 'off';
    const candidates = devices.filter(
      (d) => d.type === type && d.paired && d.actions.includes(command)
    );
    if (candidates.length === 0) continue;

    const device = pickDevice(message, candidates);
    if (!device && candidates.length > 1) {
      const list = candidates.map((d) => `・${d.name}`).join('\n');
      return {
        reply: `有多个设备可以${isOpen ? '打开' : '关闭'}，请指定具体哪一个：\n${list}`,
        intent: 'clarification_needed',
        needConfirm: false,
        action: null
      };
    }

    const target = device || candidates[0];

    if (target.status === targetStatus) {
      return {
        reply: `${target.name}已经处于${targetStatus === 'on' ? '开启' : '关闭'}状态。`,
        intent: 'already_done',
        needConfirm: false,
        action: null
      };
    }

    const actionWord = isOpen ? '打开' : '关闭';
    return {
      reply: `好的，我可以帮你${actionWord}${target.name}，需要现在执行吗？`,
      intent: 'direct_control',
      needConfirm: true,
      action: { deviceId: target.id, command }
    };
  }

  // ---- 温度命令 ----

  const tempMatch = message.match(/(?:空调|温度|设为|设置|调到|调为|调整为|改成)\D*(\d{2})\s*度?/);
  if (tempMatch) {
    const temp = Number(tempMatch[1]);
    const acs = devices.filter(
      (d) => d.type === 'air_conditioner' && d.paired && d.actions.includes('set_temperature')
    );
    const ac = pickDevice(message, acs) || acs[0];
    if (ac) {
      return {
        reply: `好的，我可以帮你把${ac.name}设置为${temp}度，需要现在执行吗？`,
        intent: 'device_control',
        needConfirm: true,
        action: { deviceId: ac.id, command: 'set_temperature', value: temp }
      };
    }
  }

  // ---- 兜底 ----

  return {
    reply: "我目前可以控制的设备已在面板中列出。你可以试试说'好热'、'好冷'、'打开空调'等。",
    intent: 'unknown',
    needConfirm: false,
    action: null
  };
}

module.exports = { decideByRules };
