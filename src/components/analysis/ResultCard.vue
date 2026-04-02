<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import type { AnalysisResult } from '../../types/analysis'
import RadarChart from './RadarChart.vue'

const EvidencePath = defineAsyncComponent(() => import('./EvidencePath.vue'))

const props = defineProps<{
  loading: boolean
  result: AnalysisResult | null
  error: string
  analyzedAt: string
  expanded: {
    core: boolean
    radar: boolean
    evidence: boolean
    details: boolean
  }
}>()

const emit = defineEmits<{
  toggle: [key: 'core' | 'radar' | 'evidence' | 'details']
  export: []
}>()

const steps = [
  { key: 'extract', icon: '🔍', title: '提取', text: '提取核心陈述与时间点' },
  { key: 'compare', icon: '⚖️', title: '比对', text: '比对权威媒体原始报道' },
  { key: 'verify', icon: '✅', title: '核验', text: '核验来源真实性与上下文' },
  { key: 'output', icon: '📤', title: '输出', text: '输出风险说明与传播建议' },
]

const displayTitle = computed(() => props.result?.meta?.newsTitle || '分析结果')
const displaySummary = computed(() => props.result?.meta?.newsSummary || props.result?.aiSummary || '')
const sourceLine = computed(() => [props.result?.meta?.sourceName, props.analyzedAt].filter(Boolean).join(' · '))
</script>

<template>
  <section class="card io-panel single-card single-result-card">
    <div class="single-result-header">
      <h2>输出（result）</h2>
      <button class="single-export-btn" :disabled="!result" @click="emit('export')">导出</button>
    </div>

    <div v-if="loading" class="single-skeleton" aria-live="polite" aria-busy="true">
      <div class="single-sk-line lg" />
      <div class="single-sk-line" />
      <div class="single-sk-line" />
      <div class="single-sk-grid">
        <div v-for="i in 4" :key="i" class="single-sk-box" />
      </div>
    </div>

    <p v-else-if="error" class="single-error">{{ error }}</p>
    <p v-else-if="!result" class="single-placeholder" v-once>点击「开始分析」后在此查看结果。</p>

    <div v-else class="single-fadein">
      <article class="single-collapse card-in is-core">
        <button class="single-collapse-trigger" @click="emit('toggle', 'core')">
          <span>核心结论</span>
          <span>{{ expanded.core ? '收起' : '展开' }}</span>
        </button>
        <div v-show="expanded.core" class="single-collapse-content">
          <h3 class="single-title">{{ displayTitle }}</h3>
          <p class="single-meta" v-if="sourceLine">{{ sourceLine }}</p>
          <p class="single-summary">{{ displaySummary }}</p>
          <div class="single-score">
            <div class="single-score-row">
              <span>可信度</span>
              <strong>{{ result.credibilityScore }}</strong>
            </div>
            <div class="single-score-row">
              <span>风险判断</span>
              <strong>{{ result.verdict }} · {{ result.riskLevel }}</strong>
            </div>
          </div>
        </div>
      </article>

      <article class="single-collapse card-in">
        <button class="single-collapse-trigger" @click="emit('toggle', 'radar')">
          <span>风险维度雷达</span>
          <span>{{ expanded.radar ? '收起' : '展开' }}</span>
        </button>
        <div v-show="expanded.radar" class="single-collapse-content">
          <RadarChart :dimensions="result.dimensions" />
        </div>
      </article>

      <article class="single-collapse card-in">
        <button class="single-collapse-trigger" @click="emit('toggle', 'evidence')">
          <span>证据路径</span>
          <span>{{ expanded.evidence ? '收起' : '展开' }}</span>
        </button>
        <div v-show="expanded.evidence" class="single-collapse-content">
          <EvidencePath :steps="steps" />
        </div>
      </article>

      <article class="single-collapse card-in">
        <button class="single-collapse-trigger" @click="emit('toggle', 'details')">
          <span>关键原因与建议</span>
          <span>{{ expanded.details ? '收起' : '展开' }}</span>
        </button>
        <div v-show="expanded.details" class="single-collapse-content single-detail">
          <p><b>关键原因：</b>{{ (result.reasons || []).join('；') || '暂无' }}</p>
          <p><b>建议：</b>{{ (result.suggestions || []).join('；') || '暂无' }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
