<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { analyzeMulti } from '../api/analysis'

const router = useRouter()
const inputA = ref('')
const inputB = ref('')
const output = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')
const conflictsOpen = ref(true)
const hoveredRadarAxis = ref(-1)
const animatedRadar = ref([0, 0, 0, 0])
const radarAnimating = ref(false)

const isUrlInput = (value) => /^https?:\/\//i.test(String(value || '').trim())

const radarMeta = [
  { key: 'timeline', label: '时间线', icon: '⏱️', tip: '两篇文章在时间叙述与事件顺序上的一致程度' },
  { key: 'subject', label: '主体一致', icon: '👤', tip: '关键人物、机构等主体指称是否对齐' },
  { key: 'data', label: '数据一致', icon: '📊', tip: '比分、数字、统计等可量化信息是否一致' },
  { key: 'conclusion', label: '结论一致', icon: '📝', tip: '整体结论与叙事方向是否相容' },
]

/** 基于接口返回的 consistencyScore 与冲突数量推导四轴分数（不新增接口字段，与旧版「同源分数」逻辑一致） */
function deriveRadarScores(o) {
  if (!o || typeof o.consistencyScore !== 'number') {
    return [0, 0, 0, 0]
  }
  const base = Math.max(0, Math.min(100, Number(o.consistencyScore)))
  const n = Array.isArray(o.conflicts) ? o.conflicts.length : 0
  const timeline = Math.max(0, Math.min(100, base - Math.min(20, n * 4)))
  const subject = Math.max(0, Math.min(100, base - Math.min(15, n * 3)))
  const data = base
  const conclusion = Math.max(0, Math.min(100, base - Math.min(12, n * 2)))
  return [timeline, subject, data, conclusion]
}

const radarTarget = computed(() => deriveRadarScores(output.value))

const suggestionSteps = [
  {
    icon: '✅',
    title: '保留权威结论',
    desc: '优先采信高权威来源的核心判断，降低噪声叙事干扰。',
    sourceLine: '优先保留高权威来源结论',
  },
  {
    icon: '🔍',
    title: '追溯冲突来源',
    desc: '对冲突段落标注出处，回溯原文与上下文。',
    sourceLine: '标记冲突段落并追溯原出处',
  },
  {
    icon: '🔍',
    title: '人工复核校验',
    desc: '在关键分歧点触发人工复核，避免误传播。',
    sourceLine: '触发人工复核流程',
  },
  {
    icon: '🚨',
    title: '同步预警策略',
    desc: '将高风险结论同步至边缘端策略，便于联动处置。',
    sourceLine: '同步预警到边缘端策略',
  },
]

const consistencyBarTone = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 'mid'
  if (v <= 30) return 'low'
  if (v <= 60) return 'mid'
  return 'high'
})

const conclusionTone = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 'neutral'
  if (v < 40) return 'bad'
  if (v < 70) return 'warn'
  return 'good'
})

const authorityStars = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 3
  return Math.max(1, Math.min(5, Math.round(v / 20)))
})

const authorityBarPct = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 50
  return Math.max(0, Math.min(100, v))
})

/** 雷达图顶点：4 轴，从顶部顺时针 */
function radarPoints(values, scale = 1) {
  const cx = 100
  const cy = 100
  const r = 72
  const pts = []
  for (let k = 0; k < 4; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 2
    const t = (Number(values[k]) / 100) * scale
    const x = cx + r * t * Math.cos(angle)
    const y = cy + r * t * Math.sin(angle)
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

const radarPolygonPoints = computed(() => radarPoints(animatedRadar.value, 1))
const radarGridRings = [0.25, 0.5, 0.75, 1]

function runRadarAnimation(targets) {
  radarAnimating.value = true
  const start = animatedRadar.value.slice()
  const duration = 1000
  const t0 = performance.now()
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration)
    const ease = 1 - (1 - p) ** 3
    for (let i = 0; i < 4; i += 1) {
      animatedRadar.value[i] = Math.round(start[i] + (targets[i] - start[i]) * ease)
    }
    if (p < 1) requestAnimationFrame(tick)
    else {
      animatedRadar.value = targets.map((n) => Math.round(n))
      radarAnimating.value = false
    }
  }
  requestAnimationFrame(tick)
}

