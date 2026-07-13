<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { LayoutDashboard, MessageCircle, Cpu, Radio, BrainCircuit, Settings, Moon, Sun, RefreshCw } from '@lucide/vue'
import { useSystemStore } from '../stores/system'
import ComputerAudioPlayer from '../components/ComputerAudioPlayer.vue'

const system = useSystemStore()
const route = useRoute()
const dark = ref(localStorage.getItem('theme') !== 'light')
const nav = [
  ['overview', '总览', LayoutDashboard], ['assistant', 'AI 助手', MessageCircle],
  ['devices', '设备', Cpu], ['ir-learning', '红外', Radio], ['models', '模型', BrainCircuit], ['settings', '设置', Settings]
]
watch(dark, value => {
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  localStorage.setItem('theme', value ? 'dark' : 'light')
}, { immediate: true })
onMounted(system.startPolling)
onBeforeUnmount(system.stopPolling)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">S</span><div><strong>Smart Home AI</strong><small>红外控制中心</small></div></div>
      <nav class="side-nav" aria-label="主导航">
        <RouterLink v-for="[name,label,icon] in nav" :key="name" :to="{name}"><component :is="icon" :size="19"/><span>{{ label }}</span></RouterLink>
      </nav>
      <div class="sidebar-foot"><span class="status-dot" :class="system.system.esp32Connected ? 'ok' : 'warn'"></span>{{ system.system.esp32Connected ? '硬件在线' : '硬件未连接' }}</div>
    </aside>
    <main class="main-area">
      <header class="topbar">
        <div><small>SMART HOME / {{ route.meta.title }}</small><h1>{{ route.meta.title }}</h1></div>
        <div class="top-actions">
          <ComputerAudioPlayer />
          <button class="icon-btn" @click="system.refresh" aria-label="刷新状态"><RefreshCw :size="18" :class="{spin:system.loading}"/></button>
          <button class="icon-btn" @click="dark=!dark" :aria-label="dark?'切换浅色主题':'切换深色主题'"><Sun v-if="dark" :size="18"/><Moon v-else :size="18"/></button>
        </div>
      </header>
      <div v-if="system.error" class="alert error">后端连接失败：{{ system.error }}</div>
      <RouterView />
    </main>
    <nav class="mobile-nav" aria-label="移动端主导航">
      <RouterLink v-for="[name,label,icon] in nav" :key="name" :to="{name}"><component :is="icon" :size="20"/><span>{{ label }}</span></RouterLink>
    </nav>
  </div>
</template>
