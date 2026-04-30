// V1 规则决策模块
// 用于未启用大模型时的本地开发和演示模式

const { getDevices, getEnvironment } = require('./devices');

function containsKeywords(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

function decideByRules(message) {
  const devices = getDevices();
  const env = getEnvironment();

  if (containsKeywords(message, ['热', '好热', '太热', '闷', '闷热', '不舒服'])) {
    if (env.temperature >= 28) {
      const ac = devices.find(d => d.id === 'bedroom_ac');
      if (ac && ac.paired) {
        return {
          reply: `当前室温${env.temperature}度，卧室空调处于关闭状态，建议打开卧室空调，需要我帮你打开吗？`,
          intent: "cooling",
          needConfirm: true,
          action: {
            deviceId: "bedroom_ac",
            command: "turn_on"
          }
        };
      }
    }
  }

  if (containsKeywords(message, ['冷', '好冷', '太冷'])) {
    const ac = devices.find(d => d.id === 'bedroom_ac');
    if (ac && ac.status === 'on') {
      return {
        reply: "如果你觉得冷，我可以帮你关闭卧室空调。",
        intent: "warming",
        needConfirm: true,
        action: {
          deviceId: "bedroom_ac",
          command: "turn_off"
        }
      };
    }
  }

  if (containsKeywords(message, ['你能控制什么', '有哪些设备', '你会干什么', '能控制哪些家电'])) {
    return {
      reply: "我目前可以控制卧室空调、客厅风扇和客厅灯。卧室空调支持开关和设置温度，客厅风扇支持开关，客厅灯支持开关。",
      intent: "capability_query",
      needConfirm: false,
      action: null
    };
  }

  if (containsKeywords(message, ['打开空调', '开空调'])) {
    const ac = devices.find(d => d.id === 'bedroom_ac');
    if (ac) {
      return {
        reply: "好的，我可以帮你打开卧室空调，需要现在执行吗？",
        intent: "direct_control",
        needConfirm: true,
        action: {
          deviceId: "bedroom_ac",
          command: "turn_on"
        }
      };
    }
  }

  if (containsKeywords(message, ['关闭空调', '关空调'])) {
    const ac = devices.find(d => d.id === 'bedroom_ac');
    if (ac && ac.status === 'on') {
      return {
        reply: "好的，我可以帮你关闭卧室空调，需要现在执行吗？",
        intent: "direct_control",
        needConfirm: true,
        action: {
          deviceId: "bedroom_ac",
          command: "turn_off"
        }
      };
    }
  }

  if (containsKeywords(message, ['打开风扇', '开风扇', '风扇'])) {
    const fan = devices.find(d => d.id === 'livingroom_fan');
    if (fan && fan.status === 'off') {
      return {
        reply: "好的，我可以帮你打开客厅风扇，需要现在执行吗？",
        intent: "direct_control",
        needConfirm: true,
        action: {
          deviceId: "livingroom_fan",
          command: "turn_on"
        }
      };
    }
  }

  if (containsKeywords(message, ['开灯', '打开灯'])) {
    const light = devices.find(d => d.id === 'livingroom_light');
    if (light && light.status === 'off') {
      return {
        reply: "好的，我可以帮你打开客厅灯，需要现在执行吗？",
        intent: "direct_control",
        needConfirm: true,
        action: {
          deviceId: "livingroom_light",
          command: "turn_on"
        }
      };
    }
  }

  return {
    reply: "我目前可以控制卧室空调、客厅风扇和客厅灯。你可以试试说'好热'、'好冷'、'打开空调'等。",
    intent: "unknown",
    needConfirm: false,
    action: null
  };
}

module.exports = {
  decideByRules
};
