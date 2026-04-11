<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchNewsDetail, fetchNewsList } from '../api/news'
import NewsDetailToolbar from '../components/news-detail/NewsDetailToolbar.vue'
import NewsDetailSkeleton from '../components/news-detail/NewsDetailSkeleton.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const detail = ref(null)
const related = ref([])
const relatedStart = ref(0)
const relatedPageSize = ref(3)
const fontStep = ref(1)
/** 原文图 URL 加载失败（如海外 CDN 不可达）时改用与门户大屏一致的 picsum 占位 */
const heroImageFallback = ref(false)
/** 浏览器书签引导层（网页无法代用户按出收藏夹，仅可提示快捷键 / 复制链接） */
const bookmarkGuideOpen = ref(false)

function asDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTime(value) {
  const d = asDate(value)
  if (!d) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function riskBand(level) {
  const s = String(level || '')
  if (s.includes('高') || /^high$/i.test(s)) return 'high'
  if (s.includes('中') || /^medium$/i.test(s) || /^mid$/i.test(s)) return 'mid'
  return 'low'
}

function bookmarkPageTitle() {
  const t = detail.value?.title
  if (t && String(t).trim()) return `${String(t).trim()} · TruthLens`
  return document.title || 'TruthLens'
}

/** 仅旧版 IE 等环境可能生效；Chrome / Edge / Firefox 会返回 false */
function tryLegacyAddFavorite() {
  try {
    const url = window.location.href
    const title = bookmarkPageTitle()
    const ext = window.external
    if (ext && typeof ext.AddFavorite === 'function') {
      ext.AddFavorite(url, title)
      return true
    }
  } catch {
    /* noop */
  }
  return false
}

function closeBookmarkGuide() {
  bookmarkGuideOpen.value = false
}

function onBookmarkClick() {
  if (tryLegacyAddFavorite()) return
  bookmarkGuideOpen.value = true
}

async function copyCurrentPageUrl() {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    window.alert('链接已复制，可在浏览器书签栏或书签管理器中新建书签并粘贴地址')
  } catch {
    window.alert('复制失败，请手动复制地址栏中的链接')
  }
}

const bodyFontPx = computed(() => {
  const m = { 0: 13, 1: 15, 2: 17 }
  return m[fontStep.value] ?? 15
})

function bumpFont(delta) {
  fontStep.value = Math.min(2, Math.max(0, fontStep.value + delta))
}

const credibilityPct = computed(() => {
  const n = Number(detail.value?.credibilityScore)
  if (Number.isNaN(n)) return null
  return Math.min(100, Math.max(0, n))
})

const fakePct = computed(() => {
  const n = Number(detail.value?.fakeScore)
  if (Number.isNaN(n)) return null
  // FakeScore 满分为 10，将其映射到 0–100% 进度
  const clamped = Math.min(10, Math.max(0, n))
  return (clamped / 10) * 100
})

function fmtMsBool(v) {
  if (v === true) return '是'
  if (v === false) return '否'
  return '—'
}

function mcpArticlesList(m) {
  const raw = m?.mcpRelatedArticles
  return Array.isArray(raw) ? raw : []
}

function fmtConsistent(v) {
  if (v == null || v === '') return '—'
  return String(v)
}

function fmtChinaRelated(v) {
  if (v === true) return '是'
  if (v === false) return '否'
  return '—'
}

const ms = computed(() => {
  if (!detail.value?.latestAnalysis) return null
  const m = detail.value.multiSourceCheck
  if (m && typeof m === 'object') return m
  return {
    isSameEvent: null,
    isConsistent: null,
    hasAuthoritySource: null,
    description: '',
    mcpRelatedArticles: [],
  }
})

const primaryHeroImageUrl = computed(() => {
  const u = detail.value?.image
  if (u == null || !String(u).trim()) return ''
  return String(u).trim()
})

/** 与 NewsPortalScreenView 一致：picsum 按新闻 id 固定 seed，避免每次刷新变图 */
function picsumPlaceholder(seedSuffix, w, h) {
  return `https://picsum.photos/seed/${seedSuffix}/${w}/${h}`
}

