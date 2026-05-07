// 设备数据模块
// 定义已配对的设备和初始状态

// 当前阶段使用虚拟设备模拟未来的红外家电
const devices = [
  {
    id: "bedroom_ac",
    name: "卧室空调",
    type: "air_conditioner",
    location: "卧室",
    controlType: "ir",
    status: "off",
    assumedState: "off",
    targetTemperature: null,
    lastCommand: null,
    stateConfidence: "assumed",
    paired: true,
    actions: ["turn_on", "turn_off", "set_temperature"],
    capabilities: {
      power: true,
      temperature: {
        min: 16,
        max: 30,
        step: 1,
        unit: "celsius"
      },
      mode: ["cool", "heat", "dry", "fan"],
      fanSpeed: ["low", "medium", "high", "auto"]
    },
    irProfile: {
      brand: "unknown",
      model: "unknown",
      learnedCodes: {}
    }
  },
  {
    id: "livingroom_fan",
    name: "客厅风扇",
    type: "fan",
    location: "客厅",
    controlType: "ir",
    status: "off",
    assumedState: "off",
    lastCommand: null,
    stateConfidence: "assumed",
    paired: true,
    actions: ["turn_on", "turn_off"],
    capabilities: {
      power: true,
      fanSpeed: ["low", "medium", "high"]
    },
    irProfile: {
      brand: "unknown",
      model: "unknown",
      learnedCodes: {}
    }
  },
  {
    id: "livingroom_light",
    name: "客厅灯",
    type: "light",
    location: "客厅",
    controlType: "ir",
    status: "off",
    assumedState: "off",
    lastCommand: null,
    stateConfidence: "assumed",
    paired: true,
    actions: ["turn_on", "turn_off"],
    capabilities: {
      power: true
    },
    irProfile: {
      brand: "unknown",
      model: "unknown",
      learnedCodes: {}
    }
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

// 更新设备字段
function updateDevice(deviceId, updates) {
  const device = devices.find(d => d.id === deviceId);
  if (device) {
    Object.assign(device, updates);
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
  updateDevice,
  getEnvironment
};
