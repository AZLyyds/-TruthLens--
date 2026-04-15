<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TruthLensTopNav from './components/layout/TruthLensTopNav.vue'

const route = useRoute()
const showTopNav = computed(() => route.path !== '/login')
const isDashboardRoute = computed(() => route.path === '/dashboard')
</script>

<template>
  <TruthLensTopNav v-if="showTopNav" />
  <div class="app-shell" :class="{ 'app-shell--dashboard': isDashboardRoute }">
    <router-view />
  </div>
</template>

<!-- 全局背景：右下角装饰图 + 浅色渐变罩层。将图片放到 public/images/truthlens-page-bg.png（或改下方 url 扩展名） -->
<style>
html {
  background-color: var(--bg);
}

body {
  background-color: var(--bg);
  background-image:
    linear-gradient(
      118deg,
      rgba(244, 244, 243, 0.96) 0%,
      rgba(244, 244, 243, 0.88) 38%,
      rgba(254, 242, 242, 0.5) 72%,
      rgba(254, 226, 226, 0.28) 100%
    ),
    url('/images/truthlens-page-bg.png');
  background-position:
    0 0,
    right bottom;
  background-repeat: no-repeat, no-repeat;
  background-size:
    cover,
    min(520px, 46vw) auto;
  background-attachment: fixed, fixed;
}

/* 正文区域左右留白，右下角装饰图更易露出；顶栏仍为通栏 */
.app-shell {
  padding-left: clamp(20px, 5.5vw, 56px);
  padding-right: clamp(20px, 5.5vw, 56px);
}

.app-shell.app-shell--dashboard {
  padding-left: 0;
  padding-right: 0;
}
</style>
