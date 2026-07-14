import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api/client'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const checked = ref(false)
  const loading = ref(false)
  const authenticated = computed(() => Boolean(user.value))

  async function check() {
    try {
      const result = await api('/api/auth/status', {}, { redirectOnUnauthorized: false })
      user.value = result.authenticated ? result.user : null
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
    return authenticated.value
  }

  async function login(credentials) {
    loading.value = true
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      }, { redirectOnUnauthorized: false })
      user.value = result.user
      checked.value = true
      return result
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' }, { redirectOnUnauthorized: false })
    } finally {
      user.value = null
      checked.value = true
    }
  }

  return { user, checked, loading, authenticated, check, login, logout }
})
