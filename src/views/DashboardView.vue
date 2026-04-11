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
const elAlert30 = ref(null)

let chartTrend
let chartPie
let chartMap
let chartConsistency
let chartSpread
let chartAlert30

let clockTimer
let refreshTimer
let ro

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
  ;[chartTrend, chartPie, chartMap, chartConsistency, chartSpread, chartAlert30].forEach((c) => {
    try {
      c?.dispose()
    } catch {
      /* noop */
    }
  })
  chartTrend = chartPie = chartMap = chartConsistency = chartSpread = chartAlert30 = null
}

function baseTextStyle() {
  return { color: '#94a3b8', fontSize: 11 }
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

function ensureWorldMapRegistered() {
  const w = topojson.feature(worldTopology, worldTopology.objects.countries)
  try {
    echarts.registerMap('world', w)
  } catch {
    /* 已注册 */
  }
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
    tooltip: { trigger: 'axis' },
    legend: { data: ['分析量', '高风险'], textStyle: { color: '#94a3b8' }, top: 0 },
    grid: { left: 44, right: 12, top: 36, bottom: 22 },
    xAxis: { type: 'category', data: x, axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } } },
    series: [
      { name: '分析量', type: 'line', smooth: true, data: analyzed, itemStyle: { color: '#22d3ee' }, areaStyle: { opacity: 0.08 } },
      { name: '高风险', type: 'bar', data: high, itemStyle: { color: '#f43f5e' } },
    ],
  })
}

function applyPieChart() {
  if (!elPie.value) return
  const rows = getFirst(screen.value, ['riskDistribution', 'risk_distribution'], []) || []
  if (!chartPie) chartPie = echarts.init(elPie.value, null, { renderer: 'canvas' })
  const data = (Array.isArray(rows) ? rows : [])
    .filter((x) => num(x.value) > 0)
    .map((x) => ({ name: String(x.name ?? x.label ?? '—'), value: num(x.value) }))
  chartPie.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    series: [
      {
        type: 'pie',
        radius: ['34%', '62%'],
        center: ['50%', '46%'],
        data: data.length ? data : [{ name: '暂无', value: 1 }],
        itemStyle: { borderColor: '#0f172a', borderWidth: 1 },
        label: { color: '#cbd5e1' },
        color: ['#22c55e', '#eab308', '#f43f5e', '#64748b'],
      },
    ],
  })
}

