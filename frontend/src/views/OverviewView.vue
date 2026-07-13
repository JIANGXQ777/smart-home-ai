<script setup>
import { computed, ref } from 'vue'
import { Thermometer, Droplets, Server, Bot, Mic } from '@lucide/vue'
import { useSystemStore } from '../stores/system'
import DeviceCard from '../components/DeviceCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
const store = useSystemStore()
const notice = ref('')
const esp32ConnectionLabel = computed(() => {
  const connection = store.system.esp32Connection
  if (!connection?.activeTransport) return connection?.mode === 'websocket' ? '等待 WebSocket 连接' : '硬件未连接'
  if (connection.activeTransport === 'websocket') {
    return `WebSocket · ${connection.websocket?.deviceId || connection.websocket?.remoteAddress || 'ESP32'}`
  }
  return `串口 · ${connection.serialPath || '未知端口'}`
})
async function execute(action) { try { const r=await store.execute(action); notice.value=r.message } catch(e) { notice.value=e.message } }
</script>
<template>
  <section class="page-stack">
    <div v-if="notice" class="alert">{{ notice }}</div>
    <div class="metric-grid">
      <article class="metric card"><Thermometer/><div><small>室内温度</small><strong>{{ store.environment.temperature ?? '--' }}°C</strong><span>{{ store.environment.source==='esp32'?'实时传感器':'模拟数据' }}</span></div></article>
      <article class="metric card"><Droplets/><div><small>室内湿度</small><strong>{{ store.environment.humidity ?? '--' }}%</strong><span>{{ store.environment.time || '--:--' }} 更新</span></div></article>
      <article class="metric card"><Server/><div><small>ESP32 网关</small><strong>{{ store.system.appMode==='demo'?'模拟模式':store.system.esp32Connected?'在线':'离线' }}</strong><span>{{ store.system.appMode==='demo'?'未连接真实硬件':esp32ConnectionLabel }}</span></div></article>
      <article class="metric card"><Bot/><div><small>AI 决策</small><strong>{{ store.system.aiDecisionEnabled?'已启用':'规则模式' }}</strong><span>{{ store.system.llmStatus?.ok?'模型可用':'本地规则可用' }}</span></div></article>
      <article class="metric card"><Mic/><div><small>硬件语音</small><strong>{{ !store.state.voice?.enabled?'未启用':store.state.voice?.connected?(store.state.voice?.speechConfigured?'可对话':'音频在线'):'等待终端' }}</strong><span>{{ store.state.voice?.processing?'正在处理':store.state.voice?.playing?'正在播放':store.state.voice?.speaking?'正在聆听':`音量 ${store.state.voice?.lastLevel||0}` }}</span></div></article>
    </div>
    <div class="section-title"><div><small>DEVICES</small><h2>设备快捷控制</h2></div><StatusBadge :tone="store.devices.length?'ok':'neutral'" :label="`${store.devices.length} 台设备`"/></div>
    <div class="device-grid"><DeviceCard v-for="device in store.devices" :key="device.id" :device="device" @execute="execute"/><div v-if="!store.devices.length" class="empty card">还没有设备，请先前往设备管理添加。</div></div>
    <div class="card activity"><h2>最近执行</h2><ul v-if="store.activities.length"><li v-for="item in store.activities" :key="item.id || item.at+item.text"><span>{{ item.success===false?'失败 · ':'' }}{{ item.text }}</span><time>{{ item.at }}</time></li></ul><p v-else class="muted">暂无持久化执行记录。</p></div>
  </section>
</template>
