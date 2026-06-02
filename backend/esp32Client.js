const serialClient = require('./serialClient');

const HARDWARE_ENABLED = process.env.ESP32_ENABLED !== 'false';

function isEsp32Configured() {
  return HARDWARE_ENABLED && serialClient.isSerialConfigured();
}

function getEsp32ConnectionTargets() {
  return {
    mode: 'serial',
    ...serialClient.getConnectionTargets()
  };
}

function getHardwareHealth(options) {
  return serialClient.getHardwareHealth(options);
}

function sendIrCommand(commandProfile) {
  return serialClient.sendIrCommand(commandProfile);
}

module.exports = {
  isEsp32Configured,
  getEsp32ConnectionTargets,
  getHardwareHealth,
  sendIrCommand
};
