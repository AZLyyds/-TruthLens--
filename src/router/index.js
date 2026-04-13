import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import NewsPortalView from '../views/NewsPortalView.vue'
import NewsPortalScreenView from '../views/NewsPortalScreenView.vue'
import NewsDetailView from '../views/NewsDetailView.vue'
import NewsAnalysisView from '../views/NewsAnalysisView.vue'
import MultiAnalysisView from '../views/MultiAnalysisView.vue'
import ProfileView from '../views/ProfileView.vue'
import DashboardView from '../views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0, left: 0, behavior: 'auto' }
  },
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView, meta: { title: '登录' } },
    { path: '/portal', name: 'portal', component: NewsPortalView, meta: { title: '控制板' } },
    { path: '/portal-screen', name: 'portal-screen', component: NewsPortalScreenView, meta: { title: '新闻门户' } },
    { path: '/news/:id', name: 'news-detail', component: NewsDetailView, meta: { title: '新闻详情' } },
    { path: '/analysis', name: 'analysis', component: NewsAnalysisView, meta: { title: '单篇分析' } },
    { path: '/multi-analysis', name: 'multi-analysis', component: MultiAnalysisView, meta: { title: '多篇分析' } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { title: '个人中心' } },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { title: '监控大屏' } },
  ],
})

export default router
