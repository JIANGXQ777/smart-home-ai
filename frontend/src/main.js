import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const themeVersion = 'light-console-v2'
if (localStorage.getItem('themeVersion') !== themeVersion) {
  localStorage.setItem('theme', 'light')
  localStorage.setItem('themeVersion', themeVersion)
}
document.documentElement.dataset.theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'

window.addEventListener('auth:required', () => {
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

createApp(App).use(createPinia()).use(router).mount('#app')
