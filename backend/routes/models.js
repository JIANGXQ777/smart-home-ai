const express = require('express');
const {
  getPublicModelConfigs,
  saveModelConfigs
} = require('../modelConfigStore');
const { refreshLlmHealth } = require('../services/stateService');
const { setCapture } = require('../services/voiceService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ storage: 'sqlite', models: getPublicModelConfigs() });
});

router.put('/', async (req, res) => {
  try {
    const models = saveModelConfigs(req.body?.models || req.body);
    setCapture(process.env.VOICE_ENABLED === 'true');
    refreshLlmHealth().catch(() => {});
    res.json({
      success: true,
      message: '模型配置已保存到数据库并立即生效。',
      storage: 'sqlite',
      models
    });
  } catch (error) {
    res.status(400).json({ success: false, message: `保存模型配置失败：${error.message}` });
  }
});

module.exports = router;
