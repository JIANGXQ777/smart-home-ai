require('dotenv').config({ quiet: true });

const { getDevices, getEnvironment } = require('./devices');
const { callLlmDecision, getConfig } = require('./llmClient');
const { validateDecision } = require('./decisionValidator');
const { decideByRules } = require('./ruleAgent');
const { getHardwareHealth, isEsp32Configured } = require('./esp32Client');
const { getCode } = require('./irCodeStore');
const { getAppMode } = require('./services/configService');

// ---- 工具函数 ----

function safeNoActionReply() {
  return {
    reply: '我暂时无法安全判断要执行的设备动作。你可以换一种更明确的说法，例如设备名称或"打开空调"。',
    intent: 'llm_unavailable',
    needConfirm: false,
    action: null
  };
}

function noStateChangeReply() {
  return {
    reply: '这个设备已经处于目标状态，不需要重复执行同一个动作。',
    intent: 'already_done',
    needConfirm: false,
    action: null
  };
}

function unsupportedSpecificActionReply() {
  return {
    reply: '当前设备暂不支持这个具体动作。请确认设备列表中已有的可用动作，或换一个可支持的控制方式。',
    intent: 'unsupported_action',
    needConfirm: false,
    action: null
  };
}

function missingIrCodeReply(decision, devices) {
  const device = devices.find((item) => item.id === decision.action.deviceId);
  const action = decision.action.command === 'set_temperature'
    ? `${decision.action.value}度`
    : formatActionLabel(decision.action.command);
  return {
    reply: `${device ? device.name : '该设备'}还没有录入${action}对应的红外码，请先完成红外学习。`,
    intent: 'ir_code_missing',
    needConfirm: false,
    action: null
  };
}

function finalizeDecision(candidate, devices, hardwareAvailability) {
  const validation = validateDecision(candidate, devices);
  if (!validation.valid) {
    console.log(`Decision rejected: ${validation.reason}`);
    if (validation.reason === 'command would not change device state') return noStateChangeReply();
    if (validation.reason.startsWith('temperature value')) return unsupportedSpecificActionReply();
    return safeNoActionReply();
  }

  const decision = validation.decision;
  if (!decision.action) return decision;

  if (!hardwareAvailability.online) {
    return {
      reply: '当前硬件未连接，暂时不能执行真实控制。请先检查 ESP32 连接。',
      intent: 'hardware_offline',
      needConfirm: false,
      action: null
    };
  }

  const device = devices.find((item) => item.id === decision.action.deviceId);
  if (!hardwareAvailability.simulated && device && device.controlType === 'ir' &&
      !getCode(device.id, decision.action.command, decision.action.value)) {
    return missingIrCodeReply(decision, devices);
  }

  return decision;
}

