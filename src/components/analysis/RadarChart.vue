<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FAKE_SCORE_FEATURE_LABELS, FAKE_SCORE_FEATURE_ORDER } from '../../constants/fakeScoreModelExplain'
import type { AnalysisDimensions } from '../../types/analysis'

const props = withDefaults(
  defineProps<{
    dimensions?: AnalysisDimensions
    /** 12 维风险特征 x（0–1），与引擎一致；仅 variant=fake 时使用 */
    features?: Record<string, number> | null
    /** fake：虚假信号越高越红；credibility：四轴「可信/克制」越高越好 */
    variant?: 'fake' | 'credibility'
  }>(),
  { variant: 'fake' },
)

const wrapRef = ref<HTMLDivElement | null>(null)
const elRef = ref<HTMLDivElement | null>(null)
let chart: any = null
let ro: ResizeObserver | null = null

const LEGACY_LABELS = ['来源可信度', '事实一致性', '情绪煽动性', '传播误导性'] as const

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function riskToRadar01(x: unknown) {
  return Math.round(clamp01(Number(x)) * 100)
}

type RadarPack = {
  indicators: { name: string; max: number }[]
  values: number[]
  labels: string[]
  benchmark: number[]
}

function buildFromFeatures(feat: Record<string, number> | null | undefined): RadarPack | null {
  if (!feat || typeof feat !== 'object') return null
  const indicators: { name: string; max: number }[] = []
  const values: number[] = []
  const labels: string[] = []
  let any = false
  for (const key of FAKE_SCORE_FEATURE_ORDER) {
    if (feat[key] == null && feat[key] !== 0) continue
    any = true
    const full = FAKE_SCORE_FEATURE_LABELS[key]
    labels.push(full)
    const short = full.length > 6 ? `${full.slice(0, 5)}…` : full
    indicators.push({ name: short, max: 100 })
    values.push(riskToRadar01(feat[key]))
  }
  if (!any || indicators.length < 4) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const bench = values.map(() => Math.round(Math.min(85, Math.max(28, avg * 0.72))))
  return { indicators, values, labels, benchmark: bench }
}

function buildLegacyFake(d: AnalysisDimensions | undefined): RadarPack {
  const values = [
    d?.sourceCredibility ?? 0,
    d?.factConsistency ?? 0,
    d?.emotionManipulation ?? 0,
    d?.propagationMisleading ?? 0,
  ]
  const benchmark = [50, 50, 50, 50]
  return {
    indicators: LEGACY_LABELS.map((name) => ({ name, max: 100 })),
    values,
    labels: [...LEGACY_LABELS],
    benchmark,
  }
}

/** 可信度雷达：四轴均为「越高越好」（煽动/误导已换算为克制分） */
function buildCredibility(d: AnalysisDimensions | undefined): RadarPack {
  const sc = Math.round(Math.min(100, Math.max(0, Number(d?.sourceCredibility ?? 0))))
  const fc = Math.round(Math.min(100, Math.max(0, Number(d?.factConsistency ?? 0))))
  const em = Math.min(100, Math.max(0, Number(d?.emotionManipulation ?? 0)))
  const pm = Math.min(100, Math.max(0, Number(d?.propagationMisleading ?? 0)))
  const calmEm = Math.round(100 - em)
  const calmPm = Math.round(100 - pm)
  const labels = ['来源可信度', '事实一致性', '情绪克制', '传播克制']
  const indicators = labels.map((name) => ({ name, max: 100 }))
  const values = [sc, fc, calmEm, calmPm]
  const avg = values.reduce((a, b) => a + b, 0) / 4
  const bench = values.map(() => Math.round(Math.min(92, Math.max(40, avg * 0.92))))
  return { indicators, values, labels, benchmark: bench }
}

