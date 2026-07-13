const express = require('express');
const { execute } = require('../executor');

const router = express.Router();

router.post('/', async (req, res) => {
  const { deviceId, command, value } = req.body;
  if (!deviceId || !command) {
    return res.status(400).json({ success: false, message: '缺少 deviceId 或 command 字段。' });
  }
  try {
    return res.json(await execute(deviceId, command, value));
  } catch (error) {
    console.error('设备执行失败:', error);
    return res.status(500).json({ success: false, message: '设备执行服务暂时不可用。' });
  }
});

module.exports = router;
