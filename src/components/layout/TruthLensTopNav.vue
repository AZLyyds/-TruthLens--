<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

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
  <header class="site-topbar">
    <div class="site-topbar-inner">
      <a class="site-brand" href="#" @click.prevent="go('/portal-screen')">
        <img class="site-logo-mark" src="/logo/white.svg" alt="" width="34" height="34" decoding="async" />
        <span class="site-logo-text">TruthLens</span>
      </a>
      <nav class="site-nav" aria-label="主导航">
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

.site-nav a:hover {
  color: #fff;
  border-bottom-color: rgba(255, 255, 255, 0.45);
}

.site-nav a.is-active {
  color: #fff;
  font-weight: 600;
  border-bottom-color: #fff;
}
</style>

