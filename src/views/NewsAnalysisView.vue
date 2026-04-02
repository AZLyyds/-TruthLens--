<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { analyzeSingle } from '../api/analysis'
import AnalysisResultViz from '../components/AnalysisResultViz.vue'

const route = useRoute()
const router = useRouter()

const title = computed(() => route.query.title || '涉华新闻样例：国际平台出现争议性报道')
const newsId = computed(() => {
  const raw = route.query.newsId
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
})
const inputText = ref('')
const output = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')
const analyzedAt = ref('')

const evidenceSteps = [
  { key: 'extract', icon: '🔍', title: '提取', text: '提取核心陈述与时间点' },
  { key: 'compare', icon: '⚖️', title: '比对', text: '比对权威媒体原始报道' },
  { key: 'verify', icon: '✅', title: '核验', text: '核验来源真实性与上下文' },
  { key: 'output', icon: '📤', title: '输出', text: '输出风险说明与传播建议' },
]

const isUrlInput = (value) => /^https?:\/\//i.test(String(value || '').trim())

const displayTitle = computed(() => {
  const m = output.value?.meta
  if (m?.newsTitle) return m.newsTitle
  return '分析结果'
})

const displaySummary = computed(() => {
  const m = output.value?.meta
  return m?.newsSummary || output.value?.aiSummary || ''
})

const sourceLine = computed(() => {
  const m = output.value?.meta
  const parts = []
  if (m?.sourceName) parts.push(m.sourceName)
  if (analyzedAt.value) parts.push(analyzedAt.value)
  return parts.join(' · ')
})

const runAnalysis = async () => {
  if (!inputText.value.trim()) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    const value = inputText.value.trim()
    const payload = isUrlInput(value) ? { url: value } : { text: value }
    if (newsId.value != null) payload.newsId = newsId.value
    output.value = await analyzeSingle(payload)
    analyzedAt.value = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (error) {
    errorMessage.value = error?.message || '分析失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [route.query.title, route.query.newsId],
  () => {
    inputText.value = String(route.query.title || title.value || '')
  },
  { immediate: true },
)
</script>

<template>
  <div class="page page-analysis">
    <header class="analysis-header card">
      <button class="ghost-btn" @click="router.push('/portal')">返回新闻门户</button>
      <h1>单篇新闻分析</h1>
    </header>

    <main class="panel-layout analysis-top-row">
      <section class="card io-panel anim-up">
        <h2>输入（text / URL）</h2>
        <textarea
          v-model="inputText"
          placeholder="输入新闻正文或URL，系统将判断是否存在涉华风险与真实性疑点"
          rows="9"
        />
        <button class="action-btn" :disabled="isLoading" @click="runAnalysis">
          {{ isLoading ? '分析中...' : '开始分析' }}
        </button>
      </section>

      <section class="card io-panel anim-up delay-1 single-result-panel">
        <template v-if="errorMessage">
          <h3>提示</h3>
          <p class="single-result-panel__error">{{ errorMessage }}</p>
        </template>
        <template v-else-if="output">
          <header class="single-result-panel__head">
            <h3 class="single-result-panel__title">{{ displayTitle }}</h3>
            <p v-if="sourceLine" class="single-result-panel__meta">{{ sourceLine }}</p>
          </header>
          <p class="single-result-panel__summary">{{ displaySummary }}</p>
          <div class="single-result-panel__scores card-in">
            <div class="single-result-panel__score-row">
              <span>可信度</span>
              <strong>{{ output.credibilityScore }}</strong>
            </div>
            <div class="single-result-panel__score-row">
              <span>判断</span>
              <strong>{{ output.verdict }} · {{ output.riskLevel }}</strong>
            </div>
          </div>
          <AnalysisResultViz :result-json="output" />
          <div v-if="(output.reasons || []).length" class="single-result-panel__hints">
            <p><b>关键原因</b>：{{ (output.reasons || []).join('；') }}</p>
            <p><b>建议</b>：{{ (output.suggestions || []).join('；') }}</p>
          </div>
        </template>
        <template v-else>
          <h3>结果</h3>
          <p class="single-result-panel__placeholder">点击「开始分析」后在此查看标题、概括与可视化分析。</p>
        </template>
      </section>
    </main>

    <section class="analysis-extra analysis-bottom-row">
      <article class="card block anim-up">
        <h3>证据路径</h3>
        <ul class="timeline evidence-timeline">
          <li
            v-for="(step, idx) in evidenceSteps"
            :key="step.key"
            class="evidence-step"
            :style="{ animationDelay: `${idx * 0.2}s` }"
          >
            <span class="step-dot">{{ step.icon }}</span>
            <div class="step-content">
              <b>{{ step.title }}</b>
              <p>{{ step.text }}</p>
            </div>
          </li>
        </ul>
      </article>
      <article v-if="output?.dimensions" class="card block anim-up delay-1">
        <h3>辅助维度参考</h3>
        <div class="score-rows score-rows-advanced">
          <div v-for="(label, key) in { sourceCredibility: '来源可信度', factConsistency: '事实一致性', emotionManipulation: '情绪煽动性', propagationMisleading: '传播误导性' }" :key="key" class="score-item">
            <div class="score-topline">
              <span>{{ label }}</span>
              <b>{{ output.dimensions[key] ?? 0 }}</b>
            </div>
            <div class="score-track-wrap">
              <div class="score-track">
                <i class="score-fill low" :style="{ width: `${output.dimensions[key] || 0}%` }" />
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.single-result-panel__head {
  margin-bottom: 10px;
}

.single-result-panel__title {
  margin: 0 0 6px;
  font-size: 20px;
  line-height: 1.4;
  font-weight: 700;
  color: #0f172a;
}

.single-result-panel__meta {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.single-result-panel__summary {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.65;
  color: #334155;
}

.single-result-panel__scores {
  margin-bottom: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.single-result-panel__score-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
}

.single-result-panel__score-row strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.single-result-panel__hints {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}

.single-result-panel__hints p {
  margin: 0 0 8px;
}

.single-result-panel__error {
  color: #b91c1c;
  margin: 0;
  line-height: 1.5;
}

.single-result-panel__placeholder {
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.55;
}
</style>