const heroImageSrc = computed(() => {
  if (!detail.value?.id) return ''
  const id = detail.value.id
  const placeholder = picsumPlaceholder(`truthlens-nd-${id}`, 800, 520)
  if (!primaryHeroImageUrl.value || heroImageFallback.value) return placeholder
  return primaryHeroImageUrl.value
})

function onHeroImageError() {
  if (!primaryHeroImageUrl.value) return
  if (heroImageFallback.value) return
  heroImageFallback.value = true
}

const heroImageIsPlaceholder = computed(
  () => !primaryHeroImageUrl.value || heroImageFallback.value,
)

async function loadRelated(current) {
  try {
    const list = await fetchNewsList({ page: 1, pageSize: 120 })
    const sid = String(current?.id ?? route.params.id)
    const src = current?.source
    let rows = (Array.isArray(list) ? list : []).filter((x) => String(x.id) !== sid)
    if (src) {
      const same = rows.filter((x) => x.source === src)
      if (same.length >= 2) rows = same
    }
    related.value = rows.slice(0, 12)
    relatedStart.value = 0
  } catch {
    related.value = []
    relatedStart.value = 0
  }
}

async function loadDetail() {
  loading.value = true
  error.value = ''
  detail.value = null
  heroImageFallback.value = false
  const id = route.params.id
  try {
    const data = await fetchNewsDetail(id)
    detail.value = data
    await loadRelated(data)
  } catch (e) {
    error.value = e?.message || '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

/** 与列表页跳转时 query.from 一致，仅允许白名单，避免开放重定向 */
const DETAIL_BACK = {
  portal: { name: 'portal' },
  'portal-screen': { name: 'portal-screen' },
  dashboard: { name: 'dashboard' },
}

function goBack() {
  const key = String(route.query.from || '')
  const target = DETAIL_BACK[key]
  if (target) {
    router.push(target)
    return
  }
  router.push({ name: 'portal' })
}

function goRelated(item) {
  const key = String(route.query.from || '')
  const query = DETAIL_BACK[key] ? { from: key } : {}
  router.push({ name: 'news-detail', params: { id: String(item.id) }, query })
}

function updateRelatedPageSize() {
  if (window.innerWidth < 760) relatedPageSize.value = 1
  else if (window.innerWidth < 1180) relatedPageSize.value = 2
  else relatedPageSize.value = 3
}

const relatedVisible = computed(() =>
  related.value.slice(relatedStart.value, relatedStart.value + relatedPageSize.value),
)
const relatedCanPrev = computed(() => relatedStart.value > 0)
const relatedCanNext = computed(
  () => relatedStart.value + relatedPageSize.value < related.value.length,
)

function relatedPrev() {
  relatedStart.value = Math.max(0, relatedStart.value - relatedPageSize.value)
}

function relatedNext() {
  const maxStart = Math.max(0, related.value.length - relatedPageSize.value)
  relatedStart.value = Math.min(maxStart, relatedStart.value + relatedPageSize.value)
}

function goDeepAnalysis() {
  if (!detail.value) return
  router.push({
    name: 'analysis',
    query: {
      newsId: String(detail.value.id),
      title: detail.value.title || '',
    },
  })
}

async function onShare() {
  if (!detail.value) return
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: detail.value.title, text: detail.value.summary || '', url })
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      window.alert('链接已复制到剪贴板')
    }
  } catch {
    /* 用户取消分享 */
  }
}

