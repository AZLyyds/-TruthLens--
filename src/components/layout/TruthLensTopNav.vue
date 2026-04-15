<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isDashboardRoute = computed(() => route.path === '/dashboard')

const go = (to) => {
  router.push(to)
}

const navItems = computed(() => [
  {
    to: '/portal-screen',
    label: '新闻门户',
    active: route.path === '/portal-screen',
  },
  {
    to: '/portal',
    label: '控制板',
    active: route.path === '/portal',
  },
  {
    to: '/analysis',
    label: '单篇分析',
    active: route.path === '/analysis',
  },
  {
    to: '/multi-analysis',
    label: '多篇分析',
    active: route.path === '/multi-analysis',
  },
  {
    to: '/profile',
    label: '个人中心',
    active: route.path === '/profile',
  },
  {
    to: '/dashboard',
    label: '监控大屏',
    active: route.path === '/dashboard',
  },
])
</script>

<template>
  <header class="site-topbar" :class="{ 'site-topbar--dashboard': isDashboardRoute }">
    <div class="site-topbar-inner" :class="{ 'site-topbar-inner--dashboard': isDashboardRoute }">
      <a class="site-brand" href="#" @click.prevent="go('/portal-screen')">
        <img class="site-logo-mark" src="/logo/white.svg" alt="" width="34" height="34" decoding="async" />
        <span class="site-logo-text">TruthLens</span>
      </a>
      <nav class="site-nav" :class="{ 'site-nav--dashboard': isDashboardRoute }" aria-label="主导航">
        <a
          v-for="item in navItems"
          :key="item.to"
          :class="{ 'is-active': item.active }"
          href="#"
          @click.prevent="go(item.to)"
        >
          {{ item.label }}
        </a>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-topbar {
  --theme-red: #90080e;
  --theme-red-hover: #7a070c;

  background: var(--theme-red);
  color: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.site-topbar--dashboard {
  --theme-red: #0f172a;
  background:
    linear-gradient(180deg, rgba(18, 26, 47, 0.95), rgba(15, 23, 42, 0.92)),
    radial-gradient(circle at 12% -40%, rgba(59, 130, 246, 0.22), transparent 48%);
  color: #fff;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow:
    0 1px 0 rgba(148, 163, 184, 0.14),
    0 10px 24px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(8px) saturate(120%);
}

.site-topbar-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px clamp(16px, 4vw, 28px) 12px clamp(10px, 2.2vw, 20px);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.site-topbar-inner--dashboard {
  max-width: none;
  padding-left: clamp(14px, 1.7vw, 22px);
  padding-right: clamp(14px, 1.7vw, 22px);
}

.site-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  text-decoration: none;
  transition: opacity 0.2s ease;
}

.site-brand:hover {
  opacity: 0.94;
}

.site-logo-mark {
  display: block;
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.site-logo-text {
  font-weight: 800;
  font-size: 1.12rem;
  letter-spacing: 0.04em;
  line-height: 1;
}

.site-nav {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  font-size: 0.95rem;
}

.site-nav a {
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
  background: transparent;
  border-radius: 0;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.site-nav--dashboard a {
  color: rgba(241, 245, 249, 0.9);
  border-bottom-color: transparent;
}

.site-nav a:hover {
  color: #fff;
  border-bottom-color: rgba(255, 255, 255, 0.45);
}

.site-nav--dashboard a:hover {
  color: #fff;
  border-bottom-color: rgba(220, 38, 38, 0.68);
}

.site-nav a.is-active {
  color: #fff;
  font-weight: 600;
  border-bottom-color: #fff;
}

.site-nav--dashboard a.is-active {
  border-bottom-color: #dc2626;
  box-shadow: inset 0 -2px 0 #dc2626;
}
</style>

