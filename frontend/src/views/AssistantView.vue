<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AudioLines, LoaderCircle, Mic, Send, Sparkles, Square, Volume2, VolumeX } from '@lucide/vue'
import { api } from '../api/client'
import { BrowserPcmRecorder, playWavBlob, stopSpeaker, unlockSpeaker } from '../services/browserVoice'
import { useChatStore } from '../stores/chat'

const chat = useChatStore()
const input = ref('')
const stream = ref()
const voiceStatus = ref({ asrConfigured: false, ttsConfigured: false, sampleRate: 16000 })
const phase = ref('idle')
const voiceError = ref('')
const voiceHint = ref('')
const inputLevel = ref(0)
const elapsedSeconds = ref(0)
const speakerEnabled = ref(localStorage.getItem('voiceReplyEnabled') !== 'false')
const savedVolume = Number(localStorage.getItem('voiceReplyVolume'))
const volume = ref(Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 0.9)
let recorder = null
let elapsedTimer = null
let maximumTimer = null

const recording = computed(() => phase.value === 'recording')
const busy = computed(() => !['idle', 'recording'].includes(phase.value))
const recordButtonDisabled = computed(() => !recording.value && (busy.value || chat.sending || !voiceStatus.value.asrConfigured))
const recordButtonLabel = computed(() => {
  if (recording.value) return '停止电脑麦克风录音'
  if (phase.value === 'transcribing') return '正在识别语音'
  if (phase.value === 'thinking') return 'AI 正在生成回复'
  if (phase.value === 'speaking') return '电脑正在播放回复'
  return '使用电脑麦克风录音'
})
const phaseText = computed(() => ({
  idle: '点击麦克风开始说话',
  recording: `正在录音 ${elapsedSeconds.value}s，再次点击结束`,
  transcribing: '正在把语音转换为文字…',
  thinking: 'AI 正在理解并生成回复…',
  speaking: '正在通过电脑扬声器播放…'
})[phase.value])

watch(speakerEnabled, value => localStorage.setItem('voiceReplyEnabled', String(value)))
watch(volume, value => localStorage.setItem('voiceReplyVolume', String(value)))

async function scrollToBottom() {
  await nextTick()
  stream.value?.scrollTo({ top: stream.value.scrollHeight, behavior: 'smooth' })
}

async function send() {
  const text = input.value
  input.value = ''
  await chat.send(text)
  await scrollToBottom()
}

function clearTimers() {
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  if (maximumTimer) window.clearTimeout(maximumTimer)
  elapsedTimer = null
  maximumTimer = null
}

function friendlyMicrophoneError(error) {
  if (error?.name === 'NotAllowedError') return '麦克风权限被拒绝，请在浏览器地址栏中允许麦克风访问'
  if (error?.name === 'NotFoundError') return '没有找到可用的电脑麦克风'
  return error?.message || '电脑麦克风启动失败'
}

async function startRecording() {
  voiceError.value = ''
  voiceHint.value = ''
  try {
    await unlockSpeaker()
    recorder = new BrowserPcmRecorder({
      sampleRate: voiceStatus.value.sampleRate || 16000,
      onLevel: value => { inputLevel.value = value }
    })
    await recorder.start()
    phase.value = 'recording'
    elapsedSeconds.value = 0
    elapsedTimer = window.setInterval(() => { elapsedSeconds.value += 1 }, 1000)
    maximumTimer = window.setTimeout(() => stopRecording(), 20000)
  } catch (error) {
    recorder = null
    phase.value = 'idle'
    voiceError.value = friendlyMicrophoneError(error)
  }
}

async function requestTranscription(pcm) {
  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Sample-Rate': String(voiceStatus.value.sampleRate || 16000) },
    body: pcm
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) window.dispatchEvent(new CustomEvent('auth:required'))
  if (!response.ok) throw new Error(data.message || `语音识别失败 (${response.status})`)
  return data.text
}

async function speakReply(text) {
  const response = await fetch('/api/voice/synthesize', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || `语音合成失败 (${response.status})`)
  }
  await playWavBlob(await response.blob(), volume.value)
}

async function stopRecording() {
  if (!recording.value || !recorder) return
  clearTimers()
  phase.value = 'transcribing'
  voiceError.value = ''
  try {
    const recordingResult = await recorder.stop()
    recorder = null
    const transcript = await requestTranscription(recordingResult.pcm)
    phase.value = 'thinking'
    const result = await chat.send(transcript, { voice: true })
    await scrollToBottom()
    if (result?.reply && speakerEnabled.value && voiceStatus.value.ttsConfigured) {
      phase.value = 'speaking'
      await speakReply(result.reply)
    } else if (result?.reply && speakerEnabled.value && !voiceStatus.value.ttsConfigured) {
      voiceHint.value = '文字回复已生成；配置并启用 TTS 后可自动通过电脑扬声器播放。'
    }
  } catch (error) {
    voiceError.value = error.message || '语音交互失败'
  } finally {
    phase.value = 'idle'
    inputLevel.value = 0
    await scrollToBottom()
  }
}

