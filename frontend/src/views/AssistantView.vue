<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { LoaderCircle, Mic, Send, Sparkles, Square } from '@lucide/vue'
import { api } from '../api/client'
import { useChatStore } from '../stores/chat'

const chat = useChatStore()
const input = ref('')
const stream = ref()
const voiceConnected = ref(false)
const recording = ref(false)
const voiceProcessing = ref(false)
const voicePlaying = ref(false)
const voiceToggling = ref(false)
const lastHandledManualId = ref(0)
let voiceStatusInitialized = false
let pollTimer = null
let pollBusy = false
let statusRequestSequence = 0
let lastAppliedStatusSequence = 0

const recordButtonBusy = computed(() => voiceProcessing.value || voicePlaying.value || voiceToggling.value)
const recordButtonLabel = computed(() => {
  if (recording.value) return '停止硬件麦克风录音'
  if (voiceProcessing.value) return '语音识别处理中'
  if (voicePlaying.value) return '语音播放中'
  return '开始硬件麦克风录音'
})
const recordButtonTitle = computed(() => {
  if (!voiceConnected.value) return 'ESP32 语音终端未连接'
  if (recording.value) return '点击结束录音'
  if (voiceProcessing.value) return '正在识别并生成回复'
  if (voicePlaying.value) return '请等待电脑播放结束'
  return '使用硬件麦克风录音'
})

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

async function applyVoiceStatus(status, { ignoreTerminalResult = false, requestSequence = 0 } = {}) {
  if (requestSequence && requestSequence < lastAppliedStatusSequence) return
  if (requestSequence) lastAppliedStatusSequence = requestSequence
  voiceConnected.value = Boolean(status?.connected)
  recording.value = Boolean(status?.manualRecording)
  voiceProcessing.value = Boolean(status?.processing || status?.manualResult?.status === 'processing')
  voicePlaying.value = Boolean(status?.playing)
  const result = status?.manualResult
  if (!result?.id || !['completed', 'error'].includes(result.status)) return
  if (ignoreTerminalResult) {
    lastHandledManualId.value = Math.max(lastHandledManualId.value, result.id)
    return
  }
  if (result.id <= lastHandledManualId.value) return
  lastHandledManualId.value = result.id
  chat.appendVoiceExchange(result.transcript, result.reply, result.error)
  await scrollToBottom()
}

async function pollVoiceStatus() {
  if (pollBusy) return
  pollBusy = true
  const requestSequence = ++statusRequestSequence
  try {
    const status = await api('/api/voice/status')
    await applyVoiceStatus(status, { ignoreTerminalResult: !voiceStatusInitialized, requestSequence })
    voiceStatusInitialized = true
  } catch {
    if (requestSequence >= lastAppliedStatusSequence) {
      lastAppliedStatusSequence = requestSequence
      voiceConnected.value = false
      recording.value = false
      voiceProcessing.value = false
      voicePlaying.value = false
    }
  } finally {
    pollBusy = false
  }
}

async function toggleRecording() {
  if (recordButtonBusy.value) return
  voiceToggling.value = true
  const requestSequence = ++statusRequestSequence
  try {
    const result = await api('/api/voice/manual-recording', {
      method: 'POST',
      body: JSON.stringify({ enabled: !recording.value })
    })
    await applyVoiceStatus(result.status, { requestSequence })
  } catch (error) {
    lastAppliedStatusSequence = Math.max(lastAppliedStatusSequence, requestSequence)
    chat.appendVoiceExchange('', '', error.message)
    await scrollToBottom()
    await pollVoiceStatus()
  } finally {
    voiceToggling.value = false
  }
}

onMounted(async () => {
  await pollVoiceStatus()
  pollTimer = window.setInterval(pollVoiceStatus, 700)
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <section class="assistant-layout card">
    <div class="chat-intro">
      <div class="device-icon"><Sparkles/></div>
      <div><h2>家庭控制助手</h2><p>描述你的需求，系统会先生成待确认动作，不会直接控制硬件。</p></div>
    </div>
    <div ref="stream" class="chat-stream" aria-live="polite">
      <div v-if="!chat.messages.length" class="empty">
        <p>试试输入：</p>
        <button v-for="x in ['打开空调','把空调调到 26 度','你能控制什么设备？']" :key="x" class="chip" @click="input=x;send()">{{ x }}</button>
      </div>
      <div v-for="(message,index) in chat.messages" :key="index" class="message" :class="[message.role,message.error?'message-error':'']">
        <small>{{ message.role === 'user' ? (message.voice ? '你 · 语音' : '你') : 'AI' }}</small>
        <p>{{ message.text }}</p>
      </div>
    </div>
    <div v-if="chat.pendingAction" class="confirm-bar">
      <div><strong>等待确认</strong><span>{{ chat.pendingAction.deviceId }} / {{ chat.pendingAction.command }} {{ chat.pendingAction.value ?? '' }}</span></div>
      <button class="btn primary" @click="chat.confirm">确认执行</button>
      <button class="btn ghost" @click="chat.pendingAction=null">取消</button>
    </div>
    <form class="chat-form" @submit.prevent="send">
      <label class="sr-only" for="chat-input">输入控制需求</label>
      <input id="chat-input" v-model.trim="input" placeholder="例如：打开教室空调" autocomplete="off"/>
      <button
        type="button"
        class="record-btn"
        :class="{ recording, processing: recordButtonBusy && !recording }"
        :disabled="!voiceConnected || recordButtonBusy || chat.sending"
        :aria-label="recordButtonLabel"
        :aria-pressed="recording"
        :title="recordButtonTitle"
        @click="toggleRecording"
      >
        <LoaderCircle v-if="recordButtonBusy && !recording" :size="19" class="spin"/>
        <Square v-else-if="recording" :size="17" fill="currentColor"/>
        <Mic v-else :size="19"/>
      </button>
      <button class="btn primary" :disabled="!input || chat.sending || recording || voiceProcessing"><Send :size="18"/>发送</button>
    </form>
  </section>
</template>
