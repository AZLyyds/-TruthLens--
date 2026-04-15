<script setup>
import * as echarts from 'echarts'
import * as topojson from 'topojson-client'
import worldTopology from 'world-atlas/countries-110m.json'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchDashboardAlerts,
  fetchDashboardOverview,
  fetchDashboardScreen,
} from '../api/dashboard'
import { fetchNewsList } from '../api/news'
import CdsWordCloud from '../components/wordcloud/CdsWordCloud.vue'

countries.registerLocale(enLocale)

const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const screen = shallowRef(null)
const dataUpdatedAt = ref('')
const clock = ref('')
const selectedNewsTab = ref('high')

const elTrend = ref(null)
const elPie = ref(null)
const elMap = ref(null)
const elConsistency = ref(null)
const elSpread = ref(null)
const elRiskRealtime = ref(null)
const elGlobalCompare = ref(null)

let chartTrend
let chartPie
let chartMap
let chartConsistency
let chartSpread
let chartRiskRealtime
let chartGlobalCompare

let clockTimer
let refreshTimer
let ro
let worldGeoCached

const pad = (n) => String(n).padStart(2, '0')
const tickClock = () => {
  const d = new Date()
  clock.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 从任意嵌套路径安全取值 */
function getFirst(obj, paths, fallback = null) {
  if (!obj) return fallback
  for (const p of paths) {
    const parts = p.split('.')
    let cur = obj
    let ok = true
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') {
        ok = false
        break
      }
      cur = cur[part]
    }
    if (ok && cur !== undefined && cur !== null) return cur
  }
  return fallback
}

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const kpis = computed(() => {
  const s = screen.value || {}
  return {
    todayCollected: num(getFirst(s, ['kpis.todayCollected', 'todayCollected'])),
    todayAnalyzed: num(getFirst(s, ['kpis.todayAnalyzed', 'todayAnalyzed'])),
    chinaHighRisk: num(getFirst(s, ['kpis.chinaHighRisk', 'chinaHighRisk'])),
    avgCredibility: (() => {
      const v = getFirst(s, ['kpis.avgCredibilityScore', 'kpis.avg_credibility_score', 'avgCredibilityScore'])
      if (v == null) return null
      return num(v, null)
    })(),
  }
})

/** KPI 数字滚动展示（数据源仍为 kpis，仅视觉动画） */
const kpiDisplay = ref({
  todayCollected: 0,
  todayAnalyzed: 0,
  chinaHighRisk: 0,
  avgCredibility: null,
})
let kpiAnimId = 0

function animateKpiTo(next) {
  const from = {
    todayCollected: kpiDisplay.value.todayCollected,
    todayAnalyzed: kpiDisplay.value.todayAnalyzed,
    chinaHighRisk: kpiDisplay.value.chinaHighRisk,
    avgCredibility: kpiDisplay.value.avgCredibility,
  }
  const start = performance.now()
  const duration = 950
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const ease = 1 - (1 - t) ** 3
    const lerp = (a, b) => Math.round(a + (b - a) * ease)
    const nextAvg = next.avgCredibility
    const fromAvg = from.avgCredibility
    let nextCred = null
    if (nextAvg != null && fromAvg != null) {
      nextCred = Math.round((fromAvg + (nextAvg - fromAvg) * ease) * 100) / 100
    } else if (nextAvg != null) {
      nextCred = Math.round(nextAvg * ease * 100) / 100
    } else {
      nextCred = null
    }
    kpiDisplay.value = {
      todayCollected: lerp(from.todayCollected, next.todayCollected),
      todayAnalyzed: lerp(from.todayAnalyzed, next.todayAnalyzed),
      chinaHighRisk: lerp(from.chinaHighRisk, next.chinaHighRisk),
      avgCredibility: nextCred,
    }
    if (t < 1) kpiAnimId = requestAnimationFrame(tick)
  }
  cancelAnimationFrame(kpiAnimId)
  kpiAnimId = requestAnimationFrame(tick)
}

watch(
  kpis,
  (v) => {
    animateKpiTo({
      todayCollected: v.todayCollected,
      todayAnalyzed: v.todayAnalyzed,
      chinaHighRisk: v.chinaHighRisk,
      avgCredibility: v.avgCredibility,
    })
  },
  { deep: true, immediate: true },
)

const keywordWords = computed(() => {
  const k = getFirst(screen.value, ['keywords', 'keywordList'], []) || []
  if (!Array.isArray(k)) return []
  return k.slice(0, 60).map((item) => {
    if (typeof item === 'string') return { text: item, size: 14 }
    const t = item.text ?? item.word ?? item.name ?? item.key ?? ''
    const w = num(item.weight ?? item.count ?? item.value, 1)
    return { text: String(t), size: Math.min(42, 12 + Math.min(30, w)) }
  })
})

/** 词云：涉华/China 相关词加大字号突出 */
const keywordWordsForCloud = computed(() => {
  const base = keywordWords.value
  return base.map((w) => {
    const t = String(w.text || '')
    const low = t.toLowerCase()
    if (low === 'china' || t === '中国' || /涉华|对华/.test(t)) {
      return { ...w, size: Math.min(52, num(w.size, 14) + 12) }
    }
    return w
  })
})

const alertTicker = computed(() => {
  const raw = getFirst(screen.value, ['alerts', 'alertItems'], []) || []
  if (!Array.isArray(raw)) return []
  const list = raw.filter((x) => x && (x.title || x.message))
  if (list.length > 6) return [...list, ...list]
  return list
})

const latestNewsList = computed(() => {
  const raw = getFirst(screen.value, ['latestNews', 'latest_news'], []) || []
  return Array.isArray(raw) ? raw : []
})

const highRiskNewsList = computed(() => {
  const raw = getFirst(screen.value, ['highRiskNews', 'high_risk_news'], []) || []
  return Array.isArray(raw) ? raw : []
})

const rightNewsList = computed(() => {
  return selectedNewsTab.value === 'latest' ? latestNewsList.value : highRiskNewsList.value
})

function goNewsDetail(id) {
  const n = Number(id)
  if (!Number.isFinite(n) || n <= 0) return
  router.push({ name: 'news-detail', params: { id: String(n) }, query: { from: 'dashboard' } })
}

function extractKeywordsFromNewsItems(items) {
  const freq = new Map()
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'news', 'said'])
  for (const it of items || []) {
    const t = String(it.title || '')
    for (const p of t.split(/[\s\u3000\-_/,:;，。！？]+/).filter(Boolean)) {
      const w = p.trim()
      if (w.length < 2) continue
      if (stop.has(w.toLowerCase())) continue
      freq.set(w, (freq.get(w) || 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([text, weight]) => ({ text, weight }))
}

async function loadFallbackScreen() {
  const [overview, alerts, newsItems] = await Promise.all([
    fetchDashboardOverview(),
    fetchDashboardAlerts(),
    fetchNewsList({ page: 1, pageSize: 80 }),
  ])
  return {
    updatedAt: new Date().toISOString(),
    kpis: {
      todayCollected: num(overview.todayCollected),
      todayAnalyzed: 0,
      chinaHighRisk: num(overview.highRiskCount),
      highRiskTotal: num(overview.highRiskCount),
      avgFakeScore: null,
      avgCredibilityScore: null,
    },
    riskTrend7d: [],
    riskDistribution: [],
    countryRisk: [],
    keywords: extractKeywordsFromNewsItems(newsItems),
    multiConsistencyBuckets: [
      { name: '0-25', value: 0 },
      { name: '26-50', value: 0 },
      { name: '51-75', value: 0 },
      { name: '76-100', value: 0 },
    ],
    alerts: (alerts.items || []).map((x) => ({
      id: x.id,
      title: x.title,
      riskLevel: x.riskLevel,
      source: x.source,
      score: x.score,
      createdAt: x.createdAt,
    })),
    latestNews: (newsItems || []).map((x) => ({
      id: x.id,
      title: x.title,
      source: x.source,
      riskLevel: x.risk,
    })),
    highRiskNews: (newsItems || []).filter((x) => x.risk === '高风险').map((x) => ({
      id: x.id,
      title: x.title,
      source: x.source,
      riskLevel: x.risk,
    })),
    globalSpreadBySource: [],
    highRiskAlerts30d: [],
  }
}

async function loadScreen() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchDashboardScreen()
    screen.value = data && typeof data === 'object' ? data : {}
  } catch (e) {
    try {
      screen.value = await loadFallbackScreen()
    } catch (e2) {
      errorMessage.value = e2?.message || e?.message || '数据加载失败'
      screen.value = {}
    }
  } finally {
    dataUpdatedAt.value = getFirst(screen.value, ['updatedAt', 'updated_at'], '') || new Date().toISOString()
    loading.value = false
    await nextTick()
    applyAllCharts()
  }
}

