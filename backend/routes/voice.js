const express = require('express');
const { getVoiceStatus, playTestTone, setCapture } = require('../services/voiceService');

const router = express.Router();

router.get('/status', (req, res) => res.json(getVoiceStatus()));

router.post('/capture', (req, res) => {
  const enabled = req.body?.enabled === true;
  const active = setCapture(enabled);
  res.json({ success: true, captureRequested: active, status: getVoiceStatus() });
});

router.post('/test-tone', async (req, res) => {
  try {
    await playTestTone();
    res.json({ success: true, message: '测试音已播放。' });
  } catch (error) {
    res.status(422).json({ success: false, message: error.message });
  }
});

module.exports = router;