watch(
  () => output.value,
  (next) => {
    if (!next) {
      animatedRadar.value = [0, 0, 0, 0]
      return
    }
    const t = deriveRadarScores(next)
    runRadarAnimation(t)
  },
)

onMounted(() => {
  if (output.value) runRadarAnimation(deriveRadarScores(output.value))
})

const runCompare = async () => {
  if (!inputA.value.trim() || !inputB.value.trim()) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    const valueA = inputA.value.trim()
    const valueB = inputB.value.trim()
    output.value = await analyzeMulti({
      items: [
        isUrlInput(valueA) ? { url: valueA } : { text: valueA },
        isUrlInput(valueB) ? { url: valueB } : { text: valueB },
      ],
    })
  } catch (error) {
    errorMessage.value = error?.message || '一致性分析失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="page page-analysis multi-analysis">
    <main class="panel-layout multi-main">
      <section class="card io-panel multi-card-enter multi-hover-card" style="--delay: 0s">
        <h2>输入 1（text / URL）</h2>
        <textarea v-model="inputA" rows="4" placeholder="输入第一篇新闻文本或URL" />
        <h2>输入 2（text / URL）</h2>
        <textarea v-model="inputB" rows="4" placeholder="输入第二篇新闻文本或URL" />
        <button class="action-btn" :disabled="isLoading" @click="runCompare">
          {{ isLoading ? '分析中...' : '开始一致性分析' }}
        </button>
      </section>

      <section class="card io-panel multi-card-enter multi-hover-card multi-output-card" style="--delay: 0.15s">
        <h3>输出（output）</h3>
        <div v-if="errorMessage" class="multi-output-inner danger">{{ errorMessage }}</div>
        <div v-else-if="output" class="multi-output-inner multi-output-structured">
          <header class="multi-out-title">多源一致性分析结果</header>

          <section class="multi-conflict-block">
            <button type="button" class="multi-conflict-toggle" @click="conflictsOpen = !conflictsOpen">
              <span class="multi-tag conflict">冲突项</span>
              <span class="multi-chevron" :class="{ open: conflictsOpen }">▼</span>
            </button>
            <div v-show="conflictsOpen" class="multi-conflict-body">
              <p v-for="(line, idx) in output.conflicts || []" :key="idx">{{ line }}</p>
              <p v-if="!(output.conflicts || []).length" class="muted">暂无冲突项描述</p>
            </div>
          </section>

          <section class="multi-consistency-block">
            <div class="multi-big-num-row">
              <span class="multi-label">核心事实一致性</span>
              <strong class="multi-big-num">{{ Math.round(output.consistencyScore) }}%</strong>
            </div>
            <div class="multi-consistency-track">
              <i
                class="multi-consistency-fill"
                :class="consistencyBarTone"
                :style="{ width: `${Math.min(100, Math.max(0, output.consistencyScore))}%` }"
              />
            </div>
          </section>

          <section class="multi-authority-block">
            <span class="multi-label">来源权威性差异</span>
            <p class="multi-authority-text">{{ output.sourceAuthorityDiff }}</p>
            <div class="multi-stars" aria-hidden="true">
              <span v-for="n in 5" :key="n" class="star" :class="{ on: n <= authorityStars }">★</span>
            </div>
            <div class="multi-mini-track">
              <i
                class="multi-mini-fill"
                :class="consistencyBarTone"
                :style="{ width: `${authorityBarPct}%` }"
              />
            </div>
          </section>

          <section class="multi-conclusion-box" :class="conclusionTone">
            <span class="multi-label">结论</span>
            <p>{{ output.recommendation }}</p>
          </section>
        </div>
        <div v-else class="multi-output-inner placeholder">填写两条输入后点击按钮，查看多源一致性结果。</div>
      </section>
    </main>

    <section class="analysis-extra multi-extra">
      <article class="card block multi-card-enter multi-hover-card multi-radar-card" style="--delay: 0.3s">
        <h3>一致性雷达（示意）</h3>
        <div class="multi-radar-wrap">
          <div v-if="hoveredRadarAxis >= 0" class="multi-radar-tooltip">
            {{ radarMeta[hoveredRadarAxis].tip }}
          </div>
          <svg class="multi-radar-svg" viewBox="0 0 200 200" role="img" aria-label="一致性雷达图">
            <defs>
              <linearGradient id="multiRadarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fecaca" stop-opacity="0.55" />
                <stop offset="100%" stop-color="#f87171" stop-opacity="0.45" />
              </linearGradient>
              <filter id="multiRadarGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polygon
              v-for="(ring, ri) in radarGridRings"
              :key="ri"
              :points="`${100},${100 - 72 * ring} ${100 + 72 * ring},100 ${100},${100 + 72 * ring} ${100 - 72 * ring},100`"
              fill="none"
              stroke="#e7e5e4"
              stroke-width="0.9"
              opacity="0.95"
            />
            <polygon
              points="100,28 172,100 100,172 28,100"
              fill="none"
              stroke="#fca5a5"
              stroke-width="1.2"
              opacity="0.85"
            />
            <line
              v-for="(meta, idx) in radarMeta"
              :key="`ax-${meta.key}`"
              x1="100"
              y1="100"
              :x2="100 + 72 * Math.cos(-Math.PI / 2 + (idx * Math.PI) / 2)"
              :y2="100 + 72 * Math.sin(-Math.PI / 2 + (idx * Math.PI) / 2)"
              stroke="#fca5a5"
              :stroke-width="hoveredRadarAxis === idx ? 2.2 : 1"
              :opacity="hoveredRadarAxis === idx ? 1 : 0.4"
              class="multi-radar-axis-line"
            />
            <polygon
              :points="radarPolygonPoints"
              fill="url(#multiRadarFill)"
              stroke="#b91c1c"
              stroke-width="1.8"
              filter="url(#multiRadarGlow)"
              class="multi-radar-fill-poly"
            />
          </svg>
          <div
            v-for="(meta, idx) in radarMeta"
            :key="`lbl-${meta.key}`"
            class="multi-radar-label"
            :class="[`axis-${idx}`, { hover: hoveredRadarAxis === idx }]"
            @mouseenter="hoveredRadarAxis = idx"
            @mouseleave="hoveredRadarAxis = -1"
          >
            <span class="multi-radar-ico">{{ meta.icon }}</span>
            <span>{{ meta.label }}</span>
          </div>
        </div>
        <div class="multi-radar-scores">
          <div
            v-for="(meta, idx) in radarMeta"
            :key="`sc-${meta.key}`"
            class="multi-radar-score-chip"
            :class="{ active: hoveredRadarAxis === idx }"
            @mouseenter="hoveredRadarAxis = idx"
            @mouseleave="hoveredRadarAxis = -1"
          >
            <span>{{ meta.label }}</span>
            <strong>{{ animatedRadar[idx] }}%</strong>
          </div>
        </div>
        <p class="multi-radar-hint">（示意）四轴分数由核心一致性分数与冲突项数量推导展示</p>
      </article>

      <article class="card block multi-card-enter multi-hover-card multi-suggest-card" style="--delay: 0.45s">
        <h3>建议动作</h3>
        <div class="multi-suggest-flow">
          <div
            v-for="(step, idx) in suggestionSteps"
            :key="step.title"
            class="multi-suggest-step"
            :style="{ animationDelay: `${idx * 0.2}s` }"
          >
            <div class="multi-suggest-card-inner">
              <span class="multi-suggest-ico">{{ step.icon }}</span>
              <b>{{ step.title }}</b>
              <p>{{ step.desc }}</p>
              <span class="multi-suggest-src">{{ step.sourceLine }}</span>
            </div>
            <div v-if="idx < suggestionSteps.length - 1" class="multi-suggest-connector" aria-hidden="true" />
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