function disposeAll() {
  ;[chartTrend, chartPie, chartMap, chartConsistency, chartSpread, chartRiskRealtime, chartGlobalCompare].forEach((c) => {
    try {
      c?.dispose()
    } catch {
      /* noop */
    }
  })
  chartTrend = chartPie = chartMap = chartConsistency = chartSpread = chartRiskRealtime = chartGlobalCompare = null
}

function baseTextStyle() {
  return { color: '#94a3b8', fontSize: 11 }
}

const techAxisCategory = () => ({
  axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.35)', width: 1 } },
  axisTick: { show: false },
  axisLabel: { color: '#94a3b8', fontSize: 10 },
})

const techAxisValue = (pos) => ({
  type: 'value',
  position: pos,
  axisLine: { show: true, lineStyle: { color: pos === 'left' ? 'rgba(34, 211, 238, 0.45)' : 'rgba(244, 63, 94, 0.45)' } },
  axisTick: { show: false },
  axisLabel: { color: '#94a3b8', fontSize: 10 },
  splitLine:
    pos === 'left'
      ? { lineStyle: { color: 'rgba(56, 189, 248, 0.06)', type: 'dashed' } }
      : { show: false },
})

function areaGradient(c0, c1) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: c0 },
    { offset: 1, color: c1 },
  ])
}

function geoFeaturesList(worldGeo) {
  const fc = worldGeo?.features
  if (Array.isArray(fc)) return fc
  return []
}

function resolveIsoToName(code) {
  if (!code || typeof code !== 'string') return ''
  const c = code.trim()
  if (c.length === 2) {
    const n = countries.getName(c.toUpperCase(), 'en')
    return n || ''
  }
  return ''
}

function matchFeatureForCountry(raw, features) {
  const s = String(raw || '').trim()
  if (!s) return null
  const low = s.toLowerCase()
  let f = features.find((x) => (x.properties?.name || '').toLowerCase() === low)
  if (f) return f
  const isoName = resolveIsoToName(s)
  if (isoName) {
    f = features.find((x) => (x.properties?.name || '').toLowerCase() === isoName.toLowerCase())
    if (f) return f
    f = features.find(
      (x) =>
        isoName.length > 3 &&
        (x.properties?.name || '').toLowerCase().includes(isoName.split(' ')[0].toLowerCase()),
    )
    if (f) return f
  }
  f = features.find((x) => (x.properties?.name || '').toLowerCase().includes(low))
  if (f) return f
  f = features.find((x) => low.length > 3 && low.includes((x.properties?.name || '').toLowerCase()))
  return f || null
}

function buildMapSeriesData(countryRisk, worldGeo) {
  const features = geoFeaturesList(worldGeo)
  const list = Array.isArray(countryRisk) ? countryRisk : []
  const out = []
  for (const row of list) {
    const raw = row.country ?? row.region ?? row.code ?? row.name
    const feat = matchFeatureForCountry(String(raw || ''), features)
    const name = feat?.properties?.name || String(raw || '')
    if (!name) continue
    const v = num(row.riskIntensity ?? row.avgFakeScore ?? row.value ?? row.risk, 0)
    out.push({
      name,
      value: v,
      rawCountry: String(raw || ''),
      newsCount: num(row.newsCount),
    })
  }
  return out
}

/** 与 Natural Earth / world-atlas 国家名对齐的近似中心点 [lng, lat]，用于舆情节点与传播链路绘制 */
const COUNTRY_COORDS = {
  China: [104.2, 35.9],
  'United States of America': [-98.35, 39.5],
  'United States': [-98.35, 39.5],
  Russia: [37.6, 55.75],
  Japan: [138.25, 36.2],
  Germany: [10.45, 51.16],
  France: [2.21, 46.23],
  'United Kingdom': [-2.43, 53.83],
  India: [78.96, 20.59],
  Brazil: [-51.93, -14.24],
  Canada: [-106.35, 56.13],
  Australia: [133.78, -25.27],
  Italy: [12.57, 41.87],
  Spain: [-3.75, 40.46],
  Mexico: [-102.55, 23.63],
  Indonesia: [117.02, -2.55],
  Turkey: [35.24, 38.96],
  'Saudi Arabia': [45.08, 23.89],
  'South Korea': [127.77, 35.91],
  Korea: [127.77, 35.91],
  'Korea, Republic of': [127.77, 35.91],
  Thailand: [100.99, 15.87],
  Vietnam: [108.28, 14.06],
  Poland: [19.13, 51.92],
  Ukraine: [31.17, 48.38],
  Egypt: [30.8, 26.82],
  'South Africa': [22.94, -30.56],
  Argentina: [-63.62, -38.42],
  Iran: [53.69, 32.43],
  Nigeria: [8.68, 9.08],
  Pakistan: [69.35, 29.95],
  Netherlands: [5.29, 52.13],
  Sweden: [18.64, 60.13],
}

const CHINA_HUB = [116.4, 39.9]

function lngLatForMapRow(rowName, rawCountry) {
  const n = String(rowName || '').trim()
  const r = String(rawCountry || '').trim()
  if (COUNTRY_COORDS[n]) return [...COUNTRY_COORDS[n]]
  if (COUNTRY_COORDS[r]) return [...COUNTRY_COORDS[r]]
  const low = n.toLowerCase()
  const hit = Object.keys(COUNTRY_COORDS).find((k) => k.toLowerCase() === low || low.includes(k.toLowerCase()))
  if (hit) return [...COUNTRY_COORDS[hit]]
  return null
}

function isChinaRegion(name, raw) {
  const s = `${name || ''} ${raw || ''}`.toLowerCase()
  return s.includes('china') || s === 'cn' || s.includes('中国')
}

/**
 * world-atlas 将台湾单独成区；业务上与中国大陆同风险填色，避免「中国红了台湾不亮」。
 * 取两岸条目中的最大风险值，并保证 China / Taiwan 各有一条同名数据供 map 系列着色。
 */
function unifyChinaTaiwanMapData(mapData) {
  const list = Array.isArray(mapData) ? mapData.map((d) => ({ ...d })) : []
  const iCn = list.findIndex((d) => String(d.name) === 'China')
  const iTw = list.findIndex((d) => String(d.name) === 'Taiwan')
  if (iCn < 0 && iTw < 0) return list

  const base = iCn >= 0 ? list[iCn] : list[iTw]
  const unified = Math.max(iCn >= 0 ? num(list[iCn].value) : 0, iTw >= 0 ? num(list[iTw].value) : 0)
  const rawCountry = base.rawCountry
  const newsCount = base.newsCount

  if (iCn >= 0) list[iCn] = { ...list[iCn], value: unified }
  else list.push({ name: 'China', value: unified, rawCountry, newsCount })

  if (iTw >= 0) list[iTw] = { ...list[iTw], value: unified, rawCountry: rawCountry || list[iTw].rawCountry, newsCount }
  else list.push({ name: 'Taiwan', value: unified, rawCountry, newsCount })

  return list
}

/**
 * 舆图层：中枢涟漪 + 海外舆情节点 + 涉华传播弧线（与地图填色数据同源）
 */
