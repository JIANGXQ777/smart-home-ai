import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import { useSystemStore } from './system'

export const useIrLearningStore = defineStore('irLearning', () => {
  const codes = ref({})
  const learned = ref(null)
  const learning = ref(false)

  async function load() { codes.value = await api('/api/ir-learn/codes') }
  async function start() {
    learning.value = true
    learned.value = null
    try {
      const result = await api('/api/ir-learn/start', { method: 'POST' })
      if (!result.success) throw new Error(result.message)
      learned.value = result.learned
    } finally { learning.value = false }
  }
  async function save(payload) {
    await api('/api/ir-learn/save', { method: 'POST', body: JSON.stringify({ ...payload, learned: learned.value }) })
    learned.value = null
    await Promise.all([load(), useSystemStore().refresh()])
  }
  async function remove(deviceId, command, value, legacy = false) {
    await api('/api/ir-learn/codes', { method: 'DELETE', body: JSON.stringify({ deviceId, command, value, legacy }) })
    await load()
  }
  return { codes, learned, learning, load, start, save, remove }
})
