<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Save, Volume2 } from '@lucide/vue'
import { api } from '../api/client'
import { useSystemStore } from '../stores/system'

const form = reactive({ appMode: 'demo', esp32Enabled: false, esp32Transport: 'auto', esp32WsToken: '', esp32WsPath: '/ws/esp32', serialPort: '', serialBaudRate: 115200, voiceEnabled: false, voiceVadThreshold: 700, voiceSilenceMs: 700 })
const notice = ref('')
const error = ref('')
const saving = ref(false)

onMounted(async () => Object.assign(form, await api('/api/config')))

async function save() {
  try {
    saving.value = true
    error.value = ''
    notice.value = ''
    const result = await api('/api/config', { method: 'POST', body: JSON.stringify(form) })
    notice.value = result.message
    Object.assign(form, result.config)
    await useSystemStore().refresh()
  } catch (exception) {
    error.value = exception.message
  } finally {
    saving.value = false
  }
}

async function testVoice() {
  try {
    error.value = ''
    const result = await api('/api/voice/test-tone', { method: 'POST', body: '{}' })
    notice.value = result.message
  } catch (exception) {
    error.value = exception.message
  }
}
</script>

<template>
  <form class="settings-grid" @submit.prevent="save">
    <section class="card">
      <div class="section-title"><div><small>RUNTIME</small><h2>运行模式</h2></div></div>
      <label>模式<select v-model="form.appMode"><option value="demo">Demo · 规则 + 模拟环境</option><option value="hybrid">Hybrid · 模型 + 可选硬件</option><option value="hardware">Hardware · 模型 + ESP32</option></select></label>
      <p class="muted">模型服务已移到“模型配置”，这里仅控制系统和硬件运行方式。</p>
    </section>
    <section class="card">
      <div class="section-title"><div><small>HARDWARE</small><h2>ESP32 连接</h2></div></div>
      <label class="switch-row"><span>启用真实硬件</span><input v-model="form.esp32Enabled" type="checkbox"/></label>
      <label>连接方式<select v-model="form.esp32Transport"><option value="auto">自动 · WebSocket 优先，串口兜底</option><option value="websocket">仅 WebSocket</option><option value="serial">仅 USB 串口</option></select></label>
      <template v-if="form.esp32Transport !== 'serial'"><label>WebSocket 路径<input :value="form.esp32WsPath" disabled/></label><label>连接令牌<input v-model.trim="form.esp32WsToken" type="password" :placeholder="form.esp32WsTokenConfigured ? '已配置，留空保持不变' : '建议设置连接令牌'"/></label></template>
      <template v-if="form.esp32Transport !== 'websocket'"><label>兜底串口<input v-model.trim="form.serialPort" placeholder="COM3"/></label><label>波特率<input v-model.number="form.serialBaudRate" type="number"/></label></template>
    </section>
    <section class="card voice-terminal-card">
      <div class="section-title"><div><small>VOICE TERMINAL</small><h2>硬件语音终端</h2></div><Volume2 :size="21"/></div>
      <label class="switch-row"><span>启用麦克风持续监听</span><input v-model="form.voiceEnabled" type="checkbox"/></label>
      <label>声音检测阈值<input v-model.number="form.voiceVadThreshold" type="number" min="50" max="10000"/></label>
      <label>结束静音时间（ms）<input v-model.number="form.voiceSilenceMs" type="number" min="200" max="3000"/></label>
      <button type="button" class="btn secondary" @click="testVoice"><Volume2 :size="17"/>播放硬件测试音</button>
      <p class="muted">ASR、TTS 和语言模型的接口、模型与密钥请在“模型配置”中管理。</p>
    </section>
    <div class="settings-actions"><div><span v-if="notice" class="alert">{{ notice }}</span><span v-if="error" class="alert error">{{ error }}</span></div><button class="btn primary" :disabled="saving"><Save :size="18"/>{{ saving ? '保存中…' : '保存系统设置' }}</button></div>
  </form>
</template>