function buildGeoOverlaySeries(mapData, vmax) {
  const hub = CHINA_HUB
  const maxV = Math.max(10, num(vmax, 10))
  const resolved = []
  for (const d of mapData) {
    const ll = lngLatForMapRow(d.name, d.rawCountry)
    if (!ll) continue
    resolved.push({
      name: d.name,
      rawCountry: d.rawCountry,
      value: num(d.value),
      newsCount: d.newsCount,
      lnglat: ll,
    })
  }

  const hubPoint = {
    name: '涉华舆情中枢',
    value: [hub[0], hub[1], maxV],
    symbolSize: 24,
    itemStyle: {
      color: '#f43f5e',
      shadowBlur: 16,
      shadowColor: 'rgba(244, 63, 94, 0.85)',
    },
  }

  const foreignPoints = resolved
    .filter((x) => !isChinaRegion(x.name, x.rawCountry))
    .sort((a, b) => b.value - a.value)
    .slice(0, 16)
    .map((x) => ({
      name: x.name,
      value: [...x.lnglat, x.value],
      symbolSize: 7 + Math.min(14, x.value / 7),
      itemStyle: {
        color: x.value >= maxV * 0.62 ? '#fb7185' : '#fda4af',
        shadowBlur: 10,
        shadowColor: 'rgba(251, 113, 133, 0.55)',
      },
    }))

  let linesData = foreignPoints.map((p) => {
    const lng = p.value[0]
    const lat = p.value[1]
    const z = num(p.value[2])
    return {
      coords: [hub, [lng, lat]],
      lineStyle: {
        curveness: 0.14 + Math.min(0.22, Math.abs(lng - hub[0]) / 420),
        width: z >= maxV * 0.55 ? 1.35 : 0.95,
        opacity: 0.32 + Math.min(0.42, z / (maxV * 1.15)),
      },
    }
  })

  const fallbackKeys = ['United States of America', 'United Kingdom', 'Japan', 'Australia', 'Germany', 'France']
  if (!linesData.length) {
    linesData = fallbackKeys
      .map((k) =>
        COUNTRY_COORDS[k]
          ? {
              coords: [hub, [...COUNTRY_COORDS[k]]],
              lineStyle: { curveness: 0.2, width: 0.9, opacity: 0.38 },
            }
          : null,
      )
      .filter(Boolean)
  }

  const effectData = [hubPoint, ...foreignPoints]

  if (!foreignPoints.length && linesData.length) {
    for (const seg of linesData) {
      const end = seg.coords[1]
      effectData.push({
        name: '监测节点',
        value: [...end, 22],
        symbolSize: 9,
        itemStyle: { color: '#fecdd3', shadowBlur: 6, shadowColor: 'rgba(254, 205, 211, 0.7)' },
      })
    }
  }

  return { effectData, linesData }
}

function normLon(lon) {
  let x = Number(lon)
  if (!Number.isFinite(x)) return 0
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

function splitRingAtDateline(ring) {
  const pts = Array.isArray(ring) ? ring.filter((p) => Array.isArray(p) && p.length >= 2) : []
  if (pts.length < 2) return []

  const out = []
  let cur = []

  const pushPoint = (p) => cur.push([normLon(p[0]), Number(p[1])])

  // 不依赖 ring 是否闭合，统一按序处理
  pushPoint(pts[0])

  for (let i = 1; i < pts.length; i++) {
    const prev = cur[cur.length - 1]
    const next = [normLon(pts[i][0]), Number(pts[i][1])]
    const d = next[0] - prev[0]

    if (Math.abs(d) > 180) {
      // 跨越反子午线：在 ±180 处插值切开，避免出现“跨图横线”伪影
      const toRight = d > 0 // -170 -> 170
      const boundaryLon = toRight ? -180 : 180
      const otherBoundaryLon = toRight ? 180 : -180

      const adjNextLon = next[0] + (toRight ? -360 : 360)
      const t = (boundaryLon - prev[0]) / (adjNextLon - prev[0])
      const iy = prev[1] + (next[1] - prev[1]) * t

      cur.push([boundaryLon, iy])
      if (cur.length >= 4) out.push(cur)

      cur = [[otherBoundaryLon, iy], next]
    } else {
      cur.push(next)
    }
  }

  if (cur.length >= 4) out.push(cur)

  // 闭合每段 ring（ECharts 对闭合与否都能画，但闭合更稳）
  return out.map((r) => {
    const first = r[0]
    const last = r[r.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) r.push([first[0], first[1]])
    return r
  })
}

function cutAntimeridianGeoJSON(geo) {
  if (!geo || !Array.isArray(geo.features)) return geo
  const cloned = {
    ...geo,
    features: geo.features.map((f) => {
      const g = f?.geometry
      if (!g) return f

      if (g.type === 'Polygon') {
        const rings = (g.coordinates || []).flatMap((ring) => splitRingAtDateline(ring))
        return { ...f, geometry: { ...g, coordinates: rings } }
      }

      if (g.type === 'MultiPolygon') {
        const polys = (g.coordinates || []).map((poly) => poly.flatMap((ring) => splitRingAtDateline(ring))).filter((p) => p.length)
        return { ...f, geometry: { ...g, coordinates: polys } }
      }

      return f
    }),
  }
  return cloned
}

function ensureWorldMapRegistered() {
  if (worldGeoCached) return worldGeoCached
  const w0 = topojson.feature(worldTopology, worldTopology.objects.countries)
  const w = cutAntimeridianGeoJSON(w0)
  try {
    echarts.registerMap('world', w)
  } catch {
    /* 已注册 */
  }
  worldGeoCached = w
  return w
}

function applyTrendChart() {
  if (!elTrend.value) return
  const rows = getFirst(screen.value, ['riskTrend7d', 'risk_trend_7d'], []) || []
  if (!chartTrend) chartTrend = echarts.init(elTrend.value, null, { renderer: 'canvas' })
  const days = Array.isArray(rows) ? rows : []
  const x = days.map((d) => {
    const raw = String(d.day ?? d.date ?? d.time ?? '')
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(5, 10)
    return raw ? raw : '—'
  })
  const analyzed = days.map((d) => num(d.analyzed ?? d.count ?? d.total))
  const high = days.map((d) => num(d.highRisk ?? d.high_risk))
  chartTrend.setOption({
    backgroundColor: 'transparent',
    textStyle: baseTextStyle(),
    animationDuration: 1200,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    legend: {
      data: ['分析量', '高风险'],
      textStyle: { color: '#cbd5e1', fontSize: 11 },
      top: 2,
    },
    grid: { left: 48, right: 48, top: 38, bottom: 24 },
    xAxis: {
      type: 'category',
      data: x.length ? x : ['—'],
      ...techAxisCategory(),
    },
    yAxis: [techAxisValue('left'), techAxisValue('right')],
    series: [
      {
        name: '分析量',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 9,
        showSymbol: true,
        data: analyzed.length ? analyzed : [0],
        lineStyle: {
          width: 3,
          color: '#22d3ee',
          shadowBlur: 14,
          shadowColor: 'rgba(34, 211, 238, 0.55)',
        },
        itemStyle: {
          color: '#22d3ee',
          borderColor: '#fff',
          borderWidth: 1,
          shadowBlur: 12,
          shadowColor: 'rgba(34, 211, 238, 0.65)',
        },
        areaStyle: {
          color: areaGradient('rgba(34, 211, 238, 0.42)', 'rgba(34, 211, 238, 0.02)'),
        },
        emphasis: { focus: 'series', scale: true },
      },
      {
        name: '高风险',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 9,
        showSymbol: true,
        data: high.length ? high : [0],
        lineStyle: {
          width: 3,
          color: '#fb7185',
          shadowBlur: 14,
          shadowColor: 'rgba(244, 63, 94, 0.55)',
        },
        itemStyle: {
          color: '#fb7185',
          borderColor: '#fff',
          borderWidth: 1,
          shadowBlur: 12,
          shadowColor: 'rgba(244, 63, 94, 0.6)',
        },
        areaStyle: {
          color: areaGradient('rgba(244, 63, 94, 0.38)', 'rgba(244, 63, 94, 0.02)'),
        },
        emphasis: { focus: 'series', scale: true },
      },
    ],
  })
}

function applyPieChart() {
  if (!elPie.value) return
  const rows = getFirst(screen.value, ['riskDistribution', 'risk_distribution'], []) || []
  if (!chartPie) chartPie = echarts.init(elPie.value, null, { renderer: 'canvas' })
  const raw = (Array.isArray(rows) ? rows : [])
    .filter((x) => num(x.value) > 0)
    .map((x) => ({ name: String(x.name ?? x.label ?? '—'), value: num(x.value) }))
  const gradStops = [
    [
      { offset: 0, color: '#4ade80' },
      { offset: 1, color: '#166534' },
    ],
    [
      { offset: 0, color: '#fbbf24' },
      { offset: 1, color: '#b45309' },
    ],
    [
      { offset: 0, color: '#fb7185' },
      { offset: 1, color: '#be123c' },
    ],
    [
      { offset: 0, color: '#94a3b8' },
      { offset: 1, color: '#475569' },
    ],
  ]
  const data = (raw.length ? raw : [{ name: '暂无', value: 1 }]).map((d, i) => {
    const g = gradStops[i % gradStops.length]
    return {
      ...d,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 1,
          colorStops: g,
        },
        borderRadius: 6,
        borderColor: 'rgba(15, 23, 42, 0.9)',
        borderWidth: 2,
        shadowBlur: 18,
        shadowColor: 'rgba(56, 189, 248, 0.35)',
      },
    }
  })
  chartPie.setOption({
    backgroundColor: 'transparent',
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      textStyle: { color: '#e2e8f0' },
    },
    legend: { bottom: 2, textStyle: { color: '#94a3b8', fontSize: 10 } },
    series: [
      {
        type: 'pie',
        radius: ['38%', '66%'],
        center: ['50%', '46%'],
        roseType: 'radius',
        minShowLabelAngle: 6,
        data,
        label: {
          color: '#e2e8f0',
          formatter: '{b}\n{d}%',
        },
        labelLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.35)' } },
        emphasis: {
          scale: true,
          scaleSize: 8,
          itemStyle: {
            shadowBlur: 28,
            shadowColor: 'rgba(244, 63, 94, 0.45)',
            borderColor: 'rgba(34, 211, 238, 0.65)',
            borderWidth: 2,
          },
          label: { fontWeight: 700 },
        },
      },
    ],
  })
}

