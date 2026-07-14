<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, MessageCircle, Cpu, Radio, BrainCircuit, Settings, Moon, Sun, RefreshCw, LogOut, UserRound, HouseWifi } from '@lucide/vue'
import { useSystemStore } from '../stores/system'
import { useAuthStore } from '../stores/auth'

const system = useSystemStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const dark = ref(localStorage.getItem('theme') === 'dark')
const nav = [
  ['overview', '总览', LayoutDashboard], ['assistant', 'AI 助手', MessageCircle],
  ['devices', '设备', Cpu], ['ir-learning', '红外', Radio], ['models', '模型', BrainCircuit], ['settings', '设置', Settings]
]

watch(dark, value => {
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  localStorage.setItem('theme', value ? 'dark' : 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#0d1714' : '#f4f7f5')
}, { immediate: true })
onMounted(system.startPolling)
onBeforeUnmount(system.stopPolling)

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><HouseWifi :size="21"/></span><div><strong>Smart Home AI</strong><small>智能家居控制台</small></div></div>
      <span class="nav-label">控制中心</span>
      <nav class="side-nav" aria-label="主导航">
        <RouterLink v-for="[name,label,icon] in nav" :key="name" :to="{name}"><component :is="icon" :size="19"/><span>{{ label }}</span></RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-account"><UserRound :size="17"/><div><strong>{{ auth.user?.username }}</strong><small>管理员账户</small></div></div>
        <div class="sidebar-foot"><span class="status-dot" :class="system.system.esp32Connected ? 'ok' : 'warn'"></span><div><strong>{{ system.system.esp32Connected ? '硬件在线' : '硬件未连接' }}</strong><small>公网 WSS 连接</small></div></div>
      </div>
    </aside>
    <main id="main-content" class="main-area" tabindex="-1">
      <header class="topbar">
        <div class="topbar-title"><small>SMART HOME / {{ route.meta.title }}</small><h1>{{ route.meta.title }}</h1></div>
        <div class="top-actions">
          <button class="icon-btn" @click="system.refresh" aria-label="刷新状态" title="刷新状态"><RefreshCw :size="18" :class="{spin:system.loading}"/></button>
          <button class="icon-btn" @click="dark=!dark" :aria-label="dark?'切换浅色主题':'切换深色主题'" :title="dark?'切换浅色主题':'切换深色主题'"><Sun v-if="dark" :size="18"/><Moon v-else :size="18"/></button>
          <button class="icon-btn danger" @click="logout" aria-label="退出登录" title="退出登录"><LogOut :size="18"/></button>
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
