<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { AudioLines, BrainCircuit, Database, Eye, EyeOff, Save, Volume2 } from '@lucide/vue'
import { api } from '../api/client'
import { playWavBlob, unlockSpeaker } from '../services/browserVoice'
import { useSystemStore } from '../stores/system'

const defaults = {
  llm: { type: 'llm', enabled: false, provider: 'openai-compatible', baseUrl: '', apiKey: '', apiKeyConfigured: false, model: '', settings: { endpointPath: '', timeoutMs: 15000, maxCompletionTokens: 1024, temperature: 0.2 } },
  asr: { type: 'asr', enabled: false, provider: 'openai-compatible', baseUrl: '', apiKey: '', apiKeyConfigured: false, model: '', settings: { endpointPath: '', language: 'zh', timeoutMs: 30000 } },
  tts: { type: 'tts', enabled: false, provider: 'openai-compatible', baseUrl: '', apiKey: '', apiKeyConfigured: false, model: '', settings: { endpointPath: '', voice: 'alloy', timeoutMs: 30000, sourceSampleRate: 24000, volume: 0.25 } }
}
const models = reactive(structuredClone(defaults))
const keyVisible = reactive({ llm: false, asr: false, tts: false })
const loading = ref(true)
const saving = ref(false)
const testingTts = ref(false)
const notice = ref('')
const error = ref('')
const configuredCount = computed(() => Object.values(models).filter(item => item.apiKeyConfigured || item.apiKey).length)
const enabledCount = computed(() => Object.values(models).filter(item => item.enabled).length)

function assignModels(value) {
  for (const type of ['llm', 'asr', 'tts']) {
    Object.assign(models[type], value[type] || {})
    models[type].settings = { ...defaults[type].settings, ...(value[type]?.settings || {}) }
    models[type].apiKey = ''
  }
}

onMounted(async () => {
  try { assignModels((await api('/api/models')).models) }
  catch (exception) { error.value = exception.message }
  finally { loading.value = false }
})

async function save() {
  try {
    saving.value = true
    notice.value = ''
    error.value = ''
    const result = await api('/api/models', { method: 'PUT', body: JSON.stringify({ models }) })
    assignModels(result.models)
    notice.value = result.message
    await useSystemStore().refresh()
  } catch (exception) { error.value = exception.message }
  finally { saving.value = false }
}

function keyPlaceholder(type) { return models[type].apiKeyConfigured ? '已保存，留空保持不变' : '输入服务商 API Key' }

async function testTts() {
  try {
    testingTts.value = true
    notice.value = ''
    error.value = ''
    await unlockSpeaker()
    const response = await fetch('/api/voice/synthesize', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '你好，我是智能家居助手。' })
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(result.message || `语音合成失败 (${response.status})`)
    }
    await playWavBlob(await response.blob(), 1)
    notice.value = 'TTS 测试语音已通过电脑扬声器播放。'
  } catch (exception) { error.value = exception.message }
  finally { testingTts.value = false }
}
</script>

