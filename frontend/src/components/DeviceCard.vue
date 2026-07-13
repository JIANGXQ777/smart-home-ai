<script setup>
import { Power, Thermometer, MapPin } from '@lucide/vue'
import StatusBadge from './StatusBadge.vue'
defineProps({ device: { type: Object, required: true } })
defineEmits(['execute'])
</script>
<template>
  <article class="card device-card">
    <div class="card-head"><div class="device-icon"><Power :size="21"/></div><StatusBadge :tone="device.stateConfidence==='reported'?'ok':device.stateConfidence==='unknown'?'neutral':'warn'" :label="device.stateConfidence==='reported'?'真实状态':device.stateConfidence==='simulated'?'模拟状态':device.stateConfidence==='unknown'?'状态未知':'推测状态'"/></div>
    <div><h3>{{ device.name }}</h3><p class="muted row"><MapPin :size="14"/>{{ device.location || '未设置位置' }}</p></div>
    <div class="device-state"><strong>{{ device.status === 'on' ? '推测开启' : device.status === 'off' ? '推测关闭' : '状态未知' }}</strong><span v-if="device.targetTemperature" class="row"><Thermometer :size="15"/>{{ device.targetTemperature }}°C</span></div>
    <div class="button-row">
      <button class="btn secondary" :disabled="device.status==='on'" @click="$emit('execute',{deviceId:device.id,command:'turn_on'})">开启</button>
      <button class="btn secondary" :disabled="device.status==='off'" @click="$emit('execute',{deviceId:device.id,command:'turn_off'})">关闭</button>
    </div>
    <small class="muted">最后命令：{{ device.lastCommand?.command || '暂无' }}</small>
  </article>
</template>
