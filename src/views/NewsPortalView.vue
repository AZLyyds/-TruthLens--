<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchDashboardOverview, fetchDashboardTrends } from '../api/dashboard'
import { fetchNewsDetail, fetchNewsList } from '../api/news'
import { runNewsWorkflow } from '../api/workflow'
import CdsWordCloud from '../components/wordcloud/CdsWordCloud.vue'

const router = useRouter()
const isLoading = ref(false)
const errorMessage = ref('')
const workflowStatus = ref('')
const workflowLoading = ref(false)
const overviewLoading = ref(false)

const allNews = ref([])
const trendItems = ref([])
const pageSize = 12
const visibleCount = ref(pageSize)
const selectedKeyword = ref('')
const filters = ref({
  source: 'all',
  risk: 'all',
  keyword: '',
  time: 'all',
})

/** 列表 risk 与详情一致：可为 low / medium / high 或中文三档 */
function riskRankForSort(risk) {
  const r = String(risk ?? '').trim().toLowerCase()
  if (r === '高风险' || r === 'high') return 3
  if (r === '中风险' || r === 'medium') return 2
  if (r === '低风险' || r === 'low') return 1
  return 0
}

function riskFilterMatches(filterVal, itemRisk) {
  if (filterVal === 'all') return true
  const ir = String(itemRisk ?? '').trim().toLowerCase()
  if (filterVal === '高风险') return ir === '高风险' || ir === 'high'
  if (filterVal === '中风险') return ir === '中风险' || ir === 'medium'
  if (filterVal === '低风险') return ir === '低风险' || ir === 'low'
  return false
}

function riskTagClass(risk) {
  const r = String(risk ?? '').trim().toLowerCase()
  if (r === '高风险' || r === 'high') return 'high'
  if (r === '中风险' || r === 'medium') return 'mid'
  if (r === '低风险' || r === 'low') return 'low'
  return 'pending'
}

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
  router.push({ name: 'news-detail', params: { id: String(item.id) }, query: { from: 'portal' } })
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
    const [, t] = await Promise.all([fetchDashboardOverview(), fetchDashboardTrends()])
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

/** 词云：停用词 + 长度 2–6，过滤介词与无意义高频 */
const KEYWORD_STOP = new Set(
  [
    '中国',
    '新闻',
    '报道',
    '国际',
    '表示',
    '发布',
    '透露',
    '消息',
    '记者',
    '讯',
    '本报',
    '的',
    '了',
    '在',
    '是',
    '和',
    '与',
    '或',
    '及',
    '对',
    '为',
    '以',
    '于',
    '也',
    '都',
    '而',
    '就',
    '等',
    '被',
    '从',
    '把',
    '让',
    '向',
    '中',
    '其',
    '这',
    '那',
    '有',
    '不',
    '一个',
    '没有',
    '可以',
    '已经',
    '进行',
    '通过',
    '根据',
    '目前',
    '相关',
    '问题',
    '情况',
    '方面',
    '内容',
    '时间',
    '地区',
    '国家',
    '政府',
    '部门',
    '公司',
    '称',
    '说',
    '将',
    '会',
    '还',
    '又',
    '但',
    '若',
    '所',
    '之',
    '由',
    '到',
    '给',
    '向',
    '因',
    '于',
    '很',
    '更',
    '最',
    '再',
    '并',
    '且',
    '则',
    '即',
    '虽',
    '仍',
    '亦',
    'on',
    'and',
    'or',
    'to',
    'for',
    'of',
    'the',
    'with',
    'from',
    'by',
    'at',
    'as',
    'in',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'that',
    'this',
    'these',
    'those',
    'it',
    'its',
    'their',
    'them',
    'about',
    'after',
    'before',
    'into',
    'over',
    'under',
  ].map((s) => s.trim()),
)

