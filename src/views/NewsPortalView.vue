<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchDashboardOverview, fetchDashboardTrends } from '../api/dashboard'
import { fetchNewsDetail, fetchNewsList } from '../api/news'
import { runNewsWorkflow } from '../api/workflow'

const router = useRouter()
const isLoading = ref(false)
const errorMessage = ref('')
const workflowStatus = ref('')
const workflowLoading = ref(false)
const overviewLoading = ref(false)

const allNews = ref([])
const trendItems = ref([])
const overview = ref({
  todayCollected: 0,
  yesterdayCollected: 0,
  todayCollectedDeltaPct: 0,
  highRiskCount: 0,
  yesterdayHighRiskCount: 0,
  highRiskDeltaPct: 0,
  mediaCoverage: 0,
})

const pageSize = 12
const visibleCount = ref(pageSize)
const selectedKeyword = ref('')
const filters = ref({
  source: 'all',
  risk: 'all',
  keyword: '',
  time: 'all',
})

const riskOrder = { 高风险: 3, 中风险: 2, 低风险: 1 }

function asDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTime(value) {
  const d = asDate(value)
  if (!d) return '未知时间'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function toDetail(item) {
  if (item?.id == null) return
  router.push({ name: 'news-detail', params: { id: String(item.id) } })
}

async function loadNews() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const rows = await fetchNewsList({ page: 1, pageSize: 200 })
    const baseRows = Array.isArray(rows) ? rows : []
    // 与详情页保持同一风险来源：按新闻 id 回填 detail.riskLevel / detail.fakeScore
    const enriched = await Promise.all(
      baseRows.map(async (item) => {
        if (item?.id == null) return item
        try {
          const d = await fetchNewsDetail(item.id)
          return {
            ...item,
            risk: d?.riskLevel || item.risk || null,
            fakeScore: d?.fakeScore ?? item.fakeScore ?? null,
          }
        } catch {
          return item
        }
      }),
    )
    allNews.value = enriched
    visibleCount.value = pageSize
  } catch (error) {
    errorMessage.value = error?.message || '新闻加载失败'
  } finally {
    isLoading.value = false
  }
}

async function loadOverview() {
  overviewLoading.value = true
  try {
    const [o, t] = await Promise.all([fetchDashboardOverview(), fetchDashboardTrends()])
    overview.value = {
      todayCollected: Number(o?.todayCollected || 0),
      yesterdayCollected: Number(o?.yesterdayCollected || 0),
      todayCollectedDeltaPct: Number(o?.todayCollectedDeltaPct || 0),
      highRiskCount: Number(o?.highRiskCount || 0),
      yesterdayHighRiskCount: Number(o?.yesterdayHighRiskCount || 0),
      highRiskDeltaPct: Number(o?.highRiskDeltaPct || 0),
      mediaCoverage: Number(o?.mediaCoverage || 0),
    }
    trendItems.value = Array.isArray(t?.items) ? t.items : []
  } catch {
    trendItems.value = []
  } finally {
    overviewLoading.value = false
  }
}

const sourceOptions = computed(() => {
  const set = new Set(allNews.value.map((n) => n.source).filter(Boolean))
  return ['all', ...Array.from(set)]
})

const keywordCloud = computed(() => {
  const stop = new Set(['中国', '新闻', '报道', '国际', '表示', '发布', '透露', '消息'])
  const counts = new Map()
  allNews.value.forEach((item) => {
    const text = String(item.title || '')
    const words = text.split(/[\s,，。；：:、|/()（）【】[\]-]+/).filter((w) => w && w.length >= 2)
    words.forEach((w) => {
      if (stop.has(w)) return
      counts.set(w, (counts.get(w) || 0) + 1)
    })
  })
  const items = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)
  const max = items[0]?.count || 1
  return items.map((item) => ({
    ...item,
    size: 12 + Math.round((item.count / max) * 12),
  }))
})

