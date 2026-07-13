const { getModelConfig } = require('../modelConfigStore');

function getSpeechConfig() {
  const asr = getModelConfig('asr');
  const tts = getModelConfig('tts');
  return {
    enabled: process.env.VOICE_ENABLED === 'true',
    inputSampleRate: Number(process.env.VOICE_SAMPLE_RATE || 16000),
    asr: {
      enabled: asr.enabled,
      provider: asr.provider,
      apiKey: asr.apiKey,
      baseUrl: String(asr.baseUrl).replace(/\/+$/, ''),
      model: asr.model,
      language: String(asr.settings.language || 'zh'),
      timeoutMs: Number(asr.settings.timeoutMs || 30000)
    },
    tts: {
      enabled: tts.enabled,
      provider: tts.provider,
      apiKey: tts.apiKey,
      baseUrl: String(tts.baseUrl).replace(/\/+$/, ''),
      model: tts.model,
      voice: String(tts.settings.voice || 'alloy'),
      timeoutMs: Number(tts.settings.timeoutMs || 30000),
      sourceSampleRate: Number(tts.settings.sourceSampleRate || 24000)
    }
  };
}

function isSpeechConfigured() {
  const config = getSpeechConfig();
  return config.enabled &&
    config.asr.enabled && Boolean(config.asr.apiKey && config.asr.model) &&
    config.tts.enabled && Boolean(config.tts.apiKey && config.tts.model);
}

function createWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function extractWavPcm(buffer, fallbackSampleRate) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return { pcm: buffer, sampleRate: fallbackSampleRate };
  }
  const sampleRate = buffer.readUInt32LE(24);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      return {
        pcm: buffer.subarray(offset + 8, Math.min(offset + 8 + chunkSize, buffer.length)),
        sampleRate
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error('TTS 返回的 WAV 文件缺少 data 区块');
}

function resamplePcm16(pcm, sourceRate, targetRate) {
  if (sourceRate === targetRate) return pcm;
  const inputSamples = Math.floor(pcm.length / 2);
  if (inputSamples === 0) return Buffer.alloc(0);
  const outputSamples = Math.max(1, Math.floor(inputSamples * targetRate / sourceRate));
  const output = Buffer.alloc(outputSamples * 2);
  for (let index = 0; index < outputSamples; index += 1) {
    const sourcePosition = index * sourceRate / targetRate;
    const leftIndex = Math.min(Math.floor(sourcePosition), inputSamples - 1);
    const rightIndex = Math.min(leftIndex + 1, inputSamples - 1);
    const fraction = sourcePosition - leftIndex;
    const left = pcm.readInt16LE(leftIndex * 2);
    const right = pcm.readInt16LE(rightIndex * 2);
    const sample = Math.max(-32768, Math.min(32767, Math.round(left + (right - left) * fraction)));
    output.writeInt16LE(sample, index * 2);
  }
  return output;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function transcribePcm(pcm) {
  const config = getSpeechConfig();
  const asr = config.asr;
  if (!config.enabled || !asr.enabled || !asr.apiKey || !asr.model) {
    throw new Error('ASR 服务尚未配置');
  }
  const form = new FormData();
  form.append('model', asr.model);
  form.append('language', asr.language);
  form.append('file', new Blob([createWav(pcm, config.inputSampleRate)], { type: 'audio/wav' }), 'speech.wav');
  const response = await fetchWithTimeout(asr.baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${asr.apiKey}` },
    body: form
  }, asr.timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `语音识别失败 (${response.status})`);
  const text = String(data.text || '').trim();
  if (!text) throw new Error('语音识别未返回文本');
  return text;
}

async function synthesizeSpeech(text) {
  const config = getSpeechConfig();
  const tts = config.tts;
  if (!config.enabled || !tts.enabled || !tts.apiKey || !tts.model) {
    throw new Error('TTS 服务尚未配置');
  }
  const response = await fetchWithTimeout(tts.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tts.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: tts.model,
      voice: tts.voice,
      input: text,
      response_format: 'pcm'
    })
  }, tts.timeoutMs);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || data.message || `语音合成失败 (${response.status})`);
  }
  const raw = Buffer.from(await response.arrayBuffer());
  const decoded = extractWavPcm(raw, tts.sourceSampleRate);
  return resamplePcm16(decoded.pcm, decoded.sampleRate, config.inputSampleRate);
}

module.exports = {
  createWav,
  getSpeechConfig,
  isSpeechConfigured,
  resamplePcm16,
  synthesizeSpeech,
  transcribePcm
};
