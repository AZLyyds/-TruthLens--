<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TruthLensTopNav from './components/layout/TruthLensTopNav.vue'

const route = useRoute()
const showTopNav = computed(() => route.path !== '/login')
const isDashboardRoute = computed(() => route.path === '/dashboard')
const showGlobalCopyright = computed(() => route.path !== '/dashboard')
</script>

<template>
  <TruthLensTopNav v-if="showTopNav" />
  <div class="app-shell" :class="{ 'app-shell--dashboard': isDashboardRoute }">
    <router-view />
  </div>
  <footer v-if="showGlobalCopyright" class="site-copyright" role="contentinfo" aria-label="版权信息">
    <p>© 2026 学号：20260146 原创作品</p>
    <p>2026 年上海市大学生计算机应用能力大赛参赛作品</p>
  </footer>
</template>

<!-- 全局背景：右下角装饰图 + 浅色渐变罩层。将图片放到 public/images/truthlens-page-bg.png（或改下方 url 扩展名） -->
<style>
html {
  background-color: var(--bg);
}

body {
  --site-copyright-height: 56px;
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
  padding-bottom: calc(var(--site-copyright-height) + 12px);
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

.site-copyright {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  height: var(--site-copyright-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.25;
  letter-spacing: 0.02em;
  text-align: center;
  background: rgba(244, 244, 243, 0.9);
  border-top: 1px solid rgba(156, 163, 175, 0.25);
  backdrop-filter: saturate(120%) blur(3px);
}

.site-copyright p {
  margin: 0;
}
</style>
