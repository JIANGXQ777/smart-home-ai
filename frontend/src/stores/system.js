import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'

export const useSystemStore = defineStore('system', () => {
  const state = ref({ environment: {}, devices: [], system: {} })
  const loading = ref(false)
  const error = ref('')
  const activities = ref([])
  let timer

  const devices = computed(() => state.value.devices || [])
  const environment = computed(() => state.value.environment || {})
  const system = computed(() => state.value.system || {})

  async function refresh() {
    try {
      loading.value = true
      state.value = await api('/api/state')
      activities.value = (state.value.recentEvents || []).map(event => ({
        id: event.id,
        text: event.message,
        success: event.success,
        at: new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false })
      }))
      error.value = ''
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function startPolling() {
    refresh()
    clearInterval(timer)
    timer = setInterval(refresh, 5000)
  }

  function stopPolling() { clearInterval(timer) }

  async function execute(action) {
    const result = await api('/api/execute', { method: 'POST', body: JSON.stringify(action) })
    if (!result.success) throw new Error(result.message || '执行失败')
    await refresh()
    return result
  }

  return { state, devices, environment, system, loading, error, activities, refresh, startPolling, stopPolling, execute }
})
