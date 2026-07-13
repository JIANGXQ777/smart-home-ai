import { createRouter, createWebHistory } from 'vue-router'
import DashboardLayout from '../layouts/DashboardLayout.vue'
import OverviewView from '../views/OverviewView.vue'
import AssistantView from '../views/AssistantView.vue'
import DevicesView from '../views/DevicesView.vue'
import IrLearningView from '../views/IrLearningView.vue'
import SettingsView from '../views/SettingsView.vue'
import ModelConfigView from '../views/ModelConfigView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/',
    component: DashboardLayout,
    children: [
      { path: '', name: 'overview', component: OverviewView, meta: { title: '系统总览' } },
      { path: 'assistant', name: 'assistant', component: AssistantView, meta: { title: 'AI 助手' } },
      { path: 'devices', name: 'devices', component: DevicesView, meta: { title: '设备管理' } },
      { path: 'ir-learning', name: 'ir-learning', component: IrLearningView, meta: { title: '红外学习' } },
      { path: 'models', name: 'models', component: ModelConfigView, meta: { title: '模型配置' } },
      { path: 'settings', name: 'settings', component: SettingsView, meta: { title: '系统设置' } }
    ]
  }]
})