<template>
  <form class="page-stack model-config-page" @submit.prevent="save">
    <section class="card model-summary">
      <div class="model-summary-icon"><Database :size="23"/></div>
      <div><small>SQLITE MODEL REGISTRY</small><h2>模型配置统一存储</h2><p>ASR、TTS 和语言模型独立管理，保存后无需重启即可生效。API Key 不会回传到浏览器。</p></div>
      <div class="model-summary-stats"><span><strong>{{ enabledCount }}</strong> 已启用</span><span><strong>{{ configuredCount }}</strong> 已配置密钥</span></div>
    </section>
    <div v-if="loading" class="card empty">正在读取数据库配置…</div>
    <div v-else class="model-config-grid">
      <section class="card model-card">
        <div class="model-card-head"><div class="model-icon llm"><BrainCircuit :size="22"/></div><div><small>LANGUAGE MODEL</small><h2>语言模型</h2><p>负责理解指令、对话与设备决策</p></div><label class="model-switch"><span class="sr-only">启用语言模型</span><input v-model="models.llm.enabled" type="checkbox"/></label></div>
        <div class="model-form"><label>服务商<input v-model.trim="models.llm.provider" placeholder="请输入服务商标识"/></label><label>服务地址<input v-model.trim="models.llm.baseUrl" type="url" placeholder="请输入服务地址"/></label><label>请求接口<input v-model.trim="models.llm.settings.endpointPath" placeholder="例如 /v1/chat/completions"/></label><label>模型名称<input v-model.trim="models.llm.model" placeholder="请输入模型名称"/></label><label>API Key<span class="secret-input"><input v-model.trim="models.llm.apiKey" :type="keyVisible.llm ? 'text' : 'password'" :placeholder="keyPlaceholder('llm')"/><button type="button" @click="keyVisible.llm = !keyVisible.llm" :aria-label="keyVisible.llm ? '隐藏语言模型密钥' : '显示语言模型密钥'"><EyeOff v-if="keyVisible.llm" :size="17"/><Eye v-else :size="17"/></button></span></label><div class="model-fields-row"><label>超时（ms）<input v-model.number="models.llm.settings.timeoutMs" type="number" min="1000" max="120000"/></label><label>最大 Token<input v-model.number="models.llm.settings.maxCompletionTokens" type="number" min="1" max="32768"/></label><label>温度<input v-model.number="models.llm.settings.temperature" type="number" min="0" max="2" step="0.1"/></label></div></div>
      </section>
      <section class="card model-card">
        <div class="model-card-head"><div class="model-icon asr"><AudioLines :size="22"/></div><div><small>AUTOMATIC SPEECH RECOGNITION</small><h2>ASR 语音识别</h2><p>把电脑麦克风采集的声音转换为文字</p></div><label class="model-switch"><span class="sr-only">启用 ASR</span><input v-model="models.asr.enabled" type="checkbox"/></label></div>
        <div class="model-form"><label>服务商<input v-model.trim="models.asr.provider" placeholder="请输入服务商标识"/></label><label>服务地址<input v-model.trim="models.asr.baseUrl" type="url" placeholder="请输入服务地址"/></label><label>请求接口<input v-model.trim="models.asr.settings.endpointPath" placeholder="例如 /v1/chat/completions"/></label><label>模型名称<input v-model.trim="models.asr.model" placeholder="请输入模型名称"/></label><label>API Key<span class="secret-input"><input v-model.trim="models.asr.apiKey" :type="keyVisible.asr ? 'text' : 'password'" :placeholder="keyPlaceholder('asr')"/><button type="button" @click="keyVisible.asr = !keyVisible.asr" :aria-label="keyVisible.asr ? '隐藏 ASR 密钥' : '显示 ASR 密钥'"><EyeOff v-if="keyVisible.asr" :size="17"/><Eye v-else :size="17"/></button></span></label><div class="model-fields-row two"><label>识别语言<input v-model.trim="models.asr.settings.language" placeholder="zh"/></label><label>超时（ms）<input v-model.number="models.asr.settings.timeoutMs" type="number" min="1000" max="120000"/></label></div></div>
      </section>
      <section class="card model-card">
        <div class="model-card-head"><div class="model-icon tts"><Volume2 :size="22"/></div><div><small>TEXT TO SPEECH</small><h2>TTS 语音合成</h2><p>把助手回复转换为电脑扬声器音频</p></div><label class="model-switch"><span class="sr-only">启用 TTS</span><input v-model="models.tts.enabled" type="checkbox"/></label></div>
        <div class="model-form"><label>服务商<input v-model.trim="models.tts.provider" placeholder="请输入服务商标识"/></label><label>服务地址<input v-model.trim="models.tts.baseUrl" type="url" placeholder="请输入服务地址"/></label><label>请求接口<input v-model.trim="models.tts.settings.endpointPath" placeholder="例如 /v1/chat/completions"/></label><label>模型名称<input v-model.trim="models.tts.model" placeholder="请输入模型名称"/></label><label>API Key<span class="secret-input"><input v-model.trim="models.tts.apiKey" :type="keyVisible.tts ? 'text' : 'password'" :placeholder="keyPlaceholder('tts')"/><button type="button" @click="keyVisible.tts = !keyVisible.tts" :aria-label="keyVisible.tts ? '隐藏 TTS 密钥' : '显示 TTS 密钥'"><EyeOff v-if="keyVisible.tts" :size="17"/><Eye v-else :size="17"/></button></span></label><div class="model-fields-row"><label>音色<input v-model.trim="models.tts.settings.voice" placeholder="请输入音色名称"/></label><label>播放音量<input v-model.number="models.tts.settings.volume" type="number" min="0.05" max="1" step="0.05"/></label><label>超时（ms）<input v-model.number="models.tts.settings.timeoutMs" type="number" min="1000" max="120000"/></label><label>源采样率<input v-model.number="models.tts.settings.sourceSampleRate" type="number" min="8000" max="48000"/></label></div><button type="button" class="btn secondary" :disabled="testingTts" @click="testTts"><Volume2 :size="17"/>{{ testingTts ? '合成中…' : '播放 TTS 测试语音' }}</button></div>
      </section>
    </div>
    <div class="model-save-bar"><div><span v-if="notice" class="alert">{{ notice }}</span><span v-if="error" class="alert error">{{ error }}</span></div><button class="btn primary" :disabled="loading || saving"><Save :size="18"/>{{ saving ? '保存中…' : '保存全部模型配置' }}</button></div>
  </form>
</template>
