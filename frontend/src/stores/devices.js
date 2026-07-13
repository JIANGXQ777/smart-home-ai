import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import { useSystemStore } from './system'

export const useDevicesStore = defineStore('devices', () => {
  const definitions = ref([])
  const presets = ref({})

  async function load() {
    ;[definitions.value, presets.value] = await Promise.all([api('/api/devices'), api('/api/device-types')])
  }
  async function save(device, editingId) {
    const path = editingId ? `/api/devices/${editingId}` : '/api/devices'
    const method = editingId ? 'PUT' : 'POST'
    await api(path, { method, body: JSON.stringify(device) })
    await Promise.all([load(), useSystemStore().refresh()])
  }
  async function remove(id) {
    await api(`/api/devices/${id}`, { method: 'DELETE' })
    await Promise.all([load(), useSystemStore().refresh()])
  }
  return { definitions, presets, load, save, remove }
})
