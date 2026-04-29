// AI 决策模块
// V1 阶段使用规则模拟 AI 判断用户意图

const { getDevices, getEnvironment } = require('./devices');

// 关键词匹配函数
function containsKeywords(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

/**
 * AI 决策核心函数
 * @param {string} message - 用户输入
 * @returns {Object} AI 决策结果
 */
function decide(message) {
  const devices = getDevices();
  const env = getEnvironment();

  // 1. 降温需求判断
  // 输入包含"热"、"闷"等关键词，且温度>=28度
  if (containsKeywords(message, ['热', '好热', '太热', '闷', '闷热', '不舒服'])) {
    if (env.temperature >= 28) {
      // 找到卧室空调
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

  // 2. 偏冷需求判断
  // 输入包含"冷"等关键词
  if (containsKeywords(message, ['冷', '好冷', '太冷'])) {
    const ac = devices.find(d => d.id === 'bedroom_ac');
    // 只有空调开启时才建议关闭
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

  // 3. 能力查询
  if (containsKeywords(message, ['你能控制什么', '有哪些设备', '你会干什么', '能控制哪些家电'])) {
    return {
      reply: "我目前可以控制卧室空调、客厅风扇和客厅灯。卧室空调支持开关和设置温度，客厅风扇支持开关，客厅灯支持开关。",
      intent: "capability_query",
      needConfirm: false,
      action: null
    };
  }

  // 4. 明确控制指令 - 打开空调
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

  // 5. 明确控制指令 - 关闭空调
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

  // 6. 打开风扇
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

  // 7. 打开灯
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

  // 默认回复 - 无法理解用户意图
  return {
    reply: "我目前可以控制卧室空调、客厅风扇和客厅灯。你可以试试说'好热'、'好冷'、'打开空调'等。",
    intent: "unknown",
    needConfirm: false,
    action: null
  };
}

module.exports = {
  decide
};