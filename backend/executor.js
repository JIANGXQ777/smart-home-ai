// 设备执行模块
// 负责执行设备动作，返回执行结果

const { getDevice, updateDevice } = require('./devices');

/**
 * 执行设备动作
 * @param {string} deviceId - 设备ID
 * @param {string} command - 命令（turn_on, turn_off, set_temperature）
 * @param {number} [value] - 参数化动作的值，例如空调目标温度
 * @returns {Object} 执行结果
 */
function execute(deviceId, command, value) {
  // 1. 校验设备是否存在
  const device = getDevice(deviceId);
  if (!device) {
    return {
      success: false,
      message: "设备不存在"
    };
  }

  // 2. 校验命令是否支持
  if (!device.actions.includes(command)) {
    return {
      success: false,
      message: "设备不支持该动作"
    };
  }

  // 3. 执行命令
  let newStatus = device.status;
  let updates = {};
  let message = "";

  switch (command) {
    case "turn_on":
      newStatus = "on";
      message = `${device.name}已打开`;
      break;
    case "turn_off":
      newStatus = "off";
      message = `${device.name}已关闭`;
      break;
    case "set_temperature":
      if (!Number.isInteger(value) || value < 16 || value > 30) {
        return {
          success: false,
          message: "空调温度只能设置为16到30度之间的整数"
        };
      }
      newStatus = "on";
      updates.targetTemperature = value;
      message = `${device.name}温度已设置为${value}度`;
      break;
    default:
      return {
        success: false,
        message: "未知的命令"
      };
  }

  // 4. 更新设备状态
  const updated = updateDevice(deviceId, {
    status: newStatus,
    ...updates
  });
  if (!updated) {
    return {
      success: false,
      message: "状态更新失败"
    };
  }

  // 5. 返回成功结果
  return {
    success: true,
    message: message,
    deviceId: deviceId,
    status: newStatus,
    targetTemperature: device.targetTemperature
  };
}

module.exports = {
  execute
};
