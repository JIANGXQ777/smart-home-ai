import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import { useSystemStore } from './system'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const pendingAction = ref(null)
  const sending = ref(false)

  async function send(text) {
    const message = text.trim()
    if (!message || sending.value) return
    messages.value.push({ role: 'user', text: message })
    sending.value = true
    try {
      const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) })
      messages.value.push({ role: 'assistant', text: result.reply })
      pendingAction.value = result.needConfirm ? result.action : null
    } catch (error) {
      messages.value.push({ role: 'assistant', text: error.message, error: true })
    } finally {
      sending.value = false
    }
  }

  async function confirm() {
    if (!pendingAction.value) return
    const system = useSystemStore()
    try {
      const result = await system.execute(pendingAction.value)
      messages.value.push({ role: 'assistant', text: result.message })
    } catch (error) {
      messages.value.push({ role: 'assistant', text: error.message, error: true })
    } finally {
      pendingAction.value = null
    }
  }

  function appendVoiceExchange(transcript, reply, error = '') {
    if (transcript) messages.value.push({ role: 'user', text: transcript, voice: true })
    if (reply || error) messages.value.push({ role: 'assistant', text: error || reply, error: Boolean(error), voice: true })
  }

  return { messages, pendingAction, sending, send, confirm, appendVoiceExchange }
})
