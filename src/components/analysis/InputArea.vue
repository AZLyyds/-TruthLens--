<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisResult } from '../../types/analysis'
import { renderAiMarkdown } from '../../utils/aiMarkdown.js'

const props = defineProps<{
  loading: boolean
  result?: AnalysisResult | null
}>()

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ analyze: [] }>()

const structuredReport = computed(() => {
  const r = props.result
  if (!r) return null

  const risk = String(r.riskLevel || '未判定')
  const score = Number(r.credibilityScore)
  const scoreText = Number.isNaN(score) ? '—' : `${Math.round(score)}`
  const title = String(r.meta?.newsTitle || '').trim() || '本次输入文本'
  const detailedText = String(r.detailedReport || '').trim()

  return {
    title,
    risk,
    scoreText,
    detailedText,
  }
})

const detailedReportHtml = computed(() => renderAiMarkdown(structuredReport.value?.detailedText || ''))
</script>

<template>
  <div class="in-col single-input-card">
    <div class="in-decor" aria-hidden="true">
      <svg class="in-decor-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="78" stroke="currentColor" stroke-width="1.2" opacity="0.25" />
        <circle cx="100" cy="100" r="52" stroke="currentColor" stroke-width="1" opacity="0.35" />
        <circle cx="100" cy="100" r="26" fill="currentColor" opacity="0.08" />
        <path
          d="M100 22 L118 88 L100 100 L82 88 Z"
          fill="currentColor"
          opacity="0.12"
        />
      </svg>
    </div>
    <div class="in-blobs" aria-hidden="true" />

    <section class="in-shell" aria-labelledby="single-input-title">
      <h2 id="single-input-title" class="in-title">输入</h2>
      <p class="in-hint">正文或 http(s) 链接</p>
      <textarea
        v-model="model"
        class="in-field"
        rows="4"
        placeholder="粘贴新闻内容，或粘贴可访问的链接"
        aria-labelledby="single-input-title"
        spellcheck="false"
      />
      <button type="button" class="in-btn" :disabled="loading || !model.trim()" @click="emit('analyze')">
        <span v-if="loading" class="in-spinner" aria-hidden="true" />
        {{ loading ? '分析中…' : '开始分析' }}
      </button>
    </section>

    <aside class="in-aside">
      <template v-if="structuredReport">
        <div class="in-report">
          <div class="in-report-head">
            <p class="in-aside-title">AI 总结报告</p>
            <span class="in-report-risk">{{ structuredReport.risk }}</span>
          </div>
          <p class="in-report-title" :title="structuredReport.title">{{ structuredReport.title }}</p>
          <p class="in-report-line">
            可信度评分：<strong>{{ structuredReport.scoreText }}</strong> / 100
          </p>
          <div
            v-if="structuredReport.detailedText"
            class="in-report-text in-report-md markdown-body"
            v-html="detailedReportHtml"
          />
          <p v-else class="in-report-text in-report-text--placeholder">
            该文本已完成结构化核验，建议结合关键证据点与执行建议进行复核处置。
          </p>
        </div>
      </template>
      <template v-else>
        <p class="in-aside-title">TruthLens</p>
        <ul class="in-aside-list">
          <li>多源信息抽取与交叉验证</li>
          <li>可信度与风险维度量化</li>
          <li>可追溯分析路径</li>
        </ul>
        <div class="in-aside-badge" aria-hidden="true">
          <span class="in-badge-dot" />
          <span class="in-badge-dot" />
          <span class="in-badge-dot" />
        </div>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.in-col {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 18px 16px 20px;
  border-radius: 16px;
  background:
    radial-gradient(ellipse 120% 90% at 100% 0%, rgba(185, 28, 28, 0.08), transparent 55%),
    radial-gradient(ellipse 90% 70% at 0% 100%, rgba(120, 8, 14, 0.06), transparent 50%),
    linear-gradient(168deg, #f5f6f8 0%, #ebecef 100%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 2px 12px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.in-col::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px);
  background-size: 13px 13px;
  pointer-events: none;
  opacity: 0.9;
}

.in-blobs {
  position: absolute;
  width: 200px;
  height: 200px;
  left: -80px;
  top: 40%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(185, 28, 28, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.in-decor {
  position: absolute;
  right: -24px;
  bottom: 8%;
  width: 140px;
  height: 140px;
  color: #b91c1c;
  opacity: 0.4;
  pointer-events: none;
  z-index: 0;
}

.in-decor-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.in-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(180%) blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 6px 20px rgba(0, 0, 0, 0.06);
}

.in-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.022em;
  color: #1d1d1f;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', sans-serif;
}

.in-hint {
  margin: 4px 0 10px;
  font-size: 13px;
  line-height: 1.35;
  color: #86868b;
}

.in-field {
  width: 100%;
  min-height: 100px;
  max-height: 180px;
  margin: 0;
  padding: 11px 13px;
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: -0.011em;
  color: #1d1d1f;
  background: #f5f5f7;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  resize: vertical;
  font-family: inherit;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.in-field::placeholder {
  color: #aeaeb2;
}

.in-field:hover {
  background: #f0f0f2;
}

.in-field:focus {
  outline: none;
  background: #fff;
  border-color: rgba(185, 28, 28, 0.45);
  box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.18);
}

.in-btn {
  margin-top: 12px;
  width: 100%;
  padding: 10px 16px;
  font-size: 15px;
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

.in-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.in-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.in-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.in-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  vertical-align: -2px;
  animation: in-spin 0.7s linear infinite;
}

@keyframes in-spin {
  to {
    transform: rotate(360deg);
  }
}

.in-aside {
  position: relative;
  z-index: 1;
  margin-top: auto;
  padding-top: 12px;
  max-height: min(72vh, 720px);
  min-height: 260px;
  overflow: auto;
  scrollbar-width: thin;
}

.in-report {
  padding: 12px 12px 10px;
  border-radius: 12px;
  border: 1px solid rgba(185, 28, 28, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(254, 242, 242, 0.9));
  box-shadow: 0 6px 18px rgba(185, 28, 28, 0.08);
}

.in-report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.in-report-risk {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #991b1b;
  background: rgba(185, 28, 28, 0.12);
}

.in-report-title {
  margin: 8px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.in-report-line {
  margin: 0 0 10px;
  font-size: 13px;
  color: #4b5563;
}

.in-report-line strong {
  font-weight: 700;
  color: #7f1d1d;
}

.in-report-text {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.62;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}

.in-report-md {
  margin-top: 4px;
  max-height: min(58vh, 560px);
  overflow-y: auto;
  padding-right: 4px;
  font-size: 15px;
  line-height: 1.72;
  color: #1f2937;
}

.in-report-md :deep(h1) {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 700;
  color: #7f1d1d;
  line-height: 1.35;
}

.in-report-md :deep(h2) {
  margin: 12px 0 6px;
  font-size: 1.02rem;
  font-weight: 700;
  color: #991b1b;
}

.in-report-md :deep(h3) {
  margin: 10px 0 5px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
}

.in-report-md :deep(p) {
  margin: 0 0 8px;
}

.in-report-md :deep(ul),
.in-report-md :deep(ol) {
  margin: 0 0 8px;
  padding-left: 1.2rem;
}

.in-report-md :deep(li) {
  margin: 0 0 5px;
}

.in-report-md :deep(strong) {
  color: #111827;
}

.in-report-text--placeholder {
  font-size: 13.5px;
  line-height: 1.68;
}

.in-aside-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #86868b;
}

.in-aside-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.in-aside-list li {
  position: relative;
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: #3a3a3c;
}

.in-aside-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: linear-gradient(180deg, #b91c1c, #fca5a5);
  box-shadow: 0 0 0 2px rgba(185, 28, 28, 0.15);
}

.in-aside-badge {
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.in-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c7c7cc;
  opacity: 0.6;
}

.in-badge-dot:nth-child(2) {
  opacity: 0.85;
  background: #b91c1c;
}
</style>
