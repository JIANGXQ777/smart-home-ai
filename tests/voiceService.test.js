const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-ai-voice-'));
process.env.DATABASE_PATH = path.join(testDir, 'voice.test.db');
process.env.VOICE_ENABLED = 'true';
process.env.VOICE_SAMPLE_RATE = '16000';
delete process.env.VOICE_API_KEY;

const voiceService = require('../backend/services/voiceService');
const { closeDatabase } = require('../backend/database');

test('语音终端握手并接收 16kHz PCM 测试音', async () => {
  const textMessages = [];
  const binaryMessages = [];
  const client = {
    sendText(payload) {
      textMessages.push(JSON.parse(payload));
      return true;
    },
    sendBinary(payload) {
      binaryMessages.push(Buffer.from(payload));
      return true;
    }
  };

  assert.equal(voiceService.handleControlMessage(client, {
    type: 'voice.hello',
    sampleRate: 16000,
    frameMs: 20,
    audioReady: true
  }), true);
  assert.equal(voiceService.getVoiceStatus().connected, true);
  assert.equal(voiceService.getVoiceStatus().captureRequested, true);

  await voiceService.playTestTone();

  assert.ok(textMessages.some(message => message.type === 'voice.playback.start'));
  assert.ok(textMessages.some(message => message.type === 'voice.playback.stop'));
  assert.ok(binaryMessages.length >= 30);
  assert.ok(binaryMessages.every(frame => frame.length === 640));

  voiceService.detachClient(client);
  assert.equal(voiceService.getVoiceStatus().connected, false);
});

test.after(() => {
  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
});
