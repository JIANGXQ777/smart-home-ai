const {
  createWav,
  getSpeechConfig,
  isAsrConfigured,
  isSpeechConfigured,
  isTtsConfigured,
  synthesizeSpeech,
  transcribePcm
} = require('./speechService');

let transcribing = false;
let synthesizing = false;
let lastTranscript = '';
let lastReply = '';
let lastError = '';
let lastAudioAt = null;
let utteranceCount = 0;

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function validateBrowserPcm(pcm, sampleRate) {
  if (!Buffer.isBuffer(pcm)) throw new Error('浏览器录音数据无效');
  const expectedRate = getSpeechConfig().inputSampleRate;
  if (sampleRate !== expectedRate) throw new Error(`录音采样率必须为 ${expectedRate} Hz`);
  if (pcm.length % 2 !== 0) throw new Error('录音数据必须为 16-bit PCM');

  const durationMs = pcm.length / 2 / sampleRate * 1000;
  const minimumMs = numericEnv('BROWSER_VOICE_MIN_MS', 400);
  const maximumMs = numericEnv('BROWSER_VOICE_MAX_MS', 30000);
  if (durationMs < minimumMs) throw new Error(`录音时间太短，请至少录制 ${minimumMs / 1000} 秒`);
  if (durationMs > maximumMs) throw new Error(`录音时间过长，请控制在 ${maximumMs / 1000} 秒以内`);
  return { durationMs: Math.round(durationMs), sampleRate, bytes: pcm.length };
}

async function transcribeBrowserPcm(pcm, sampleRate) {
  const audio = validateBrowserPcm(pcm, sampleRate);
  if (!isAsrConfigured()) throw new Error('请先在模型配置中启用并配置 ASR');
  if (transcribing) throw new Error('正在识别上一段录音，请稍后再试');

  transcribing = true;
  lastError = '';
  try {
    const text = await transcribePcm(pcm);
    lastTranscript = text;
    lastAudioAt = new Date().toISOString();
    utteranceCount += 1;
    return { text, audio };
  } catch (error) {
    lastError = error.message;
    throw error;
  } finally {
    transcribing = false;
  }
}

async function synthesizeBrowserSpeech(text) {
  const normalized = String(text || '').trim().slice(0, 1000);
  if (!normalized) throw new Error('语音合成文本不能为空');
  if (!isTtsConfigured()) throw new Error('请先在模型配置中启用并配置 TTS');
  if (synthesizing) throw new Error('正在生成上一段语音，请稍后再试');

  synthesizing = true;
  lastError = '';
  try {
    const pcm = await synthesizeSpeech(normalized);
    const sampleRate = getSpeechConfig().inputSampleRate;
    lastReply = normalized;
    return { wav: createWav(pcm, sampleRate), sampleRate };
  } catch (error) {
    lastError = error.message;
    throw error;
  } finally {
    synthesizing = false;
  }
}

function getVoiceStatus() {
  const config = getSpeechConfig();
  return {
    mode: 'browser',
    input: 'computer-microphone',
    output: 'computer-speaker',
    enabled: isAsrConfigured() || isTtsConfigured(),
    asrConfigured: isAsrConfigured(),
    ttsConfigured: isTtsConfigured(),
    speechConfigured: isSpeechConfigured(),
    sampleRate: config.inputSampleRate,
    transcribing,
    synthesizing,
    lastTranscript,
    lastReply,
    lastError,
    lastAudioAt,
    utteranceCount
  };
}

module.exports = {
  getVoiceStatus,
  synthesizeBrowserSpeech,
  transcribeBrowserPcm,
  validateBrowserPcm
};