const keywordCloud = computed(() => {
  const counts = new Map()
  allNews.value.forEach((item) => {
    const text = String(item.title || '')
    const words = text.split(/[\s,，。；：:、|/()（）【】\[\]"'“”‘’-]+/).filter(Boolean)
    words.forEach((raw) => {
      const w = String(raw).trim()
      const low = w.toLowerCase()
      if (!w || KEYWORD_STOP.has(w) || KEYWORD_STOP.has(low)) return
      if (w.length < 2 || w.length > 6) return
      if (/^\d+$/.test(w)) return
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
      if (!riskFilterMatches(filters.value.risk, item.risk)) return false
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
      return riskRankForSort(b.risk) - riskRankForSort(a.risk)
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

/** 当前列表中的风险占比（用于总览条带图） */
const riskMix = computed(() => {
  let high = 0
  let mid = 0
  let low = 0
  let other = 0
  for (const n of allNews.value) {
    const r = String(n.risk ?? '').trim().toLowerCase()
    if (r === '高风险' || r === 'high') high += 1
    else if (r === '中风险' || r === 'medium') mid += 1
    else if (r === '低风险' || r === 'low') low += 1
    else other += 1
  }
  const total = high + mid + low + other || 1
  return {
    high,
    mid,
    low,
    other,
    total,
    highPct: Math.round((high / total) * 100),
    midPct: Math.round((mid / total) * 100),
    lowPct: Math.round((low / total) * 100),
    otherPct: Math.round((other / total) * 100),
  }
})

/** 仪表盘迷你折线（后台风险指数） */
const trendSparkPath = computed(() =>
  trendSeries.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
)

const keywordTop = computed(() => keywordCloud.value.slice(0, 8))

/** 列表风险环形图（与 risk-tag 同系浅色） */
const riskDonutStyle = computed(() => {
  const m = riskMix.value
  let a = 0
  const parts = []
  if (m.highPct) {
    parts.push(`#dc2626 ${a}% ${a + m.highPct}%`)
    a += m.highPct
  }
  if (m.midPct) {
    parts.push(`#f59e0b ${a}% ${a + m.midPct}%`)
    a += m.midPct
  }
  if (m.lowPct) {
    parts.push(`#16a34a ${a}% ${a + m.lowPct}%`)
    a += m.lowPct
  }
  if (m.otherPct) {
    parts.push(`#e7e5e4 ${a}% ${a + m.otherPct}%`)
  }
  if (!parts.length) parts.push('#f5f5f4 0% 100%')
  return { background: `conic-gradient(${parts.join(', ')})` }
})

const heroShellVars = computed(() => ({ '--portal-hero-flag': 'url(/logo/headpic.svg)' }))

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
    let msg = `工作流已触发：新增约 ${result?.storedCount ?? 0} 条入库。风险参考分会在后台陆续算好，打开新闻详情即可看到进度。`
    const firstCreated = Array.isArray(result?.created) ? result.created[0] : null
    if (firstCreated?.newsId) {
      msg += ` 可优先查看最新一条。`
    }
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
      workflowStatus.value = '工作流等待超时，可稍后重试；若经常超时，请联系管理员调高超时上限。'
    } else {
      workflowStatus.value = msg || '工作流触发失败，请稍后重试或检查百炼接入配置。'
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
    <main class="portal-main">
        <section class="portal-dash anim-up delay-1">
          <article class="dash-hero card dash-hero--surface has-custom-bg" :style="heroShellVars">
            <div class="dash-hero-bg-fallback" aria-hidden="true" />
            <div class="dash-hero-scrim" aria-hidden="true" />
            <div class="dash-hero-glow" aria-hidden="true" />
            <div class="dash-hero-flag" aria-hidden="true" />
            <div class="dash-hero-topbar">
              <div class="dash-hero-copy">
                <p class="dash-kicker dash-kicker--on-dark">工作台</p>
                <h2 class="dash-hero-title">新闻采集与核验工作台</h2>
                <p class="dash-hero-lead">
                  在此查看后台风险走势、列表风险分布、触发采集流水线，并用关键词辅助筛选下方新闻流。
                </p>
              </div>
            </div>
          </article>

          <div class="portal-dash-grid">
            <article class="dash-card dash-trend-panel card">
              <header class="dash-head">
                <div>
                  <p class="dash-kicker">趋势</p>
                  <h3 class="dash-title">后台风险指数</h3>
                </div>
                <span class="dash-pill" :class="{ pending: overviewLoading }">{{ trendSeries.length }} 点</span>
              </header>
              <div class="dash-trend-body">
                <svg class="dash-trend-svg dash-trend-svg--heatmap" viewBox="0 0 100 44" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="hmStrong" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#b91c1c" />
                      <stop offset="100%" stop-color="#ef4444" />
                    </linearGradient>
                    <linearGradient id="hmMid" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#ea580c" />
                      <stop offset="100%" stop-color="#fb923c" />
                    </linearGradient>
                    <linearGradient id="hmLow" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#16a34a" />
                      <stop offset="100%" stop-color="#86efac" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="44" rx="5" fill="#fff8f8" />
                  <g opacity="0.92">
                    <rect x="4" y="6" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="15" y="6" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="26" y="6" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="37" y="6" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="48" y="6" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="59" y="6" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="70" y="6" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="81" y="6" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="4" y="15" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="15" y="15" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="26" y="15" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="37" y="15" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="48" y="15" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="59" y="15" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="70" y="15" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="81" y="15" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="4" y="24" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="15" y="24" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="26" y="24" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="37" y="24" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="48" y="24" width="9" height="7" rx="1.5" fill="url(#hmStrong)" />
                    <rect x="59" y="24" width="9" height="7" rx="1.5" fill="url(#hmMid)" />
                    <rect x="70" y="24" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                    <rect x="81" y="24" width="9" height="7" rx="1.5" fill="url(#hmLow)" />
                  </g>
                </svg>
                <div class="dash-trend-caption">风险强度时间热力</div>
                <p class="dash-trend-foot">静态示意：颜色越深代表阶段风险越高，按时间轴滚动观察。</p>
              </div>
            </article>

            <article class="dash-card dash-risk-mix card dash-risk-mix--dense">
              <header class="dash-head">
                <div>
                  <p class="dash-kicker">分布</p>
                  <h3 class="dash-title">列表风险结构</h3>
                </div>
                <span class="dash-pill">{{ riskMix.total }} 条</span>
              </header>
              <div class="dash-risk-dense">
                <div class="dash-risk-donut" aria-hidden="true">
                  <div class="dash-ring-outer" :style="riskDonutStyle">
                    <div class="dash-ring-hole" />
                  </div>
                </div>
                <div class="dash-risk-bars dash-risk-bars--tight" role="img" aria-label="风险条带图">
                  <div class="dash-risk-track">
                    <span
                      v-if="riskMix.high"
                      class="dash-risk-seg dash-risk-seg--high"
                      :style="{ width: riskMix.highPct + '%' }"
                    />
                    <span
                      v-if="riskMix.mid"
                      class="dash-risk-seg dash-risk-seg--mid"
                      :style="{ width: riskMix.midPct + '%' }"
                    />
                    <span
                      v-if="riskMix.low"
                      class="dash-risk-seg dash-risk-seg--low"
                      :style="{ width: riskMix.lowPct + '%' }"
                    />
                    <span
                      v-if="riskMix.other"
                      class="dash-risk-seg dash-risk-seg--other"
                      :style="{ width: riskMix.otherPct + '%' }"
                    />
                  </div>
                  <ul class="dash-risk-legend dash-risk-legend--compact">
                    <li><i class="dot dot--high" />高 {{ riskMix.high }}（{{ riskMix.highPct }}%）</li>
                    <li><i class="dot dot--mid" />中 {{ riskMix.mid }}（{{ riskMix.midPct }}%）</li>
                    <li><i class="dot dot--low" />低 {{ riskMix.low }}（{{ riskMix.lowPct }}%）</li>
                    <li v-if="riskMix.other"><i class="dot dot--other" />其它 {{ riskMix.other }}</li>
                  </ul>
                </div>
              </div>
            </article>

            <article class="dash-card dash-workflow card">
              <header class="dash-head">
                <div>
                  <p class="dash-kicker">编排</p>
                  <h3 class="dash-title">百炼工作流</h3>
                </div>
                <span class="dash-pill">接入</span>
              </header>
              <div class="dash-workflow-body">
                <p class="dash-workflow-lead">
                  一键触发云端流水线，抓取并写入新闻与结构化要点；完成后可在详情页查看风险参考分（后台陆续计算）。
                </p>
                <button type="button" class="dash-workflow-btn" :disabled="workflowLoading" @click="triggerWorkflow">
                  {{ workflowLoading ? '运行中…' : '触发百炼工作流' }}
                </button>
                <p v-if="workflowStatus" class="dash-workflow-msg">{{ workflowStatus }}</p>
              </div>
            </article>
          </div>

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
                  <span :class="['risk-tag', riskTagClass(item.risk)]">
                    {{ item.risk || '—' }}
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
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  height: auto;
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--page-pad-y-top) var(--page-pad-x) var(--page-pad-y-bottom);
  gap: 14px;
  overflow: visible;
  display: flex;
  flex-direction: column;
}

.portal-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
  overflow: visible;
}

.portal-dash {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex-shrink: 0;
}

.portal-dash-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .portal-dash-grid {
    grid-template-columns: 1fr;
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dash-hero--surface {
  position: relative;
  overflow: hidden;
  padding: 22px 22px 18px;
  border: none;
  color: #fff;
  background-color: #450a0a;
  background-image: linear-gradient(135deg, rgba(69, 10, 10, 0.94) 0%, rgba(127, 29, 29, 0.82) 48%, rgba(185, 28, 28, 0.9) 100%);
  background-size: cover;
  background-position: center;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 18px 40px rgba(69, 10, 10, 0.28);
}

.dash-hero--surface.has-custom-bg {
  background-image: linear-gradient(135deg, rgba(127, 29, 29, 0.94) 0%, rgba(185, 28, 28, 0.86) 52%, rgba(153, 27, 27, 0.94) 100%);
  background-size: cover;
  background-position: center;
}

.dash-hero-bg-fallback {
  display: none;
}

.dash-hero-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: transparent;
  opacity: 0;
}

.dash-hero-glow {
  position: absolute;
  inset: -40% -20% auto 40%;
  height: 120%;
  background: transparent;
  pointer-events: none;
}

.dash-hero-flag {
  position: absolute;
  right: 18px;
  top: 68%;
  width: min(220px, 30vw);
  height: min(220px, 30vw);
  transform: translateY(-50%);
  background: var(--portal-hero-flag) center / contain no-repeat;
  opacity: 0.4;
  pointer-events: none;
  z-index: 10;
}

.dash-hero-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 20px;
}

.dash-hero-copy {
  min-width: min(100%, 320px);
}

.dash-hero-title {
  margin: 0 0 8px;
  font-size: clamp(1.35rem, 2.4vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.dash-hero-lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.88);
  max-width: 56ch;
}

.dash-kicker--on-dark {
  color: rgba(254, 226, 226, 0.88);
}

.dash-trend-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 140px;
}

.dash-trend-svg {
  width: 100%;
  height: 120px;
  display: block;
  border-radius: 14px;
  background: linear-gradient(180deg, #fef2f2 0%, #fafaf9 100%);
  border: 1px solid #e7e5e4;
}

.dash-trend-svg--heatmap {
  box-shadow: inset 0 0 0 1px rgba(254, 202, 202, 0.35);
}

.dash-trend-foot {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #78716c;
}

.dash-trend-caption {
  font-size: 14px;
  font-weight: 700;
  color: #7f1d1d;
}

.dash-pill.pending {
  opacity: 0.65;
}

.portal-cloud-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.72fr);
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 900px) {
  .portal-cloud-row {
    grid-template-columns: 1fr;
  }
}

.dash-cloud-side {
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(165deg, #ffffff 0%, #fafaf9 100%);
  border: 1px solid #e7e5e4;
  box-shadow: var(--shadow, 0 10px 28px rgba(15, 23, 42, 0.06));
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.dash-side-title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: #1c1917;
  letter-spacing: -0.02em;
}

.dash-kw-rank {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dash-kw-rank li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.dash-kw-i {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  color: #7f1d1d;
  background: linear-gradient(135deg, #fef2f2, #fff7ed);
  border: 1px solid rgba(254, 202, 202, 0.85);
}

.dash-kw-btn {
  justify-self: start;
  max-width: 100%;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: #292524;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.dash-kw-btn:hover {
  border-color: #fca5a5;
  background: #fff;
}

.dash-kw-c {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #78716c;
}

.dash-side-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #a8a29e;
  line-height: 1.45;
}

.dash-risk-mix--dense .dash-risk-dense {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px 18px;
  min-height: 156px;
}

.dash-risk-donut {
  flex-shrink: 0;
}

.dash-ring-outer {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  box-shadow:
    0 2px 8px rgba(28, 25, 23, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.dash-ring-hole {
  position: absolute;
  inset: 20px;
  border-radius: 50%;
  background: var(--card, #fafaf9);
  box-shadow: inset 0 2px 6px rgba(15, 23, 42, 0.06);
}

.dash-risk-bars--tight {
  flex: 1;
  min-width: min(100%, 220px);
  gap: 8px;
}

.dash-risk-legend--compact {
  gap: 6px 12px;
  font-size: 12px;
}

.dash-risk-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dash-risk-track {
  display: flex;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: #f5f5f4;
  border: 1px solid #e7e5e4;
}

.dash-risk-seg {
  height: 100%;
  min-width: 2px;
  transition: width 0.35s ease;
}

.dash-risk-seg--high {
  background: linear-gradient(90deg, #ef4444, #b91c1c);
}

.dash-risk-seg--mid {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.dash-risk-seg--low {
  background: linear-gradient(90deg, #4ade80, #16a34a);
}

.dash-risk-seg--other {
  background: linear-gradient(90deg, #e7e5e4, #d6d3d1);
}

.dash-risk-legend {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 13px;
  color: #44403c;
}

.dash-risk-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dash-risk-legend .dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.dot--high {
  background: #f87171;
  box-shadow: inset 0 0 0 1px rgba(185, 28, 28, 0.25);
}

.dot--mid {
  background: #fbbf24;
  box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.2);
}

.dot--low {
  background: #4ade80;
  box-shadow: inset 0 0 0 1px rgba(21, 128, 61, 0.2);
}

.dot--other {
  background: #78716c;
}

.dash-card {
  padding: 16px 18px;
  border-radius: 18px;
  overflow: visible;
}

.dash-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.dash-head--cloud {
  margin-bottom: 10px;
}

.dash-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a8a29e;
}

.dash-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1c1917;
}

.dash-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fef2f2, #fff7ed);
  color: #7f1d1d;
  border: 1px solid rgba(254, 202, 202, 0.9);
}

.dash-workflow-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  min-height: 164px;
}

.dash-workflow-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #57534e;
}

.dash-workflow-btn {
  width: 100%;
  padding: 13px 16px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.02em;
  color: #fff;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: linear-gradient(168deg, #7f1d1d 0%, #b91c1c 48%, #991b1b 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 10px 26px rgba(127, 29, 29, 0.22);
  transition: filter 0.2s ease, transform 0.15s ease;
}

.dash-workflow-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.dash-workflow-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.dash-workflow-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.dash-workflow-msg {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #44403c;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(254, 242, 242, 0.9);
  border: 1px solid rgba(254, 202, 202, 0.85);
  max-height: 120px;
  overflow-y: auto;
}

.dash-cloud-stage {
  position: relative;
  min-height: 260px;
  height: 260px;
  border-radius: 16px;
  border: 1px solid #e7e5e4;
  background: linear-gradient(180deg, #fffdfd 0%, #fafaf9 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 10px;
}

.chip {
  border: 1px solid #e7e5e4;
  border-radius: 999px;
  background: linear-gradient(120deg, #ffffff, #fafaf9);
  color: #292524;
  padding: 5px 11px;
  line-height: 1;
}

.chip:hover {
  transform: scale(1.04);
}

.chip.active {
  background: linear-gradient(120deg, #b91c1c, #f87171);
  color: #fff;
  border-color: transparent;
}

.feed-card {
  padding: 20px 22px 22px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.news-scroll {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 4px;
  padding-right: 4px;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.feed-header h2 {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1c1917;
}

.feed-header .desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: #57534e;
  max-width: 62ch;
}

.feed-count {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: #7f1d1d;
  background: linear-gradient(135deg, #fef2f2, #fff7ed);
  border: 1px solid rgba(254, 202, 202, 0.85);
  border-radius: 999px;
  padding: 8px 14px;
}

.filter-bar {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 14px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(180deg, #fafaf9 0%, #f5f5f4 100%);
  border: 1px solid #e7e5e4;
}

.filter-bar select,
.filter-bar input {
  flex: 1 1 160px;
  min-width: 140px;
  border: 1px solid #e7e5e4;
  background: #ffffff;
  height: 44px;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 14px;
  font-family: inherit;
  color: #292524;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.filter-bar select {
  appearance: auto;
  background-image: none;
  padding-right: 12px;
}

.filter-bar input::placeholder {
  color: #a8a29e;
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  grid-auto-rows: minmax(118px, auto);
}

.news-tile {
  border: 1px solid #e7e5e4;
  border-radius: 16px;
  min-height: 118px;
  padding: 14px 14px 12px;
  background: linear-gradient(160deg, #fff, #fafaf9);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.news-tile:hover {
  transform: translateY(-2px);
  border-color: #fca5a5;
  box-shadow: 0 12px 26px rgba(185, 28, 28, 0.1);
}

.news-tile header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.risk-tag {
  border-radius: 999px;
  font-size: 12px;
  padding: 4px 10px;
  font-weight: 700;
}

.risk-tag.low {
  color: #15803d;
  background: #dcfce7;
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
  background: #e7e5e4;
}

.source {
  color: #57534e;
  font-size: 13px;
  font-weight: 500;
}

.news-tile h3 {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: #1c1917;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.time {
  margin: 0;
  color: #78716c;
  font-size: 13px;
}

.feed-footer {
  margin-top: 4px;
  text-align: center;
  color: #6b7280;
  font-size: 12px;
}

.load-more-btn {
  display: inline-block;
  margin-bottom: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #b91c1c, #f87171);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(185, 28, 28, 0.22);
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
  background: linear-gradient(110deg, #fef2f2 8%, #fff1f2 18%, #fef2f2 33%);
  background-size: 200% 100%;
  animation: loading 1.3s linear infinite;
}

.empty-state {
  border: 1px dashed #e7e5e4;
  border-radius: 14px;
  background: #fafaf9;
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
    min-height: 100dvh;
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