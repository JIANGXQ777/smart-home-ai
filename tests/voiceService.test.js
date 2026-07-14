const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-ai-browser-voice-'));
process.env.DATABASE_PATH = path.join(testDir, 'voice.test.db');
process.env.VOICE_SAMPLE_RATE = '16000';
process.env.BROWSER_VOICE_MIN_MS = '400';
process.env.BROWSER_VOICE_MAX_MS = '30000';

const { getVoiceStatus, validateBrowserPcm } = require('../backend/services/voiceService');
const { closeDatabase } = require('../backend/database');

test('控制台语音固定使用麦克风和扬声器', () => {
  const status = getVoiceStatus();
  assert.equal(status.mode, 'browser');
  assert.equal(status.input, 'computer-microphone');
  assert.equal(status.output, 'computer-speaker');
  assert.equal(status.sampleRate, 16000);
  assert.equal('connected' in status, false);
  assert.equal('captureRequested' in status, false);
});

test('浏览器上传的 16kHz PCM 长度和格式会被校验', () => {
  const oneSecond = Buffer.alloc(16000 * 2);
  const result = validateBrowserPcm(oneSecond, 16000);
  assert.equal(result.durationMs, 1000);
  assert.equal(result.bytes, oneSecond.length);
  assert.throws(() => validateBrowserPcm(Buffer.alloc(100), 16000), /录音时间太短/);
  assert.throws(() => validateBrowserPcm(oneSecond, 48000), /采样率必须为 16000/);
  assert.throws(() => validateBrowserPcm(Buffer.alloc(101), 16000), /16-bit PCM/);
});

test.after(() => {
  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
});
