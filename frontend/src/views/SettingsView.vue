<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Save } from '@lucide/vue'
import { api } from '../api/client'
import { useSystemStore } from '../stores/system'

const form = reactive({ appMode: 'demo', esp32Enabled: false, esp32Transport: 'auto', esp32WsToken: '', esp32WsPath: '/ws/esp32', serialPort: '', serialBaudRate: 115200 })
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
</script>

<template>
  <form class="settings-grid" @submit.prevent="save">
    <section class="card">
      <div class="section-title"><div><small>RUNTIME</small><h2>运行模式</h2></div></div>
      <label>模式<select v-model="form.appMode"><option value="demo">Demo · 规则 + 模拟环境</option><option value="hybrid">Hybrid · 模型 + 可选硬件</option><option value="hardware">Hardware · 模型 + ESP32</option></select></label>
      <p class="muted">模型服务在“模型配置”中管理；麦克风和扬声器集中在“AI 助手”页面使用。</p>
    </section>
    <section class="card">
      <div class="section-title"><div><small>HARDWARE</small><h2>ESP32 连接</h2></div></div>
      <label class="switch-row"><span>启用真实硬件</span><input v-model="form.esp32Enabled" type="checkbox"/></label>
      <label>连接方式<select v-model="form.esp32Transport"><option value="auto">自动 · WebSocket 优先，串口兜底</option><option value="websocket">仅 WebSocket</option><option value="serial">仅 USB 串口</option></select></label>
      <template v-if="form.esp32Transport !== 'serial'"><label>WebSocket 路径<input :value="form.esp32WsPath" disabled/></label><label>连接令牌<input v-model.trim="form.esp32WsToken" type="password" :placeholder="form.esp32WsTokenConfigured ? '已配置，留空保持不变' : '建议设置连接令牌'"/></label></template>
      <template v-if="form.esp32Transport !== 'websocket'"><label>兜底串口<input v-model.trim="form.serialPort" placeholder="COM3"/></label><label>波特率<input v-model.number="form.serialBaudRate" type="number"/></label></template>
    </section>
    <section class="card browser-voice-settings">
      <div class="section-title"><div><small>CONSOLE VOICE</small><h2>控制台语音交互</h2></div></div>
      <p>硬件语音终端已停用。录音、识别和播报现在全部在 AI 助手页面完成：</p>
      <ul><li>麦克风按键录音</li><li>ASR 转文字后进入现有 AI 对话</li><li>TTS 通过默认扬声器播放</li><li>ESP32 继续负责红外、传感器和设备状态</li></ul>
      <RouterLink class="btn secondary" :to="{ name: 'assistant' }">前往 AI 助手</RouterLink>
    </section>
    <div class="settings-actions"><div><span v-if="notice" class="alert">{{ notice }}</span><span v-if="error" class="alert error">{{ error }}</span></div><button class="btn primary" :disabled="saving"><Save :size="18"/>{{ saving ? '保存中…' : '保存系统设置' }}</button></div>
  </form>
</template>
