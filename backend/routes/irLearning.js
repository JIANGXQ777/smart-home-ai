const express = require('express');
const { getDevice, reloadDevices } = require('../devices');
const { isEsp32Configured, learnIrCode } = require('../esp32Client');
const { getAllCodes, setCode, deleteCode } = require('../irCodeStore');

const router = express.Router();

router.post('/start', async (req, res) => {
  if (!isEsp32Configured()) {
    return res.status(422).json({ success: false, message: 'ESP32 未配置，无法学习红外码。' });
  }
  try {
    return res.json({ success: true, learned: await learnIrCode() });
  } catch (error) {
    return res.json({ success: false, message: `学习失败: ${error.message}` });
  }
});

router.post('/save', (req, res) => {
  const { deviceId, command, value, learned } = req.body;
  if (!deviceId || !command) {
    return res.status(400).json({ success: false, message: '缺少 deviceId 或 command 字段。' });
  }
  if (!learned || !learned.protocol || !learned.code) {
    return res.status(400).json({ success: false, message: '缺少学习结果数据。' });
  }

  const device = getDevice(deviceId);
  if (!device) return res.status(404).json({ success: false, message: '设备不存在。' });
  if (device.controlType !== 'ir') {
    return res.status(400).json({ success: false, message: '该设备不支持红外控制。' });
  }
  if (!device.actions.includes(command)) {
    return res.status(400).json({ success: false, message: `设备不支持动作: ${command}` });
  }

  if (command === 'set_temperature') {
    const capability = device.capabilities && device.capabilities.temperature;
    const min = capability ? capability.min : 16;
    const max = capability ? capability.max : 30;
    if (!Number.isInteger(value) || value < min || value > max) {
      return res.status(400).json({ success: false, message: `温度必须是 ${min}-${max} 之间的整数。` });
    }
  }

  try {
    setCode(deviceId, command, learned, value);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  reloadDevices();

  const suffix = command === 'set_temperature' ? ` / ${value}度` : '';
  return res.json({ success: true, message: `已保存 ${device.name} / ${command}${suffix}` });
});

router.get('/codes', (req, res) => res.json(getAllCodes()));

router.delete('/codes', (req, res) => {
  const { deviceId, command, value, legacy = false } = req.body;
  const deleteLegacy = legacy === true;
  if (!deviceId || !command) {
    return res.status(400).json({ success: false, message: '缺少 deviceId 或 command 字段。' });
  }

  const hasTemperatureValue = value !== undefined && value !== null && value !== '' && Number.isInteger(Number(value));
  if (command === 'set_temperature' && !deleteLegacy && !hasTemperatureValue) {
    return res.status(400).json({ success: false, message: '删除温度红外码时必须指定具体温度。' });
  }

  const normalizedValue = command === 'set_temperature' && !deleteLegacy ? Number(value) : value;
  if (!deleteCode(deviceId, command, normalizedValue, { legacy: deleteLegacy })) {
    return res.status(404).json({ success: false, message: '未找到对应的红外码。' });
  }

  reloadDevices();
  return res.json({ success: true, message: '已删除。' });
});

module.exports = router;
