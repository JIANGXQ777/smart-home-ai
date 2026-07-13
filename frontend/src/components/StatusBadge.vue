<script setup>
defineProps({ tone: { type: String, default: 'neutral' }, label: { type: String, required: true } })
</script>
<template><span class="badge" :class="tone"><span class="status-dot" :class="tone"></span>{{ label }}</span></template>
