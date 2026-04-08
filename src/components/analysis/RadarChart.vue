<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnalysisDimensions } from '../../types/analysis'

const props = defineProps<{ dimensions?: AnalysisDimensions }>()

const elRef = ref<HTMLDivElement | null>(null)
let chart: any = null

const labels = ['来源可信度', '事实一致性', '情绪煽动性', '传播误导性']

const render = () => {
  if (!chart) return
  const d = props.dimensions || {}
  const values = [
    d.sourceCredibility ?? 0,
    d.factConsistency ?? 0,
    d.emotionManipulation ?? 0,
    d.propagationMisleading ?? 0,
  ]
  chart.setOption({
    animationDuration: 900,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: 'rgba(148, 163, 184, 0.35)',
      textStyle: { color: '#1c1917', fontSize: 12 },
      formatter: (params: { value?: number[]; data?: { value?: number[] } }) => {
        const v = params?.value ?? params?.data?.value
        if (!Array.isArray(v)) return ''
        return labels.map((name, i) => `${name}：${v[i] ?? 0}`).join('<br/>')
      },
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      data: ['风险维度'],
      textStyle: { color: '#57534e', fontSize: 12 },
    },
    radar: {
      center: ['50%', '46%'],
      radius: '58%',
      splitNumber: 4,
      axisName: { color: '#57534e', fontSize: 12, fontWeight: 500 },
      splitLine: { lineStyle: { color: '#e7e5e4' } },
      splitArea: {
        areaStyle: { color: ['rgba(254,242,242,0.95)', 'rgba(254,202,202,0.55)', 'rgba(252,165,165,0.4)', 'rgba(248,113,113,0.25)'] },
      },
      axisLine: { lineStyle: { color: '#e7e5e4' } },
      indicator: [
        { name: '来源可信度', max: 100 },
        { name: '事实一致性', max: 100 },
        { name: '情绪煽动性', max: 100 },
        { name: '传播误导性', max: 100 },
      ],
    },
    series: [
      {
        name: '风险维度',
        type: 'radar',
        data: [
          {
            value: values,
            name: '风险维度',
            areaStyle: { color: 'rgba(185, 28, 28, 0.16)' },
            lineStyle: { color: '#b91c1c', width: 2.5 },
            itemStyle: { color: '#b91c1c', borderWidth: 2, borderColor: '#fff' },
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

const onResize = () => chart?.resize()

onMounted(async () => {
  await initChart()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
})

watch(() => props.dimensions, render, { deep: true })
</script>

<template>
  <div class="single-radar">
    <div ref="elRef" class="single-radar-canvas" role="img" aria-label="风险维度雷达图" />
  </div>
</template>

<style scoped>
.single-radar {
  width: 100%;
  height: 192px;
}

.single-radar-canvas {
  width: 100%;
  height: 100%;
}
</style>
