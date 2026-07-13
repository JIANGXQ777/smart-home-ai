const express = require('express');
const {
  finishBrowserPlayback,
  getBrowserAudio,
  getVoiceStatus,
  playLocalDeviceTone,
  playSpeechTest,
  playTestTone,
  startManualRecording,
  stopManualRecording,
  setCapture
} = require('../services/voiceService');

const router = express.Router();

router.get('/status', (req, res) => res.json(getVoiceStatus()));

router.get('/browser-audio', (req, res) => {
  const audio = getBrowserAudio(req.query.after);
  if (!audio) return res.status(204).end();
  res.set({
    'Content-Type': 'audio/wav',
    'Content-Length': audio.wav.length,
    'Cache-Control': 'no-store',
    'X-Audio-Id': String(audio.id),
    'X-Audio-Created-At': audio.createdAt
  });
  return res.send(audio.wav);
});

router.post('/browser-audio/:id/finished', (req, res) => {
  const finished = finishBrowserPlayback(req.params.id);
  res.json({ success: finished, status: getVoiceStatus() });
});

router.post('/capture', (req, res) => {
  const enabled = req.body?.enabled === true;
  const active = setCapture(enabled);
  res.json({ success: true, captureRequested: active, status: getVoiceStatus() });
});

router.post('/manual-recording', (req, res) => {
  try {
    const result = req.body?.enabled === true ? startManualRecording() : stopManualRecording();
    res.json({ success: true, manual: result, status: getVoiceStatus() });
  } catch (error) {
    res.status(422).json({ success: false, message: error.message, status: getVoiceStatus() });
  }
});

router.post('/test-tone', async (req, res) => {
  try {
    await playTestTone();
    res.json({ success: true, message: '测试音已播放。' });
  } catch (error) {
    res.status(422).json({ success: false, message: error.message });
  }
});

router.post('/test-speech', async (req, res) => {
  try {
    const text = String(req.body?.text || '你好，我是智能家居助手。').trim();
    if (!text) return res.status(400).json({ success: false, message: '测试文本不能为空' });
    await playSpeechTest(text);
    return res.json({ success: true, message: 'TTS 测试语音已播放。' });
  } catch (error) {
    return res.status(422).json({ success: false, message: error.message });
  }
});

router.post('/test-local-tone', (req, res) => {
  try {
    playLocalDeviceTone();
    res.json({ success: true, message: 'ESP32 本地测试音命令已发送。' });
  } catch (error) {
    res.status(422).json({ success: false, message: error.message });
  }
});

module.exports = router;
