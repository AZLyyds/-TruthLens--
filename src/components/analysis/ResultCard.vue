<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import type { AnalysisResult } from '../../types/analysis'
import { scoreToTier, tierClassSuffix, tierLabel } from '../../utils/scoreTier'
import { FAKE_SCORE_BETA, FAKE_SCORE_FEATURE_LABELS, FAKE_SCORE_FEATURE_ORDER } from '../../constants/fakeScoreModelExplain'
import { renderAiMarkdown } from '../../utils/aiMarkdown.js'
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

const fakeScoreDetailOpen = ref(false)
const credDetailOpen = ref(false)
const fsModel = computed(() => props.result?.truthLensFakeScoreModel ?? null)

const aiReportHtml = computed(() =>
  renderAiMarkdown(String(props.result?.detailedReport || '').trim()),
)
const hasAiReport = computed(() => {
  const t = String(props.result?.detailedReport || '').trim()
  return Boolean(t && t !== '—')
})

function fmt01(v: unknown) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toFixed(3)
}

function fmt4(v: unknown) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toFixed(4)
}

function fmtTime(iso: string | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtSignalPct(v: unknown) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`
}

function setModalScrollLock(on: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('tl-modal-open', on)
}

watch([fakeScoreDetailOpen, credDetailOpen], ([a, b]) => setModalScrollLock(Boolean(a || b)))

onBeforeUnmount(() => {
  setModalScrollLock(false)
})

const credTierSuffix = computed(() =>
  props.result
    ? tierClassSuffix(scoreToTier(props.result.credibilityScore, 'credibility'), 'credibility')
    : 'cred-mid',
)
const credTierHint = computed(() =>
  props.result ? tierLabel(scoreToTier(props.result.credibilityScore, 'credibility'), 'credibility') : '',
)

const fakeFormulaTierSuffix = computed(() =>
  props.result?.formulaFakeScore == null
    ? 'fake-mid'
    : tierClassSuffix(scoreToTier(props.result.formulaFakeScore, 'fake'), 'fake'),
)
const fakeFormulaTierHint = computed(() =>
  props.result?.formulaFakeScore == null
    ? ''
    : tierLabel(scoreToTier(props.result.formulaFakeScore, 'fake'), 'fake'),
)

const riskLevelTone = computed(() => {
  const r = String(props.result?.riskLevel || '').toLowerCase()
  if (r.includes('高') || r === 'high') return 'risk-high'
  if (r.includes('中') || r === 'medium' || r === 'mid') return 'risk-mid'
  if (r.includes('低') || r === 'low') return 'risk-low'
  return 'risk-mid'
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="fakeScoreDetailOpen && result?.formulaFakeScore != null"
      class="an-fs-overlay"
      role="presentation"
      @click.self="fakeScoreDetailOpen = false"
    >
      <div
        class="an-fs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="an-fs-title"
        tabindex="-1"
        @click.stop
        @keyup.escape="fakeScoreDetailOpen = false"
      >
        <div class="an-fs-modal-head">
          <div>
            <p class="an-fs-kicker">TruthLens · 阅读提示</p>
            <h2 id="an-fs-title" class="an-fs-title">虚假风险参考分是什么？</h2>
          </div>
          <button type="button" class="an-fs-close" aria-label="关闭" @click="fakeScoreDetailOpen = false">×</button>
        </div>

        <div class="an-fs-hero">
          <div class="an-fs-hero-score">
            <span class="an-fs-hero-num">{{ Number(result.formulaFakeScore).toFixed(4) }}</span>
            <span class="an-fs-hero-unit">/ 100</span>
          </div>
          <p class="an-fs-hero-hint">
            分数在 0～100 之间，<strong>越高</strong>表示模型越建议您在分享前多核对来源与事实；可与下方的「可信度」对照阅读。
          </p>
        </div>

        <div class="an-fs-kpis" v-if="fsModel">
          <div class="an-fs-kpi">
            <span class="an-fs-kpi-k">风险比例</span>
            <span class="an-fs-kpi-v">{{ fmt4(fsModel.pFake) }}</span>
            <span class="an-fs-kpi-d">与上方总分 /100 对应，便于对照</span>
          </div>
          <div class="an-fs-kpi">
            <span class="an-fs-kpi-k">加权信号</span>
            <span class="an-fs-kpi-v">{{ fmt4(fsModel.f) }}</span>
            <span class="an-fs-kpi-d">各维度信号按重要性相加的中间值</span>
          </div>
          <div class="an-fs-kpi an-fs-kpi--wide">
            <span class="an-fs-kpi-k">更新时间</span>
            <span class="an-fs-kpi-v an-fs-kpi-v--sm">{{ fmtTime(fsModel.computedAt) }}</span>
          </div>
        </div>
        <p v-else class="an-fs-muted">
          若未看到下方各维度明细，说明本轮只返回了总分。可稍后重新分析一次，以获取完整的分项说明。
        </p>

        <section class="an-fs-section an-fs-section--callout">
          <h3 class="an-fs-h3">读表小提示</h3>
          <ul class="an-fs-list an-fs-list--tight">
            <li>
              <strong>「本条信号」</strong>：只针对<strong>当前这条内容</strong>，表示模型在来源、措辞、传播特征等方面读到的<strong>警惕程度</strong>，用百分比展示，<strong>每条稿件不同</strong>。
            </li>
            <li>
              <strong>「重要性份量」</strong>：表示各维度在综合分里的大致占比，<strong>全站统一</strong>，方便横向对比；<strong>不是本条信号的数值</strong>。
            </li>
            <li>
              <strong>总分怎么来</strong>：先把「本条信号」与「重要性份量」按规则做加权，再换算成 0～100 的参考分。您只需关注<strong>总分高低</strong>与<strong>哪几条信号偏高</strong>即可。
            </li>
          </ul>
        </section>

        <section class="an-fs-section">
          <h3 class="an-fs-h3">可以怎么用</h3>
          <ul class="an-fs-list">
            <li>把它当作<strong>阅读提醒</strong>：高分时优先核对原始出处、时间线与多方报道。</li>
            <li>与页面上的<strong>可信度</strong>、事实要点一起看；若结论不一致，以您亲自核实为准。</li>
          </ul>
        </section>

        <details class="an-fs-details">
          <summary class="an-fs-details-sum">展开查看：各维度重要性份量（全站统一）</summary>
          <div class="an-fs-table-wrap an-fs-table-wrap--beta">
            <table class="an-fs-table">
              <thead>
                <tr>
                  <th scope="col">维度</th>
                  <th scope="col">份量（0–1）</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="key in FAKE_SCORE_FEATURE_ORDER" :key="'b-' + key">
                  <th scope="row">{{ FAKE_SCORE_FEATURE_LABELS[key] }}</th>
                  <td>{{ FAKE_SCORE_BETA[key]?.toFixed(2) ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        <section v-if="fsModel?.features && typeof fsModel.features === 'object'" class="an-fs-section">
          <h3 class="an-fs-h3">本条各维度信号</h3>
          <p class="an-fs-table-lead">百分比越高，越建议您对该角度<strong>多留一个心眼</strong>。</p>
          <div class="an-fs-table-wrap">
            <table class="an-fs-table">
              <thead>
                <tr>
                  <th scope="col">维度</th>
                  <th scope="col">信号强度</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="key in FAKE_SCORE_FEATURE_ORDER" :key="key">
                  <th scope="row">{{ FAKE_SCORE_FEATURE_LABELS[key] }}</th>
                  <td>{{ fmtSignalPct(fsModel.features?.[key]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p class="an-fs-disclaimer">
          本分数由模型生成，仅供辅助阅读，不构成对事实真假的法律或学术认定；涉及转发、报道或研判请以权威信源与人工核实为准。
        </p>

        <div class="an-fs-actions">
          <button type="button" class="an-fs-btn" @click="fakeScoreDetailOpen = false">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="credDetailOpen && result"
      class="an-fs-overlay an-cred-overlay"
      role="presentation"
      @click.self="credDetailOpen = false"
    >
      <div
        class="an-fs-modal an-cred-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="an-cred-title"
        tabindex="-1"
        @click.stop
        @keyup.escape="credDetailOpen = false"
      >
        <div class="an-fs-modal-head">
          <div>
            <p class="an-cred-kicker">TruthLens · 阅读提示</p>
            <h2 id="an-cred-title" class="an-fs-title">可信度是怎么来的？</h2>
          </div>
          <button type="button" class="an-fs-close" aria-label="关闭" @click="credDetailOpen = false">×</button>
        </div>

        <div class="an-cred-hero">
          <div class="an-cred-hero-score">
            <span class="an-cred-hero-num">{{ result.credibilityScore ?? '—' }}</span>
            <span class="an-fs-hero-unit">/ 100</span>
            <span v-if="credTierHint" class="an-tier-pill">{{ credTierHint }}</span>
          </div>
          <p class="an-cred-hero-hint">
            分数<strong>越高</strong>表示模型越倾向于认为该内容<strong>整体更可信</strong>；它与「虚假风险参考分」独立计算，可能不完全一致，请交叉阅读。
          </p>
        </div>

        <section class="an-fs-section">
          <h3 class="an-fs-h3">计算思路（通俗版）</h3>
          <ul class="an-fs-list">
            <li>综合<strong>来源可靠性</strong>、<strong>事实陈述一致性</strong>，并对<strong>情绪煽动</strong>与<strong>传播误导倾向</strong>做惩罚性扣分。</li>
            <li>下方「可信度构成」雷达里，<strong>情绪克制 / 传播克制</strong>已将原始指标换算为「越高越好」，便于一眼读懂。</li>
            <li>本分数为模型辅助判断，不替代您对原文与出处的独立核实。</li>
          </ul>
        </section>

        <p class="an-fs-disclaimer an-cred-disclaimer">
          若您发现与事实不符，请以权威信源与人工核验为准。
        </p>

        <div class="an-fs-actions">
          <button type="button" class="an-fs-btn an-cred-btn" @click="credDetailOpen = false">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>

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
          <div class="an-metrics an-metrics--fs">
            <button
              v-if="result.formulaFakeScore != null"
              type="button"
              class="an-fs-trigger an-score-tier"
              :class="'an-score-tier--' + fakeFormulaTierSuffix"
              @click="fakeScoreDetailOpen = true"
            >
              <span class="an-metric-label">虚假风险参考分 · 点击查看说明</span>
              <span class="an-fs-trigger-row">
                <span class="an-metric-value an-metric-value--hero-fake">{{
                  Number(result.formulaFakeScore).toFixed(4)
                }}</span>
                <span class="an-metric-hint">/ 100</span>
                <span class="an-tier-pill">{{ fakeFormulaTierHint }}</span>
                <span class="an-fs-chev" aria-hidden="true">›</span>
              </span>
              <span class="an-fs-trigger-sub">多维度信号综合 · 可与可信度对照阅读</span>
            </button>
            <button
              type="button"
              class="an-cred-trigger an-metric an-score-tier"
              :class="'an-score-tier--' + credTierSuffix"
              @click="credDetailOpen = true"
            >
              <span class="an-metric-label">可信度 · 点击查看说明</span>
              <span class="an-cred-trigger-row">
                <span class="an-metric-value an-metric-value--hero-cred">{{ result.credibilityScore }}</span>
                <span class="an-tier-pill an-tier-pill--compact">{{ credTierHint }}</span>
                <span class="an-fs-chev" aria-hidden="true">›</span>
              </span>
              <span class="an-cred-trigger-sub">与虚假风险分独立 · 可对照雷达</span>
            </button>
            <div class="an-metric" :class="riskLevelTone">
              <span class="an-metric-label">风险</span>
              <span class="an-metric-value an-metric-value--sub">{{ result.riskLevel }}</span>
              <span class="an-metric-hint">{{ result.verdict }}</span>
            </div>
          </div>
        </section>

        <section class="an-sheet">
          <p class="an-eyebrow">维度雷达</p>
          <p class="an-radar-lead">左：虚假风险信号（越高越需警惕）· 右：可信度构成（越高越好）</p>
          <div class="an-radar-grid">
            <div class="an-radar-card">
              <p class="an-radar-cap">虚假风险</p>
              <RadarChart :dimensions="result.dimensions" :features="fsModel?.features ?? null" variant="fake" />
            </div>
            <div class="an-radar-card">
              <p class="an-radar-cap">可信度构成</p>
              <RadarChart :dimensions="result.dimensions" variant="credibility" />
            </div>
          </div>
        </section>

        <section class="an-sheet an-sheet--flush">
          <p class="an-eyebrow">证据路径</p>
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

        <section v-if="hasAiReport" class="an-sheet an-sheet--ai an-sheet--last">
          <p class="an-eyebrow">AI 总结报告</p>
          <div class="an-ai-report markdown-body" v-html="aiReportHtml" />
        </section>
        <section v-else-if="result" class="an-sheet an-sheet--ai an-sheet--last">
          <p class="an-eyebrow">AI 总结报告</p>
          <p class="an-ai-placeholder">本轮未生成长文总结，请结合上方结论与证据路径阅读。</p>
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
  padding: 10px 14px 14px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  -ms-overflow-style: auto;
}

.an-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
  display: block;
}

.an-scroll::-webkit-scrollbar-thumb {
  background: rgba(120, 113, 108, 0.45);
  border-radius: 999px;
}

.an-scroll::-webkit-scrollbar-track {
  background: transparent;
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

.an-metrics--fs .an-fs-trigger {
  grid-column: 1 / -1;
}

.an-fs-trigger {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 12px 10px;
  border-radius: 10px;
  border: 1px solid rgba(185, 28, 28, 0.22);
  background: linear-gradient(145deg, #fffafa 0%, #fff 55%);
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
  font: inherit;
  color: inherit;
}

.an-fs-trigger:hover {
  border-color: rgba(185, 28, 28, 0.42);
  box-shadow: 0 4px 14px rgba(185, 28, 28, 0.08);
}

.an-fs-trigger:focus-visible {
  outline: 2px solid #b91c1c;
  outline-offset: 2px;
}

.an-fs-trigger:active {
  transform: scale(0.995);
}

.an-fs-trigger-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.an-fs-chev {
  margin-left: auto;
  font-size: 20px;
  font-weight: 300;
  color: #b91c1c;
  line-height: 1;
}

.an-fs-trigger-sub {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #86868b;
  line-height: 1.35;
}

.an-fs-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
}

.an-fs-modal {
  width: min(760px, 100%);
  max-height: min(90vh, 860px);
  overflow-y: auto;
  border-radius: 18px;
  background: linear-gradient(165deg, #ffffff 0%, #fafbfc 100%);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 24px 64px rgba(15, 23, 42, 0.2);
  padding: 22px 24px 20px;
}

.an-cred-overlay {
  z-index: 12001;
}

.an-cred-modal .an-fs-title {
  color: #14532d;
}

.an-cred-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #15803d;
}

.an-cred-hero {
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(120deg, #f0fdf4, #fff);
  border: 1px solid #bbf7d0;
  margin-bottom: 16px;
}

.an-cred-hero-score {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.an-cred-hero-num {
  font-size: 36px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #166534;
  letter-spacing: -0.03em;
}

.an-cred-hero-hint {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: #3f6212;
}

.an-cred-disclaimer {
  color: #64748b;
  font-size: 12px;
}

.an-cred-btn {
  background: linear-gradient(165deg, #15803d, #22c55e) !important;
}

.an-cred-trigger {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 12px 10px;
  border-radius: 10px;
  border: 1px solid rgba(22, 163, 74, 0.22);
  background: linear-gradient(145deg, #f0fdf4 0%, #fff 55%);
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
  font: inherit;
  color: inherit;
}

.an-cred-trigger:hover {
  border-color: rgba(22, 163, 74, 0.45);
  box-shadow: 0 4px 14px rgba(22, 163, 74, 0.1);
}

.an-cred-trigger:focus-visible {
  outline: 2px solid #15803d;
  outline-offset: 2px;
}

.an-cred-trigger:active {
  transform: scale(0.995);
}

.an-cred-trigger-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.an-cred-trigger-sub {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #86868b;
  line-height: 1.35;
}

.an-fs-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.an-fs-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b91c1c;
}

.an-fs-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
  line-height: 1.25;
}

.an-fs-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.an-fs-close:hover {
  background: #e2e8f0;
}

.an-fs-hero {
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(120deg, #fef2f2, #fff);
  border: 1px solid #fecaca;
  margin-bottom: 14px;
}

.an-fs-hero-score {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.an-fs-hero-num {
  font-size: 36px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #991b1b;
  letter-spacing: -0.03em;
}

.an-fs-hero-unit {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 600;
}

.an-fs-hero-hint {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: #475569;
}

.an-fs-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.an-fs-kpi {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.an-fs-kpi--wide {
  grid-column: 1 / -1;
}

.an-fs-kpi-k {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 4px;
}

.an-fs-kpi-v {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.an-fs-kpi-v--sm {
  font-size: 14px;
  font-weight: 600;
}

.an-fs-kpi-d {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
  color: #94a3b8;
  line-height: 1.35;
}

.an-fs-section {
  margin-bottom: 14px;
}

.an-fs-h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.an-fs-list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 14.5px;
  line-height: 1.58;
  color: #334155;
}

.an-fs-list li {
  margin-bottom: 6px;
}

.an-fs-table-wrap {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.an-fs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.an-fs-table th,
.an-fs-table td {
  padding: 7px 10px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.an-fs-table thead th {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #f8fafc;
}

.an-fs-table tbody th {
  font-weight: 500;
  color: #334155;
  width: 58%;
}

.an-fs-table tbody td {
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.an-fs-disclaimer {
  margin: 0 0 12px;
  font-size: 11px;
  line-height: 1.45;
  color: #94a3b8;
}

.an-fs-actions {
  display: flex;
  justify-content: flex-end;
}

.an-fs-btn {
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: #b91c1c;
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.an-fs-btn:hover {
  filter: brightness(1.05);
}

.an-fs-muted {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}

.an-fs-section--callout {
  padding: 12px 14px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.an-fs-section--callout .an-fs-h3 {
  color: #92400e;
  font-size: 14px;
}

.an-fs-list--tight li {
  margin-bottom: 8px;
}

.an-fs-code {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #0f172a;
}

.an-fs-details {
  margin: 0 0 14px;
  font-size: 13px;
  color: #334155;
}

.an-fs-details-sum {
  cursor: pointer;
  font-weight: 600;
  color: #b91c1c;
  padding: 8px 0;
  list-style: none;
}

.an-fs-details-sum::-webkit-details-marker {
  display: none;
}

.an-fs-details[open] .an-fs-details-sum {
  margin-bottom: 8px;
}

.an-fs-table-wrap--beta {
  margin-top: 6px;
}

.an-fs-table-lead {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
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

.an-metric.risk-high .an-metric-value--sub {
  color: #b91c1c;
}
.an-metric.risk-mid .an-metric-value--sub {
  color: #b45309;
}
.an-metric.risk-low .an-metric-value--sub {
  color: #15803d;
}

.an-metric-row-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.an-metric-value--hero-cred {
  font-size: clamp(1.65rem, 3.5vw, 2.25rem);
  font-weight: 800;
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
}

.an-metric-value--hero-fake {
  font-size: clamp(1.45rem, 3vw, 1.95rem);
  font-weight: 800;
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
}

.an-tier-pill {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: #475569;
}

.an-tier-pill--compact {
  font-size: 10px;
  padding: 2px 7px;
}

.an-score-tier.an-score-tier--cred-low {
  background: var(--score-tier-good-bg);
  border: 1px solid rgba(22, 163, 74, 0.28);
}
.an-score-tier.an-score-tier--cred-low .an-metric-value--hero-cred {
  color: var(--score-tier-good);
}

.an-score-tier.an-score-tier--cred-mid {
  background: var(--score-tier-mid-bg);
  border: 1px solid rgba(180, 83, 9, 0.28);
}
.an-score-tier.an-score-tier--cred-mid .an-metric-value--hero-cred {
  color: var(--score-tier-mid);
}

.an-score-tier.an-score-tier--cred-high {
  background: var(--score-tier-bad-bg);
  border: 1px solid rgba(185, 28, 28, 0.28);
}
.an-score-tier.an-score-tier--cred-high .an-metric-value--hero-cred {
  color: var(--score-tier-bad);
}

.an-fs-trigger.an-score-tier--fake-low {
  border-color: rgba(22, 163, 74, 0.35);
  background: linear-gradient(145deg, var(--score-tier-good-bg) 0%, #fff 60%);
}
.an-fs-trigger.an-score-tier--fake-low .an-metric-value--hero-fake {
  color: var(--score-tier-good);
}

.an-fs-trigger.an-score-tier--fake-mid {
  border-color: rgba(180, 83, 9, 0.4);
  background: linear-gradient(145deg, var(--score-tier-mid-bg) 0%, #fff 55%);
}
.an-fs-trigger.an-score-tier--fake-mid .an-metric-value--hero-fake {
  color: var(--score-tier-mid);
}

.an-fs-trigger.an-score-tier--fake-high {
  border-color: rgba(185, 28, 28, 0.45);
  background: linear-gradient(145deg, var(--score-tier-bad-bg) 0%, #fff 50%);
}
.an-fs-trigger.an-score-tier--fake-high .an-metric-value--hero-fake {
  color: var(--score-tier-bad);
}

.an-radar-lead {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: #64748b;
}

.an-radar-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

@media (max-width: 720px) {
  .an-radar-grid {
    grid-template-columns: 1fr;
  }
}

.an-radar-card {
  min-width: 0;
  padding: 8px 8px 4px;
  border-radius: 12px;
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.an-radar-cap {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #64748b;
  text-align: center;
}

.an-sheet--ai {
  border: 1px solid rgba(185, 28, 28, 0.12);
  background: linear-gradient(180deg, #fff8f8 0%, #fffdf8 100%);
  padding: 20px 22px 22px;
}

.an-ai-report {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.82;
  color: #1c1917;
  letter-spacing: -0.012em;
}

.an-ai-report :deep(h1) {
  margin: 0 0 16px;
  font-size: 1.4rem;
  font-weight: 800;
  color: #7f1d1d;
  line-height: 1.28;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(185, 28, 28, 0.15);
  letter-spacing: -0.03em;
}

.an-ai-report :deep(h2) {
  margin: 24px 0 12px;
  font-size: 1.15rem;
  font-weight: 800;
  color: #991b1b;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.an-ai-report :deep(h3) {
  margin: 18px 0 10px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #44403c;
  letter-spacing: -0.015em;
}

.an-ai-report :deep(p) {
  margin: 0 0 14px;
  text-indent: 2em;
  text-align: justify;
  text-justify: inter-ideograph;
}

.an-ai-report :deep(li > p) {
  text-indent: 0;
  margin-bottom: 8px;
}

.an-ai-report :deep(blockquote p) {
  text-indent: 0;
}

.an-ai-report :deep(ul),
.an-ai-report :deep(ol) {
  margin: 0 0 14px;
  padding-left: 1.5rem;
}

.an-ai-report :deep(li) {
  margin: 0 0 8px;
  line-height: 1.65;
}

.an-ai-report :deep(strong) {
  color: #0f172a;
  font-weight: 700;
}

.an-ai-report :deep(blockquote) {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 3px solid rgba(185, 28, 28, 0.45);
  background: rgba(254, 242, 242, 0.5);
  border-radius: 0 8px 8px 0;
  color: #475569;
}

.an-ai-placeholder {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
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
