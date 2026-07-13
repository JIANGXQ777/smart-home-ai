const {
  getAll: getAllDeviceDefs,
  getAllRuntimeStates,
  load: loadDeviceDefs,
  saveRuntimeState
} = require('./deviceStore');
const { load: loadIrCodes, mergeIntoDevices } = require('./irCodeStore');

function runtimeDefaults() {
  return {
    status: 'unknown',
    assumedState: 'unknown',
    targetTemperature: null,
    lastCommand: null,
    stateConfidence: 'unknown',
    runtimeUpdatedAt: null
  };
}

function loadDevicesSnapshot() {
  loadDeviceDefs();
  loadIrCodes();
  const runtimeMap = new Map(getAllRuntimeStates().map((state) => [state.deviceId, state]));
  const snapshot = getAllDeviceDefs().map((device) => {
    const runtime = runtimeMap.get(device.id) || runtimeDefaults();
    return {
      ...device,
      status: runtime.status,
      assumedState: runtime.assumedState,
      targetTemperature: runtime.targetTemperature,
      lastCommand: runtime.lastCommand,
      stateConfidence: runtime.stateConfidence,
      runtimeUpdatedAt: runtime.updatedAt || null
    };
  });
  mergeIntoDevices(snapshot);
  return snapshot;
}

const devices = loadDevicesSnapshot();
console.log(`已从 SQLite 加载 ${devices.length} 台设备`);

function reloadDevices() {
  const snapshot = loadDevicesSnapshot();
  devices.splice(0, devices.length, ...snapshot);
  return devices;
}

const environment = {
  temperature: 29,
  humidity: 72,
  time: '22:30'
};

function getDevices() {
  return devices;
}

function getDevice(deviceId) {
  return devices.find((device) => device.id === deviceId);
}

function updateDeviceStatus(deviceId, newStatus) {
  return updateDevice(deviceId, { status: newStatus, assumedState: newStatus });
}

function updateDevice(deviceId, updates) {
  const device = getDevice(deviceId);
  if (!device) return false;
  const runtimeFields = [
    'status',
    'assumedState',
    'targetTemperature',
    'lastCommand',
    'stateConfidence'
  ];
  const runtimeUpdates = {};
  for (const field of runtimeFields) {
    if (updates[field] !== undefined) runtimeUpdates[field] = updates[field];
  }
  if (!saveRuntimeState(deviceId, runtimeUpdates)) return false;
  Object.assign(device, runtimeUpdates, { runtimeUpdatedAt: new Date().toISOString() });
  return true;
}

function getEnvironment() {
  return environment;
}

module.exports = {
  devices,
  environment,
  getDevice,
  getDevices,
  getEnvironment,
  reloadDevices,
  updateDevice,
  updateDeviceStatus
};
