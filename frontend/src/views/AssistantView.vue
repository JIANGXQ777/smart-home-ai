<script setup>
import { nextTick, ref } from 'vue'
import { Send, Sparkles } from '@lucide/vue'
import { useChatStore } from '../stores/chat'
const chat=useChatStore(); const input=ref(''); const stream=ref()
async function send(){const text=input.value; input.value=''; await chat.send(text); await nextTick(); stream.value?.scrollTo({top:stream.value.scrollHeight,behavior:'smooth'})}
</script>
<template>
  <section class="assistant-layout card">
    <div class="chat-intro"><div class="device-icon"><Sparkles/></div><div><h2>家庭控制助手</h2><p>描述你的需求，系统会先生成待确认动作，不会直接控制硬件。</p></div></div>
    <div ref="stream" class="chat-stream" aria-live="polite">
      <div v-if="!chat.messages.length" class="empty"><p>试试输入：</p><button v-for="x in ['打开空调','把空调调到 26 度','你能控制什么设备？']" :key="x" class="chip" @click="input=x;send()">{{ x }}</button></div>
      <div v-for="(message,index) in chat.messages" :key="index" class="message" :class="[message.role,message.error?'message-error':'']"><small>{{ message.role==='user'?'你':'AI' }}</small><p>{{ message.text }}</p></div>
    </div>
    <div v-if="chat.pendingAction" class="confirm-bar"><div><strong>等待确认</strong><span>{{ chat.pendingAction.deviceId }} / {{ chat.pendingAction.command }} {{ chat.pendingAction.value ?? '' }}</span></div><button class="btn primary" @click="chat.confirm">确认执行</button><button class="btn ghost" @click="chat.pendingAction=null">取消</button></div>
    <form class="chat-form" @submit.prevent="send"><label class="sr-only" for="chat-input">输入控制需求</label><input id="chat-input" v-model.trim="input" placeholder="例如：打开教室空调" autocomplete="off"/><button class="btn primary" :disabled="!input||chat.sending"><Send :size="18"/>发送</button></form>
  </section>
</template>