const render = () => {
  if (!chart) return
  const isCred = props.variant === 'credibility'
  const pack = isCred
    ? buildCredibility(props.dimensions)
    : buildFromFeatures(props.features) ?? buildLegacyFake(props.dimensions)
  const avg = Math.round(pack.values.reduce((a, b) => a + b, 0) / pack.values.length)
  const n = pack.indicators.length

  if (isCred) {
    chart.setOption({
      animationDuration: 800,
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'rgba(148, 163, 184, 0.35)',
        textStyle: { color: '#f8fafc', fontSize: 13 },
        formatter: (params: { value?: number[]; data?: { value?: number[] } }) => {
          const v = params?.value ?? params?.data?.value
          if (!Array.isArray(v)) return ''
          return pack.labels.map((name, i) => `${name}：${v[i] ?? 0}`).join('<br/>')
        },
      },
      legend: {
        bottom: 4,
        data: ['本条评估', '参考中线'],
        textStyle: { color: '#44403c', fontSize: 12 },
      },
      radar: {
        center: ['50%', '52%'],
        radius: '66%',
        splitNumber: 5,
        axisName: { color: '#365314', fontSize: 12, fontWeight: 600 },
        splitLine: { lineStyle: { color: 'rgba(22, 101, 52, 0.2)' } },
        splitArea: {
          areaStyle: {
            color: [
              'rgba(240, 253, 244, 0.95)',
              'rgba(187, 247, 208, 0.45)',
              'rgba(134, 239, 172, 0.35)',
              'rgba(74, 222, 128, 0.22)',
              'rgba(22, 163, 74, 0.12)',
            ],
          },
        },
        axisLine: { lineStyle: { color: 'rgba(22, 101, 52, 0.35)' } },
        indicator: pack.indicators,
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: pack.values,
              name: '本条评估',
              areaStyle: {
                color: {
                  type: 'radial',
                  x: 0.5,
                  y: 0.5,
                  r: 0.85,
                  colorStops: [
                    { offset: 0, color: 'rgba(34, 197, 94, 0.45)' },
                    { offset: 1, color: 'rgba(22, 163, 74, 0.12)' },
                  ],
                },
              },
              lineStyle: { width: 2.4, color: '#15803d' },
              itemStyle: { color: '#16a34a', borderWidth: 2, borderColor: '#fff' },
              symbol: 'circle',
              symbolSize: 6,
            },
            {
              value: pack.benchmark,
              name: '参考中线',
              areaStyle: { color: 'transparent' },
              lineStyle: { color: '#a8a29e', width: 1.2, type: 'dashed' },
              itemStyle: { color: '#a8a29e' },
              symbol: 'none',
            },
          ],
        },
      ],
    })
    return
  }

  // —— fake：虚假信号，越高越接近外圈「危险」红区 ——
  chart.setOption({
    animationDuration: 900,
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(148, 163, 184, 0.35)',
      textStyle: { color: '#fef2f2', fontSize: 13 },
      formatter: (params: { value?: number[]; data?: { value?: number[] } }) => {
        const v = params?.value ?? params?.data?.value
        if (!Array.isArray(v)) return ''
        return pack.labels.map((name, i) => `${name}（虚假信号）：${v[i] ?? 0}`).join('<br/>')
      },
    },
    legend: {
      bottom: 2,
      data: ['本条稿件', '对照参考'],
      textStyle: { color: '#57534e', fontSize: 12 },
    },
    radar: {
      center: ['50%', n > 8 ? '51%' : '50%'],
      radius: n > 8 ? '56%' : '60%',
      splitNumber: 5,
      axisName: {
        color: '#7f1d1d',
        fontSize: n > 8 ? 10 : 11,
        fontWeight: 600,
      },
      // 由内向外：浅 → 红，表示越靠外越「危险」
      splitLine: {
        lineStyle: {
          color: ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444'].map((c) => `${c}cc`),
        },
      },
      splitArea: {
        areaStyle: {
          color: [
            'rgba(255, 255, 255, 0.92)',
            'rgba(254, 242, 242, 0.85)',
            'rgba(254, 202, 202, 0.55)',
            'rgba(252, 165, 165, 0.42)',
            'rgba(248, 113, 113, 0.28)',
          ],
        },
      },
      axisLine: { lineStyle: { color: 'rgba(185, 28, 28, 0.35)' } },
      indicator: pack.indicators,
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: pack.values,
            name: '本条稿件',
            areaStyle: {
              color: {
                type: 'radial',
                x: 0.5,
                y: 0.5,
                r: 0.95,
                colorStops: [
                  { offset: 0, color: 'rgba(254, 226, 226, 0.25)' },
                  { offset: 0.55, color: 'rgba(220, 38, 38, 0.35)' },
                  { offset: 1, color: 'rgba(127, 29, 29, 0.5)' },
                ],
              },
            },
            lineStyle: { width: 2.5, color: '#991b1b' },
            itemStyle: { color: '#b91c1c', borderWidth: 2, borderColor: '#fff' },
            symbol: 'circle',
            symbolSize: 5,
          },
          {
            value: pack.benchmark,
            name: '对照参考',
            areaStyle: { color: 'transparent' },
            lineStyle: { color: '#78716c', width: 1.2, type: 'dashed' },
            itemStyle: { color: '#78716c' },
            symbol: 'none',
          },
        ],
      },
    ],
  })
}

const initChart = async () => {
  const [{ init, use }, charts, renderers, components] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/renderers'),
    import('echarts/components'),
  ])
  use([
    charts.RadarChart,
    renderers.CanvasRenderer,
    components.TooltipComponent,
    components.RadarComponent,
    components.LegendComponent,
  ])
  if (!elRef.value) return
  chart = init(elRef.value)
  render()
}

const onResize = () => {
  chart?.resize()
}

onMounted(async () => {
  await initChart()
  window.addEventListener('resize', onResize)
  if (wrapRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => onResize())
    ro.observe(wrapRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  ro?.disconnect()
  ro = null
  chart?.dispose()
})

watch(
  () => [props.dimensions, props.features, props.variant],
  () => render(),
  { deep: true },
)
</script>

<template>
  <div ref="wrapRef" class="single-radar">
    <div
      ref="elRef"
      class="single-radar-canvas"
      role="img"
      :aria-label="variant === 'credibility' ? '可信度雷达图' : '虚假风险雷达图'"
    />
  </div>
</template>

<style scoped>
.single-radar {
  width: 100%;
  max-width: 100%;
  min-height: 0;
  height: clamp(220px, 28vw, 340px);
  overflow: hidden;
  box-sizing: border-box;
}

.single-radar-canvas {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