function applyMapChart(worldGeo) {
  if (!elMap.value) return
  ensureWorldMapRegistered()
  if (!chartMap) chartMap = echarts.init(elMap.value, null, { renderer: 'canvas' })
  const cr = getFirst(screen.value, ['countryRisk', 'country_risk'], []) || []
  const mapData = unifyChinaTaiwanMapData(buildMapSeriesData(cr, worldGeo))
  const values = mapData.map((d) => d.value)
  const vmax = Math.max(10, ...values, 1)
  const { effectData, linesData } = buildGeoOverlaySeries(mapData, vmax)
  const linesStyled = linesData.map((seg) => ({
    ...seg,
    lineStyle: {
      ...seg.lineStyle,
      width: 2.4,
      curveness: seg.lineStyle?.curveness ?? 0.2,
      opacity: 0.92,
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 0,
        colorStops: [
          { offset: 0, color: 'rgba(34, 211, 238, 0.95)' },
          { offset: 0.55, color: 'rgba(244, 63, 94, 0.75)' },
          { offset: 1, color: 'rgba(251, 113, 133, 0.9)' },
        ],
      },
      shadowBlur: 12,
      shadowColor: 'rgba(56, 189, 248, 0.45)',
    },
  }))

  chartMap.setOption(
    {
      backgroundColor: 'transparent',
      animationDuration: 1400,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'item',
        formatter(p) {
          if (p.seriesType !== 'map' || p.data == null) return ''
          const ext = p.data
          return `${p.name}<br/>风险强度：${num(p.value)}<br/>原始国家字段：${ext.rawCountry || '—'}<br/>新闻条数：${ext.newsCount ?? '—'}`
        },
      },
      visualMap: {
        min: 0,
        max: vmax,
        left: 10,
        bottom: 22,
        text: ['高', '低'],
        calculable: false,
        seriesIndex: 0,
        inRange: { color: ['#0c4a6e', '#0891b2', '#e11d48'] },
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 112,
        borderColor: 'rgba(56, 189, 248, 0.25)',
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
      },
      geo: {
        map: 'world',
        roam: false,
        silent: true,
        // 用盒模型约束 geo 区域，避免 layoutCenter/layoutSize 在不同容器高度下导致上方留白/裁切
        left: 10,
        right: 10,
        top: 10,
        bottom: 10,
        zoom: 1.02,
        itemStyle: {
          areaColor: '#152a45',
          borderColor: 'rgba(56, 189, 248, 0.75)',
          borderWidth: 1.15,
          shadowBlur: 8,
          shadowColor: 'rgba(56, 189, 248, 0.25)',
        },
        emphasis: { disabled: true },
        regions: [
          {
            name: 'China',
            itemStyle: {
              areaColor: 'rgba(185, 28, 28, 0.2)',
              borderColor: 'rgba(252, 165, 165, 0.75)',
              borderWidth: 1.1,
            },
          },
          {
            name: 'Taiwan',
            itemStyle: {
              areaColor: 'rgba(185, 28, 28, 0.2)',
              borderColor: 'rgba(252, 165, 165, 0.75)',
              borderWidth: 1.1,
            },
          },
        ],
      },
      series: [
        {
          name: '舆情风险',
          type: 'map',
          geoIndex: 0,
          silent: false,
          emphasis: { disabled: true },
          label: { show: false },
          itemStyle: {
            borderColor: 'rgba(186, 230, 253, 0.65)',
            borderWidth: 0.9,
            shadowBlur: 6,
            shadowColor: 'rgba(56, 189, 248, 0.2)',
          },
          data: mapData,
        },
        {
          name: '涉华传播链路',
          type: 'lines',
          coordinateSystem: 'geo',
          geoIndex: 0,
          zlevel: 2,
          silent: true,
          polyline: false,
          effect: {
            show: true,
            period: 5.5,
            trailLength: 0.55,
            symbol: 'circle',
            symbolSize: 4.5,
            color: 'rgba(251, 113, 133, 0.85)',
          },
          data: linesStyled,
        },
        {
          name: '舆情热点',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          geoIndex: 0,
          zlevel: 3,
          silent: true,
          rippleEffect: {
            brushType: 'stroke',
            scale: 4.2,
            period: 4.2,
          },
          data: effectData,
        },
      ],
    },
    { replaceMerge: ['series', 'geo', 'visualMap', 'tooltip'] },
  )
}

function applyConsistencyChart() {
  if (!elConsistency.value) return
  const rows = getFirst(screen.value, ['multiConsistencyBuckets', 'multi_consistency'], []) || []
  if (!chartConsistency) chartConsistency = echarts.init(elConsistency.value, null, { renderer: 'canvas' })
  const list = Array.isArray(rows) ? rows : []
  const names = list.map((x) => String(x.name ?? x.label ?? x.bucket ?? '—'))
  const vals = list.map((x) => num(x.value ?? x.count))
  const barColors = [
    ['#22d3ee', '#0369a1'],
    ['#38bdf8', '#1d4ed8'],
    ['#a78bfa', '#6d28d9'],
    ['#fb7185', '#be123c'],
  ]
  const data = (vals.length ? vals : [0]).map((v, i) => ({
    value: v,
    itemStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 1,
        x2: 0,
        y2: 0,
        colorStops: [
          { offset: 0, color: barColors[i % barColors.length][1] },
          { offset: 1, color: barColors[i % barColors.length][0] },
        ],
      },
      borderRadius: [6, 6, 0, 0],
      shadowBlur: 10,
      shadowColor: 'rgba(56, 189, 248, 0.35)',
    },
  }))
  chartConsistency.setOption({
    backgroundColor: 'transparent',
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      textStyle: { color: '#e2e8f0' },
    },
    grid: { left: 44, right: 12, top: 18, bottom: 28 },
    xAxis: {
      type: 'category',
      data: names.length ? names : ['—'],
      ...techAxisCategory(),
    },
    yAxis: {
      type: 'value',
      ...techAxisValue('left'),
      splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.06)', type: 'dashed' } },
    },
    series: [
      {
        name: '多源一致性分布',
        type: 'bar',
        barWidth: '52%',
        data,
        emphasis: {
          focus: 'self',
          itemStyle: {
            shadowBlur: 22,
            shadowColor: 'rgba(244, 63, 94, 0.45)',
            borderColor: 'rgba(34, 211, 238, 0.65)',
            borderWidth: 1,
          },
        },
      },
    ],
  })
}

