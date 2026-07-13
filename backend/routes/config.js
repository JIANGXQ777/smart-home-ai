const express = require('express');
const { getPublicConfig, saveConfig } = require('../services/configService');
const { refreshLlmHealth } = require('../services/stateService');
const { reconfigureEsp32Connections } = require('../esp32Client');
const { setCapture } = require('../services/voiceService');

const router = express.Router();

router.get('/', (req, res) => res.json(getPublicConfig()));

router.post('/', async (req, res) => {
  try {
    const previousToken = process.env.ESP32_WS_TOKEN || '';
    const config = saveConfig(req.body);
    let hardwareMessage = '';
    try {
      await reconfigureEsp32Connections({
        disconnectWebSocket: previousToken !== (process.env.ESP32_WS_TOKEN || '')
      });
    } catch (error) {
      hardwareMessage = ` 硬件连接暂未就绪：${error.message}`;
    }
    res.json({ success: true, message: `配置已保存并立即生效。${hardwareMessage}`, config });
    setCapture(config.voiceEnabled);
    refreshLlmHealth().catch(() => {});
  } catch (error) {
    res.status(400).json({ success: false, message: `保存配置失败：${error.message}` });
  }
});

module.exports = router;