function onExportJson() {
  if (!detail.value) return
  const blob = new Blob([JSON.stringify(detail.value, null, 2)], { type: 'application/json;charset=utf-8' })
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = `news-${detail.value.id}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(u)
}

async function copyPlain(text) {
  const t = String(text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    window.alert('已复制')
  } catch {
    window.alert('复制失败，请手动选择文本')
  }
}

watch(
  () => route.params.id,
  () => {
    loadDetail()
  },
)

onMounted(() => {
  updateRelatedPageSize()
  window.addEventListener('resize', updateRelatedPageSize)
  loadDetail()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateRelatedPageSize)
  window.removeEventListener('keydown', onEscapeCloseBookmark)
})

watch(
  () => [related.value.length, relatedPageSize.value],
  () => {
    const maxStart = Math.max(0, related.value.length - relatedPageSize.value)
    if (relatedStart.value > maxStart) relatedStart.value = maxStart
  },
)

function onEscapeCloseBookmark(e) {
  if (e.key === 'Escape' && bookmarkGuideOpen.value) {
    closeBookmarkGuide()
  }
}

watch(bookmarkGuideOpen, (open) => {
  if (open) window.addEventListener('keydown', onEscapeCloseBookmark)
  else window.removeEventListener('keydown', onEscapeCloseBookmark)
})
</script>

<template>
  <div class="nd">
    <NewsDetailToolbar
      :disabled-share="!detail"
      @back="goBack"
      @bookmark="onBookmarkClick"
      @share="onShare"
      @export="onExportJson"
    />

    <Teleport to="body">
      <div
        v-if="bookmarkGuideOpen"
        class="nd-bm-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nd-bm-title"
        @click.self="closeBookmarkGuide"
      >
        <div class="nd-bm-card card" @click.stop>
          <button type="button" class="nd-bm-close" aria-label="关闭" @click="closeBookmarkGuide">×</button>
          <h2 id="nd-bm-title" class="nd-bm-title">加入浏览器书签</h2>
          <p class="nd-bm-lead">
            出于安全策略，网页不能代替您按下「添加书签」，请使用系统快捷键（与在任意网页收藏相同）：
          </p>
          <ul class="nd-bm-shortcuts">
            <li><span class="nd-bm-kbd">Windows / Linux</span> <kbd>Ctrl</kbd> + <kbd>D</kbd></li>
            <li><span class="nd-bm-kbd">macOS</span> <kbd>⌘</kbd> + <kbd>D</kbd></li>
          </ul>
          <p class="nd-bm-tip">手机浏览器：通常可通过分享菜单或地址栏旁的「☆ / 书签」入口保存本页。</p>
          <div class="nd-bm-actions">
            <button type="button" class="nd-bm-btn nd-bm-btn--primary" @click="copyCurrentPageUrl">复制本页链接</button>
            <button type="button" class="nd-bm-btn" @click="closeBookmarkGuide">知道了</button>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="nd-inner">
      <NewsDetailSkeleton v-if="loading" />
      <div v-else-if="error" class="nd-error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="nd-retry" @click="loadDetail">重试</button>
      </div>

      <template v-else-if="detail">
        <!-- 随滚动吸附：可信度 / 风险速览 -->
        <div class="nd-sticky" :class="'risk--' + riskBand(detail.riskLevel)">
          <div class="nd-sticky-inner">
            <div class="nd-sticky-score" v-if="credibilityPct != null">
              <span class="nd-sticky-label">可信指数</span>
              <strong>{{ detail.credibilityScore }}</strong>
              <span class="nd-sticky-track"><i :style="{ width: credibilityPct + '%' }" /></span>
            </div>
            <div v-else class="nd-sticky-score nd-sticky-score--muted">
              <span class="nd-sticky-label">可信指数</span>
              <strong>—</strong>
            </div>
            <div class="nd-sticky-risk">
              <span class="nd-chip" :class="'nd-chip--' + riskBand(detail.riskLevel)">
                {{ detail.riskLevel || '—' }}
              </span>
              <span v-if="fakePct != null" class="nd-fake">虚假评分 {{ detail.fakeScore }}</span>
            </div>
          </div>
        </div>

        <div class="nd-split">
          <section class="nd-left">
            <article class="nd-hero card">
              <div class="nd-meta">
                <span v-if="detail.source" class="nd-pill">{{ detail.source }}</span>
                <span class="nd-time">{{ formatTime(detail.publishedAt) }}</span>
                <span class="nd-pill nd-pill--soft">{{ detail.lang || detail.language || '—' }}</span>
                <span v-if="detail.chinaRelated === true" class="nd-pill nd-pill--cn">涉华</span>
                <span v-else-if="detail.chinaRelated === false" class="nd-pill nd-pill--soft">非涉华</span>
              </div>
              <h2 class="nd-title">{{ detail.title || '—' }}</h2>
              <p v-if="detail.titleCN" class="nd-title-sub">{{ detail.titleCN }}</p>
              <a v-if="detail.url" :href="detail.url" class="nd-link" target="_blank" rel="noopener noreferrer">
                原文链接 ↗
              </a>
            </article>

            <section class="nd-card card nd-body-card">
              <header class="nd-sec-head nd-sec-head--row">
                <div>
                  <h3>原文内容</h3>
                  <span class="nd-sec-sub">正文与采集信息</span>
                </div>
                <div class="nd-font-tools">
                  <button type="button" class="nd-font-btn" :disabled="fontStep <= 0" @click="bumpFont(-1)">A−</button>
                  <button type="button" class="nd-font-btn" :disabled="fontStep >= 2" @click="bumpFont(1)">A+</button>
                  <button
                    type="button"
                    class="nd-copy-btn"
                    @click="copyPlain([detail.content, detail.contentCN].filter((x) => x && String(x).trim()).join('\n\n'))"
                  >
                    复制全文
                  </button>
                </div>
              </header>
              <div class="nd-body-cols nd-body-cols--single">
                <div class="nd-body-col">
                  <span class="nd-body-label">原文 / 采集正文</span>
                  <div class="nd-prose nd-prose--orig" :style="{ fontSize: bodyFontPx + 'px' }">
                    {{ detail.content?.trim() || '—' }}
                  </div>
                </div>
                <div class="nd-body-col nd-body-col--img">
                  <span class="nd-body-label">原文插图</span>
                  <div
                    class="nd-image-slot"
                    :class="{ 'nd-image-slot--placeholder': heroImageIsPlaceholder }"
                  >
                    <img
                      class="nd-hero-img"
                      :src="heroImageSrc"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      @error="onHeroImageError"
                    />
                    <p v-if="heroImageIsPlaceholder && primaryHeroImageUrl" class="nd-image-hint">
                      原图链接在当前网络下无法加载，已显示预览占位图
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </section>

          <section class="nd-right">
            <section class="nd-card card">
              <header class="nd-sec-head">
                <h3>加工结果摘要</h3>
                <span class="nd-sec-sub">由模型加工后的可信度、结论与风险信息</span>
              </header>
              <div class="nd-analysis-wrap nd-analysis-wrap--panel">
                <span class="nd-eyebrow nd-eyebrow--hero">总结（summary）</span>
                <p class="nd-summary">{{ detail.summary != null && String(detail.summary).trim() ? String(detail.summary).trim() : '—' }}</p>
              </div>
              <div v-if="detail.verdict != null && String(detail.verdict).trim()" class="nd-verdict">
                <span class="nd-verdict-label">综合判断（verdict）</span>
                <span class="nd-verdict-val">{{ String(detail.verdict).trim() }}</span>
              </div>
            </section>

            <section class="nd-card card">
              <header class="nd-sec-head">
                <h3>可信度与其它分析</h3>
                <span class="nd-sec-sub">可信指数为接口推导；事实要点来自工作流 facts</span>
              </header>
              <div class="nd-cred-grid nd-cred-grid--single">
                <div class="nd-cred-block">
                  <span class="nd-cred-label">可信指数（credibilityScore）</span>
                  <div class="nd-cred-num-row">
                    <strong class="nd-cred-num">{{ detail.credibilityScore != null ? detail.credibilityScore : '—' }}</strong>
                    <span class="nd-cred-scale">/ 100</span>
                  </div>
                  <div v-if="credibilityPct != null" class="nd-bar">
                    <i class="nd-bar-fill nd-bar-fill--cred" :style="{ width: credibilityPct + '%' }" />
                  </div>
                </div>
              </div>
              <template v-if="detail.facts?.length">
                <span class="nd-eyebrow nd-eyebrow--facts">事实要点（facts）</span>
                <ul class="nd-facts">
                  <li v-for="(f, i) in detail.facts" :key="i">
                    <template v-if="typeof f === 'object' && f">
                      {{ [f.time, f.subject, f.event].filter(Boolean).join(' · ') }}
                    </template>
                    <template v-else>{{ f }}</template>
                  </li>
                </ul>
              </template>
            </section>

            <section v-if="detail.latestAnalysis" class="nd-card card nd-wf-fields">
              <header class="nd-sec-head">
                <h3>工作流核心字段</h3>
                <span class="nd-sec-sub">与百炼单篇 JSON 一一对应（无分析记录时不展示本块）</span>
              </header>
              <dl class="nd-wf-dl">
                <div class="nd-wf-dl-row">
                  <dt>总结（summary）</dt>
                  <dd>{{ detail.summary != null && String(detail.summary).trim() ? String(detail.summary).trim() : '—' }}</dd>
                </div>
                <div class="nd-wf-dl-row">
                  <dt>是否涉华（chinaRelated）</dt>
                  <dd>{{ fmtChinaRelated(detail.chinaRelated) }}</dd>
                </div>
                <div class="nd-wf-dl-row">
                  <dt>虚假评分（fakeScore）</dt>
                  <dd>{{ detail.fakeScore != null && !Number.isNaN(Number(detail.fakeScore)) ? detail.fakeScore : '—' }}</dd>
                </div>
                <div class="nd-wf-dl-row">
                  <dt>风险等级（riskLevel）</dt>
                  <dd>{{ detail.riskLevel || '—' }}</dd>
                </div>
                <div class="nd-wf-dl-row">
                  <dt>风险原因（riskReason）</dt>
                  <dd class="nd-wf-dl-dd--pre">
                    {{
                      detail.riskReason?.trim() ||
                        (Array.isArray(detail.reasons) && detail.reasons.length ? detail.reasons.join('；') : '') ||
                        '—'
                    }}
                  </dd>
                </div>
              </dl>
            </section>

            <section v-if="!detail.latestAnalysis" class="nd-card card">
              <p class="nd-muted">暂无单篇工作流分析记录。</p>
            </section>

            <div class="nd-cta-wrap">
              <button type="button" class="nd-cta" @click="goDeepAnalysis">进入深度分析</button>
              <p class="nd-cta-hint">将携带新闻 ID 跳转至单篇分析工作台，复用现有分析能力</p>
            </div>
          </section>
        </div>

        <section v-if="detail.latestAnalysis" class="nd-card card nd-ms-middle">
          <header class="nd-sec-head">
            <h3>多源核验（multiSourceCheck）</h3>
            <span class="nd-sec-sub">字段全部来自接口，空项显示为「—」；相关报道仅数组内容</span>
          </header>
          <div class="nd-ms">
            <div class="nd-ms-mcp">
              <div class="nd-ms-kpi">
                <div class="nd-ms-kpi-cell">
                  <span class="nd-ms-kpi-k">是否同一事件（isSameEvent）</span>
                  <span class="nd-ms-kpi-v">{{ fmtMsBool(ms.isSameEvent) }}</span>
                </div>
                <div class="nd-ms-kpi-cell">
                  <span class="nd-ms-kpi-k">信息一致性（isConsistent）</span>
                  <span class="nd-ms-kpi-v">{{ fmtConsistent(ms.isConsistent) }}</span>
                </div>
                <div class="nd-ms-kpi-cell">
                  <span class="nd-ms-kpi-k">是否有权威信源（hasAuthoritySource）</span>
                  <span class="nd-ms-kpi-v">{{ fmtMsBool(ms.hasAuthoritySource) }}</span>
                </div>
              </div>

              <div class="nd-ms-block">
                <span class="nd-ms-block-title">写实核查说明（description）</span>
                <div class="nd-ms-desc">{{ ms.description != null && String(ms.description).trim() ? ms.description : '—' }}</div>
              </div>

              <div class="nd-ms-block">
                <span class="nd-ms-block-title">相关报道（mcpRelatedArticles）</span>
                <ul v-if="mcpArticlesList(ms).length" class="nd-ms-art-list nd-ms-art-list--plain">
                  <li v-for="(row, idx) in mcpArticlesList(ms)" :key="idx" class="nd-ms-art-line">
                    {{ row?.title }} - {{ row?.source }}
                  </li>
                </ul>
                <p v-else class="nd-ms-empty">暂无相关报道</p>
              </div>
            </div>
          </div>
        </section>

        <section v-if="related.length" class="nd-card card nd-related nd-related-bottom">
          <header class="nd-sec-head">
            <h3>相关推荐</h3>
            <span class="nd-sec-sub">同源或列表邻近条目（左右翻页）</span>
          </header>
          <div class="nd-rel-carousel">
            <button type="button" class="nd-rel-nav" :disabled="!relatedCanPrev" @click="relatedPrev">‹</button>
            <TransitionGroup name="nd-rel-slide" tag="div" class="nd-rel-track">
              <button
                v-for="item in relatedVisible"
                :key="`${item.id}-${relatedStart}`"
                type="button"
                class="nd-rel-card"
                @click="goRelated(item)"
              >
                <div class="nd-rel-thumb-wrap">
                  <img
                    class="nd-rel-thumb"
                    :src="item.thumbnailUrl || `https://picsum.photos/seed/rel${item.id}/320/220`"
                    alt=""
                    loading="lazy"
                  />
                  <span class="nd-rel-risk" :class="'r--' + riskBand(item.risk)">{{ item.risk || '—' }}</span>
                </div>
                <div class="nd-rel-card-body">
                  <span class="nd-rel-title">{{ item.title }}</span>
                  <span class="nd-rel-src">{{ item.source || '未知来源' }}</span>
                </div>
              </button>
            </TransitionGroup>
            <button type="button" class="nd-rel-nav" :disabled="!relatedCanNext" @click="relatedNext">›</button>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.nd {
  min-height: 100vh;
  min-height: 100dvh;
  background:
    radial-gradient(ellipse 80% 50% at 10% -10%, rgba(185, 28, 28, 0.08), transparent),
    radial-gradient(ellipse 60% 40% at 100% 10%, rgba(248, 113, 113, 0.06), transparent),
    var(--bg, #f4f4f3);
  padding: 0 clamp(10px, 2.2vw, 28px) 48px;
  max-width: none;
  width: 100%;
  margin: 0;
}

.nd-inner {
  padding-top: 4px;
}

.nd-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.nd-left,
.nd-right {
  min-width: 0;
}

@media (max-width: 1100px) {
  .nd-split {
    grid-template-columns: 1fr;
  }
}

.nd-error {
  padding: 24px;
  border-radius: 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  text-align: center;
}

.nd-retry {
  margin-top: 12px;
  padding: 10px 20px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: #b91c1c;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.nd-sticky {
  position: sticky;
  top: 58px;
  z-index: 20;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
}

.nd-sticky-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 14px;
  padding: 10px 14px;
}

@media (max-width: 900px) {
  .nd-sticky-inner {
    grid-template-columns: 1fr;
  }
}

.nd-sticky-score {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.nd-sticky-score--muted strong {
  color: #94a3b8;
}

.nd-sticky-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.nd-sticky-score strong {
  font-size: 20px;
  font-weight: 700;
  color: #b91c1c;
  font-variant-numeric: tabular-nums;
}

.nd-sticky-track {
  flex: 1 1 120px;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
  min-width: 80px;
}

.nd-sticky-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #b91c1c, #f87171);
}

.nd-sticky-hint {
  font-size: 12px;
  color: #94a3b8;
}

.nd-sticky-risk {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nd-chip {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}

.nd-chip--high {
  color: #b91c1c;
  background: #fee2e2;
}
.nd-chip--mid {
  color: #a16207;
  background: #fef9c3;
}
.nd-chip--low {
  color: #15803d;
  background: #dcfce7;
}

.nd-fake {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.nd-hero {
  padding: 22px 22px 24px;
  margin-bottom: 16px;
  border-radius: 16px;
}

.nd-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.nd-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fef2f2;
  color: #7f1d1d;
}

.nd-pill--soft {
  background: #f1f5f9;
  color: #475569;
}

.nd-pill--cn {
  background: #fff7ed;
  color: #c2410c;
}

.nd-time {
  font-size: 13px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.nd-title {
  margin: 0 0 10px;
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.nd-title-sub {
  margin: 0 0 12px;
  font-size: 1rem;
  color: #475569;
  line-height: 1.5;
}

.nd-analysis-wrap {
  margin: 0 0 14px;
}

.nd-analysis-wrap--panel {
  margin: 4px 0 0;
}

.nd-eyebrow--hero {
  display: block;
  margin-bottom: 6px;
}

.nd-summary {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: #334155;
}

.nd-link {
  font-size: 14px;
  font-weight: 600;
  color: #b91c1c;
  text-decoration: none;
}

.nd-link:hover {
  text-decoration: underline;
}

.nd-card {
  padding: 20px 22px;
  margin-bottom: 16px;
  border-radius: 16px;
}

.nd-sec-head {
  margin-bottom: 16px;
}

.nd-sec-head h3 {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}

.nd-sec-sub {
  font-size: 13px;
  color: #64748b;
}

.nd-sec-head--row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.nd-cred-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.nd-cred-grid--single {
  grid-template-columns: 1fr;
  max-width: 420px;
}

@media (max-width: 640px) {
  .nd-cred-grid {
    grid-template-columns: 1fr;
  }
}

.nd-wf-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.nd-wf-dl-row {
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 12px 20px;
  align-items: start;
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
}

.nd-wf-dl-row:last-child {
  border-bottom: none;
}

.nd-wf-dl dt {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.nd-wf-dl dd {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: #1e293b;
  word-break: break-word;
}

.nd-wf-dl-dd--pre {
  white-space: pre-wrap;
}

@media (max-width: 640px) {
  .nd-wf-dl-row {
    grid-template-columns: 1fr;
  }
}

.nd-cred-block {
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.nd-cred-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
}

.nd-cred-num-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.nd-cred-num {
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.nd-cred-scale {
  font-size: 13px;
  color: #94a3b8;
}

.nd-bar {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.nd-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.5s ease;
}

.nd-bar-fill--cred {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.nd-bar-fill--risk {
  background: linear-gradient(90deg, #f97316, #ef4444);
}

.nd-verdict {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff;
  border: 1px dashed #cbd5e1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.nd-verdict-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.nd-verdict-val {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.nd-eyebrow {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 6px;
}

.nd-eyebrow--facts {
  margin-top: 16px;
}

.nd-facts {
  margin: 8px 0 0;
  padding-left: 1.1rem;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}

.nd-ms {
  display: grid;
  gap: 14px;
}

.nd-ms-mcp {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nd-ms-kpi {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 640px) {
  .nd-ms-kpi {
    grid-template-columns: 1fr;
  }
}

.nd-ms-kpi-cell {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.nd-ms-kpi-k {
  display: block;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.nd-ms-kpi-v {
  display: block;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: #0f172a;
  word-break: break-word;
}

.nd-ms-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nd-ms-block-title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.nd-ms-desc {
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  font-size: 14px;
  line-height: 1.75;
  color: #1e293b;
  white-space: pre-wrap;
}

.nd-ms-empty {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed #cbd5e1;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.55;
  color: #94a3b8;
}

.nd-ms-art-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nd-ms-art {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.nd-ms-art-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  color: #0f172a;
}

.nd-ms-art-src {
  font-size: 12px;
  color: #64748b;
}

.nd-ms-art-list--plain {
  gap: 0;
}

.nd-ms-art-line {
  margin: 0;
  padding: 10px 0;
  font-size: 14px;
  line-height: 1.55;
  color: #0f172a;
  border-bottom: 1px solid #f1f5f9;
  list-style: none;
}

.nd-ms-art-line:last-child {
  border-bottom: none;
}

.nd-muted {
  margin: 0;
  font-size: 14px;
  color: #94a3b8;
}

.nd-body-card {
  padding-bottom: 22px;
}

.nd-font-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.nd-font-btn,
.nd-copy-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  transition:
    background 0.2s,
    transform 0.12s;
}

.nd-font-btn:hover:not(:disabled),
.nd-copy-btn:hover {
  background: #f1f5f9;
}

.nd-font-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.nd-font-btn:active:not(:disabled),
.nd-copy-btn:active {
  transform: scale(0.97);
}

.nd-copy-btn {
  border-color: #fecaca;
  color: #7f1d1d;
  background: #fef2f2;
}

.nd-body-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.nd-body-cols--single {
  grid-template-columns: 1fr;
}

@media (max-width: 820px) {
  .nd-body-cols {
    grid-template-columns: 1fr;
  }
}

.nd-body-col {
  min-width: 0;
}

.nd-body-col--img {
  margin-top: 2px;
}

.nd-image-slot {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  min-height: 220px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0;
}

.nd-image-slot--placeholder {
  border-style: dashed;
  border-color: #d6d3d1;
}

.nd-hero-img {
  width: 100%;
  min-height: 220px;
  max-height: 420px;
  object-fit: cover;
  object-position: center;
  display: block;
  background: #e2e8f0;
}

.nd-image-hint {
  margin: 0;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.45;
  color: #64748b;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
}

.nd-body-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 8px;
}

.nd-prose {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
  color: #1e293b;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  max-height: 420px;
  overflow-y: auto;
  transition: font-size 0.2s ease;
}

.nd-prose--orig {
  background: #fff;
}

.nd-prose--cn {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-color: #cbd5e1;
}

.nd-cta-wrap {
  text-align: center;
  margin: 6px 0 12px;
}

.nd-cta {
  padding: 14px 36px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background: linear-gradient(135deg, #b91c1c, #f87171);
  box-shadow: 0 10px 28px rgba(185, 28, 28, 0.28);
  transition:
    transform 0.18s ease,
    box-shadow 0.2s ease,
    filter 0.2s;
}

.nd-cta:hover {
  filter: brightness(1.05);
  box-shadow: 0 14px 32px rgba(185, 28, 28, 0.34);
  transform: translateY(-2px);
}

.nd-cta:active {
  transform: scale(0.98) translateY(0);
}

.nd-cta-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #64748b;
}

.nd-rel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nd-related-bottom {
  margin-top: 14px;
}

.nd-ms-middle {
  margin-top: 14px;
}

.nd-rel-carousel {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: stretch;
}

.nd-rel-nav {
  width: 40px;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  background: #fff;
  color: #44403c;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.nd-rel-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nd-rel-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.nd-rel-card {
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  padding: 0;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.nd-rel-card:hover {
  transform: translateY(-2px);
  border-color: #fca5a5;
  box-shadow: 0 8px 20px rgba(185, 28, 28, 0.12);
}

.nd-rel-thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #e7e5e4;
}

.nd-rel-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.nd-rel-card-body {
  padding: 10px 10px 12px;
  display: grid;
  gap: 6px;
}

.nd-rel-slide-enter-active,
.nd-rel-slide-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}

.nd-rel-slide-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.nd-rel-slide-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.nd-rel-btn {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  text-align: left;
  font: inherit;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    transform 0.15s;
}

.nd-rel-btn:hover {
  border-color: #fca5a5;
  box-shadow: 0 6px 18px rgba(185, 28, 28, 0.1);
  transform: translateY(-1px);
}

.nd-rel-risk {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}

.nd-rel-risk.r--high {
  background: #fee2e2;
  color: #b91c1c;
}
.nd-rel-risk.r--mid {
  background: #fef9c3;
  color: #a16207;
}
.nd-rel-risk.r--low {
  background: #dcfce7;
  color: #15803d;
}

.nd-rel-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nd-rel-src {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .nd-rel-track {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .nd-rel-track {
    grid-template-columns: 1fr;
  }
}

/* —— 浏览器书签引导（Teleport 到 body，需全局层级） */
.nd-bm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
}

.nd-bm-card {
  position: relative;
  max-width: 420px;
  width: 100%;
  padding: 22px 22px 18px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
}

.nd-bm-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.nd-bm-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.nd-bm-title {
  margin: 0 28px 12px 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.nd-bm-lead {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.55;
  color: #475569;
}

.nd-bm-shortcuts {
  margin: 0 0 12px;
  padding-left: 1.1rem;
  font-size: 14px;
  line-height: 1.85;
  color: #334155;
}

.nd-bm-shortcuts li {
  margin-bottom: 4px;
}

.nd-bm-kbd {
  display: inline-block;
  min-width: 118px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.nd-bm-shortcuts kbd {
  display: inline-block;
  padding: 2px 8px;
  margin: 0 2px;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  box-shadow: 0 1px 0 #e2e8f0;
}

.nd-bm-tip {
  margin: 0 0 18px;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
}

.nd-bm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.nd-bm-btn {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  cursor: pointer;
}

.nd-bm-btn:hover {
  background: #f1f5f9;
}

.nd-bm-btn--primary {
  border-color: #fecaca;
  background: linear-gradient(135deg, #b91c1c, #f87171);
  color: #fff;
  box-shadow: 0 4px 14px rgba(185, 28, 28, 0.22);
}

.nd-bm-btn--primary:hover {
  filter: brightness(1.05);
}
</style>
