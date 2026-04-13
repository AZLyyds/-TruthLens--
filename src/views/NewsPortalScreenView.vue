<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchNewsList } from '../api/news'
import { newsPortalPicsumPlaceholder } from '../utils/newsFallbackImage'

const router = useRouter()

function goNewsDetail(item) {
  const id = item?.id
  if (id == null || id === '') return
  router.push({ name: 'news-detail', params: { id: String(id) }, query: { from: 'portal-screen' } })
}

const slides = ref([])
const listItems = ref([])
const isLoading = ref(false)
const errorMessage = ref('')

const n = computed(() => slides.value.length)
const index = ref(0)
const paused = ref(false)
const AUTO_MS = 5500
let timer = null

const trackStyle = computed(() => {
  const count = Math.max(n.value, 1)
  const pct = (index.value * 100) / count
  return {
    '--focus-count': String(count),
    transform: `translateX(-${pct}%)`,
  }
})

const counterText = computed(() => `${Math.min(index.value + 1, n.value || 1)} / ${n.value || 1}`)

function go(delta) {
  if (!n.value) return
  index.value = (index.value + delta + n.value) % n.value
}

function next() {
  go(1)
}

function prev() {
  go(-1)
}

function stopAuto() {
  if (timer) window.clearInterval(timer)
  timer = null
}

function startAuto() {
  stopAuto()
  if (paused.value || n.value <= 1) return
  timer = window.setInterval(next, AUTO_MS)
}

function togglePause() {
  paused.value = !paused.value
  if (paused.value) stopAuto()
  else startAuto()
}

function onCarouselKeydown(e) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
    if (!paused.value) startAuto()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
    if (!paused.value) startAuto()
  }
}

function onVisibilityChange() {
  if (document.hidden) stopAuto()
  else if (!paused.value) startAuto()
}

