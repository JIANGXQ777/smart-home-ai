const { getDevice, updateDevice } = require('./devices');
const { isEsp32Configured, sendIrCommand } = require('./esp32Client');
const { getCode } = require('./irCodeStore');
const { getAppMode } = require('./services/configService');
const { recordCommandEvent } = require('./commandEventStore');

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

function buildSuccessMessage(device, command, value, simulated) {
  const suffix = simulated ? '' : '指令已发送（状态为推测）';
  if (command === 'turn_on') {
    return simulated ? `${device.name}已打开` : `${device.name}开启${suffix}`;
  }

  if (command === 'turn_off') {
    return simulated ? `${device.name}已关闭` : `${device.name}关闭${suffix}`;
  }

  if (command === 'set_temperature') {
    return simulated
      ? `${device.name}温度已设置为${value}度`
      : `${device.name}${value}度${suffix}`;
  }

  return `${device.name}执行成功`;
}

function getLearnedCode(device, command, value) {
  return getCode(device.id, command, value);
}

async function execute(deviceId, command, value) {
  const device = getDevice(deviceId);
  const finish = (result, details = {}) => {
    try {
      recordCommandEvent({
        deviceId,
        deviceName: device ? device.name : null,
        command: command || 'unknown',
        value,
        source: details.source || 'validation',
        success: result.success,
        message: result.message,
        stateConfidence: details.stateConfidence || null
      });
    } catch (error) {
      console.error(`记录设备操作失败：${error.message}`);
    }
    return result;
  };

  if (!device) {
    return finish({
      success: false,
      message: '设备不存在'
    });
  }

  if (!device.actions.includes(command)) {
    return finish({
      success: false,
      message: '设备不支持该动作'
    });
  }

  const valueError = validateValueIfNeeded(device, command, value);
  if (valueError) {
    return finish({
      success: false,
      message: valueError
    });
  }

  const appMode = getAppMode();
  const simulated = appMode === 'demo' || (appMode === 'hybrid' && process.env.ESP32_ENABLED === 'false');

  if (device.controlType === 'ir' && !simulated) {
    const learnedCode = getLearnedCode(device, command, value);
    if (!learnedCode) {
      const target = command === 'set_temperature' ? `${value}度` : command;
      return finish({
        success: false,
        message: `${device.name} 还没有录入 ${target} 的红外码`
      }, { source: 'esp32_ir_bridge' });
    }

    if (!isEsp32Configured()) {
      return finish({
        success: false,
        message: 'ESP32 未配置，请确认 WebSocket 或串口连接设置'
      }, { source: 'esp32_ir_bridge' });
    }

    try {
      await sendIrCommand(learnedCode, { command, value });
    } catch (error) {
      return finish({
        success: false,
        message: `ESP32 执行失败：${error.message}`
      }, { source: 'esp32_ir_bridge' });
    }
  }

  const nextStatus = getNextStatus(command, device.status);
  const updates = {
    lastCommand: {
      command,
      value: value === undefined ? null : value,
      source: device.controlType === 'ir' && !simulated ? 'esp32_ir_bridge' : 'virtual_executor',
      executedAt: new Date().toISOString()
    },
    stateConfidence: device.controlType === 'ir' && !simulated ? 'assumed' : 'simulated'
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
    return finish({
      success: false,
      message: '状态更新失败'
    }, {
      source: updates.lastCommand.source,
      stateConfidence: updates.stateConfidence
    });
  }

  return finish({
    success: true,
    message: buildSuccessMessage(device, command, value, simulated),
    deviceId,
    status: nextStatus,
    assumedState: nextStatus,
    targetTemperature: command === 'set_temperature' ? value : device.targetTemperature,
    stateConfidence: updates.stateConfidence
  }, {
    source: updates.lastCommand.source,
    stateConfidence: updates.stateConfidence
  });
}

module.exports = {
  execute
};
