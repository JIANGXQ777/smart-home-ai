// 设备数据模块
// 定义已配对的设备和初始状态

// V1 阶段固定设备列表
const devices = [
  {
    id: "bedroom_ac",
    name: "卧室空调",
    type: "air_conditioner",
    location: "卧室",
    status: "off",
    paired: true,
    actions: ["turn_on", "turn_off", "set_temp_26"]
  },
  {
    id: "livingroom_fan",
    name: "客厅风扇",
    type: "fan",
    location: "客厅",
    status: "off",
    paired: true,
    actions: ["turn_on", "turn_off"]
  },
  {
    id: "livingroom_light",
    name: "客厅灯",
    type: "light",
    location: "客厅",
    status: "off",
    paired: true,
    actions: ["turn_on", "turn_off"]
  }
];

// 模拟环境信息
const environment = {
  temperature: 29,    // 温度
  humidity: 72,       // 湿度
  time: "22:30",      // 当前时间
  presence: true,     // 是否有人
  scene: "bedroom"    // 当前场景
};

// 获取所有设备
function getDevices() {
  return devices;
}

// 获取单个设备
function getDevice(deviceId) {
  return devices.find(d => d.id === deviceId);
}

// 更新设备状态
function updateDeviceStatus(deviceId, newStatus) {
  const device = devices.find(d => d.id === deviceId);
  if (device) {
    device.status = newStatus;
    return true;
  }
  return false;
}

// 获取环境信息
function getEnvironment() {
  return environment;
}

module.exports = {
  devices,
  environment,
  getDevices,
  getDevice,
  updateDeviceStatus,
  getEnvironment
};