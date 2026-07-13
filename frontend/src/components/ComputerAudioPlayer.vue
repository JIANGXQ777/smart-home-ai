<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Volume1, Volume2, VolumeX } from '@lucide/vue'
import { useSystemStore } from '../stores/system'

const system = useSystemStore()
const enabled = ref(false)
const playing = ref(false)
const error = ref('')
const volumeOpen = ref(false)
const savedVolumeValue = localStorage.getItem('voicePlaybackVolume')
const savedVolume = savedVolumeValue === null ? Number.NaN : Number(savedVolumeValue)
const volume = ref(Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 1)
let timer = null
let busy = false
let currentAudio = null
let audioContext = null
let lastAudioId = 0

const visible = computed(() => system.state.voice?.playbackTarget === 'browser')
const label = computed(() => error.value ? '重新启用电脑播放' : playing.value ? '电脑正在播放' : enabled.value ? '电脑播放已启用' : '启用电脑播放')
const volumePercent = computed(() => Math.round(volume.value * 100))
const volumeIcon = computed(() => volume.value === 0 ? VolumeX : volume.value < 0.5 ? Volume1 : Volume2)

watch(volume, value => {
  localStorage.setItem('voicePlaybackVolume', String(value))
  if (currentAudio) currentAudio.volume = value
})

async function unlockAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioContext ||= new AudioContextClass()
      await audioContext.resume()
      const buffer = audioContext.createBuffer(1, 1, 22050)
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.start(0)
    }
    enabled.value = true
    error.value = ''
    if (!timer) timer = window.setInterval(pollAudio, 500)
    await pollAudio()
  } catch (exception) {
    error.value = exception.message || '浏览器音频权限启用失败'
  }
}

async function acknowledge(audioId) {
  await fetch(`/api/voice/browser-audio/${audioId}/finished`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
}

async function pollAudio() {
  if (!visible.value || !enabled.value || busy) return
  busy = true
  let objectUrl = ''
  try {
    const response = await fetch(`/api/voice/browser-audio?after=${lastAudioId}`, { cache: 'no-store' })
    if (response.status === 204) return
    if (!response.ok) throw new Error(`音频获取失败 (${response.status})`)
    const audioId = Number(response.headers.get('X-Audio-Id'))
    const blob = await response.blob()
    objectUrl = URL.createObjectURL(blob)
    currentAudio = new Audio(objectUrl)
    currentAudio.volume = volume.value
    playing.value = true
    await currentAudio.play()
    await new Promise((resolve, reject) => {
      currentAudio.onended = resolve
      currentAudio.onerror = () => reject(new Error('电脑音频播放失败'))
    })
    lastAudioId = audioId
    await acknowledge(audioId)
    error.value = ''
  } catch (exception) {
    error.value = exception.message || '电脑音频播放失败'
    enabled.value = false
    if (timer) window.clearInterval(timer)
    timer = null
  } finally {
    playing.value = false
    currentAudio = null
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    busy = false
  }
}

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  currentAudio?.pause()
  audioContext?.close()
})
</script>

<template>
  <div v-if="visible" class="audio-player" @keydown.esc="volumeOpen=false">
    <button type="button" class="audio-output-btn" :class="{ active: enabled, playing, error: error }" :title="error || label" @click="unlockAudio">
      <Volume2 :size="17"/><span>{{ label }}</span><i aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="icon-btn audio-volume-toggle"
      :aria-label="`调节电脑播放音量，当前 ${volumePercent}%`"
      :aria-expanded="volumeOpen"
      aria-controls="voice-volume-panel"
      :title="`播放音量 ${volumePercent}%`"
      @click="volumeOpen=!volumeOpen"
    >
      <component :is="volumeIcon" :size="18"/>
    </button>
    <div v-if="volumeOpen" id="voice-volume-panel" class="audio-volume-panel">
      <label for="voice-volume-range"><span>电脑播放音量</span><output>{{ volumePercent }}%</output></label>
      <div class="audio-volume-row">
        <component :is="volumeIcon" :size="18" aria-hidden="true"/>
        <input
          id="voice-volume-range"
          v-model.number="volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          aria-label="电脑播放音量"
          :aria-valuetext="`${volumePercent}%`"
        />
      </div>
    </div>
  </div>
</template>