function formatActionLabel(action) {
  const map = { turn_on: '开关', turn_off: '开关', set_temperature: '调温' };
  return map[action] || action;
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseTemperatureCommand(message) {
  const match = message.match(/(?:空调|温度|设为|设置为|设置|调到|调为|调整为|改成)\D*(\d{2})\s*度?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

// ---- 设备发现（动态匹配） ----

const TYPE_KEYWORDS = {
  air_conditioner: ['空调'],
  fan: ['风扇'],
  light: ['灯', '灯光'],
  tv: ['电视']
};

const POWER_ON_KEYWORDS = ['打开', '开', '开启', '启动'];
const POWER_OFF_KEYWORDS = ['关闭', '关', '关掉', '停掉', '停止'];

// 从消息中检测用户想操作的设备类型和电源意图
// 返回 { type, wantOn, wantOff } 或 null
function detectIntent(message) {
  const wantOn = containsAny(message, POWER_ON_KEYWORDS);
  const wantOff = containsAny(message, POWER_OFF_KEYWORDS);

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (containsAny(message, keywords)) {
      return { type, wantOn, wantOff };
    }
  }
  return null;
}

// 从候选设备列表中通过消息中的名称/位置提示缩小范围
function pickDevice(message, candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 按名称直接匹配
  for (const d of candidates) {
    if (message.includes(d.name)) return d;
  }
  // 按位置匹配
  for (const d of candidates) {
    if (d.location && message.includes(d.location)) return d;
  }
  // 无法确定 → 返回 null（交给 LLM 或列出选项）
  return null;
}

// 获取设备的能力文本描述
function describeDevice(device) {
  const actions = (device.actions || []).map(formatActionLabel);
  return `${device.name}（${actions.join('、')}）`;
}

// ---- 硬件状态 ----

async function getHardwareAvailability() {
  const appMode = getAppMode();
  if (appMode === 'demo' || (appMode === 'hybrid' && process.env.ESP32_ENABLED === 'false')) {
    return { configured: false, online: true, simulated: true };
  }
  if (!isEsp32Configured()) {
    return { configured: false, online: false, simulated: false };
  }
  try {
    await getHardwareHealth();
    return { configured: true, online: true, simulated: false };
  } catch (error) {
    return { configured: true, online: false, simulated: false };
  }
}

function buildHardwareOfflineReply(deviceName, capabilitiesText) {
  const suffix = capabilitiesText ? `，支持${capabilitiesText}` : '';
  return `${deviceName}${suffix}，但当前硬件未连接，暂时不能执行真实控制。等硬件连接后，我就可以帮你操作。`;
}

// ---- 闲聊 ----

function decideSmallTalk(message) {
  const normalized = message.trim();
  const isGreeting = containsAny(normalized, ['你好', '您好', 'hello', 'hi', '嗨'])
    && normalized.length <= 12;
  if (!isGreeting) return null;

  return {
    reply: '你好，我在。你可以问我设备能力，也可以直接说"只打开空调"或"关闭空调"。',
    intent: 'general_chat',
    needConfirm: false,
    action: null
  };
}

// ---- 模糊控制问题 ----

function decideAmbiguousControlQuestion(message, hardwareAvailability) {
  const asksCanOpen = containsAny(message, ['能不能打开', '可以打开吗', '能打开吗', '能不能关', '可以关吗']);
  if (!asksCanOpen) return null;

  if (!hardwareAvailability.online) {
    return {
      reply: '我需要知道你想控制哪个设备，而且当前硬件未连接，暂时不能执行真实控制。你可以说"只打开空调"或看面板中已配对的设备。',
      intent: 'device_unavailable',
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: '可以帮你控制设备，但我需要知道具体是哪一个。你可以直接说设备名称或"打开空调"等。',
    intent: 'clarification_needed',
    needConfirm: false,
    action: null
  };
}

// ---- 能力查询（动态） ----

function decideCapabilityQuestion(message, devices, hardwareAvailability) {
  // 通用能力查询
  const asksGeneral = containsAny(message, [
    '你能控制什么', '有哪些设备', '你会干什么', '能控制哪些家电'
  ]);
  if (asksGeneral) {
    const deviceList = devices
      .filter((d) => d.paired)
      .map(describeDevice)
      .join('，');

    if (!hardwareAvailability.online) {
      return {
        reply: `我已经识别到${deviceList}这些设备能力，但当前硬件未连接，所以暂时只能介绍能力，不能执行真实控制。`,
        intent: 'capability_query',
        needConfirm: false,
        action: null
      };
    }

    return {
      reply: `我目前可以控制${deviceList}。`,
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  // 特定类型能力查询："能控制空调吗"
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    const asksType = containsAny(message, keywords)
      && containsAny(message, ['能控制', '可以控制', '现在能控制', '能控制吗', '可以控制吗']);
    if (!asksType) continue;

    const matches = devices.filter((d) => d.type === type && d.paired);
    if (matches.length === 0) {
      return {
        reply: `当前还没有已配对的${keywords[0]}设备。`,
        intent: 'capability_query',
        needConfirm: false,
        action: null
      };
    }

    if (!hardwareAvailability.online) {
      return {
        reply: buildHardwareOfflineReply(matches[0].name, matches[0].actions.map(formatActionLabel).join('和')),
        intent: 'capability_query',
        needConfirm: false,
        action: null
      };
    }

    const parts = matches.map(describeDevice);
    return {
      reply: `可以。${parts.join('；')}。你可以直接说"打开${matches[0].name}"等。`,
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  return null;
}

// ---- 开关命令（动态） ----

function buildMultiDeviceChoiceReply(candidates, actionName) {
  const list = candidates.map((d) => `・${d.name}`).join('\n');
  return {
    reply: `有多个设备可以${actionName}，请指定具体哪一个：\n${list}`,
    intent: 'clarification_needed',
    needConfirm: false,
    action: null
  };
}

function decideExplicitPowerCommand(message, devices, hardwareAvailability) {
  const intent = detectIntent(message);
  if (!intent) return null;
  if (!intent.wantOn && !intent.wantOff) return null;

  // 温度命令跳过（留给 decideDirectControl）
  if (parseTemperatureCommand(message) !== null) return null;

  const candidates = devices.filter(
    (d) => d.type === intent.type && d.paired && d.controlType === 'ir'
  );
  if (candidates.length === 0) return null;

  const command = intent.wantOn ? 'turn_on' : 'turn_off';
  const targetStatus = intent.wantOn ? 'on' : 'off';

  // 只保留支持该命令的设备
  const capable = candidates.filter((d) => d.actions.includes(command));
  if (capable.length === 0) return null;

  const device = pickDevice(message, capable);

  // 用户没指定具体设备，且有多台
  if (!device && capable.length > 1) {
    return buildMultiDeviceChoiceReply(capable, intent.wantOn ? '打开' : '关闭');
  }

  // 只有一台或用户已指定
  const target = device || capable[0];

  if (!hardwareAvailability.online) {
    return {
      reply: buildHardwareOfflineReply(target.name, target.actions.map(formatActionLabel).join('和')),
      intent: 'device_unavailable',
      needConfirm: false,
      action: null
    };
  }

  if (target.status === targetStatus) {
    return {
      reply: `${target.name}已经处于${targetStatus === 'on' ? '开启' : '关闭'}状态，不需要重复${command === 'turn_on' ? '打开' : '关闭'}。`,
      intent: 'already_done',
      needConfirm: false,
      action: null
    };
  }

  const actionWord = intent.wantOn ? '打开' : '关闭';
  return {
    reply: `好的，我可以帮你${actionWord}${target.name}，需要我现在执行吗？`,
    intent: 'direct_control',
    needConfirm: true,
    action: { deviceId: target.id, command }
  };
}

// ---- 温度命令（动态） ----

function decideDirectControl(message, devices, hardwareAvailability) {
  // 先走开关命令
  const powerDecision = decideExplicitPowerCommand(message, devices, hardwareAvailability);
  if (powerDecision) return powerDecision;

  const temperature = parseTemperatureCommand(message);
  if (temperature === null) return null;

  // 找所有支持 set_temperature 的空调类设备
  const candidates = devices.filter(
    (d) => d.type === 'air_conditioner' && d.paired && d.controlType === 'ir' && d.actions.includes('set_temperature')
  );
  if (candidates.length === 0) return unsupportedSpecificActionReply();

  const device = pickDevice(message, candidates);

  if (!device && candidates.length > 1) {
    return buildMultiDeviceChoiceReply(candidates, '调温度');
  }

  const target = device || candidates[0];

  const cap = target.capabilities && target.capabilities.temperature;
  const min = cap ? cap.min : 16;
  const max = cap ? cap.max : 30;
  const step = cap ? cap.step || 1 : 1;

  if (temperature < min || temperature > max || (temperature - min) % step !== 0) {
    return {
      reply: `${target.name}温度只能设置为${min}到${max}度之间的整数。`,
      intent: 'unsupported_action',
      needConfirm: false,
      action: null
    };
  }

  if (!hardwareAvailability.online) {
    return {
      reply: buildHardwareOfflineReply(target.name, '开关和设定温度'),
      intent: 'device_unavailable',
      needConfirm: false,
      action: null
    };
  }

  if (target.status === 'on' && target.targetTemperature === temperature) {
    return {
      reply: `${target.name}已经设置为${temperature}度，不需要重复调整。`,
      intent: 'already_done',
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: `好的，我可以帮你把${target.name}设置为${temperature}度，需要现在执行吗？`,
    intent: 'device_control',
    needConfirm: true,
    action: { deviceId: target.id, command: 'set_temperature', value: temperature }
  };
}

// ---- 主入口 ----

async function decide(message) {
  const config = getConfig();
  const devices = getDevices();
  const environment = getEnvironment();
  const hardwareAvailability = await getHardwareAvailability();

  // 规则链：闲聊 → 模糊问题 → 能力查询 → 开关/温度命令 → LLM 兜底
  const stages = [
    () => decideSmallTalk(message),
    () => decideAmbiguousControlQuestion(message, hardwareAvailability),
    () => decideCapabilityQuestion(message, devices, hardwareAvailability),
    () => decideDirectControl(message, devices, hardwareAvailability)
  ];

  for (const stage of stages) {
    const result = stage();
    if (result) return finalizeDecision(result, devices, hardwareAvailability);
  }

  if (!config.enabled) {
    return finalizeDecision(decideByRules(message), devices, hardwareAvailability);
  }

  // 规则未命中，走 LLM
  try {
    const modelDecision = await callLlmDecision({
      message,
      environment,
      devices,
      hardware: hardwareAvailability
    });

    return finalizeDecision(modelDecision, devices, hardwareAvailability);
  } catch (error) {
    console.log(`LLM decision failed: ${error.message}`);
    return safeNoActionReply();
  }
}

module.exports = { decide };