const filteredNews = computed(() => {
  const now = Date.now()
  const kw = filters.value.keyword.trim().toLowerCase()
  return allNews.value
    .filter((item) => {
      if (filters.value.source !== 'all' && item.source !== filters.value.source) return false
      if (filters.value.risk !== 'all' && item.risk !== filters.value.risk) return false
      const title = String(item.title || '').toLowerCase()
      const source = String(item.source || '').toLowerCase()
      if (selectedKeyword.value && !title.includes(selectedKeyword.value.toLowerCase())) return false
      if (kw && !title.includes(kw) && !source.includes(kw)) return false
      if (filters.value.time === '24h') {
        const d = asDate(item.publishedAt || item.createdAt)
        if (!d || now - d.getTime() > 24 * 3600 * 1000) return false
      }
      if (filters.value.time === '7d') {
        const d = asDate(item.publishedAt || item.createdAt)
        if (!d || now - d.getTime() > 7 * 24 * 3600 * 1000) return false
      }
      return true
    })
    .sort((a, b) => {
      const da = asDate(a.publishedAt || a.createdAt)?.getTime() || 0
      const db = asDate(b.publishedAt || b.createdAt)?.getTime() || 0
      if (db !== da) return db - da
      return (riskOrder[b.risk] || 0) - (riskOrder[a.risk] || 0)
    })
})

const visibleNews = computed(() => filteredNews.value.slice(0, visibleCount.value))
const canLoadMore = computed(() => visibleNews.value.length < filteredNews.value.length)

function loadMore() {
  visibleCount.value = Math.min(filteredNews.value.length, visibleCount.value + pageSize)
}

// 筛选条件变化时，重置为每次展示 12 条
watch(
  () => [filters.value.source, filters.value.risk, filters.value.time, filters.value.keyword, selectedKeyword.value],
  () => {
    visibleCount.value = pageSize
  },
)

const trendSeries = computed(() => {
  const src = trendItems.value.length
    ? trendItems.value
    : Array.from({ length: 8 }, (_, i) => ({ time: `${String(i * 3).padStart(2, '0')}:00`, riskIndex: 20 + i * 9 }))
  const max = Math.max(...src.map((x) => Number(x.riskIndex || 0)), 1)
  return src.map((item, i) => {
    const value = Number(item.riskIndex || 0)
    const x = src.length === 1 ? 0 : (i / (src.length - 1)) * 100
    const y = 100 - (value / max) * 100
    return { time: item.time, value, x, y: Math.max(6, y) }
  })
})

const trendPath = computed(() => trendSeries.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '))
const trendHoverIndex = ref(-1)
const currentHighRiskCount = computed(() => allNews.value.filter((n) => n.risk === '高风险').length)

const metricCards = computed(() => {
  const base = [
    {
      key: 'todayCollected',
      title: '今日采集',
      icon: '🛰',
      value: overview.value.todayCollected,
      delta: overview.value.todayCollectedDeltaPct,
    },
    {
      key: 'highRiskCount',
      title: '高风险条目',
      icon: '⚠',
      // 与下方新闻流卡片使用同一数据源，保证口径一致
      value: currentHighRiskCount.value,
      delta: overview.value.highRiskDeltaPct,
    },
  ]
  return base.map((card, idx) => ({
    ...card,
    up: card.delta >= 0,
    spark: trendSeries.value.slice(Math.max(0, idx * 2), Math.max(4, idx * 2 + 6)),
  }))
})

function applyKeywordChip(word) {
  selectedKeyword.value = selectedKeyword.value === word ? '' : word
}

async function triggerWorkflow() {
  workflowLoading.value = true
  workflowStatus.value = ''
  try {
    const result = await runNewsWorkflow({
      triggerSource: 'frontend_test',
      requestedAt: new Date().toISOString(),
      timeoutMs: 360000,
    })
    let msg = `工作流触发成功：已写入 ${result?.storedCount ?? 0} 条结果。`
    const w = result?.workflow
    if (w && typeof w === 'object') {
      const bits = []
      if (w.newsCount != null) bits.push(`抓取 ${w.newsCount} 条`)
      if (w.duplicateRemovedCount != null) bits.push(`去重后 ${w.duplicateRemovedCount} 条`)
      if (w.overallRiskLevel) bits.push(`整体 ${String(w.overallRiskLevel)}`)
      if (bits.length) msg += `（${bits.join('，')}）`
      if (w.overallConclusion) {
        const c = String(w.overallConclusion)
        msg += ` ${c.length > 200 ? `${c.slice(0, 200)}…` : c}`
      }
    }
    workflowStatus.value = msg
    await loadNews()
    await loadOverview()
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg.includes('timeout') || msg.includes('ECONNABORTED')) {
      workflowStatus.value = '工作流执行超时（已超过等待上限）。可稍后重试，或在 .env 提高 DASHSCOPE_WORKFLOW_TIMEOUT_MS。'
    } else {
      workflowStatus.value = msg || '工作流触发失败，请检查后端日志与百炼配置。'
    }
  } finally {
    workflowLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadNews(), loadOverview()])
})
</script>

