require('dotenv').config({ quiet: true });

const { getDevices, getEnvironment } = require('./devices');
const { callLlmDecision, getConfig } = require('./llmClient');
const { validateDecision } = require('./decisionValidator');
const { decideByRules } = require('./ruleAgent');
const { getHardwareHealth, isEsp32Configured } = require('./esp32Client');

function safeNoActionReply() {
  return {
    reply: '我暂时无法安全判断要执行的设备动作。你可以换一种更明确的说法，例如“打开卧室空调”或“打开客厅灯”。',
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

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseTemperatureCommand(message) {
  const match = message.match(/(?:空调|温度|设为|设置为|设置|调到|调为|调整为|改成)\D*(\d{2})\s*度?/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function findBedroomAc(devices) {
  return devices.find((device) => device.id === 'bedroom_ac');
}

async function getHardwareAvailability() {
  if (!isEsp32Configured()) {
    return {
      configured: false,
      online: false
    };
  }

  try {
    await getHardwareHealth();
    return {
      configured: true,
      online: true
    };
  } catch (error) {
    return {
      configured: true,
      online: false
    };
  }
}

function buildHardwareOfflineReply(deviceName, capabilitiesText) {
  const suffix = capabilitiesText ? `，支持${capabilitiesText}` : '';
  return `${deviceName}${suffix}，但当前硬件未连接，暂时不能执行真实控制。等硬件连接后，我就可以帮你操作。`;
}

function decideSmallTalk(message) {
  const normalized = message.trim();
  const isGreeting = containsAny(normalized, ['你好', '您好', 'hello', 'hi', '嗨']) &&
    normalized.length <= 12;

  if (!isGreeting) {
    return null;
  }

  return {
    reply: '你好，我在。你可以问我设备能力，也可以直接说“只打开空调”或“关闭空调”。',
    intent: 'general_chat',
    needConfirm: false,
    action: null
  };
}

function decideAmbiguousControlQuestion(message, hardwareAvailability) {
  const asksCanOpen = containsAny(message, ['能不能打开', '可以打开吗', '能打开吗', '能不能关', '可以关吗']);

  if (!asksCanOpen) {
    return null;
  }

  if (!hardwareAvailability.online) {
    return {
      reply: '我需要知道你想控制哪个设备，而且当前硬件未连接，暂时不能执行真实控制。你可以说“只打开空调”或“关闭客厅灯”，硬件连接后我再帮你执行。',
      intent: 'device_unavailable',
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: '可以帮你控制设备，但我需要知道具体是哪一个。你可以说“只打开空调”“关闭空调”或“打开客厅灯”。',
    intent: 'clarification_needed',
    needConfirm: false,
    action: null
  };
}

function decideCapabilityQuestion(message, devices, hardwareAvailability) {
  const asksGeneralCapability = containsAny(message, [
    '你能控制什么',
    '有哪些设备',
    '你会干什么',
    '能控制哪些家电'
  ]);

  if (asksGeneralCapability) {
    if (!hardwareAvailability.online) {
      return {
        reply: '我已经识别到卧室空调、客厅风扇和客厅灯这些设备能力，但当前硬件未连接，所以暂时只能介绍能力，不能执行真实控制。',
        intent: 'capability_query',
        needConfirm: false,
        action: null
      };
    }

    return {
      reply: '我目前可以控制卧室空调、客厅风扇和客厅灯。卧室空调支持开关和设置温度，客厅风扇支持开关，客厅灯支持开关。',
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  const asksAcCapability = containsAny(message, [
    '能控制空调吗',
    '可以控制空调吗',
    '现在能控制空调吗',
    '空调能控制吗',
    '空调可以控制吗'
  ]);

  if (!asksAcCapability) {
    return null;
  }

  const ac = findBedroomAc(devices);
  if (!ac || !ac.paired) {
    return {
      reply: '当前还没有可控制的卧室空调设备。',
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  if (!hardwareAvailability.online) {
    return {
      reply: buildHardwareOfflineReply('卧室空调', '开关和设定温度'),
      intent: 'capability_query',
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: '可以。当前卧室空调支持开关和设定温度，你可以直接说“只打开空调”“关闭空调”或“把空调调到26度”。',
    intent: 'capability_query',
    needConfirm: false,
    action: null
  };
}

function decideExplicitPowerCommand(message, devices, hardwareAvailability) {
  const ac = findBedroomAc(devices);
  if (!ac || !ac.paired) {
    return null;
  }

  const asksOpenAc = containsAny(message, ['打开空调', '开空调', '开启空调']);
  const asksCloseAc = containsAny(message, ['关闭空调', '关空调', '关掉空调']);
  const asksTemperature = parseTemperatureCommand(message) !== null;

  if (asksTemperature) {
    return null;
  }

  if (asksOpenAc) {
    if (!hardwareAvailability.online) {
      return {
        reply: buildHardwareOfflineReply('卧室空调', '开关和设定温度'),
        intent: 'device_unavailable',
        needConfirm: false,
        action: null
      };
    }

    if (ac.status === 'on') {
      return {
        reply: '卧室空调已经处于开启状态，不需要重复打开。',
        intent: 'already_done',
        needConfirm: false,
        action: null
      };
    }

    return {
      reply: '好的，我可以帮你只打开卧室空调，不调整温度，需要我现在执行吗？',
      intent: 'direct_control',
      needConfirm: true,
      action: {
        deviceId: 'bedroom_ac',
        command: 'turn_on'
      }
    };
  }

  if (asksCloseAc) {
    if (!hardwareAvailability.online) {
      return {
        reply: buildHardwareOfflineReply('卧室空调', '开关和设定温度'),
        intent: 'device_unavailable',
        needConfirm: false,
        action: null
      };
    }

    if (ac.status === 'off') {
      return {
        reply: '卧室空调已经处于关闭状态，不需要重复关闭。',
        intent: 'already_done',
        needConfirm: false,
        action: null
      };
    }

    return {
      reply: '好的，我可以帮你只关闭卧室空调，需要我现在执行吗？',
      intent: 'direct_control',
      needConfirm: true,
      action: {
        deviceId: 'bedroom_ac',
        command: 'turn_off'
      }
    };
  }

  return null;
}

function decideDirectControl(message, devices, hardwareAvailability) {
  const explicitPowerDecision = decideExplicitPowerCommand(message, devices, hardwareAvailability);
  if (explicitPowerDecision) {
    return explicitPowerDecision;
  }

  const temperature = parseTemperatureCommand(message);
  if (temperature === null) {
    return null;
  }

  const ac = findBedroomAc(devices);
  if (!ac || !ac.paired || !ac.actions.includes('set_temperature')) {
    return unsupportedSpecificActionReply();
  }

  if (!hardwareAvailability.online) {
    return {
      reply: buildHardwareOfflineReply('卧室空调', '开关和设定温度'),
      intent: 'device_unavailable',
      needConfirm: false,
      action: null
    };
  }

  const temperatureCapability = ac.capabilities && ac.capabilities.temperature;
  const min = temperatureCapability ? temperatureCapability.min : 16;
  const max = temperatureCapability ? temperatureCapability.max : 30;
  const step = temperatureCapability ? temperatureCapability.step || 1 : 1;

  if (temperature < min || temperature > max || (temperature - min) % step !== 0) {
    return {
      reply: `空调温度只能设置为${min}到${max}度之间的整数。`,
      intent: 'unsupported_action',
      needConfirm: false,
      action: null
    };
  }

  if (ac.status === 'on' && ac.targetTemperature === temperature) {
    return {
      reply: `卧室空调已经设置为${temperature}度，不需要重复调整。`,
      intent: 'already_done',
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: `好的，我可以帮你把卧室空调设置为${temperature}度，需要现在执行吗？`,
    intent: 'device_control',
    needConfirm: true,
    action: {
      deviceId: 'bedroom_ac',
      command: 'set_temperature',
      value: temperature
    }
  };
}

async function decide(message) {
  const config = getConfig();

  if (!config.enabled) {
    return decideByRules(message);
  }

  const devices = getDevices();
  const environment = getEnvironment();
  const hardwareAvailability = await getHardwareAvailability();

  const smallTalkDecision = decideSmallTalk(message);
  if (smallTalkDecision) {
    return smallTalkDecision;
  }

  const ambiguousDecision = decideAmbiguousControlQuestion(message, hardwareAvailability);
  if (ambiguousDecision) {
    return ambiguousDecision;
  }

  const capabilityDecision = decideCapabilityQuestion(message, devices, hardwareAvailability);
  if (capabilityDecision) {
    return capabilityDecision;
  }

  const directDecision = decideDirectControl(message, devices, hardwareAvailability);
  if (directDecision) {
    return directDecision;
  }

  try {
    const modelDecision = await callLlmDecision({
      message,
      environment,
      devices
    });

    const validation = validateDecision(modelDecision, devices);
    if (!validation.valid) {
      console.log(`LLM decision rejected: ${validation.reason}`);
      if (validation.reason === 'command would not change device state') {
        return noStateChangeReply();
      }
      if (validation.reason === 'temperature value must be an integer from 16 to 30') {
        return unsupportedSpecificActionReply();
      }
      return safeNoActionReply();
    }

    return validation.decision;
  } catch (error) {
    console.log(`LLM decision failed: ${error.message}`);
    return safeNoActionReply();
  }
}

module.exports = {
  decide
};