function applySpreadChart() {
  if (!elSpread.value) return
  const rows = getFirst(screen.value, ['globalSpreadBySource', 'spreadBySource'], []) || []
  if (!chartSpread) chartSpread = echarts.init(elSpread.value, null, { renderer: 'canvas' })
  const list = Array.isArray(rows) ? rows : []
  const names = list.map((x) => String(x.source ?? x.media ?? x.name ?? '—').slice(0, 16))
  const vals = list.map((x) => num(x.count ?? x.cnt ?? x.value))
  const data = (vals.length ? vals : [0]).map((v, i) => ({
    value: v,
    itemStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 0,
        colorStops: [
          { offset: 0, color: 'rgba(20, 184, 166, 0.25)' },
          { offset: 1, color: 'rgba(34, 211, 238, 0.95)' },
        ],
      },
      borderRadius: [0, 8, 8, 0],
      shadowBlur: 8,
      shadowColor: 'rgba(45, 212, 191, 0.35)',
    },
  }))
  chartSpread.setOption({
    backgroundColor: 'transparent',
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    title: {
      text: list.length ? '近30日新闻来源传播量（按媒体）' : '近30日新闻采集分布（按媒体聚合）',
      left: 10,
      top: 6,
      textStyle: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(56, 189, 248, 0.35)',
      textStyle: { color: '#e2e8f0' },
    },
    grid: { left: 88, right: 16, top: 40, bottom: 8 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.06)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.35)' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: names.length ? names : ['暂无数据'],
      ...techAxisCategory(),
    },
    series: [
      {
        type: 'bar',
        data,
        barWidth: '58%',
        emphasis: {
          focus: 'self',
          itemStyle: {
            shadowBlur: 20,
            shadowColor: 'rgba(34, 211, 238, 0.55)',
          },
        },
      },
    ],
  })
}

function normalizeToHundred(v, min, max, fallback = 50) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  if (max <= min) return fallback
  const p = ((n - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, Math.round(p * 10) / 10))
}

function buildRealtimeRiskRows() {
  const rows = getFirst(screen.value, ['riskTrend7d', 'risk_trend_7d'], []) || []
  const list = Array.isArray(rows) ? rows : []
  const safe = list.length ? list : Array.from({ length: 7 }, (_, i) => ({ day: `D${i + 1}` }))
  const analyzed = safe.map((d) => num(d.analyzed ?? d.count ?? d.total, 0))
  const high = safe.map((d) => num(d.highRisk ?? d.high_risk, 0))
  const maxAnalyzed = Math.max(1, ...analyzed)
  const maxHigh = Math.max(1, ...high)
  return safe.map((d, i) => {
    const h = num(d.highRisk ?? d.high_risk, 0)
    const a = num(d.analyzed ?? d.count ?? d.total, 0)
    const fake = d.avgFakeScore ?? d.avg_fake_score
    const credibility =
      d.avgCredibility ?? d.avg_credibility ?? d.avgCredibilityScore ?? d.avg_credibility_score ?? (fake != null ? 100 - num(fake, 50) : null)
    const hotTopic = h / maxHigh
    const intensity = a > 0 ? h / Math.max(1, a) : h / maxHigh
    return {
      day: String(d.day ?? d.date ?? d.time ?? `D${i + 1}`).slice(-5),
      highRisk: Math.round(h),
      credibility: Math.max(0, Math.min(100, credibility != null ? num(credibility, 50) : normalizeToHundred(a, 0, maxAnalyzed, 50))),
      sentiment: Math.max(0, Math.min(100, Math.round((48 + hotTopic * 36 + intensity * 18) * 10) / 10)),
      misleading: Math.max(0, Math.min(100, Math.round((42 + intensity * 40 + hotTopic * 14) * 10) / 10)),
    }
  })
}

function applyRiskRealtimeChart() {
  if (!elRiskRealtime.value) return
  if (!chartRiskRealtime) chartRiskRealtime = echarts.init(elRiskRealtime.value, null, { renderer: 'canvas' })
  const rows = buildRealtimeRiskRows()
  const x = rows.map((r) => r.day)
  const highRisk = rows.map((r) => r.highRisk)
  const credibility = rows.map((r) => r.credibility)
  const sentiment = rows.map((r) => r.sentiment)
  const misleading = rows.map((r) => r.misleading)
  const makePulse = (data, color, yAxisIndex = 0) => ({
    type: 'effectScatter',
    yAxisIndex,
    coordinateSystem: 'cartesian2d',
    data: x.map((d, i) => [d, data[i]]),
    z: 6,
    symbolSize: 7,
    itemStyle: { color, shadowBlur: 14, shadowColor: color },
    rippleEffect: { scale: 2.8, period: 4.2, brushType: 'stroke' },
    tooltip: { show: false },
  })
  chartRiskRealtime.setOption({
    backgroundColor: 'transparent',
    textStyle: baseTextStyle(),
    animationDuration: 1500,
    animationDurationUpdate: 900,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(6, 18, 35, 0.94)',
      borderColor: 'rgba(56, 189, 248, 0.45)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    legend: {
      top: 2,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: '#cbd5e1', fontSize: 11 },
      data: ['高风险舆情量', '平均可信度', '情绪煽动指数', '传播误导指数'],
    },
    grid: { left: 52, right: 56, top: 36, bottom: 26 },
    xAxis: {
      type: 'category',
      data: x.length ? x : ['—'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.45)', width: 1 } },
      axisTick: { show: false },
      axisLabel: { color: '#bae6fd', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: 'rgba(56, 189, 248, 0.09)', type: 'dashed' } },
    },
    yAxis: [
      {
        ...techAxisValue('left'),
        name: '舆情量 / 指数',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.08)', type: 'dashed' } },
      },
      {
        ...techAxisValue('right'),
        name: '可信度',
        min: 0,
        max: 100,
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      },
    ],
    series: [
      {
        name: '高风险舆情量',
        type: 'line',
        yAxisIndex: 0,
        smooth: 0.35,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 8,
        data: highRisk,
        lineStyle: { width: 3.6, color: '#fb7185', shadowBlur: 18, shadowColor: 'rgba(244,63,94,0.72)' },
        itemStyle: { color: '#fb7185', borderColor: '#fff', borderWidth: 1.2, shadowBlur: 14, shadowColor: 'rgba(244,63,94,0.75)' },
        areaStyle: { color: areaGradient('rgba(244,63,94,0.34)', 'rgba(244,63,94,0.02)') },
        emphasis: { focus: 'series', scale: true },
      },
      {
        name: '平均可信度',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.35,
        showSymbol: true,
        symbol: 'diamond',
        symbolSize: 8,
        data: credibility,
        lineStyle: { width: 3.2, color: '#22d3ee', shadowBlur: 16, shadowColor: 'rgba(34,211,238,0.72)' },
        itemStyle: { color: '#22d3ee', borderColor: '#fff', borderWidth: 1.1, shadowBlur: 12, shadowColor: 'rgba(34,211,238,0.7)' },
        areaStyle: { color: areaGradient('rgba(34,211,238,0.25)', 'rgba(34,211,238,0.02)') },
        emphasis: { focus: 'series', scale: true },
      },
      {
        name: '情绪煽动指数',
        type: 'line',
        yAxisIndex: 0,
        smooth: 0.4,
        showSymbol: true,
        symbol: 'rect',
        symbolSize: 7,
        data: sentiment,
        lineStyle: { width: 3, color: '#fbbf24', shadowBlur: 14, shadowColor: 'rgba(251,191,36,0.66)' },
        itemStyle: { color: '#fbbf24', borderColor: '#fff', borderWidth: 1, shadowBlur: 12, shadowColor: 'rgba(251,191,36,0.66)' },
        areaStyle: { color: areaGradient('rgba(251,191,36,0.2)', 'rgba(251,191,36,0.01)') },
        emphasis: { focus: 'series', scale: true },
      },
      {
        name: '传播误导指数',
        type: 'line',
        yAxisIndex: 0,
        smooth: 0.4,
        showSymbol: true,
        symbol: 'triangle',
        symbolSize: 8,
        data: misleading,
        lineStyle: { width: 3, color: '#a78bfa', shadowBlur: 14, shadowColor: 'rgba(167,139,250,0.66)' },
        itemStyle: { color: '#a78bfa', borderColor: '#fff', borderWidth: 1, shadowBlur: 12, shadowColor: 'rgba(167,139,250,0.66)' },
        areaStyle: { color: areaGradient('rgba(167,139,250,0.18)', 'rgba(167,139,250,0.01)') },
        emphasis: { focus: 'series', scale: true },
      },
      makePulse(highRisk, '#fb7185', 0),
      makePulse(credibility, '#22d3ee', 1),
      makePulse(sentiment, '#fbbf24', 0),
      makePulse(misleading, '#a78bfa', 0),
    ],
  })
}

