<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, HouseWifi, LockKeyhole, LogIn, ShieldCheck } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const canSubmit = computed(() => username.value.trim() && password.value && !auth.loading)

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  try {
    await auth.login({ username: username.value.trim(), password: password.value })
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
    await router.replace(redirect)
  } catch (requestError) {
    error.value = requestError.message || '登录失败，请稍后重试'
    password.value = ''
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-visual" aria-label="Smart Home AI 远程控制说明">
      <div class="login-brand"><span class="brand-mark"><HouseWifi :size="22" /></span><strong>Smart Home AI</strong></div>
      <div class="login-copy">
        <small>SECURE HOME CONTROL</small>
        <h1>让家的状态，<br>始终触手可及。</h1>
        <p>AI 理解你的自然语言，红外改造家里的传统电器。无需更换旧设备，也能获得对话控制、远程管理与自动化能力。</p>
      </div>
      <div class="login-security"><ShieldCheck :size="20" /><div><strong>安全连接已启用</strong><span>HTTPS · 会话保护 · 登录限制</span></div></div>
    </section>

    <section class="login-panel">
      <form class="login-card" @submit.prevent="submit">
        <div class="login-card-icon"><LockKeyhole :size="23" /></div>
        <small>WELCOME BACK</small>
        <h2>登录控制中心</h2>
        <p class="muted">请输入管理员账号，继续管理设备与自动化。</p>
        <div v-if="error" class="alert error" role="alert">{{ error }}</div>

        <label for="login-username">用户名
          <input id="login-username" v-model="username" name="username" autocomplete="username" autofocus required placeholder="请输入用户名">
        </label>
        <label for="login-password">密码
          <span class="password-field">
            <input id="login-password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required placeholder="请输入密码">
            <button type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
        </label>

        <button class="btn primary wide login-submit" type="submit" :disabled="!canSubmit">
          <LogIn :size="18" />{{ auth.loading ? '正在登录…' : '登录' }}
        </button>
        <p class="login-footnote"><ShieldCheck :size="14" />登录信息仅发送到你的 Smart Home AI 服务。</p>
      </form>
    </section>
  </main>
</template>
