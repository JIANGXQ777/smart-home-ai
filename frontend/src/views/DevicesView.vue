<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Plus, Pencil, Trash2, X } from '@lucide/vue'
import { useDevicesStore } from '../stores/devices'
const store=useDevicesStore(); const open=ref(false); const editing=ref(''); const error=ref('');
const form=reactive({id:'',name:'',type:'air_conditioner',location:''})
onMounted(store.load)
function show(device){editing.value=device?.id||''; Object.assign(form,device?{id:device.id,name:device.name,type:device.type,location:device.location}:{id:'',name:'',type:'air_conditioner',location:''}); open.value=true}
async function save(){try{error.value=''; await store.save({...form},editing.value); open.value=false}catch(e){error.value=e.message}}
async function remove(device){if(confirm(`确定删除“${device.name}”吗？`)) await store.remove(device.id)}
</script>
<template>
  <section class="page-stack">
    <div class="section-title"><div><small>DEVICE REGISTRY</small><h2>设备定义</h2></div><button class="btn primary" @click="show()"><Plus :size="18"/>添加设备</button></div>
    <div class="table-card card"><table><thead><tr><th>名称</th><th>位置</th><th>类型</th><th>支持动作</th><th></th></tr></thead><tbody><tr v-for="d in store.definitions" :key="d.id"><td><strong>{{ d.name }}</strong><small>{{ d.id }}</small></td><td>{{ d.location||'—' }}</td><td>{{ d.type }}</td><td><span v-for="a in d.actions" :key="a" class="tag">{{ a }}</span></td><td class="actions"><button class="icon-btn" @click="show(d)" aria-label="编辑"><Pencil :size="17"/></button><button class="icon-btn danger" @click="remove(d)" aria-label="删除"><Trash2 :size="17"/></button></td></tr></tbody></table></div>
    <div v-if="open" class="modal-backdrop" @click.self="open=false"><form class="modal card" @submit.prevent="save"><div class="card-head"><h2>{{ editing?'编辑设备':'添加设备' }}</h2><button type="button" class="icon-btn" @click="open=false"><X/></button></div><div v-if="error" class="alert error">{{ error }}</div><label>设备名称<input v-model.trim="form.name" required/></label><label>设备 ID<input v-model.trim="form.id" :disabled="!!editing" pattern="[a-z0-9_]+" required/></label><label>设备类型<select v-model="form.type"><option v-for="(_,key) in store.presets" :key="key" :value="key">{{ key }}</option></select></label><label>位置<input v-model.trim="form.location"/></label><div class="button-row end"><button type="button" class="btn ghost" @click="open=false">取消</button><button class="btn primary">保存</button></div></form></div>
  </section>
</template>