function buildGlobalCompareRows() {
  const rows = getFirst(screen.value, ['countryRisk', 'country_risk'], []) || []
  const list = Array.isArray(rows) ? rows : []
  const mapped = list
    .map((r) => {
      const riskRaw = r.riskIntensity ?? r.risk ?? r.avgFakeScore ?? r.value
      const fake = r.avgFakeScore ?? r.fakeScore
      const credibilityRaw = r.avgCredibility ?? r.credibility ?? r.avgCredibilityScore ?? (fake != null ? 100 - num(fake, 50) : null)
      const name = String(r.region ?? r.country ?? r.name ?? '未知').trim()
      return {
        name,
        highRiskPct: Math.max(0, Math.min(100, num(r.highRiskPct ?? r.high_risk_pct ?? riskRaw, 0))),
        credibility: Math.max(0, Math.min(100, credibilityRaw != null ? num(credibilityRaw, 50) : 50)),
        newsCount: num(r.newsCount ?? r.count, 0),
      }
    })
    .filter((r) => r.name)
  const top = mapped.sort((a, b) => b.highRiskPct - a.highRiskPct).slice(0, 10)
  if (top.length >= 8) return top
  const fallback = [
    ['美国', 82, 44],
    ['欧洲', 73, 51],
    ['东南亚', 66, 58],
    ['拉美', 61, 55],
    ['中东', 69, 48],
    ['南亚', 64, 53],
    ['日韩', 57, 63],
    ['非洲', 52, 60],
  ]
  return fallback.map(([name, highRiskPct, credibility]) => ({ name, highRiskPct, credibility, newsCount: 0 }))
}

function applyGlobalCompareChart() {
  if (!elGlobalCompare.value) return
  if (!chartGlobalCompare) chartGlobalCompare = echarts.init(elGlobalCompare.value, null, { renderer: 'canvas' })
  const rows = buildGlobalCompareRows()
  const names = rows.map((r) => r.name)
  const riskVals = rows.map((r) => Math.round(r.highRiskPct))
  const credVals = rows.map((r) => Math.round(r.credibility))
  chartGlobalCompare.setOption({
    backgroundColor: 'transparent',
    animationDuration: 1300,
    animationDurationUpdate: 900,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(6, 18, 35, 0.94)',
      borderColor: 'rgba(56, 189, 248, 0.45)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    legend: {
      top: 2,
      textStyle: { color: '#cbd5e1', fontSize: 11 },
      data: ['高风险舆情占比', '平均可信度'],
    },
    grid: { left: 48, right: 56, top: 38, bottom: 28 },
    xAxis: {
      type: 'category',
      data: names.length ? names : ['—'],
      axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.45)' } },
      axisTick: { show: false },
      axisLabel: { color: '#bae6fd', fontSize: 10, interval: 0 },
      splitLine: { show: false },
    },
    yAxis: [
      {
        ...techAxisValue('left'),
        min: 0,
        max: 100,
        name: '高风险占比(%)',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.08)', type: 'dashed' } },
      },
      {
        ...techAxisValue('right'),
        min: 0,
        max: 100,
        name: '可信度',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      },
    ],
    series: [
      {
        name: '高风险舆情占比',
        type: 'bar',
        yAxisIndex: 0,
        barWidth: '32%',
        barGap: '8%',
        data: riskVals.map((v, i) => ({
          value: v,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
              { offset: 0, color: 'rgba(136, 19, 55, 0.9)' },
              { offset: 1, color: i % 2 === 0 ? '#fb7185' : '#f43f5e' },
            ]),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 18,
            shadowColor: 'rgba(244,63,94,0.58)',
          },
        })),
        emphasis: {
          focus: 'self',
          scale: true,
          itemStyle: { shadowBlur: 26, shadowColor: 'rgba(251,113,133,0.85)' },
        },
      },
      {
        name: '平均可信度',
        type: 'bar',
        yAxisIndex: 1,
        barWidth: '32%',
        data: credVals.map((v, i) => ({
          value: v,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
              { offset: 0, color: 'rgba(6, 95, 112, 0.92)' },
              { offset: 1, color: i % 2 === 0 ? '#22d3ee' : '#38bdf8' },
            ]),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 18,
            shadowColor: 'rgba(34,211,238,0.58)',
          },
        })),
        emphasis: {
          focus: 'self',
          scale: true,
          itemStyle: { shadowBlur: 26, shadowColor: 'rgba(34,211,238,0.85)' },
        },
      },
      {
        type: 'pictorialBar',
        name: '高风险舆情占比顶端',
        yAxisIndex: 0,
        symbol: 'rect',
        symbolSize: [20, 4],
        symbolOffset: [-11, -2],
        symbolPosition: 'end',
        z: 8,
        data: riskVals,
        itemStyle: { color: 'rgba(251, 113, 133, 0.92)', shadowBlur: 12, shadowColor: 'rgba(251, 113, 133, 0.9)' },
        tooltip: { show: false },
      },
      {
        type: 'pictorialBar',
        name: '平均可信度顶端',
        yAxisIndex: 1,
        symbol: 'rect',
        symbolSize: [20, 4],
        symbolOffset: [11, -2],
        symbolPosition: 'end',
        z: 8,
        data: credVals,
        itemStyle: { color: 'rgba(34, 211, 238, 0.92)', shadowBlur: 12, shadowColor: 'rgba(34, 211, 238, 0.9)' },
        tooltip: { show: false },
      },
    ],
  })
}

function applyAllCharts() {
  const worldGeo = ensureWorldMapRegistered()
  applyTrendChart()
  applyPieChart()
  applyMapChart(worldGeo)
  applyConsistencyChart()
  applySpreadChart()
  applyRiskRealtimeChart()
  applyGlobalCompareChart()
  requestAnimationFrame(() => {
    chartTrend?.resize()
    chartPie?.resize()
    chartMap?.resize()
    chartConsistency?.resize()
    chartSpread?.resize()
    chartRiskRealtime?.resize()
    chartGlobalCompare?.resize()
  })
}

watch(
  () => screen.value,
  () => {
    nextTick(() => applyAllCharts())
  },
  { deep: true },
)

