const { getDevice, updateDevice } = require('./devices');
const { isEsp32Configured, sendIrCommand } = require('./esp32Client');

function getTemperatureCapability(device) {
  return device.capabilities && device.capabilities.temperature;
}

function validateValueIfNeeded(device, command, value) {
  if (command !== 'set_temperature') {
    return null;
  }

  const temperatureCapability = getTemperatureCapability(device);
  const min = temperatureCapability ? temperatureCapability.min : 16;
  const max = temperatureCapability ? temperatureCapability.max : 30;
  const step = temperatureCapability ? temperatureCapability.step || 1 : 1;

  if (!Number.isInteger(value) || value < min || value > max || (value - min) % step !== 0) {
    return `空调温度只能设置为${min}到${max}度之间的整数`;
  }

  return null;
}

function getNextStatus(command, currentStatus) {
  if (command === 'turn_on') {
    return 'on';
  }

  if (command === 'turn_off') {
    return 'off';
  }

  if (command === 'set_temperature') {
    return 'on';
  }

  return currentStatus;
}

function buildSuccessMessage(device, command, value) {
  if (command === 'turn_on') {
    return `${device.name}已打开`;
  }

  if (command === 'turn_off') {
    return `${device.name}已关闭`;
  }

  if (command === 'set_temperature') {
    return `${device.name}温度已设置为${value}度`;
  }

  return `${device.name}执行成功`;
}

function getLearnedCode(device, command) {
  return device.irProfile && device.irProfile.learnedCodes && device.irProfile.learnedCodes[command];
}

async function execute(deviceId, command, value) {
  const device = getDevice(deviceId);
  if (!device) {
    return {
      success: false,
      message: '设备不存在'
    };
  }

  if (!device.actions.includes(command)) {
    return {
      success: false,
      message: '设备不支持该动作'
    };
  }

  const valueError = validateValueIfNeeded(device, command, value);
  if (valueError) {
    return {
      success: false,
      message: valueError
    };
  }

  if (device.controlType === 'ir') {
    const learnedCode = getLearnedCode(device, command);
    if (!learnedCode) {
      return {
        success: false,
        message: `${device.name} 还没有录入 ${command} 的红外码`
      };
    }

    if (!isEsp32Configured()) {
      return {
        success: false,
        message: 'ESP32 红外网关未配置，请设置 ESP32_BASE_URL'
      };
    }

    try {
      await sendIrCommand(learnedCode);
    } catch (error) {
      return {
        success: false,
        message: `ESP32 执行失败：${error.message}`
      };
    }
  }

  const nextStatus = getNextStatus(command, device.status);
  const updates = {
    lastCommand: {
      command,
      value: value === undefined ? null : value,
      source: device.controlType === 'ir' ? 'esp32_ir_bridge' : 'virtual_executor',
      executedAt: new Date().toISOString()
    },
    stateConfidence: device.controlType === 'ir' ? 'assumed' : 'reported'
  };

  if (command === 'set_temperature') {
    updates.targetTemperature = value;
  }

  const updated = updateDevice(deviceId, {
    status: nextStatus,
    assumedState: nextStatus,
    ...updates
  });

  if (!updated) {
    return {
      success: false,
      message: '状态更新失败'
    };
  }

  return {
    success: true,
    message: buildSuccessMessage(device, command, value),
    deviceId,
    status: nextStatus,
    assumedState: nextStatus,
    targetTemperature: command === 'set_temperature' ? value : device.targetTemperature,
    stateConfidence: updates.stateConfidence
  };
}

module.exports = {
  execute
};
