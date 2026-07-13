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

test('电脑播放模式将 PCM 放入浏览器 WAV 队列并在确认后恢复采集', async () => {
  process.env.VOICE_PLAYBACK_TARGET = 'browser';
  const client = {
    sendText() { return true; },
    sendBinary() { throw new Error('电脑播放模式不应向 ESP32 发送音频'); }
  };
  voiceService.attachClient(client);
  await voiceService.playTestTone();
  const audio = voiceService.getBrowserAudio(0);
  assert.ok(audio);
  assert.equal(audio.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(voiceService.getVoiceStatus().playing, true);
  assert.equal(voiceService.getVoiceStatus().captureRequested, false);
  assert.equal(voiceService.finishBrowserPlayback(audio.id), true);
  assert.equal(voiceService.getVoiceStatus().playing, false);
  assert.equal(voiceService.getVoiceStatus().captureRequested, true);
  voiceService.detachClient(client);
  process.env.VOICE_PLAYBACK_TARGET = 'esp32';
});

test('手动录音可开始和停止，短录音返回错误并恢复采集', () => {
  const textMessages = [];
  const client = {
    sendText(payload) {
      textMessages.push(JSON.parse(payload));
      return true;
    },
    sendBinary() { return true; }
  };
  voiceService.attachClient(client);

  const started = voiceService.startManualRecording();
  assert.equal(started.status, 'recording');
  assert.equal(voiceService.getVoiceStatus().manualRecording, true);

  voiceService.handleAudioFrame(client, Buffer.alloc(640));
  const stopped = voiceService.stopManualRecording();
  assert.equal(stopped.status, 'error');
  assert.match(stopped.error, /录音时间太短/);
  assert.equal(voiceService.getVoiceStatus().manualRecording, false);
  assert.equal(voiceService.getVoiceStatus().captureRequested, true);
  assert.ok(textMessages.some(message => message.type === 'voice.manual-recording.started'));
  assert.ok(textMessages.some(message => message.type === 'voice.manual-recording.stopped'));
  assert.throws(() => voiceService.stopManualRecording(), /当前没有正在进行的录音/);

  voiceService.detachClient(client);
});

test.after(() => {
  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
});
