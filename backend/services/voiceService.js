const {
  getSpeechConfig,
  isSpeechConfigured,
  synthesizeSpeech,
  transcribePcm
} = require('./speechService');

const FRAME_MS = 20;
let activeClient = null;
let captureRequested = false;
let speaking = false;
let processing = false;
let playing = false;
let speechFrames = [];
let preRollFrames = [];
let speechStartedAt = 0;
let lastVoiceAt = 0;
let pendingAction = null;
let lastTranscript = '';
let lastReply = '';
let lastError = '';
let lastAudioAt = null;
let receivedFrames = 0;
let receivedBytes = 0;
let lastLevel = 0;
let utteranceCount = 0;

function voiceEnabled() {
  return process.env.VOICE_ENABLED === 'true';
}

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function sendControl(type, payload = {}) {
  if (!activeClient) return false;
  activeClient.sendText(JSON.stringify({ type, ...payload }));
  return true;
}

function setCapture(enabled) {
  captureRequested = Boolean(enabled && voiceEnabled() && activeClient && !playing);
  sendControl(captureRequested ? 'voice.capture.start' : 'voice.capture.stop');
  return captureRequested;
}

function attachClient(client) {
  activeClient = client;
  lastError = '';
  sendControl('voice.config', {
    enabled: voiceEnabled(),
    sampleRate: numericEnv('VOICE_SAMPLE_RATE', 16000),
    frameMs: FRAME_MS,
    speechConfigured: isSpeechConfigured()
  });
  if (voiceEnabled()) setCapture(true);
}

function detachClient(client) {
  if (activeClient !== client) return;
  activeClient = null;
  captureRequested = false;
  speaking = false;
  processing = false;
  playing = false;
  speechFrames = [];
  preRollFrames = [];
}

function calculateLevel(frame) {
  let sum = 0;
  const samples = Math.floor(frame.length / 2);
  if (!samples) return 0;
  for (let offset = 0; offset + 1 < frame.length; offset += 2) {
    sum += Math.abs(frame.readInt16LE(offset));
  }
  return Math.round(sum / samples);
}

function isConfirmation(text) {
  return /^(确认|确定|是的|是|好|好的|可以|执行|没问题)[。！!]?$/i.test(text.trim());
}

function isCancellation(text) {
  return /^(取消|不要|不用|不执行|算了|否|不是)[。！!]?$/i.test(text.trim());
}