<template>
  <div class="page page-portal portal-pro">
    <header class="top-nav card">
      <div class="title">TruthLens · 新闻门户</div>
      <nav>
        <span class="dot active" @click="router.push('/portal')">总览</span>
        <span class="dot" @click="router.push('/dashboard')">监控大屏</span>
        <span class="dot" @click="router.push('/analysis')">单篇分析</span>
        <span class="dot" @click="router.push('/multi-analysis')">多篇分析</span>
        <span class="dot" @click="router.push('/profile')">个人中心</span>
        <span class="avatar">JW</span>
      </nav>
    </header>

    <main class="portal-main">
        <section class="overview-grid anim-up delay-1">
          <article class="overview-card metrics-card card">
            <header class="section-head"><h3>核心指标</h3><span>实时更新</span></header>
            <div class="metrics-list">
              <div v-for="m in metricCards" :key="m.key" class="metric-item shimmer" :class="{ pending: overviewLoading }">
                <div class="metric-top">
                  <span class="metric-icon">{{ m.icon }}</span>
                  <span class="metric-title">{{ m.title }}</span>
                  <span :class="['metric-delta', m.up ? 'up' : 'down']">{{ m.up ? '↑' : '↓' }} {{ Math.abs(m.delta) }}%</span>
                </div>
                <div class="metric-value">{{ m.value }}</div>
                <div class="sparkline">
                  <span v-for="(s, idx) in m.spark" :key="idx" :style="{ height: `${10 + (s.value || 0) * 0.5}px` }"></span>
                </div>
              </div>
            </div>
          </article>

          <article class="overview-card trend-card card">
            <header class="section-head"><h3>风险趋势 24h</h3><span>{{ trendSeries.length }} 个采样点</span></header>
            <div class="trend-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="风险趋势图">
                <defs>
                  <linearGradient id="trendLine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#2563eb" />
                    <stop offset="100%" stop-color="#60a5fa" />
                  </linearGradient>
                </defs>
                <path class="grid-line" d="M 0 20 L 100 20 M 0 40 L 100 40 M 0 60 L 100 60 M 0 80 L 100 80" />
                <path :d="trendPath" fill="none" stroke="url(#trendLine)" stroke-width="1.4" stroke-linecap="round" />
                <circle
                  v-for="(p, idx) in trendSeries"
                  :key="idx"
                  :cx="p.x"
                  :cy="p.y"
                  r="1.6"
                  :class="['trend-dot', { active: trendHoverIndex === idx }]"
                  @mouseenter="trendHoverIndex = idx"
                  @mouseleave="trendHoverIndex = -1"
                />
              </svg>
              <div v-if="trendHoverIndex >= 0" class="trend-tooltip">
                {{ trendSeries[trendHoverIndex].time }} · 风险指数 {{ trendSeries[trendHoverIndex].value }}
              </div>
            </div>
            <div class="chart-axis">
              <span v-for="(p, idx) in trendSeries" :key="`axis-${idx}`">{{ p.time }}</span>
            </div>
          </article>

          <article class="overview-card cloud-card card">
            <header class="section-head"><h3>热点关键词云</h3><span>{{ keywordCloud.length }} 个热点词</span></header>
            <div class="keyword-cloud">
              <button
                v-for="word in keywordCloud"
                :key="word.name"
                type="button"
                :class="['chip', { active: selectedKeyword === word.name }]"
                :style="{ fontSize: `${word.size}px` }"
                @click="applyKeywordChip(word.name)"
              >
                {{ word.name }}
              </button>
            </div>
          </article>

          <article class="overview-card actions-card card">
            <header class="section-head"><h3>操作</h3><span>工作台</span></header>
            <div class="action-grid">
              <button class="action-tile" @click="router.push('/analysis')">单篇分析</button>
              <button class="action-tile" @click="router.push('/multi-analysis')">多篇一致性</button>
              <button class="action-tile" @click="router.push('/profile')">个人中心</button>
              <button class="action-tile" :disabled="workflowLoading" @click="triggerWorkflow">
                {{ workflowLoading ? '工作流运行中...' : '触发百炼工作流' }}
              </button>
            </div>
            <p v-if="workflowStatus" class="workflow-status">{{ workflowStatus }}</p>
          </article>
        </section>

        <section class="feed-card card anim-up delay-2">
          <header class="feed-header">
            <div>
              <h2>海外新闻实时流</h2>
              <p class="desc">默认每次展示 12 条，可点击“加载更多”查看更多；点击卡片进入新闻详情，可在详情页进入深度分析。</p>
            </div>
            <div class="feed-count">共 {{ filteredNews.length }} 条</div>
          </header>

          <div class="filter-bar">
            <select v-model="filters.source">
              <option v-for="s in sourceOptions" :key="s" :value="s">{{ s === 'all' ? '全部来源' : s }}</option>
            </select>
            <select v-model="filters.risk">
              <option value="all">全部风险</option>
              <option value="高风险">高风险</option>
              <option value="中风险">中风险</option>
              <option value="低风险">低风险</option>
            </select>
            <select v-model="filters.time">
              <option value="all">全部时间</option>
              <option value="24h">近24小时</option>
              <option value="7d">近7天</option>
            </select>
            <input
              v-model.trim="filters.keyword"
              placeholder="关键词搜索标题/来源"
            />
          </div>

          <p v-if="errorMessage" class="desc danger">{{ errorMessage }}</p>

          <div class="news-scroll">
            <div v-if="isLoading" class="news-grid">
              <article v-for="i in 12" :key="i" class="news-tile skeleton"></article>
            </div>

            <div v-else-if="visibleNews.length" class="news-grid">
              <article v-for="item in visibleNews" :key="item.id" class="news-tile" @click="toDetail(item)">
                <header>
                  <span
                    :class="[
                      'risk-tag',
                      item.risk === '高风险' ? 'high' : item.risk === '中风险' ? 'mid' : item.risk === '低风险' ? 'low' : 'pending',
                    ]"
                  >
                    {{ item.risk || '待评估' }}
                  </span>
                  <span class="source">{{ item.source || '未知来源' }}</span>
                </header>
                <h3 :title="item.title">{{ item.title }}</h3>
                <p class="time">{{ formatTime(item.publishedAt || item.createdAt) }}</p>
              </article>
            </div>

            <div v-else class="empty-state">
              <h4>没有匹配的新闻</h4>
              <p>可以清空筛选条件，或点击上方关键词标签重新过滤。</p>
            </div>
          </div>

          <footer class="feed-footer" v-if="!isLoading && filteredNews.length">
            <button
              v-if="canLoadMore"
              type="button"
              class="load-more-btn"
              @click="loadMore"
            >
              加载更多（每次 12 条）
            </button>
            <span v-if="canLoadMore" class="feed-footer-sub">已展示 {{ visibleNews.length }} / {{ filteredNews.length }} 条</span>
            <span v-else>已展示全部结果（{{ filteredNews.length }} 条）</span>
          </footer>
        </section>
      </main>
  </div>