function applyMapChart(worldGeo) {
  if (!elMap.value) return
  ensureWorldMapRegistered()
  if (!chartMap) chartMap = echarts.init(elMap.value, null, { renderer: 'canvas' })
  const cr = getFirst(screen.value, ['countryRisk', 'country_risk'], []) || []
  const mapData = buildMapSeriesData(cr, worldGeo)
  const values = mapData.map((d) => d.value)
  const vmax = Math.max(10, ...values, 1)
  const { effectData, linesData } = buildGeoOverlaySeries(mapData, vmax)

  chartMap.setOption(
    {
      backgroundColor: 'transparent',
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
        inRange: { color: ['#164e63', '#0e7490', '#e11d48'] },
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 112,
      },
      geo: {
        map: 'world',
        roam: false,
        silent: true,
        zoom: 1.05,
        layoutCenter: ['50%', '50%'],
        layoutSize: '94%',
        itemStyle: {
          areaColor: '#152a45',
          borderColor: 'rgba(125, 211, 252, 0.55)',
          borderWidth: 1,
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
            borderColor: 'rgba(186, 230, 253, 0.5)',
            borderWidth: 0.85,
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
            period: 7,
            trailLength: 0.2,
            symbol: 'circle',
            symbolSize: 2.8,
            color: 'rgba(251, 113, 133, 0.55)',
          },
          lineStyle: {
            color: 'rgba(244, 63, 94, 0.35)',
            width: 1.05,
            curveness: 0.2,
            opacity: 0.9,
          },
          data: linesData,
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
            scale: 3.5,
            period: 5.2,
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
  chartConsistency.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 12, top: 18, bottom: 28 },
    xAxis: {
      type: 'category',
      data: names.length ? names : ['—'],
      axisLabel: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
    series: [
      {
        name: '多源一致性分布',
        type: 'bar',
        data: vals.length ? vals : [0],
        itemStyle: { color: '#a78bfa' },
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
  chartSpread.setOption({
    backgroundColor: 'transparent',
    title: {
      text: list.length ? '近30日新闻来源传播量（按媒体）' : '近30日新闻采集分布（按媒体聚合）',
      left: 10,
      top: 6,
      textStyle: { color: '#94a3b8', fontSize: 12 },
    },
    tooltip: { trigger: 'axis' },
    grid: { left: 88, right: 16, top: 40, bottom: 8 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
    yAxis: { type: 'category', data: names.length ? names : ['暂无数据'], axisLine: { lineStyle: { color: '#334155' } } },
    series: [
      {
        type: 'bar',
        data: vals.length ? vals : [0],
        itemStyle: { color: '#14b8a6' },
      },
    ],
  })
}

function applyAlert30Chart() {
  if (!elAlert30.value) return
  const rows = getFirst(screen.value, ['highRiskAlerts30d', 'alerts_30d'], []) || []
  if (!chartAlert30) chartAlert30 = echarts.init(elAlert30.value, null, { renderer: 'canvas' })
  const list = Array.isArray(rows) ? rows : []
  const x = list.map((r) => String(r.day ?? r.date ?? '').slice(5, 10))
  const y = list.map((r) => num(r.count ?? r.cnt))
  chartAlert30.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 12, top: 32, bottom: 22 },
    xAxis: { type: 'category', data: x.length ? x : ['—'], axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
    series: [
      {
        name: '预警次数',
        type: 'line',
        smooth: true,
        data: y.length ? y : [0],
        areaStyle: { opacity: 0.12, color: '#f43f5e' },
        itemStyle: { color: '#fb7185' },
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
  applyAlert30Chart()
  requestAnimationFrame(() => {
    chartTrend?.resize()
    chartPie?.resize()
    chartMap?.resize()
    chartConsistency?.resize()
    chartSpread?.resize()
    chartAlert30?.resize()
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
  ;[elTrend, elPie, elMap, elConsistency, elSpread, elAlert30].forEach((r) => {
    if (r.value && ro) ro.observe(r.value)
  })
  window.addEventListener('resize', applyAllCharts)
})

onBeforeUnmount(() => {
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
      <article class="tl-kpi">
        <span class="tl-kpi-label">今日采集新闻总量</span>
        <strong>{{ kpis.todayCollected }}</strong>
      </article>
      <article class="tl-kpi">
        <span class="tl-kpi-label">今日分析完成量</span>
        <strong>{{ kpis.todayAnalyzed }}</strong>
      </article>
      <article class="tl-kpi danger">
        <span class="tl-kpi-label">高风险涉华信息数</span>
        <strong>{{ kpis.chinaHighRisk }}</strong>
      </article>
      <article class="tl-kpi accent">
        <span class="tl-kpi-label">平均可信度（100 − FakeScore）</span>
        <strong>{{ kpis.avgCredibility != null ? kpis.avgCredibility : '—' }}</strong>
      </article>
    </section>

    <div class="tl-main">
      <aside class="tl-col tl-left">
        <div class="tl-panel">
          <div class="tl-panel-title">近7日风险与处理趋势</div>
          <div ref="elTrend" class="tl-chart" />
        </div>
        <div class="tl-panel">
          <div class="tl-panel-title">风险类型分布（单篇分析）</div>
          <div ref="elPie" class="tl-chart" />
        </div>
        <div class="tl-panel">
          <div class="tl-panel-title">近30日新闻采集分布（来源/媒体）</div>
          <div ref="elSpread" class="tl-chart" />
        </div>
      </aside>

      <main class="tl-center">
        <div class="tl-panel map-panel">
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
        <div class="tl-panel tl-scroll-panel">
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
        <div class="tl-panel">
          <div class="tl-panel-title">多源一致性评分分布</div>
          <div ref="elConsistency" class="tl-chart" />
        </div>
        <div class="tl-panel cloud-panel">
          <div class="tl-panel-title">热点舆情关键词</div>
          <div class="tl-cloud">
            <CdsWordCloud v-if="keywordWords.length" :words="keywordWords" :max-words="50" />
            <p v-else class="tl-muted">暂无关键词（可补充新闻标题后自动抽取）</p>
          </div>
        </div>
      </aside>
    </div>

    <footer class="tl-footer">
      <div class="tl-panel">
        <div class="tl-panel-title">近30日高风险预警统计</div>
        <div ref="elAlert30" class="tl-chart wide" />
      </div>
    </footer>
  </div>
</template>

<style scoped>
.tl-bigscreen {
  height: 100vh;
  box-sizing: border-box;
  padding: 16px 20px 24px;
  background: radial-gradient(ellipse 120% 80% at 50% -20%, #1e3a5f 0%, #0a1628 45%, #050b14 100%);
  color: #e2e8f0;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) minmax(180px, 24vh);
  gap: 12px;
}

.tl-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 0;
  padding-bottom: 10px;
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
  gap: 12px;
  margin-bottom: 0;
}

@media (max-width: 1100px) {
  .tl-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.tl-kpi {
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.65));
  border: 1px solid rgba(56, 189, 248, 0.15);
  box-shadow: 0 0 24px rgba(8, 47, 73, 0.35);
}

.tl-kpi.danger {
  border-color: rgba(244, 63, 94, 0.35);
}

.tl-kpi.accent {
  border-color: rgba(34, 211, 238, 0.35);
}

.tl-kpi-label {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-bottom: 8px;
}

.tl-kpi strong {
  font-size: 1.45rem;
  font-weight: 700;
  color: #f1f5f9;
}

.tl-kpi.danger strong {
  color: #fb7185;
}

.tl-kpi.accent strong {
  color: #22d3ee;
}

.tl-main {
  display: grid;
  grid-template-columns: 24% 1fr 24%;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

@media (max-width: 1400px) {
  .tl-main {
    grid-template-columns: 1fr;
  }
}

.tl-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.tl-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(51, 65, 85, 0.6);
  padding: 10px 10px 8px;
  flex: 1;
  min-height: 0;
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
  width: 100%;
  flex: 1;
  min-height: 120px;
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

.tl-chart.wide {
  height: 240px;
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
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 0;
  height: 100%;
  min-height: 0;
}

@media (max-width: 1100px) {
  .tl-footer {
    grid-template-columns: 1fr;
  }
}
</style>
