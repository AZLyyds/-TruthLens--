<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchDashboardAlerts,
  fetchDashboardOverview,
  fetchDashboardRanking,
  fetchDashboardTrends,
} from '../api/dashboard'
import { fetchNewsList } from '../api/news'

const router = useRouter()
const isLoading = ref(false)
const errorMessage = ref('')
const formatClock = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const nowTime = ref(formatClock())

const overview = ref({
  todayCollected: 0,
  highRiskCount: 0,
  mediaCoverage: 0,
  averageCredibility: 0,
})
const animatedOverview = ref({
  todayCollected: 0,
  highRiskCount: 0,
  mediaCoverage: 0,
  averageCredibility: 0,
})
const trendItems = ref([])
const highFreqTrend = ref([])
const rankingItems = ref([])
const alertItems = ref([])
const newsItems = ref([])

const selectedRegion = ref('亚洲')
const selectedKeyword = ref('')
const selectedMapPoint = ref(null)
const hoveredTrendTime = ref('')
const hoveredScatter = ref('')
const activeConsistency = ref('')

const mapPoints = ref([
  { name: '亚洲', x: 74, y: 52, heat: 86, risk: '高风险', detail: '涉华经济与科技议题热度高位' },
  { name: '欧洲', x: 52, y: 38, heat: 63, risk: '中风险', detail: '政策叙事分歧增强，舆情波动上升' },
  { name: '北美', x: 27, y: 34, heat: 71, risk: '高风险', detail: '媒体论调极化，冲突信息扩散快' },
  { name: '南美', x: 33, y: 68, heat: 48, risk: '中风险', detail: '转载增多，原始来源可信度参差' },
  { name: '非洲', x: 54, y: 60, heat: 42, risk: '低风险', detail: '舆情平稳，合作类信息占主流' },
  { name: '大洋洲', x: 82, y: 74, heat: 39, risk: '低风险', detail: '讨论热度较低，偶发高风险话题' },
])

const keywordCloud = ref([
  { text: '地缘政治', weight: 28, risk: 'high' },
  { text: '芯片', weight: 24, risk: 'high' },
  { text: '贸易协定', weight: 18, risk: 'mid' },
  { text: '新能源', weight: 20, risk: 'mid' },
  { text: '舆论战', weight: 26, risk: 'high' },
  { text: '数据安全', weight: 22, risk: 'mid' },
  { text: '供应链', weight: 16, risk: 'mid' },
  { text: '人工智能', weight: 14, risk: 'mid' },
  { text: '国际合作', weight: 12, risk: 'low' },
])

const scatterPoints = ref([
  { media: 'Reuters', credibility: 89, risk: 34 },
  { media: 'Global Times', credibility: 82, risk: 41 },
  { media: 'Tech Daily', credibility: 76, risk: 58 },
  { media: 'World Echo', credibility: 48, risk: 84 },
  { media: 'Open Wire', credibility: 57, risk: 76 },
])

const semanticDist = ref([
  { label: '情绪煽动', value: 31 },
  { label: '事实偏差', value: 28 },
  { label: '立场误导', value: 22 },
  { label: '断章取义', value: 19 },
])

const consistencyBars = ref([
  { channel: '官方媒体', consistency: 88 },
  { channel: '主流国际媒体', consistency: 73 },
  { channel: '自媒体平台', consistency: 41 },
  { channel: '论坛社区', consistency: 35 },
])

const propagationPath = ref([
  { from: '原始来源', to: '聚合站点', risk: 'mid' },
  { from: '聚合站点', to: '社交平台', risk: 'high' },
  { from: '社交平台', to: '短视频账号', risk: 'high' },
  { from: '短视频账号', to: '跨区转载', risk: 'mid' },
])

const aiSummary = computed(() => {
  if (!alertItems.value.length) return '当前暂无高危预警，舆情总体可控。'
  const top = alertItems.value[0]
  return `近1小时高风险话题集中于“${top.title}”，建议优先核验来源 ${top.source} 的原始数据链路。`
})