</template>

<style scoped>
.portal-pro {
  max-width: 1460px;
  height: 100dvh;
  min-height: 100dvh;
  padding: 10px 14px 8px;
  gap: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.portal-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
  overflow: hidden;
}

.overview-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-height: 232px;
  max-height: 232px;
  flex-shrink: 0;
}

.overview-card {
  height: 100%;
  overflow: hidden;
  padding: 10px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-head h3 {
  margin: 0;
  font-size: 15px;
}

.section-head span {
  color: #7c8da7;
  font-size: 12px;
}

.metrics-list {
  display: grid;
  gap: 10px;
  grid-template-rows: 1fr 1fr;
  height: calc(100% - 26px);
}

.metric-item {
  border: 1px solid #e1eaf8;
  border-radius: 12px;
  padding: 10px;
  background: linear-gradient(180deg, #fff, #f9fbff);
}

.metric-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #607494;
}

.metric-title {
  flex: 1;
}

.metric-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  color: #162b4d;
}

.metric-delta {
  font-weight: 700;
}

.metric-delta.up {
  color: #047857;
}

.metric-delta.down {
  color: #b45309;
}

.sparkline {
  margin-top: 4px;
  display: flex;
  align-items: end;
  gap: 4px;
  height: 24px;
}

.sparkline span {
  width: 5px;
  background: linear-gradient(180deg, #3b82f6, #93c5fd);
  border-radius: 8px;
}

.trend-chart {
  position: relative;
  height: calc(100% - 52px);
  border: 1px solid #e3ebf9;
  border-radius: 14px;
  background: linear-gradient(180deg, #fcfdff, #f6f9ff);
}

.trend-chart svg {
  width: 100%;
  height: 100%;
}

.grid-line {
  stroke: #dce8fc;
  stroke-width: 0.4;
}

.trend-dot {
  fill: #2563eb;
  transition: r 0.2s ease;
  cursor: pointer;
}

.trend-dot.active {
  r: 2.6;
  fill: #1d4ed8;
}

.chart-axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  color: #7c8da7;
  font-size: 11px;
}

.trend-tooltip {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 12px;
  color: #1d4ed8;
  background: #eaf1ff;
  border-radius: 999px;
  padding: 4px 10px;
}

.keyword-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-content: flex-start;
  justify-content: flex-start;
  height: calc(100% - 26px);
  overflow: hidden;
}

