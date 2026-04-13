import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App).use(createPinia()).use(router)

router.afterEach((to) => {
  const t = to.meta?.title
  document.title = typeof t === 'string' && t.trim() ? `TruthLens - ${t.trim()}` : 'TruthLens'
})

app.mount('#app')
