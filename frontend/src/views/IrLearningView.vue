<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Radio, Save, Trash2 } from '@lucide/vue'
import { useSystemStore } from '../stores/system'
import { useIrLearningStore } from '../stores/irLearning'
const system=useSystemStore(); const store=useIrLearningStore(); const form=reactive({deviceId:'',command:'',value:26}); const error=ref('');
const device=computed(()=>system.devices.find(d=>d.id===form.deviceId));
const flatCodes=computed(()=>{const rows=[]; for(const [deviceId,actions] of Object.entries(store.codes)){for(const [command,entry] of Object.entries(actions)){if(command==='set_temperature'){for(const [value,p] of Object.entries(entry.variants||{})) rows.push({deviceId,command,value:Number(value),legacy:false,...p}); if(entry.legacy) rows.push({deviceId,command,value:null,legacy:true,...entry.legacy})}else rows.push({deviceId,command,value:null,legacy:false,...entry})}} return rows})
onMounted(store.load)
async function run(fn){try{error.value=''; await fn()}catch(e){error.value=e.message}}
</script>
<template>
  <section class="split-layout">
    <div class="card learning-panel"><div class="section-title"><div><small>CAPTURE</small><h2>学习红外码</h2></div><Radio/></div><p class="muted">将遥控器对准 ESP32 接收头，依次完成捕获和保存。</p><div v-if="error" class="alert error">{{ error }}</div><label>设备<select v-model="form.deviceId"><option value="">请选择</option><option v-for="d in system.devices.filter(x=>x.controlType==='ir')" :key="d.id" :value="d.id">{{ d.name }}</option></select></label><label>动作<select v-model="form.command" :disabled="!device"><option value="">请选择</option><option v-for="a in device?.actions||[]" :key="a" :value="a">{{ a }}</option></select></label><label v-if="form.command==='set_temperature'">目标温度<input v-model.number="form.value" type="number" :min="device?.capabilities?.temperature?.min||16" :max="device?.capabilities?.temperature?.max||30"/></label><button class="btn primary wide" :disabled="!form.deviceId||!form.command||store.learning" @click="run(store.start)">{{ store.learning?'等待遥控器信号…':'开始学习' }}</button><div v-if="store.learned" class="capture-result"><strong>捕获成功</strong><code>{{ store.learned.protocol }} · {{ store.learned.code }} · {{ store.learned.bits }} bits</code><button class="btn primary" @click="run(()=>store.save(form))"><Save :size="17"/>保存红外码</button></div></div>
    <div class="card"><div class="section-title"><div><small>LIBRARY</small><h2>已录入红外码</h2></div><span class="tag">{{ flatCodes.length }} 条</span></div><div class="code-list"><div v-for="code in flatCodes" :key="`${code.deviceId}-${code.command}-${code.legacy?'legacy':code.value}`" class="code-row"><div><strong>{{ system.devices.find(d=>d.id===code.deviceId)?.name||code.deviceId }}</strong><span>{{ code.command }} {{ typeof code.value==='number'?`/ ${code.value}度`:code.legacy?'/ 旧码':'' }}</span><code>{{ code.protocol }} · {{ code.code }}</code></div><button class="icon-btn danger" @click="run(()=>store.remove(code.deviceId,code.command,code.value,code.legacy))"><Trash2 :size="17"/></button></div><p v-if="!flatCodes.length" class="empty muted">暂无红外码。</p></div></div>
  </section>
</template>