async function buildVoiceReply(transcript) {
  const { decide } = require('../aiAgent');
  const { execute } = require('../executor');
  if (pendingAction) {
    if (isConfirmation(transcript)) {
      const action = pendingAction;
      pendingAction = null;
      const result = await execute(action.deviceId, action.command, action.value);
      return result.message;
    }
    if (isCancellation(transcript)) {
      pendingAction = null;
      return '好的，已取消。';
    }
    pendingAction = null;
  }

  const decision = await decide(transcript);
  if (decision.needConfirm && decision.action) pendingAction = decision.action;
  return decision.reply || '我暂时没有理解，请再说一次。';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playPcm(pcm) {
  if (!activeClient || !pcm.length) return;
  playing = true;
  setCapture(false);
  const sampleRate = numericEnv('VOICE_SAMPLE_RATE', 16000);
  const frameBytes = Math.floor(sampleRate * 2 * FRAME_MS / 1000);
  sendControl('voice.playback.start', { sampleRate, bytes: pcm.length });
  for (let offset = 0; offset < pcm.length && activeClient; offset += frameBytes) {
    activeClient.sendBinary(pcm.subarray(offset, Math.min(offset + frameBytes, pcm.length)));
    await delay(FRAME_MS - 2);
  }
  await delay(80);
  sendControl('voice.playback.stop');
  playing = false;
  if (voiceEnabled()) setCapture(true);
}

async function processUtterance(pcm) {
  processing = true;
  speaking = false;
  setCapture(false);
  utteranceCount += 1;
  try {
    if (!isSpeechConfigured()) {
      throw new Error('音频链路正常，请在模型配置中完成 ASR 和 TTS 设置');
    }
    lastTranscript = await transcribePcm(pcm);
    sendControl('voice.transcript', { text: lastTranscript });
    lastReply = await buildVoiceReply(lastTranscript);
    sendControl('voice.reply', { text: lastReply, needConfirm: Boolean(pendingAction) });
    const audio = await synthesizeSpeech(lastReply);
    await playPcm(audio);
    lastError = '';
  } catch (error) {
    lastError = error.message;
    sendControl('voice.error', { message: error.message });
  } finally {
    processing = false;
    if (voiceEnabled() && !playing) setCapture(true);
  }
}

function finishUtterance() {
  const pcm = Buffer.concat(speechFrames);
  speechFrames = [];
  preRollFrames = [];
  speaking = false;
  const minimumBytes = numericEnv('VOICE_SAMPLE_RATE', 16000) * 2 * numericEnv('VOICE_MIN_SPEECH_MS', 400) / 1000;
  if (pcm.length < minimumBytes || processing) return;
  processUtterance(pcm).catch((error) => {
    lastError = error.message;
    processing = false;
  });
}

function handleAudioFrame(client, frame) {
  if (client !== activeClient || !captureRequested || playing || processing || !Buffer.isBuffer(frame)) return;
  const expectedFrameBytes = Math.floor(numericEnv('VOICE_SAMPLE_RATE', 16000) * 2 * FRAME_MS / 1000);
  if (frame.length !== expectedFrameBytes) {
    lastError = `音频帧长度无效：${frame.length}，预期 ${expectedFrameBytes}`;
    return;
  }
  const now = Date.now();
  lastAudioAt = new Date(now).toISOString();
  receivedFrames += 1;
  receivedBytes += frame.length;
  lastLevel = calculateLevel(frame);
  const threshold = numericEnv('VOICE_VAD_THRESHOLD', 700);
  const silenceMs = numericEnv('VOICE_SILENCE_MS', 700);
  const maxSpeechMs = numericEnv('VOICE_MAX_SPEECH_MS', 15000);
  const preRollLimit = Math.max(1, Math.floor(numericEnv('VOICE_PREFIX_MS', 300) / FRAME_MS));

  if (!speaking) {
    preRollFrames.push(Buffer.from(frame));
    if (preRollFrames.length > preRollLimit) preRollFrames.shift();
    if (lastLevel >= threshold) {
      speaking = true;
      speechStartedAt = now;
      lastVoiceAt = now;
      speechFrames = preRollFrames.splice(0);
      sendControl('voice.speech.started');
    }
    return;
  }

  speechFrames.push(Buffer.from(frame));
  if (lastLevel >= threshold) lastVoiceAt = now;
  if (now - lastVoiceAt >= silenceMs || now - speechStartedAt >= maxSpeechMs) {
    sendControl('voice.speech.stopped');
    finishUtterance();
  }
}

function handleControlMessage(client, data) {
  if (!data || typeof data.type !== 'string' || !data.type.startsWith('voice.')) return false;
  if (data.type === 'voice.hello') {
    attachClient(client);
  } else if (data.type === 'voice.playback.finished') {
    playing = false;
    if (voiceEnabled()) setCapture(true);
  } else if (data.type === 'voice.error') {
    lastError = String(data.message || 'ESP32 音频错误');
  }
  return true;
}

function generateTestTone(durationMs = 700, frequency = 440) {
  const sampleRate = numericEnv('VOICE_SAMPLE_RATE', 16000);
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 5000);
    pcm.writeInt16LE(sample, index * 2);
  }
  return pcm;
}

async function playTestTone() {
  if (!activeClient) throw new Error('ESP32 语音终端未连接');
  await playPcm(generateTestTone());
}

function getVoiceStatus() {
  const config = getSpeechConfig();
  return {
    enabled: voiceEnabled(),
    connected: Boolean(activeClient),
    speechConfigured: isSpeechConfigured(),
    sampleRate: config.inputSampleRate,
    captureRequested,
    speaking,
    processing,
    playing,
    pendingConfirmation: Boolean(pendingAction),
    lastTranscript,
    lastReply,
    lastError,
    lastAudioAt,
    lastLevel,
    receivedFrames,
    receivedBytes,
    utteranceCount
  };
}

module.exports = {
  attachClient,
  detachClient,
  getVoiceStatus,
  handleAudioFrame,
  handleControlMessage,
  playTestTone,
  setCapture
};
