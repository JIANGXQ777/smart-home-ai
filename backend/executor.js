// 设备执行模块
// 负责执行设备动作，返回执行结果

const { getDevice, updateDeviceStatus } = require('./devices');

/**
 * 执行设备动作
 * @param {string} deviceId - 设备ID
 * @param {string} command - 命令（turn_on, turn_off, set_temp_26）
 * @returns {Object} 执行结果
 */
function execute(deviceId, command) {
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
    case "set_temp_26":
      newStatus = "on";
      message = `${device.name}温度已设置为26度`;
      break;
    default:
      return {
        success: false,
        message: "未知的命令"
      };
  }

  // 4. 更新设备状态
  const updated = updateDeviceStatus(deviceId, newStatus);
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
    status: newStatus
  };
}

module.exports = {
  execute
};