async function toggleRecording() {
  if (recording.value) await stopRecording()
  else if (!recordButtonDisabled.value) await startRecording()
}

onMounted(async () => {
  try { voiceStatus.value = await api('/api/voice/status') }
  catch (error) { voiceError.value = error.message }
})

onBeforeUnmount(async () => {
  clearTimers()
  if (recorder) await recorder.cancel()
  stopSpeaker()
})
</script>

<template>
  <section class="assistant-layout card">
    <div class="chat-intro assistant-intro">
      <div class="device-icon"><Sparkles/></div>
      <div class="assistant-intro-copy"><h2>家庭控制助手</h2><p>文字与语音都在控制台完成；设备动作仍会等待你的确认。</p></div>
      <div class="voice-capabilities" aria-label="控制台语音状态">
        <span :class="{ ready: voiceStatus.asrConfigured }"><Mic :size="14"/>{{ voiceStatus.asrConfigured ? '电脑麦克风可用' : 'ASR 未配置' }}</span>
        <span :class="{ ready: voiceStatus.ttsConfigured }"><Volume2 :size="14"/>{{ voiceStatus.ttsConfigured ? '电脑扬声器可用' : 'TTS 未配置' }}</span>
      </div>
    </div>
    <div ref="stream" class="chat-stream" aria-live="polite">
      <div v-if="!chat.messages.length" class="empty">
        <p>可以输入文字，也可以点击麦克风直接说：</p>
        <button v-for="x in ['打开空调','把空调调到 26 度','你能控制什么设备？']" :key="x" class="chip" @click="input=x;send()">{{ x }}</button>
      </div>
      <div v-for="(message,index) in chat.messages" :key="index" class="message" :class="[message.role,message.error?'message-error':'']">
        <small>{{ message.role === 'user' ? (message.voice ? '你 · 电脑麦克风' : '你') : 'AI' }}</small>
        <p>{{ message.text }}</p>
      </div>
    </div>
    <div v-if="chat.pendingAction" class="confirm-bar">
      <div><strong>等待确认</strong><span>{{ chat.pendingAction.deviceId }} / {{ chat.pendingAction.command }} {{ chat.pendingAction.value ?? '' }}</span></div>
      <button class="btn primary" @click="chat.confirm">确认执行</button>
      <button class="btn ghost" @click="chat.pendingAction=null">取消</button>
    </div>
    <div class="voice-console" :class="{ active: recording || busy }" aria-live="polite">
      <div class="voice-console-status">
        <span class="voice-state-icon"><AudioLines v-if="recording" :size="18"/><LoaderCircle v-else-if="busy" :size="18" class="spin"/><Mic v-else :size="18"/></span>
        <div><strong>{{ recordButtonLabel }}</strong><span>{{ phaseText }}</span></div>
      </div>
      <div class="voice-level" :aria-label="`麦克风音量 ${Math.round(inputLevel * 100)}%`"><i :style="{ width: `${Math.max(recording ? 4 : 0, inputLevel * 100)}%` }"></i></div>
      <div class="voice-output-controls">
        <button type="button" class="voice-reply-toggle" :class="{ active: speakerEnabled }" :aria-pressed="speakerEnabled" @click="speakerEnabled=!speakerEnabled">
          <Volume2 v-if="speakerEnabled" :size="16"/><VolumeX v-else :size="16"/>语音回复
        </button>
        <label>音量 <input v-model.number="volume" type="range" min="0" max="1" step="0.05" :disabled="!speakerEnabled" aria-label="电脑语音回复音量"></label>
      </div>
    </div>
    <div v-if="voiceError" class="voice-notice error" role="alert">{{ voiceError }}</div>
    <div v-else-if="voiceHint" class="voice-notice">{{ voiceHint }}</div>
    <form class="chat-form" @submit.prevent="send">
      <label class="sr-only" for="chat-input">输入控制需求</label>
      <input id="chat-input" v-model.trim="input" placeholder="例如：打开教室空调" autocomplete="off"/>
      <button type="button" class="record-btn" :class="{ recording, processing: busy }" :disabled="recordButtonDisabled" :aria-label="recordButtonLabel" :aria-pressed="recording" :title="recordButtonLabel" @click="toggleRecording">
        <LoaderCircle v-if="busy" :size="19" class="spin"/><Square v-else-if="recording" :size="17" fill="currentColor"/><Mic v-else :size="19"/>
      </button>
      <button class="btn primary" :disabled="!input || chat.sending || recording || busy"><Send :size="18"/>发送</button>
    </form>
  </section>
</template>
