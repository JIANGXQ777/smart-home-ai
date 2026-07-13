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
      endpointPath: String(asr.settings.endpointPath || ''),
      language: String(asr.settings.language || 'zh'),
      timeoutMs: Number(asr.settings.timeoutMs || 30000)
    },
    tts: {
      enabled: tts.enabled,
      provider: tts.provider,
      apiKey: tts.apiKey,
      baseUrl: String(tts.baseUrl).replace(/\/+$/, ''),
      model: tts.model,
      endpointPath: String(tts.settings.endpointPath || ''),
      voice: String(tts.settings.voice || 'alloy'),
      timeoutMs: Number(tts.settings.timeoutMs || 30000),
      sourceSampleRate: Number(tts.settings.sourceSampleRate || 24000),
      volume: Number(tts.settings.volume ?? 0.25)
    }
  };
}

function isSpeechConfigured() {
  const config = getSpeechConfig();
  return config.enabled &&
    config.asr.enabled && Boolean(config.asr.apiKey && config.asr.model && config.asr.baseUrl && config.asr.endpointPath) &&
    config.tts.enabled && Boolean(config.tts.apiKey && config.tts.model && config.tts.baseUrl && config.tts.endpointPath);
}

function buildRequestUrl(baseUrl, endpointPath) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(endpointPath || '').replace(/^\/+/, '')}`;
}

function isMiMoConfig(config) {
  const provider = String(config.provider || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (provider.includes('xiaomimimo') || provider === 'mimo' || provider === 'xiaomi') return true;
  try {
    return new URL(config.baseUrl).hostname.toLowerCase().endsWith('xiaomimimo.com');
  } catch (error) {
    return false;
  }
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

function applyPcmGain(pcm, gain) {
  const normalizedGain = Math.max(0, Math.min(1, Number(gain)));
  if (normalizedGain === 1) return pcm;
  const output = Buffer.alloc(pcm.length);
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = Math.round(pcm.readInt16LE(offset) * normalizedGain);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), offset);
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

function extractResponseError(data, fallback) {
  return data?.error?.message || data?.message || fallback;
}

function extractMiMoTranscript(data) {
  const message = data?.choices?.[0]?.message;
  if (typeof message?.content === 'string') return message.content.trim();
  if (Array.isArray(message?.content)) {
    const text = message.content
      .map((item) => typeof item === 'string' ? item : item?.text || item?.content || '')
      .join('')
      .trim();
    if (text) return text;
  }
  return String(data?.text || data?.output_text || '').trim();
}

async function transcribeMiMo(pcm, config, asr) {
  const wav = createWav(pcm, config.inputSampleRate);
  const response = await fetchWithTimeout(buildRequestUrl(asr.baseUrl, asr.endpointPath), {
    method: 'POST',
    headers: {
      'api-key': asr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: asr.model,
      messages: [{
        role: 'user',
        content: [{
          type: 'input_audio',
          input_audio: { data: `data:audio/wav;base64,${wav.toString('base64')}` }
        }]
      }],
      asr_options: { language: asr.language || 'auto' }
    })
  }, asr.timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractResponseError(data, `MiMo 语音识别失败 (${response.status})`));
  const text = extractMiMoTranscript(data);
  if (!text) throw new Error('MiMo 语音识别未返回文本');
  return text;
}

async function synthesizeMiMo(text, config, tts) {
  const response = await fetchWithTimeout(buildRequestUrl(tts.baseUrl, tts.endpointPath), {
    method: 'POST',
    headers: {
      'api-key': tts.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: tts.model,
      messages: [{ role: 'assistant', content: text }],
      audio: {
        format: 'wav',
        voice: tts.voice
      }
    })
  }, tts.timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractResponseError(data, `MiMo 语音合成失败 (${response.status})`));
  const audioData = data?.choices?.[0]?.message?.audio?.data || data?.audio?.data;
  if (!audioData || typeof audioData !== 'string') throw new Error('MiMo 语音合成未返回音频');
  let raw;
  try {
    raw = Buffer.from(audioData, 'base64');
  } catch (error) {
    throw new Error('MiMo 语音合成返回的音频编码无效');
  }
  const decoded = extractWavPcm(raw, tts.sourceSampleRate);
  const resampled = resamplePcm16(decoded.pcm, decoded.sampleRate, config.inputSampleRate);
  return applyPcmGain(resampled, tts.volume);
}

async function transcribePcm(pcm) {
  const config = getSpeechConfig();
  const asr = config.asr;
  if (!config.enabled || !asr.enabled || !asr.apiKey || !asr.model || !asr.baseUrl || !asr.endpointPath) {
    throw new Error('ASR 服务尚未配置');
  }
  if (isMiMoConfig(asr)) return transcribeMiMo(pcm, config, asr);
  const form = new FormData();
  form.append('model', asr.model);
  form.append('language', asr.language);
  form.append('file', new Blob([createWav(pcm, config.inputSampleRate)], { type: 'audio/wav' }), 'speech.wav');
  const response = await fetchWithTimeout(buildRequestUrl(asr.baseUrl, asr.endpointPath), {
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
  if (!config.enabled || !tts.enabled || !tts.apiKey || !tts.model || !tts.baseUrl || !tts.endpointPath) {
    throw new Error('TTS 服务尚未配置');
  }
  if (isMiMoConfig(tts)) return synthesizeMiMo(text, config, tts);
  const response = await fetchWithTimeout(buildRequestUrl(tts.baseUrl, tts.endpointPath), {
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
  const resampled = resamplePcm16(decoded.pcm, decoded.sampleRate, config.inputSampleRate);
  return applyPcmGain(resampled, tts.volume);
}

module.exports = {
  applyPcmGain,
  createWav,
  getSpeechConfig,
  isMiMoConfig,
  isSpeechConfigured,
  resamplePcm16,
  synthesizeSpeech,
  transcribePcm
};
