// AI 决策模块
// V2 阶段支持大模型决策，未启用模型时保留 V1 规则模式

require('dotenv').config({ quiet: true });

const { getDevices, getEnvironment } = require('./devices');
const { callLlmDecision, getConfig } = require('./llmClient');
const { validateDecision } = require('./decisionValidator');
const { decideByRules } = require('./ruleAgent');

function safeNoActionReply() {
  return {
    reply: "我暂时无法安全判断要执行的设备动作。你可以换一种更明确的说法，例如'打开卧室空调'或'打开客厅灯'。",
    intent: "llm_unavailable",
    needConfirm: false,
    action: null
  };
}

async function decide(message) {
  const config = getConfig();

  if (!config.enabled) {
    return decideByRules(message);
  }

  const devices = getDevices();
  const environment = getEnvironment();

  try {
    const modelDecision = await callLlmDecision({
      message,
      environment,
      devices
    });

    const validation = validateDecision(modelDecision, devices);
    if (!validation.valid) {
      console.log(`LLM decision rejected: ${validation.reason}`);
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
