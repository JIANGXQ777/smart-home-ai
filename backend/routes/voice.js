const express = require('express');
const {
  getVoiceStatus,
  synthesizeBrowserSpeech,
  transcribeBrowserPcm
} = require('../services/voiceService');

const router = express.Router();

router.get('/status', (_req, res) => res.json(getVoiceStatus()));

router.post('/transcribe', express.raw({ type: 'application/octet-stream', limit: '2mb' }), async (req, res) => {
  try {
    const sampleRate = Number(req.headers['x-audio-sample-rate'] || 16000);
    const result = await transcribeBrowserPcm(req.body, sampleRate);
    res.json({ success: true, ...result, status: getVoiceStatus() });
  } catch (error) {
    res.status(422).json({ success: false, message: error.message, status: getVoiceStatus() });
  }
});

router.post('/synthesize', async (req, res) => {
  try {
    const result = await synthesizeBrowserSpeech(req.body?.text);
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': result.wav.length,
      'Cache-Control': 'no-store',
      'X-Audio-Sample-Rate': String(result.sampleRate)
    });
    res.send(result.wav);
  } catch (error) {
    res.status(422).json({ success: false, message: error.message, status: getVoiceStatus() });
  }
});

module.exports = router;
