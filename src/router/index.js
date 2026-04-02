import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import NewsPortalView from '../views/NewsPortalView.vue'
import NewsAnalysisView from '../views/NewsAnalysisView.vue'
import MultiAnalysisView from '../views/MultiAnalysisView.vue'
import ProfileView from '../views/ProfileView.vue'
import DashboardView from '../views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/portal', name: 'portal', component: NewsPortalView },
    { path: '/analysis', name: 'analysis', component: NewsAnalysisView },
    { path: '/multi-analysis', name: 'multi-analysis', component: MultiAnalysisView },
    { path: '/profile', name: 'profile', component: ProfileView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
  ],
})

export default router
