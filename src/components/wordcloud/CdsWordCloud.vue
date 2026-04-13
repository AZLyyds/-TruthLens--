<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import cloud from 'd3-cloud'

type Word = {
  text: string
  size: number
}

const props = defineProps<{
  words: Word[]
  selected?: string
  // 视觉大小上限：避免太挤导致渲染耗时
  maxWords?: number
}>()

const emit = defineEmits<{
  (e: 'select', text: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgW = ref(600)
const svgH = ref(260)

type LayoutWord = {
  text: string
  size: number
  x: number
  y: number
  rotate: number
}

const layoutWords = ref<LayoutWord[]>([])
let layout: any = null
let resizeObserver: ResizeObserver | null = null

const safeWords = computed(() => {
  const src = Array.isArray(props.words) ? props.words : []
  const maxWords = props.maxWords ?? 60
  // d3-cloud 词太多会比较慢，所以这里做硬截断
  return src
    .filter((w) => w?.text)
    .slice(0, maxWords)
})

const wordsKey = computed(() => {
  // 用稳定的 key 判断是否真的“词集合/权重”变化，避免父组件重渲染触发无意义重算
  return safeWords.value.map((w) => `${w.text}:${w.size}`).join('|')
})

const fontFamily =
  "'Source Han Sans SC', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Segoe UI', sans-serif"

const PALETTE = ['#b91c1c', '#b45309', '#15803d', '#9a3412', '#166534', '#7f1d1d']

const wordColor = (text: string, size: number) => {
  const selected = props.selected && props.selected === text
  if (selected) return '#b91c1c'
  const s = Math.max(12, Math.min(42, size))
  // 高频偏红，中频偏橙，低频偏绿，整体低饱和
  const t = (s - 12) / (42 - 12)
  if (t > 0.68) {
    const r = Math.round(142 + (t - 0.68) * 120)
    const g = Math.round(32 + (1 - t) * 42)
    const b = Math.round(32 + (1 - t) * 38)
    return `rgb(${Math.min(185, r)},${Math.min(74, g)},${Math.min(74, b)})`
  }
  if (t > 0.38) {
    const r = Math.round(148 + (t - 0.38) * 56)
    const g = Math.round(74 + (1 - t) * 28)
    const b = Math.round(9 + (1 - t) * 18)
    return `rgb(${Math.min(184, r)},${Math.min(122, g)},${Math.min(55, b)})`
  }
  const h = hashString(text)
  return PALETTE[h % PALETTE.length]
}

const selectedWord = computed(() => props.selected || '')

const fontSizeFor = (size: number) => Math.max(12, Math.min(42, size + 1))

const wordOpacityFor = (size: number) => {
  // 让小词更淡，提升艺术感与层次
  const s = Math.max(12, Math.min(42, size))
  return 0.82 + ((s - 12) / (42 - 12)) * 0.18
}

const strokeWidthFor = (size: number) => {
  const s = Math.max(12, Math.min(42, size))
  // 描边随字号略微变化
  return 0.7 + ((s - 12) / (42 - 12)) * 0.6
}

const fontWeightFor = (size: number) => {
  const s = Math.max(12, Math.min(42, size))
  // 大词更粗
  return 620 + Math.round(((s - 12) / (42 - 12)) * 180)
}

function hashString(input: string) {
  // 简单稳定 hash，用于构造 seed（不追求加密强度）
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const buildLayout = () => {
  const w = Math.max(240, Math.floor(svgW.value))
  const h = Math.max(120, Math.floor(svgH.value))
  const wordItems = safeWords.value.map((d) => ({
    text: d.text,
    size: d.size,
  }))

  if (!wordItems.length) {
    layoutWords.value = []
    return
  }

  const seed = hashString(wordsKey.value)

  // 清理上一次布局任务
  layout?.stop?.()
  layout = cloud()
    .size([w, h])
    .words(wordItems)
    .padding(6)
    // 使用可重复的随机数，避免重排导致词云“抽搐”
    .random(mulberry32(seed))
    .rotate((d: any) => {
      // 旋转也用文本决定，让同一个词在同一次 seed 下固定角度
      const t = hashString(String(d.text))
      const choices = [0, 0, -24, 0, 24]
      return choices[(t + seed) % choices.length]
    })
    .font(fontFamily)
    .fontSize((d: any) => {
      const s = Number(d.size || 12)
      // 控制字体大小范围
      return Math.max(12, Math.min(42, s + 1))
    })
    .spiral('archimedean')
    .on('end', (out: any[]) => {
      layoutWords.value = out.map((d) => ({
        text: d.text,
        size: d.size,
        x: d.x,
        y: d.y,
        rotate: d.rotate || 0,
      }))
    })

  layout.start()
}

const onSelect = (text: string) => {
  emit('select', text)
}

let resizeDebounce: number | undefined

onMounted(() => {
  if (!containerRef.value) return

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const cr = entry.contentRect
    if (!cr) return
    const nextW = Math.max(240, Math.floor(cr.width))
    const nextH = Math.max(120, Math.floor(cr.height))

    // 避免 ResizeObserver 在相同尺寸下频繁触发导致重排
    if (Math.abs(nextW - svgW.value) < 2 && Math.abs(nextH - svgH.value) < 2) return

    svgW.value = nextW
    svgH.value = nextH
  })

  resizeObserver.observe(containerRef.value)
})

watch(
  () => [wordsKey.value, svgW.value, svgH.value],
  () => {
    // 防止首次尺寸抖动/父组件频繁渲染时多次重算
    window.clearTimeout(resizeDebounce)
    resizeDebounce = window.setTimeout(() => {
      if (svgW.value > 0 && svgH.value > 0) buildLayout()
    }, 150)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  layout?.stop?.()
  layout = null
  resizeObserver?.disconnect()
  window.clearTimeout(resizeDebounce)
  resizeDebounce = undefined
  resizeObserver = null
})

const ariaLabel = computed(() => {
  const count = safeWords.value.length
  return `词云（${count} 个词）`
})
</script>

<template>
  <div ref="containerRef" class="cds-wordcloud" role="img" :aria-label="ariaLabel">
    <svg
      v-if="layoutWords.length"
      :width="'100%'"
      :height="'100%'"
      :viewBox="`0 0 ${svgW} ${svgH}`"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style="display: block; overflow: hidden"
    >
      <defs>
        <filter id="tl-wc-shadow" x="-35%" y="-35%" width="170%" height="170%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.2" />
          <feDropShadow dx="0" dy="0" stdDeviation="0.5" flood-color="#ffffff" flood-opacity="0.35" />
        </filter>
        <linearGradient id="tl-wc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(254, 242, 242, 0.5)" />
          <stop offset="100%" stop-color="rgba(255, 255, 255, 0.2)" />
        </linearGradient>
      </defs>
      <rect :width="svgW" :height="svgH" x="0" y="0" fill="url(#tl-wc-bg)" opacity="0.9" />
      <g :transform="`translate(${svgW / 2}, ${svgH / 2})`">
        <text
          v-for="w in layoutWords"
          :key="w.text"
          :transform="`translate(${w.x}, ${w.y}) rotate(${w.rotate})`"
          :text-anchor="'middle'"
          :dominant-baseline="'middle'"
          :fill="wordColor(w.text, w.size)"
          :font-family="fontFamily"
          :font-size="fontSizeFor(w.size)"
          :font-weight="fontWeightFor(w.size)"
          :opacity="wordOpacityFor(w.size)"
          :stroke="w.text === selectedWord ? 'rgba(248,113,113,0.95)' : 'rgba(255,255,255,0.85)'"
          :stroke-width="strokeWidthFor(w.size)"
          paint-order="stroke fill"
          filter="url(#tl-wc-shadow)"
          :style="{ cursor: 'pointer', userSelect: 'none' }"
          @click="onSelect(w.text)"
        >
          {{ w.text }}
        </text>
      </g>
    </svg>
    <div v-else class="cds-wordcloud-empty" aria-hidden="true" />
  </div>
</template>

<style scoped>
.cds-wordcloud {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.cds-wordcloud-empty {
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>