function formatMeta(item) {
  const source = item.source || '未知来源'
  const time = item.publishedAt || item.createdAt
  if (!time) return source
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return source
  const pad = (n) => String(n).padStart(2, '0')
  return `${source} · ${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildDataFromNews(items) {
  const rows = Array.isArray(items) ? items : []
  const sorted = rows
    .map((n) => ({
      ...n,
      _time: new Date(n.publishedAt || n.createdAt || 0).getTime() || 0,
    }))
    .sort((a, b) => b._time - a._time)

  const focus = sorted.slice(0, 5)
  const rest = sorted.slice(5, 5 + 18)

  slides.value = focus.map((n, idx) => ({
    id: n.id,
    title: n.title || '（无标题）',
    img: n.thumbnailUrl || newsPortalPicsumPlaceholder(`tlstrip${idx + 1}`, 960, 720),
  }))

  listItems.value = rest.map((n, idx) => ({
    id: n.id,
    title: n.title || '（无标题）',
    meta: formatMeta(n),
    abstract: String(n.summary || n.description || '').trim(),
    img: n.thumbnailUrl || newsPortalPicsumPlaceholder(`tllist${idx + 1}`, 320, 240),
  }))
}

async function loadNews() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const items = await fetchNewsList({ page: 1, pageSize: 60 })
    buildDataFromNews(items)
  } catch (e) {
    errorMessage.value = e?.message || '新闻数据加载失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadNews()
  startAuto()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  stopAuto()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="portal-screen portal-body page page-portal-screen">
    <main class="page-wrap portal-screen-inner">
      <section class="portal-screen-section portal-screen-section--plain anim-up delay-1" aria-labelledby="strip-heading">
        <h2 id="strip-heading" class="portal-section-title">焦点滚动</h2>
        <div
          class="focus-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="焦点新闻"
          tabindex="0"
          @keydown="onCarouselKeydown"
          @mouseenter="stopAuto"
          @mouseleave="() => { if (!paused) startAuto() }"
        >
          <button type="button" class="focus-carousel-btn" aria-label="上一则" @click="() => { prev(); if (!paused) startAuto() }">
            ‹
          </button>
          <div class="focus-carousel-viewport">
            <div class="focus-carousel-track" :style="trackStyle">
              <article
                v-for="(s, i) in slides"
                :key="String(s.id ?? s.img)"
                class="focus-slide"
                role="group"
                aria-roledescription="slide"
                :aria-label="`${i + 1} / ${n}`"
                :aria-hidden="i === index ? 'false' : 'true'"
              >
                <div class="focus-slide-card" @click="goNewsDetail(s)">
                  <figure class="focus-slide-figure">
                    <img :src="s.img" alt="" width="960" height="720" :loading="i === 0 ? 'eager' : 'lazy'" />
                    <figcaption class="focus-slide-overlay">
                      <h3>{{ s.title }}</h3>
                    </figcaption>
                  </figure>
                </div>
              </article>
            </div>
          </div>
          <button type="button" class="focus-carousel-btn" aria-label="下一则" @click="() => { next(); if (!paused) startAuto() }">
            ›
          </button>
        </div>
        <div class="focus-carousel-meta">
          <span>{{ counterText }}</span>
          <button type="button" :aria-pressed="paused ? 'true' : 'false'" @click="togglePause">
            {{ paused ? '继续自动播放' : '暂停自动播放' }}
          </button>
        </div>
      </section>

      <section class="portal-screen-section anim-up delay-2" aria-labelledby="list-heading">
        <h2 id="list-heading" class="portal-section-title">要闻列表</h2>
        <div class="news-feed">
          <article v-for="item in listItems" :key="String(item.id ?? item.img)" class="news-list-item" @click="goNewsDetail(item)">
            <figure class="news-list-thumb">
              <img :src="item.img" alt="" width="320" height="240" loading="lazy" />
            </figure>
            <div class="news-list-body">
              <h3>{{ item.title }}</h3>
              <div class="news-list-meta">{{ item.meta }}</div>
              <p v-if="item.abstract" class="news-list-abstract">
                {{ item.abstract }}
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.portal-screen {
  --theme-red: #b91c1c;
  --theme-red-hover: #991b1b;
  --red-100: #fee2e2;
  --red-50: #fef2f2;
  --bg: transparent;
  --card: #ffffff;
  --text: #1c1917;
  --text-hover: #0c0a09;
  --muted: #78716c;
  --border: #e7e5e4;
  --shadow: 0 10px 25px rgba(127, 29, 29, 0.08);
  --shadow-float: 0 12px 32px rgba(28, 25, 23, 0.1);
  --radius: 18px;
  --radius-sm: 12px;
  --ease-ios: cubic-bezier(0.32, 0.72, 0, 1);

  margin: 0 auto;
  width: 100%;
  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--text);
  background: transparent;
  line-height: 1.55;
  min-height: 100vh;
  min-height: 100dvh;
}

.portal-screen-inner {
  width: 100%;
  margin: 0 auto;
}

.portal-screen :deep(a) {
  color: var(--theme-red);
  text-decoration: none;
  transition: color 0.2s ease;
}

.portal-screen :deep(a:hover) {
  color: var(--text-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.portal-screen :deep(img) {
  max-width: 100%;
  display: block;
}

.site-topbar {
  background: var(--theme-red);
  color: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.site-topbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.site-logo {
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  color: #fff !important;
  text-decoration: none !important;
  transition: opacity 0.2s ease;
}

.site-logo:hover {
  opacity: 0.92;
}

.site-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  font-size: 0.9rem;
}

.site-nav a {
  color: rgba(255, 255, 255, 0.88) !important;
  text-decoration: none !important;
  padding: 8px 12px;
  border-radius: 0;
  background: transparent;
  border-bottom: 2px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.site-nav a:hover {
  color: #fff !important;
  background: transparent;
  border-bottom-color: rgba(255, 255, 255, 0.45);
}

.site-nav a.is-active {
  color: #fff !important;
  font-weight: 600;
  background: transparent;
  border-bottom-color: #fff;
}

.page-wrap {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-title {
  margin: 0 0 8px;
  font-size: clamp(1.45rem, 2.2vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}

.page-desc {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
  max-width: 62ch;
}

.portal-screen-section {
  padding: 18px 20px 20px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  box-shadow: var(--shadow);
}

.portal-screen-section--plain {
  padding: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.portal-section-title {
  margin: 0 0 12px;
  padding: 0 4px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.portal-section-title::before {
  content: '';
  width: 3px;
  height: 17px;
  border-radius: 2px;
  background: var(--theme-red);
}

.focus-carousel {
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin: 0 0 8px;
  max-width: 100%;
}

.focus-carousel-btn {
  flex: 0 0 44px;
  align-self: center;
  width: 44px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: none;
  background: rgba(255, 255, 255, 0.92);
  color: #44403c;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.25s var(--ease-ios), color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.focus-carousel-btn:hover {
  color: var(--text-hover);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  background: #fff;
}

.focus-carousel-btn:active {
  transform: scale(0.94);
}

.focus-carousel-btn:focus-visible {
  outline: 2px solid rgba(144, 8, 14, 0.45);
  outline-offset: 3px;
}

.focus-carousel-viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border: none;
  background: transparent;
  border-radius: var(--radius);
  box-shadow: var(--shadow-float);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.focus-carousel-track {
  display: flex;
  width: calc(var(--focus-count, 5) * 100%);
  transform: translateX(0);
  transition: transform 0.65s var(--ease-ios);
  will-change: transform;
}

.focus-slide {
  flex: 0 0 calc(100% / var(--focus-count, 5));
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
}

.focus-slide-card {
  margin: 0;
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: none;
  box-shadow: none;
  background: #000;
  cursor: pointer;
}

.focus-slide-card:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: 3px;
}

.focus-slide-figure {
  position: relative;
  margin: 0;
  width: 100%;
  height: clamp(360px, 56vh, 640px);
  overflow: hidden;
  background: transparent;
}

.focus-slide-figure img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  transform: scale(1.02);
  transition: transform 0.8s var(--ease-ios);
}

.focus-slide[aria-hidden='false'] .focus-slide-figure img {
  transform: scale(1);
}

.focus-slide-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 36px 22px 22px;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.55) 42%,
    rgba(0, 0, 0, 0.12) 78%,
    transparent 100%
  );
  pointer-events: none;
}

.focus-slide-overlay h3 {
  margin: 0;
  font-size: 1.18rem;
  font-weight: 650;
  line-height: 1.45;
  color: #fff;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
}

.focus-carousel-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 0 6px 4px;
  font-size: 0.8rem;
  color: var(--muted);
}

.focus-carousel-meta button {
  font: inherit;
  color: var(--muted);
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.2s ease;
}

.focus-carousel-meta button:hover {
  color: var(--text-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.news-feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.news-list-item {
  display: grid;
  grid-template-columns: 132px 1fr;
  gap: 16px;
  padding: 14px 14px;
  background: linear-gradient(160deg, #ffffff, #fafaf9);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
  cursor: pointer;
}

.news-list-item:hover {
  border-color: #fca5a5;
  box-shadow: 0 10px 24px rgba(185, 28, 28, 0.08);
  transform: translateY(-2px);
}

.news-list-item:hover .news-list-body h3 {
  color: var(--text-hover);
}

.news-list-item:hover .news-list-abstract {
  color: #57534e;
}

.news-list-thumb {
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: #e7e5e4;
}

.news-list-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s var(--ease-ios);
}

.news-list-item:hover .news-list-thumb img {
  transform: scale(1.03);
}

.news-list-body h3 {
  margin: 0 0 10px;
  font-size: 1.08rem;
  font-weight: 750;
  line-height: 1.4;
  letter-spacing: -0.015em;
  color: var(--text);
  transition: color 0.2s ease;
}

.news-list-meta {
  font-size: 13px;
  color: #78716c;
  margin-bottom: 8px;
  font-weight: 500;
}

.news-list-abstract {
  margin: 0;
  font-size: 14px;
  color: #57534e;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s ease;
}

@media (max-width: 640px) {
  .focus-carousel {
    flex-wrap: wrap;
  }

  .focus-carousel-btn {
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    font-size: 1.35rem;
  }

  .focus-slide-figure {
    min-height: 280px;
  }

  .focus-slide-figure img {
    min-height: 280px;
  }

  .focus-slide-overlay {
    padding: 28px 16px 18px;
  }

  .focus-slide-overlay h3 {
    font-size: 1.02rem;
  }
}

@media (max-width: 560px) {
  .news-list-item {
    grid-template-columns: 100px 1fr;
    gap: 10px;
    padding: 12px 0;
  }
}
</style>

