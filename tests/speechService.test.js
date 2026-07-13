const assert = require('node:assert/strict');
const test = require('node:test');
const { createWav, resamplePcm16 } = require('../backend/services/speechService');

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
