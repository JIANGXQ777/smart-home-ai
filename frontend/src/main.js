import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

document.documentElement.dataset.theme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'

window.addEventListener('auth:required', () => {
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

createApp(App).use(createPinia()).use(router).mount('#app')