const highRiskNews = computed(() => {
  const base = newsItems.value.filter((item) => item.risk === '高风险')
  if (!selectedKeyword.value) return base
  return base.filter((item) => item.title.includes(selectedKeyword.value))
})
const tickerItems = computed(() => [...highRiskNews.value, ...highRiskNews.value])

const trendMax = computed(() => Math.max(...trendItems.value.map((item) => item.riskIndex || 0), 1))
const highFreqMax = computed(() => Math.max(...highFreqTrend.value.map((item) => item.value || 0), 1))
const rankingMax = computed(() => Math.max(...rankingItems.value.map((item) => item.credibility || 0), 1))

const pieGradient = computed(() => {
  const total = semanticDist.value.reduce((sum, item) => sum + item.value, 0) || 1
  let acc = 0
  const palette = ['#ff5b5b', '#ff8a4c', '#40b6ff', '#70d6ff']
  const stops = semanticDist.value.map((item, index) => {
    const start = (acc / total) * 100
    acc += item.value
    const end = (acc / total) * 100
    return `${palette[index % palette.length]} ${start}% ${end}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})

let timer = null
let clockTimer = null

const animateNumber = (key, targetValue) => {
  const startValue = animatedOverview.value[key]
  const frame = 20
  let current = 0
  const step = () => {
    current += 1
    animatedOverview.value[key] = Math.round(startValue + ((targetValue - startValue) * current) / frame)
    if (current < frame) requestAnimationFrame(step)
  }
  step()
}

const refreshAnimatedOverview = () => {
  animateNumber('todayCollected', overview.value.todayCollected)
  animateNumber('highRiskCount', overview.value.highRiskCount)
  animateNumber('mediaCoverage', overview.value.mediaCoverage)
  animateNumber('averageCredibility', overview.value.averageCredibility)
}

const loadDashboard = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const [overviewData, trendsData, rankingData, alertsData, newsData] = await Promise.all([
      fetchDashboardOverview(),
      fetchDashboardTrends(),
      fetchDashboardRanking(),
      fetchDashboardAlerts(),
      fetchNewsList({ page: 1, pageSize: 30 }),
    ])

    const avgCredibility = Math.round(
      (rankingData.items || []).reduce((sum, item) => sum + Number(item.credibility || 0), 0) /
        Math.max((rankingData.items || []).length, 1),
    )

    overview.value = {
      todayCollected: overviewData.todayCollected || 0,
      highRiskCount: overviewData.highRiskCount || 0,
      mediaCoverage: overviewData.mediaCoverage || 0,
      averageCredibility: avgCredibility,
    }
    refreshAnimatedOverview()
    trendItems.value = trendsData.items || []
    highFreqTrend.value = (trendsData.items || []).map((item) => ({
      time: item.time,
      value: Math.max(Math.round((item.riskIndex || 0) * 0.82), 1),
    }))
    rankingItems.value = rankingData.items || []
    alertItems.value = alertsData.items || []
    newsItems.value = newsData || []
  } catch (error) {
    errorMessage.value = error?.message || '大屏数据加载失败'
  } finally {
    isLoading.value = false
  }
}

const clickKeyword = (keyword) => {
  selectedKeyword.value = selectedKeyword.value === keyword.text ? '' : keyword.text
}

const pickRegion = (point) => {
  selectedRegion.value = point.name
  selectedMapPoint.value = point
}

onMounted(async () => {
  await loadDashboard()
  timer = setInterval(() => {
    overview.value.todayCollected += 1
    if (Math.random() > 0.7) overview.value.highRiskCount += 1
    if (Math.random() > 0.45) overview.value.averageCredibility = Math.max(30, Math.min(96, overview.value.averageCredibility + (Math.random() > 0.5 ? 1 : -1)))
    refreshAnimatedOverview()
  }, 6000)
  clockTimer = setInterval(() => {
    nowTime.value = formatClock()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <div class="dashboard-page">
    <div class="dashboard-grid">
      <section class="glass-panel compare-area anim-up">
        <div class="panel-head">
          <h2>对比分析区</h2>
          <span class="subtext">可信度 vs 风险</span>
        </div>
        <div class="compare-grid">
          <div class="chart-card">
            <h3>媒体可信度 vs 实际风险</h3>
            <div class="scatter-box">
              <span class="axis axis-x">可信度</span>
              <span class="axis axis-y">风险</span>
              <i
                v-for="point in scatterPoints"
                :key="point.media"
                class="scatter-dot"
                :class="{ active: hoveredScatter === point.media }"
                :title="`${point.media} C:${point.credibility} R:${point.risk}`"
                :style="{ left: `${point.credibility}%`, bottom: `${point.risk}%` }"
                @mouseenter="hoveredScatter = point.media"
                @mouseleave="hoveredScatter = ''"
              />
            </div>
          </div>
          <div class="chart-card">
            <h3>语义风险分布饼图</h3>
            <div class="pie-wrap">
              <div class="pie-chart" :style="{ background: pieGradient }" />
              <ul>
                <li v-for="item in semanticDist" :key="item.label">
                  <span>{{ item.label }}</span>
                  <b>{{ item.value }}%</b>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="chart-card highrisk-board">
          <h3>高风险新闻滚动榜</h3>
          <div class="ticker-list auto-scroll">
            <article v-for="(item, idx) in tickerItems" :key="`${item.id}-${idx}`">
              <b>{{ item.title }}</b>
              <span>{{ item.source }}</span>
            </article>
          </div>
        </div>
        <div class="chart-card">
          <h3>风险趋势柱状图</h3>
          <div class="bars">
            <div
              v-for="item in trendItems"
              :key="`bar-${item.time}`"
              class="bar-wrap"
              :class="{ active: hoveredTrendTime === item.time }"
              :title="`${item.time} ${item.riskIndex}`"
              @mouseenter="hoveredTrendTime = item.time"
              @mouseleave="hoveredTrendTime = ''"
            >
              <span class="bar" :style="{ height: `${(item.riskIndex / trendMax) * 100}%` }" />
              <small>{{ item.time }}</small>
            </div>
          </div>
        </div>
      </section>

      <section class="glass-panel center-board anim-up">
        <h2>全局数据看板</h2>
        <div class="center-stats">
          <article>
            <small>今日采集总量</small>
            <b>{{ animatedOverview.todayCollected }}</b>
          </article>
          <article>
            <small>高风险事件数</small>
            <b class="danger">{{ animatedOverview.highRiskCount }}</b>
          </article>
          <article>
            <small>媒体覆盖数</small>
            <b>{{ animatedOverview.mediaCoverage }}</b>
          </article>
          <article>
            <small>平均可信度评分</small>
            <b class="sky">{{ animatedOverview.averageCredibility }}</b>
          </article>
        </div>
        <div class="middle-subgrid">
          <section class="chart-card map-area">
            <div class="panel-head">
              <h3>全球分布大屏图</h3>
              <span class="subtext">点击区域下钻</span>
            </div>
            <div class="world-map">
              <svg viewBox="0 0 920 380" role="img" aria-label="全球风险热力地图">
                <path d="M90 175 L145 140 L205 145 L235 185 L200 220 L130 220 Z" />
                <path d="M245 120 L325 95 L380 120 L410 170 L345 195 L268 175 Z" />
                <path d="M450 105 L540 90 L660 120 L740 165 L700 220 L565 215 L500 182 Z" />
                <path d="M495 228 L560 220 L625 255 L596 316 L524 306 Z" />
                <path d="M760 245 L845 225 L880 264 L812 305 Z" />
              </svg>
              <button
                v-for="point in mapPoints"
                :key="point.name"
                class="map-point"
                :class="{ high: point.risk === '高风险' }"
                :style="{ left: `${point.x}%`, top: `${point.y}%` }"
                :title="`${point.name} 热度 ${point.heat}`"
                @click="pickRegion(point)"
              >
                {{ point.name }}
              </button>
            </div>
            <div class="region-detail">
              <strong>{{ selectedMapPoint?.name || selectedRegion }}</strong>
              <span>{{ selectedMapPoint?.detail || '点击地图区域查看详细舆情描述' }}</span>
            </div>
            <aside v-if="selectedMapPoint" class="map-popup">
              <h4>{{ selectedMapPoint.name }} · {{ selectedMapPoint.risk }}</h4>
              <p>热度指数：{{ selectedMapPoint.heat }}</p>
              <p>{{ selectedMapPoint.detail }}</p>
              <button class="ghost-btn" @click="selectedMapPoint = null">关闭</button>
            </aside>
          </section>
          <section class="chart-card ai-area">
            <div class="panel-head">
              <h3>AI 总结 / 风险预警</h3>
              <span class="badge-danger">实时</span>
            </div>
            <p class="ai-text">{{ aiSummary }}</p>
            <ul class="alert-list">
              <li v-for="item in alertItems" :key="item.id">
                <span class="alert-level" :class="{ high: item.riskLevel === '高风险', mid: item.riskLevel === '中风险' }">{{ item.riskLevel }}</span>
                <div>
                  <b>{{ item.title }}</b>
                  <small>{{ item.source }} · {{ item.createdAt }}</small>
                </div>
              </li>
            </ul>
          </section>
          <section class="chart-card trend-mini">
            <h3>高频事件趋势折线图</h3>
            <svg viewBox="0 0 360 120" class="line-svg" role="img" aria-label="高频事件趋势折线图">
              <polyline
                :points="
                  highFreqTrend
                    .map((item, idx) => `${(idx * 350) / Math.max(highFreqTrend.length - 1, 1)},${110 - (item.value / highFreqMax) * 95}`)
                    .join(' ')
                "
              />
              <circle
                v-for="(item, idx) in highFreqTrend"
                :key="`dot-${item.time}`"
                :cx="(idx * 350) / Math.max(highFreqTrend.length - 1, 1)"
                :cy="110 - (item.value / highFreqMax) * 95"
                r="4"
              />
            </svg>
            <div class="rank-list compact">
              <div v-for="item in rankingItems" :key="item.media" class="rank-item">
                <b>{{ item.media }}</b>
                <span class="rank-track"><i :style="{ width: `${(item.credibility / rankingMax) * 100}%` }" /></span>
                <em>{{ item.credibility }}</em>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="glass-panel keyword-area anim-up delay-1">
        <div class="panel-head">
          <h2>关键词云</h2>
          <span class="subtext">点击筛选新闻</span>
        </div>
        <div class="keyword-cloud">
          <button
            v-for="item in keywordCloud"
            :key="item.text"
            :class="['key-item', item.risk, { active: selectedKeyword === item.text }]"
            :style="{ fontSize: `${12 + item.weight}px` }"
            @click="clickKeyword(item)"
          >
            {{ item.text }}
          </button>
        </div>
      </section>

      <section class="glass-panel consistency-area anim-up delay-2">
        <div class="panel-head">
          <h2>一致性分布与传播路径</h2>
          <span class="subtext">多源交叉核验</span>
        </div>
        <div class="chart-card">
          <h3>多源一致性分布</h3>
          <div class="cons-bars">
            <div v-for="item in consistencyBars" :key="item.channel" class="cons-item">
              <span>{{ item.channel }}</span>
              <p @mouseenter="activeConsistency = item.channel" @mouseleave="activeConsistency = ''">
                <i :class="{ active: activeConsistency === item.channel }" :style="{ width: `${item.consistency}%` }" />
              </p>
              <b>{{ item.consistency }}%</b>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <h3>事件传播路径</h3>
          <div class="path-flow">
            <div v-for="item in propagationPath" :key="`${item.from}-${item.to}`" class="path-row">
              <span>{{ item.from }}</span>
              <em :class="item.risk">{{ item.risk === 'high' ? '高风险扩散' : '持续传播' }}</em>
              <span>{{ item.to }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="dashboard-foot">
      <span v-if="isLoading">数据加载中...</span>
      <span v-else-if="errorMessage" class="danger">{{ errorMessage }}</span>
      <span v-else>TruthLens 监控大屏 · 实时刷新</span>
      <span class="now-time">{{ nowTime }}</span>
      <button class="ghost-btn" @click="router.push('/portal')">返回新闻门户</button>
    </footer>
  </div>
</template>