.chip {
  border: 1px solid #d8e5fb;
  border-radius: 999px;
  background: linear-gradient(120deg, #f8fbff, #edf4ff);
  color: #30537f;
  padding: 5px 11px;
  line-height: 1;
}

.chip:hover {
  transform: scale(1.04);
}

.chip.active {
  background: linear-gradient(120deg, #2563eb, #60a5fa);
  color: #fff;
  border-color: transparent;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  height: calc(100% - 42px);
  align-content: stretch;
}

.action-tile {
  border-radius: 14px;
  padding: 10px 8px;
  font-size: 13px;
}

.workflow-status {
  margin: 10px 2px 0;
  color: #486489;
  font-size: 12px;
}

/* ---------- 这里是核心修复 ---------- */
.feed-card {
  padding: 10px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.news-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
/* ----------------------------------- */

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.feed-header h2 {
  margin: 0 0 2px;
  font-size: 20px;
}

.feed-count {
  font-size: 13px;
  color: #5c7396;
  background: #edf4ff;
  border-radius: 999px;
  padding: 6px 11px;
}

.filter-bar {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1.6fr;
  gap: 8px;
}

.filter-bar select,
.filter-bar input {
  border: 1px solid #d7e4f8;
  background: #f9fbff;
  height: 38px;
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  grid-auto-rows: minmax(108px, auto);
}

.news-tile {
  border: 1px solid #e2eafb;
  border-radius: 14px;
  min-height: 108px;
  padding: 9px;
  background: linear-gradient(160deg, #fff, #f9fbff);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.news-tile:hover {
  transform: translateY(-3px);
  border-color: #b8d0f6;
  box-shadow: 0 12px 26px rgba(27, 84, 180, 0.12);
}

.news-tile header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.risk-tag {
  border-radius: 999px;
  font-size: 11px;
  padding: 3px 8px;
  font-weight: 700;
}

.risk-tag.low {
  color: #0f766e;
  background: #ccfbf1;
}

.risk-tag.mid {
  color: #92400e;
  background: #fef3c7;
}

.risk-tag.high {
  color: #b91c1c;
  background: #fee2e2;
}

.risk-tag.pending {
  color: #475569;
  background: #e2e8f0;
}

.source {
  color: #7088ab;
  font-size: 12px;
}

.news-tile h3 {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.time {
  margin: 0;
  color: #7790b2;
  font-size: 12px;
}

.feed-footer {
  margin-top: 4px;
  text-align: center;
  color: #7088ab;
  font-size: 12px;
}

.load-more-btn {
  display: inline-block;
  margin-bottom: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.22);
  transition: transform 0.15s ease, filter 0.15s ease;
}

.load-more-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.feed-footer-sub {
  display: inline-block;
  margin-left: 8px;
}

.skeleton {
  height: 140px;
  border-radius: 14px;
  background: linear-gradient(110deg, #eef4ff 8%, #f9fbff 18%, #eef4ff 33%);
  background-size: 200% 100%;
  animation: loading 1.3s linear infinite;
}

.empty-state {
  border: 1px dashed #c6d8f7;
  border-radius: 14px;
  background: #f8fbff;
  padding: 28px;
  text-align: center;
}

.empty-state h4 {
  margin: 0 0 8px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 1360px) {
  .overview-grid {
    grid-template-columns: 1fr 1fr;
    min-height: auto;
    max-height: none;
  }
  .news-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .portal-pro {
    height: auto;
    min-height: 100vh;
    overflow: auto;
  }
}

@media (max-width: 860px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .filter-bar {
    grid-template-columns: 1fr 1fr;
  }
  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 580px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }
  .news-grid {
    grid-template-columns: 1fr;
  }
}
</style>