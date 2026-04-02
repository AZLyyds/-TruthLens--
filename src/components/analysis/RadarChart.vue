<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnalysisDimensions } from '../../types/analysis'

const props = defineProps<{ dimensions?: AnalysisDimensions }>()

const elRef = ref<HTMLDivElement | null>(null)
let chart: any = null

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
    tooltip: { trigger: 'item' },
    radar: {
      radius: 78,
      splitNumber: 4,
      axisName: { color: '#4E5969', fontSize: 12 },
      splitLine: { lineStyle: { color: '#C9CDD4' } },
      splitArea: { areaStyle: { color: ['#F7FAFF', '#F3F8FF', '#EFF6FF', '#EAF4FF'] } },
      axisLine: { lineStyle: { color: '#C9CDD4' } },
      indicator: [
        { name: '来源可信度', max: 100 },
        { name: '事实一致性', max: 100 },
        { name: '情绪煽动性', max: 100 },
        { name: '传播误导性', max: 100 },
      ],
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: values,
            areaStyle: { color: 'rgba(22,119,255,0.2)' },
            lineStyle: { color: '#1677FF', width: 2 },
            itemStyle: { color: '#1677FF' },
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