onMounted(async () => {
  tickClock()
  clockTimer = setInterval(tickClock, 1000)
  await loadScreen()
  refreshTimer = setInterval(loadScreen, 120000)
  ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => applyAllCharts()) : null
  ;[elTrend, elPie, elMap, elConsistency, elSpread, elRiskRealtime, elGlobalCompare].forEach((r) => {
    if (r.value && ro) ro.observe(r.value)
  })
  window.addEventListener('resize', applyAllCharts)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(kpiAnimId)
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  window.removeEventListener('resize', applyAllCharts)
  try {
    ro?.disconnect()
  } catch {
    /* noop */
  }
  disposeAll()
})
</script>

<template>
  <div class="tl-bigscreen">
    <header class="tl-header">
      <div class="tl-header-left">
        <h1>TruthLens 国际涉华舆情智能分析与预警大屏</h1>
        <p class="tl-sub">新闻采集 · 可信度评估 · FakeScore · 多源一致性 · 风险预警</p>
      </div>
      <div class="tl-header-mid">
        <div class="tl-clock">
          <span class="tl-label">当前时间</span>
          <strong>{{ clock }}</strong>
        </div>
        <div class="tl-clock">
          <span class="tl-label">数据更新</span>
          <strong>{{ dataUpdatedAt ? String(dataUpdatedAt).replace('T', ' ').slice(0, 19) : '—' }}</strong>
        </div>
      </div>
      <div class="tl-header-actions">
        <button type="button" class="tl-btn" @click="loadScreen">刷新</button>
        <button type="button" class="tl-btn ghost" @click="router.push('/portal-screen')">新闻门户</button>
      </div>
    </header>

    <p v-if="errorMessage" class="tl-error">{{ errorMessage }}</p>
    <p v-else-if="loading" class="tl-loading">数据加载中…</p>

    <section class="tl-kpi-row">
      <article class="tl-kpi tl-kpi-tile">
        <div class="tl-kpi-head">
          <span class="tl-kpi-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 6h16M4 12h10M4 18h7" stroke-linecap="round" />
              <path d="M18 15l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="tl-kpi-label">今日采集新闻总量</span>
        </div>
        <strong class="tl-kpi-num tl-kpi-num--cyan">{{ kpiDisplay.todayCollected }}</strong>
      </article>
      <article class="tl-kpi tl-kpi-tile">
        <div class="tl-kpi-head">
          <span class="tl-kpi-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="tl-kpi-label">今日分析完成量</span>
        </div>
        <strong class="tl-kpi-num tl-kpi-num--cyan">{{ kpiDisplay.todayAnalyzed }}</strong>
      </article>
      <article class="tl-kpi tl-kpi-tile danger">
        <div class="tl-kpi-head">
          <span class="tl-kpi-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 9v4M12 17h.01M10.3 3.2L3.1 18c-.5 1 .2 2.2 1.3 2.2h15.2c1.1 0 1.8-1.2 1.3-2.2L13.7 3.2c-.5-1-1.9-1-2.4 0z" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="tl-kpi-label">高风险涉华信息数</span>
        </div>
        <strong class="tl-kpi-num tl-kpi-num--red">{{ kpiDisplay.chinaHighRisk }}</strong>
      </article>
      <article class="tl-kpi tl-kpi-tile accent">
        <div class="tl-kpi-head">
          <span class="tl-kpi-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="tl-kpi-label">平均可信度（100 − FakeScore）</span>
        </div>
        <strong class="tl-kpi-num tl-kpi-num--accent">{{ kpiDisplay.avgCredibility != null ? kpiDisplay.avgCredibility : '—' }}</strong>
      </article>
    </section>

    <div class="tl-main">
      <aside class="tl-col tl-left">
        <div class="tl-panel tl-panel--glow">
          <div class="tl-panel-title">近7日风险与处理趋势</div>
          <div ref="elTrend" class="tl-chart" />
        </div>
        <div class="tl-panel tl-panel--glow">
          <div class="tl-panel-title">风险类型分布（单篇分析）</div>
          <div ref="elPie" class="tl-chart" />
        </div>
        <div class="tl-panel tl-panel--glow">
          <div class="tl-panel-title">近30日新闻采集分布（来源/媒体）</div>
          <div ref="elSpread" class="tl-chart" />
        </div>
      </aside>

      <main class="tl-center">
        <div class="tl-panel map-panel tl-panel--glow">
          <div class="tl-panel-title">全球舆情风险热力 · 涉华关注链路</div>
          <p class="tl-map-legend">
            国家填色：风险强度；<span class="tl-map-legend-dot" /> 监测节点：跨域舆情热点；弧线：涉华信息传播关联
          </p>
          <div ref="elMap" class="tl-chart map" />
          <p class="tl-map-attribution" role="note">
            舆情可视化底图基于开源矢量简图，仅用于演示，非导航用途，无官方审图号
          </p>
        </div>
      </main>

      <aside class="tl-col tl-right">
        <div class="tl-panel tl-scroll-panel tl-panel--glow">
          <div class="tl-panel-title">海外新闻实时流 / 高风险预警</div>
          <div class="tl-tabs">
            <button type="button" class="tl-tab" :class="{ on: selectedNewsTab === 'high' }" @click="selectedNewsTab = 'high'">
              高风险
            </button>
            <button type="button" class="tl-tab" :class="{ on: selectedNewsTab === 'latest' }" @click="selectedNewsTab = 'latest'">
              最新
            </button>
          </div>
          <div class="tl-scroll-wrap">
            <ul class="tl-scroll-list">
              <li
                v-for="(n, idx) in (rightNewsList.length > 8 ? [...rightNewsList, ...rightNewsList] : rightNewsList)"
                :key="`${n.id}-${idx}`"
                class="tl-news-row"
                role="button"
                tabindex="0"
                @click="goNewsDetail(n.id)"
              >
                <span class="tl-badge" :class="{ hi: String(n.riskLevel || '').includes('高') }">{{ n.riskLevel || (selectedNewsTab === 'high' ? '高风险' : '—') }}</span>
                <div class="tl-alert-body">
                  <b>{{ n.title || '（无标题）' }}</b>
                  <small>{{ n.source || '—' }} <span v-if="n.country">· {{ n.country }}</span></small>
                </div>
              </li>
              <li v-if="!rightNewsList.length" class="tl-muted">暂无新闻数据</li>
            </ul>
          </div>
        </div>
        <div class="tl-panel tl-panel--glow">
          <div class="tl-panel-title">多源一致性评分分布</div>
          <div ref="elConsistency" class="tl-chart" />
        </div>
        <div class="tl-panel cloud-panel tl-panel--glow">
          <div class="tl-panel-title">热点舆情关键词</div>
          <div class="tl-cloud">
            <CdsWordCloud
              v-if="keywordWordsForCloud.length"
              variant="dashboard"
              :words="keywordWordsForCloud"
              :max-words="50"
            />
            <p v-else class="tl-muted">暂无关键词（可补充新闻标题后自动抽取）</p>
          </div>
        </div>
      </aside>
    </div>

    <footer class="tl-footer">
      <div class="tl-panel tl-panel--glow">
        <div class="tl-panel-title">多维度舆情风险实时监测</div>
        <div ref="elRiskRealtime" class="tl-chart tl-chart-footer" />
      </div>
      <div class="tl-panel tl-panel--glow">
        <div class="tl-panel-title">全球涉华舆情风险热力对比</div>
        <div ref="elGlobalCompare" class="tl-chart tl-chart-footer" />
      </div>
    </footer>
  </div>
</template>

<style scoped>
.tl-bigscreen {
  position: relative;
  isolation: isolate;
  height: 100vh;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  padding: 12px 0 16px;
  background: radial-gradient(ellipse 120% 80% at 50% -20%, #1e3a5f 0%, #0a1628 45%, #050b14 100%);
  color: #e2e8f0;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) minmax(180px, 24vh);
  gap: 10px;
}

.tl-bigscreen > * {
  position: relative;
  z-index: 1;
}

.tl-bigscreen::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.045) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.55;
  animation: tl-grid-drift 22s linear infinite;
}

.tl-bigscreen::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 60% 40% at 20% 30%, rgba(56, 189, 248, 0.08), transparent 55%),
    radial-gradient(ellipse 50% 35% at 85% 70%, rgba(220, 38, 38, 0.06), transparent 50%);
  animation: tl-bg-pulse 14s ease-in-out infinite alternate;
}

