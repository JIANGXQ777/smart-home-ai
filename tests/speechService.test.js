const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-ai-speech-'));
process.env.DATABASE_PATH = path.join(testDir, 'speech.test.db');
process.env.VOICE_ENABLED = 'true';
process.env.VOICE_SAMPLE_RATE = '16000';

const { closeDatabase } = require('../backend/database');
const { saveModelConfigs } = require('../backend/modelConfigStore');
const {
  createWav,
  applyPcmGain,
  isMiMoConfig,
  resamplePcm16,
  synthesizeSpeech,
  transcribePcm
} = require('../backend/services/speechService');

const originalFetch = global.fetch;

test('PCM 可以封装为标准单声道 16-bit WAV', () => {
  const pcm = Buffer.alloc(640);
  const wav = createWav(pcm, 16000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.length, 684);
});

test('24kHz PCM 可以重采样到 16kHz', () => {
  const input = Buffer.alloc(240 * 2);
  for (let index = 0; index < 240; index += 1) {
    input.writeInt16LE(Math.round(Math.sin(index / 10) * 10000), index * 2);
  }
  const output = resamplePcm16(input, 24000, 16000);
  assert.equal(output.length, 160 * 2);
  assert.notEqual(output.readInt16LE(20), 0);
});

test('PCM 播放增益可以降低语音峰值', () => {
  const input = Buffer.alloc(4);
  input.writeInt16LE(20000, 0);
  input.writeInt16LE(-12000, 2);
  const output = applyPcmGain(input, 0.25);
  assert.equal(output.readInt16LE(0), 5000);
  assert.equal(output.readInt16LE(2), -3000);
});

test('MiMo 服务商可通过名称或官方域名识别', () => {
  assert.equal(isMiMoConfig({ provider: 'xiaomimimo', baseUrl: '' }), true);
  assert.equal(isMiMoConfig({ provider: 'openai-compatible', baseUrl: 'https://api.xiaomimimo.com' }), true);
  assert.equal(isMiMoConfig({ provider: 'openai-compatible', baseUrl: 'https://api.openai.com' }), false);
});

test('MiMo ASR 使用 api-key 和 Base64 WAV 消息协议', async () => {
  saveModelConfigs({
    asr: {
      enabled: true,
      provider: 'xiaomimimo',
      baseUrl: 'https://api.xiaomimimo.com',
      apiKey: 'asr-test-key',
      model: 'mimo-v2.5-asr',
      settings: { endpointPath: '/v1/chat/completions', language: 'zh', timeoutMs: 5000 }
    }
  });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: '测试识别文本' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const text = await transcribePcm(Buffer.alloc(640));
  const body = JSON.parse(request.options.body);
  assert.equal(text, '测试识别文本');
  assert.equal(request.url, 'https://api.xiaomimimo.com/v1/chat/completions');
  assert.equal(request.options.headers['api-key'], 'asr-test-key');
  assert.equal(body.model, 'mimo-v2.5-asr');
  assert.equal(body.asr_options.language, 'zh');
  assert.match(body.messages[0].content[0].input_audio.data, /^data:audio\/wav;base64,/);
});

test('MiMo TTS 解析 Base64 WAV 并重采样到硬件采样率', async () => {
  saveModelConfigs({
    tts: {
      enabled: true,
      provider: 'xiaomimimo',
      baseUrl: 'https://api.xiaomimimo.com',
      apiKey: 'tts-test-key',
      model: 'mimo-v2.5-tts',
      settings: { endpointPath: '/v1/chat/completions', voice: '冰糖', timeoutMs: 5000, sourceSampleRate: 24000, volume: 0.25 }
    }
  });
  const sourcePcm = Buffer.alloc(480 * 2);
  for (let index = 0; index < 480; index += 1) {
    sourcePcm.writeInt16LE(Math.round(Math.sin(index / 8) * 6000), index * 2);
  }
  const audioData = createWav(sourcePcm, 24000).toString('base64');
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { audio: { data: audioData } } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const pcm = await synthesizeSpeech('你好，我是智能家居助手。');
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.xiaomimimo.com/v1/chat/completions');
  assert.equal(request.options.headers['api-key'], 'tts-test-key');
  assert.equal(body.messages[0].role, 'assistant');
  assert.equal(body.audio.voice, '冰糖');
  assert.equal(body.audio.format, 'wav');
  assert.equal(pcm.length, 320 * 2);
  assert.notEqual(pcm.readInt16LE(20), 0);
});

test.after(() => {
  global.fetch = originalFetch;
  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });
});
