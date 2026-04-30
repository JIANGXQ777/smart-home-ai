// 大模型决策结果校验模块
// 只允许模型返回已配对设备和设备支持的动作

function invalid(reason) {
  return {
    valid: false,
    reason
  };
}

function validateDecision(decision, devices) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    return invalid('decision must be an object');
  }

  if (typeof decision.reply !== 'string' || decision.reply.trim() === '') {
    return invalid('reply must be a non-empty string');
  }

  if (typeof decision.intent !== 'string' || decision.intent.trim() === '') {
    return invalid('intent must be a non-empty string');
  }

  if (typeof decision.needConfirm !== 'boolean') {
    return invalid('needConfirm must be a boolean');
  }

  if (!decision.needConfirm) {
    if (decision.action !== null) {
      return invalid('action must be null when needConfirm is false');
    }

    return {
      valid: true,
      decision: {
        reply: decision.reply.trim(),
        intent: decision.intent.trim(),
        needConfirm: false,
        action: null
      }
    };
  }

  if (!decision.action || typeof decision.action !== 'object' || Array.isArray(decision.action)) {
    return invalid('action must be an object when needConfirm is true');
  }

  const { deviceId, command } = decision.action;
  if (typeof deviceId !== 'string' || typeof command !== 'string') {
    return invalid('action.deviceId and action.command must be strings');
  }

  const device = devices.find(item => item.id === deviceId);
  if (!device || !device.paired) {
    return invalid('deviceId must reference a paired device');
  }

  if (!device.actions.includes(command)) {
    return invalid('command must be supported by the device');
  }

  return {
    valid: true,
    decision: {
      reply: decision.reply.trim(),
      intent: decision.intent.trim(),
      needConfirm: true,
      action: {
        deviceId,
        command
      }
    }
  };
}

module.exports = {
  validateDecision
};
