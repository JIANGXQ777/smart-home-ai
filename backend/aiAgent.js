require('dotenv').config({ quiet: true });

const { getDevices, getEnvironment } = require('./devices');
const { callLlmDecision, getConfig } = require('./llmClient');
const { validateDecision } = require('./decisionValidator');
const { decideByRules } = require('./ruleAgent');

function safeNoActionReply() {
  return {
    reply: "我暂时无法安全判断要执行的设备动作。你可以换一种更明确的说法，例如“打开卧室空调”或“打开客厅灯”。",
    intent: "llm_unavailable",
    needConfirm: false,
    action: null
  };
}

function noStateChangeReply() {
  return {
    reply: "这个设备已经处于目标状态，不需要重复执行同一个动作。",
    intent: "already_done",
    needConfirm: false,
    action: null
  };
}

function unsupportedSpecificActionReply() {
  return {
    reply: "当前设备暂不支持这个具体动作。请确认设备列表中已有的可用动作，或换一个可支持的控制方式。",
    intent: "unsupported_action",
    needConfirm: false,
    action: null
  };
}

function containsAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function parseTemperatureCommand(message) {
  const match = message.match(/(?:空调|温度|设为|设置为|设置|调到|调为|调整为|改成)\D*(\d{2})\s*度?/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isInteger(value)) {
    return null;
  }

  return value;
}

function findBedroomAc(devices) {
  return devices.find(device => device.id === 'bedroom_ac');
}

function decideExplicitPowerCommand(message, devices) {
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

function decideDirectControl(message, devices) {
  const explicitPowerDecision = decideExplicitPowerCommand(message, devices);
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

  const temperatureCapability = ac.capabilities && ac.capabilities.temperature;
  const min = temperatureCapability ? temperatureCapability.min : 16;
  const max = temperatureCapability ? temperatureCapability.max : 30;
  const step = temperatureCapability ? temperatureCapability.step || 1 : 1;

  if (temperature < min || temperature > max || (temperature - min) % step !== 0) {
    return {
      reply: `空调温度只能设置为${min}到${max}度之间的整数。`,
      intent: "unsupported_action",
      needConfirm: false,
      action: null
    };
  }

  if (ac.status === 'on' && ac.targetTemperature === temperature) {
    return {
      reply: `卧室空调已经设置为${temperature}度，不需要重复调整。`,
      intent: "already_done",
      needConfirm: false,
      action: null
    };
  }

  return {
    reply: `好的，我可以帮你把卧室空调设置为${temperature}度，需要现在执行吗？`,
    intent: "device_control",
    needConfirm: true,
    action: {
      deviceId: "bedroom_ac",
      command: "set_temperature",
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
  const directDecision = decideDirectControl(message, devices);

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
  } catch (err) {
    console.log(`LLM decision failed: ${err.message}`);
    return safeNoActionReply();
  }
}

module.exports = {
  decide
};