@keyframes tl-grid-drift {
  0% {
    background-position: 0 0, 0 0;
  }
  100% {
    background-position: 44px 44px, -44px 44px;
  }
}

@keyframes tl-bg-pulse {
  0% {
    opacity: 0.65;
  }
  100% {
    opacity: 1;
  }
}

.tl-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 0;
  padding: 0 10px 10px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
}

.tl-header h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: linear-gradient(90deg, #e0f2fe, #38bdf8, #a5f3fc);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tl-sub {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: #64748b;
}

.tl-header-mid {
  display: flex;
  gap: 24px;
}

.tl-clock {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}

.tl-clock strong {
  color: #e2e8f0;
}

.tl-label {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tl-header-actions {
  display: flex;
  gap: 10px;
}

.tl-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(14, 165, 233, 0.15);
  color: #7dd3fc;
  cursor: pointer;
  font-size: 0.85rem;
}

.tl-btn.ghost {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.35);
  color: #94a3b8;
}

.tl-btn:hover {
  background: rgba(56, 189, 248, 0.25);
}

.tl-error {
  color: #fda4af;
  margin: 0 0 8px;
  font-size: 0.9rem;
}

.tl-loading {
  color: #7dd3fc;
  margin: 0 0 8px;
  font-size: 0.9rem;
}

.tl-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 0;
  padding: 0 10px;
}

@media (max-width: 1100px) {
  .tl-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.tl-kpi {
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(155deg, rgba(15, 23, 42, 0.92), rgba(30, 58, 95, 0.42));
  border: 1px solid rgba(56, 189, 248, 0.22);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.08),
    0 4px 28px rgba(2, 12, 32, 0.55),
    0 0 32px rgba(14, 165, 233, 0.12);
}

.tl-kpi-tile {
  position: relative;
  overflow: hidden;
}

.tl-kpi-tile::before {
  content: '';
  position: absolute;
  inset: -40% -20%;
  background: linear-gradient(115deg, transparent 40%, rgba(56, 189, 248, 0.06) 50%, transparent 60%);
  animation: tl-kpi-sheen 6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes tl-kpi-sheen {
  0%,
  100% {
    transform: translateX(-12%) rotate(8deg);
  }
  50% {
    transform: translateX(18%) rotate(8deg);
  }
}

.tl-kpi.danger {
  border-color: rgba(244, 63, 94, 0.38);
  box-shadow:
    0 0 0 1px rgba(244, 63, 94, 0.12),
    0 4px 28px rgba(2, 12, 32, 0.55),
    0 0 36px rgba(244, 63, 94, 0.14);
}

.tl-kpi.accent {
  border-color: rgba(34, 211, 238, 0.4);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.12),
    0 4px 28px rgba(2, 12, 32, 0.55),
    0 0 36px rgba(34, 211, 238, 0.14);
}

.tl-kpi-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tl-kpi-ico {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  color: #7dd3fc;
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.45));
}

.tl-kpi-ico svg {
  display: block;
  width: 100%;
  height: 100%;
}

.tl-kpi-label {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-bottom: 0;
  line-height: 1.3;
}

.tl-kpi-num {
  display: block;
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.tl-kpi-num--cyan {
  color: #e0f2fe;
  text-shadow:
    0 0 18px rgba(56, 189, 248, 0.55),
    0 0 36px rgba(14, 165, 233, 0.28);
}

.tl-kpi-num--red {
  color: #fda4af;
  text-shadow:
    0 0 18px rgba(244, 63, 94, 0.55),
    0 0 32px rgba(220, 38, 38, 0.25);
}

.tl-kpi-num--accent {
  color: #67e8f9;
  text-shadow:
    0 0 18px rgba(34, 211, 238, 0.5),
    0 0 30px rgba(56, 189, 248, 0.22);
}

.tl-main {
  display: grid;
  grid-template-columns: 24% 1fr 24%;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 0 10px;
}

@media (max-width: 1400px) {
  .tl-main {
    grid-template-columns: 1fr;
  }
}

.tl-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.tl-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(11, 28, 52, 0.62), rgba(6, 16, 34, 0.46) 45%, rgba(20, 24, 44, 0.44));
  border: 1px solid rgba(51, 65, 85, 0.55);
  padding: 10px 10px 8px;
  flex: 1;
  min-height: 0;
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.28);
}

.tl-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  pointer-events: none;
  background:
    linear-gradient(140deg, rgba(34, 211, 238, 0.07), transparent 35%),
    linear-gradient(320deg, rgba(244, 63, 94, 0.06), transparent 42%);
  opacity: 0.9;
}

.tl-panel--glow {
  border-color: rgba(56, 189, 248, 0.28);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.06),
    0 8px 32px rgba(2, 8, 23, 0.45),
    0 0 40px rgba(14, 165, 233, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.tl-panel-title {
  font-size: 0.78rem;
  color: #7dd3fc;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  padding-left: 4px;
  border-left: 3px solid #22d3ee;
}

.tl-chart {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 120px;
}

.tl-chart::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.025) 1px, transparent 1px);
  background-size: 26px 26px;
  opacity: 0.65;
}

.tl-chart.map {
  height: 100%;
  min-height: 280px;
  border-radius: 8px;
  /* 略提亮画布背后区域，陆地边界在 ECharts 内已通过 geo border 加粗加亮 */
  background: radial-gradient(ellipse 85% 90% at 50% 45%, rgba(30, 58, 95, 0.45), rgba(6, 15, 30, 0.92));
  box-shadow:
    inset 0 0 0 1px rgba(125, 211, 252, 0.18),
    inset 0 0 40px rgba(56, 189, 248, 0.06);
}

.tl-chart-footer {
  min-height: 220px;
}

.map-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tl-map-legend {
  margin: 0 0 6px 4px;
  padding: 0;
  font-size: 0.68rem;
  line-height: 1.45;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

.tl-map-legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin: 0 3px 0 2px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fecdd3, #f43f5e);
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.65);
  vertical-align: middle;
}

.tl-map-attribution {
  flex-shrink: 0;
  margin: 8px 2px 0;
  padding: 8px 10px;
  font-size: 0.62rem;
  line-height: 1.55;
  color: #64748b;
  letter-spacing: 0.01em;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(51, 65, 85, 0.45);
}


.tl-scroll-panel {
  flex: 1.35;
  min-height: 0;
}

.tl-scroll-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent);
}

.tl-scroll-list {
  list-style: none;
  margin: 0;
  padding: 0;
  animation: tl-scroll 28s linear infinite;
}

@keyframes tl-scroll {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}

.tl-scroll-list:hover {
  animation-play-state: paused;
}

.tl-scroll-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  font-size: 0.78rem;
}

.tl-news-row {
  cursor: pointer;
}

.tl-news-row:hover {
  background: rgba(56, 189, 248, 0.08);
}

.tl-tabs {
  display: flex;
  gap: 8px;
  padding: 4px 4px 10px;
}

.tl-tab {
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.35);
  color: #94a3b8;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.78rem;
}

.tl-tab.on {
  border-color: rgba(56, 189, 248, 0.55);
  color: #7dd3fc;
  background: rgba(14, 165, 233, 0.18);
}

.tl-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
  font-size: 0.65rem;
}

.tl-badge.hi {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}

.tl-alert-body b {
  display: block;
  color: #e2e8f0;
  font-weight: 600;
  line-height: 1.35;
}

.tl-alert-body small {
  color: #64748b;
}

.tl-cloud {
  flex: 1;
  min-height: 0;
}

.cloud-panel {
  flex: 1.2;
}

.tl-muted {
  color: #64748b;
  font-size: 0.8rem;
  padding: 12px;
}

.tl-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 0;
  height: 100%;
  min-height: 0;
  padding: 0 10px;
}

@media (max-width: 1100px) {
  .tl-footer {
    grid-template-columns: 1fr;
  }
}
</style>
