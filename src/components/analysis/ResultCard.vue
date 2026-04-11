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
}>()

const emit = defineEmits<{ export: [] }>()

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
  <section class="an-shell single-card single-result-card">
    <div class="an-top">
      <h2 class="an-top-title">输出</h2>
      <button type="button" class="an-export" :disabled="!result" @click="emit('export')">导出</button>
    </div>

    <div class="an-body">
      <div v-if="loading" class="an-scroll an-skeleton" aria-live="polite" aria-busy="true">
        <div class="an-sk an-sk-lg" />
        <div class="an-sk" />
        <div class="an-sk" />
        <div class="an-sk-grid">
          <div v-for="i in 4" :key="i" class="an-sk-box" />
        </div>
        <div class="an-sk-radar" />
      </div>

      <div v-else-if="error" class="an-scroll">
        <p class="an-error">{{ error }}</p>
      </div>

      <div v-else-if="!result" class="an-empty">
        <p class="an-empty-title">等待分析</p>
        <p class="an-empty-desc">在左侧输入正文或链接，点击「开始分析」后，结果将显示于此。</p>
      </div>

      <div v-else class="an-scroll an-enter">
        <section class="an-sheet">
          <p class="an-eyebrow">核心结论</p>
          <h3 class="an-hero-title" :title="displayTitle">{{ displayTitle }}</h3>
          <p v-if="sourceLine" class="an-meta">{{ sourceLine }}</p>
          <p class="an-lead" :title="displaySummary">{{ displaySummary }}</p>
          <div class="an-metrics">
            <div class="an-metric">
              <span class="an-metric-label">可信度</span>
              <span class="an-metric-value">{{ result.credibilityScore }}</span>
            </div>
            <div class="an-metric">
              <span class="an-metric-label">风险</span>
              <span class="an-metric-value an-metric-value--sub">{{ result.riskLevel }}</span>
              <span class="an-metric-hint">{{ result.verdict }}</span>
            </div>
          </div>
        </section>

        <section class="an-sheet">
          <p class="an-eyebrow">风险维度</p>
          <div class="an-radar-box">
            <RadarChart :dimensions="result.dimensions" />
          </div>
        </section>

        <section class="an-sheet an-sheet--flush an-sheet--last">
          <p class="an-eyebrow">证据路径</p>
          <!-- 原因与建议已并入各步骤展开面板，避免与证据路径脱节 -->
          <EvidencePath
            :steps="steps"
            :credibility-score="result.credibilityScore"
            :reasons="result.reasons"
            :suggestions="result.suggestions"
            :facts="result.facts"
            :dimensions="result.dimensions"
            :risk-level="result.riskLevel"
            :verdict="result.verdict"
          />
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.an-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 24px rgba(0, 0, 0, 0.06);
}

.an-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(16px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.an-top-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.022em;
  color: #1d1d1f;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', sans-serif;
}

.an-export {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  letter-spacing: -0.01em;
  color: #fff;
  background: #b91c1c;
  border: none;
  border-radius: 980px;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.15s ease;
}

.an-export:hover:not(:disabled) {
  opacity: 0.92;
}

.an-export:active:not(:disabled) {
  transform: scale(0.98);
}

.an-export:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.an-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.an-body > .an-empty {
  flex: 1 1 auto;
}

.an-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px 12px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.an-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.an-enter {
  animation: an-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes an-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.an-sheet {
  background: #fff;
  border-radius: 10px;
  padding: 11px 12px 12px;
  margin-bottom: 8px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.an-sheet--flush {
  padding-bottom: 10px;
}

.an-sheet--last {
  margin-bottom: 0;
}

.an-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #86868b;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', sans-serif;
}

.an-hero-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.28;
  letter-spacing: -0.024em;
  color: #1d1d1f;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'PingFang SC', sans-serif;
}

.an-meta {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.4;
  color: #86868b;
  font-variant-numeric: tabular-nums;
}

.an-lead {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: -0.011em;
  color: #424245;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.an-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.an-metric {
  padding: 10px 10px 8px;
  border-radius: 8px;
  background: #f5f5f7;
}

.an-metric-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #86868b;
  margin-bottom: 4px;
}

.an-metric-value {
  display: block;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #1d1d1f;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.an-metric-value--sub {
  font-size: 17px;
}

.an-metric-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #6e6e73;
  line-height: 1.35;
}

.an-radar-box {
  display: flex;
  justify-content: center;
  margin: 2px 0 0;
  max-height: 200px;
}

@media (max-width: 640px) {
  .an-metrics {
    grid-template-columns: 1fr;
  }
}

.an-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 36px 24px 40px;
  margin: 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px dashed rgba(0, 0, 0, 0.08);
}

.an-empty-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #1d1d1f;
}

.an-empty-desc {
  margin: 0;
  max-width: 280px;
  font-size: 14px;
  line-height: 1.5;
  color: #86868b;
}

.an-error {
  margin: 0;
  padding: 16px;
  border-radius: 10px;
  background: #fff2f2;
  border: 1px solid rgba(255, 59, 48, 0.2);
  color: #c41e12;
  font-size: 14px;
  line-height: 1.5;
}

.an-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.an-sk {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ececee 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: an-shimmer 1.2s ease-in-out infinite;
}

.an-sk-lg {
  width: 55%;
  height: 20px;
}

.an-sk-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.an-sk-box {
  height: 56px;
  border-radius: 10px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ececee 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: an-shimmer 1.2s ease-in-out infinite;
}

.an-sk-radar {
  height: 200px;
  border-radius: 12px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ececee 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: an-shimmer 1.2s ease-in-out infinite;
}

@keyframes an-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
