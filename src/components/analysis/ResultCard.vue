<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { AnalysisResult } from '../../types/analysis'
import { FAKE_SCORE_BETA, FAKE_SCORE_FEATURE_ORDER } from '../../constants/fakeScoreModelExplain'
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
const fsModel = computed(() => props.result?.truthLensFakeScoreModel ?? null)

const FAKE_SCORE_LABELS: Record<string, string> = {
  x1: '来源不可信度',
  x2: '媒体偏见',
  x3: '报道差错 / 不可核验',
  x5: '情绪煽动',
  x6: '情绪极性极端',
  x7: '主观性',
  x8: '传播链深度',
  x9: '扩散范围',
  x10: '突发性 / 异常节奏',
  x11: '多源不一致 / 孤证',
  x12: '标题党',
  x13: '语言异常',
}

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

watch(fakeScoreDetailOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
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
            <p class="an-fs-kicker">TruthLens · 可解释 FakeScore</p>
            <h2 id="an-fs-title" class="an-fs-title">公式评分是怎么来的？</h2>
          </div>
          <button type="button" class="an-fs-close" aria-label="关闭" @click="fakeScoreDetailOpen = false">×</button>
        </div>

        <div class="an-fs-hero">
          <div class="an-fs-hero-score">
            <span class="an-fs-hero-num">{{ Number(result.formulaFakeScore).toFixed(4) }}</span>
            <span class="an-fs-hero-unit">/ 100</span>
          </div>
          <p class="an-fs-hero-hint">
            数值越高，表示综合风险信号越接近「虚假 / 误导」一侧；与下方可信度（100 − 本值）配套阅读。
          </p>
        </div>

        <div class="an-fs-kpis" v-if="fsModel">
          <div class="an-fs-kpi">
            <span class="an-fs-kpi-k">P(fake)</span>
            <span class="an-fs-kpi-v">{{ fmt4(fsModel.pFake) }}</span>
            <span class="an-fs-kpi-d">f/Σβ，与 FakeScore/100 一致</span>
          </div>
          <div class="an-fs-kpi">
            <span class="an-fs-kpi-k">f(x)</span>
            <span class="an-fs-kpi-v">{{ fmt4(fsModel.f) }}</span>
            <span class="an-fs-kpi-d">线性项（加权和）</span>
          </div>
          <div class="an-fs-kpi an-fs-kpi--wide">
            <span class="an-fs-kpi-k">计算时间</span>
            <span class="an-fs-kpi-v an-fs-kpi-v--sm">{{ fmtTime(fsModel.computedAt) }}</span>
          </div>
        </div>
        <p v-else class="an-fs-muted">
          本轮未返回第二轮 12 维特征明细时，上方主分数可能来自第一轮风险模型；配置通义 Key 并重试分析可获取完整公式链路。
        </p>

        <section class="an-fs-section an-fs-section--callout">
          <h3 class="an-fs-h3">先分清两类数字（避免和文档里的 β 表混淆）</h3>
          <ul class="an-fs-list an-fs-list--tight">
            <li>
              <strong>xᵢ（下表第二列）</strong>：通义千问对<strong>当前这条新闻</strong>抽出来的<strong>风险特征输入</strong>，取值
              0–1，<strong>每条稿件不同</strong>。你截图里看到的 0.70、0.30 等指的是这一类。
            </li>
            <li>
              <strong>βᵢ（固定权重）</strong>：写在服务端 <code class="an-fs-code">fakeScoreModel.js</code> 里，<strong>所有新闻共用同一套</strong>，例如
              β₁=0.10、β₂=0.14…，分组和为 0.30 / 0.20 / 0.15 / 0.35，全体 β 之和为 1（与课程/文档表一致）。<strong>β 不会出现在下表第二列</strong>。
            </li>
            <li>
              <strong>合成方式</strong>：先算线性项 f(x)=Σβᵢxᵢ（β₀=0），P(fake)=f/Σβ，FakeScore=P(fake)×100（Σβ=1 时 x 全为 1 得满分 100）。
            </li>
          </ul>
        </section>

        <section class="an-fs-section">
          <h3 class="an-fs-h3">为何可信</h3>
          <ul class="an-fs-list">
            <li><strong>两阶段</strong>：先做事实抽取与风险理解（第一轮 AI），再把结构化结果与正文一并交给通义千问，抽取 12 维「风险向」特征 xᵢ（第二轮）。</li>
            <li><strong>固定公式</strong>：用文档约定的 β 与当条 x 做线性组合，再线性映射到 0–100，同一套规则可复核。</li>
          </ul>
        </section>

        <details class="an-fs-details">
          <summary class="an-fs-details-sum">展开查看：各维固定权重 β（与文档一致，非本条 x）</summary>
          <div class="an-fs-table-wrap an-fs-table-wrap--beta">
            <table class="an-fs-table">
              <thead>
                <tr>
                  <th scope="col">维度</th>
                  <th scope="col">β（固定）</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="key in FAKE_SCORE_FEATURE_ORDER" :key="'b-' + key">
                  <th scope="row">{{ FAKE_SCORE_LABELS[key] }}（{{ key }}）</th>
                  <td>{{ FAKE_SCORE_BETA[key]?.toFixed(2) ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        <section v-if="fsModel?.features && typeof fsModel.features === 'object'" class="an-fs-section">
          <h3 class="an-fs-h3">本条新闻的特征 xᵢ（0–1，每条不同）</h3>
          <p class="an-fs-table-lead">下表为<strong>输入 x</strong>，不是权重 β。</p>
          <div class="an-fs-table-wrap">
            <table class="an-fs-table">
              <thead>
                <tr>
                  <th scope="col">维度</th>
                  <th scope="col">x 取值 [0,1]</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="key in FAKE_SCORE_FEATURE_ORDER" :key="key">
                  <th scope="row">{{ FAKE_SCORE_LABELS[key] }}（{{ key }}）</th>
                  <td>{{ fmt01(fsModel.features?.[key]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p class="an-fs-disclaimer">
          本分数为模型辅助判断，不替代人工核实与权威信源；传播决策请结合事实要点与证据路径综合考量。
        </p>

        <div class="an-fs-actions">
          <button type="button" class="an-fs-btn" @click="fakeScoreDetailOpen = false">知道了</button>
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
              class="an-fs-trigger"
              @click="fakeScoreDetailOpen = true"
            >
              <span class="an-metric-label">FakeScore（公式）· 点击查看依据</span>
              <span class="an-fs-trigger-row">
                <span class="an-metric-value">{{ Number(result.formulaFakeScore).toFixed(4) }}</span>
                <span class="an-metric-hint">/ 100</span>
                <span class="an-fs-chev" aria-hidden="true">›</span>
              </span>
              <span class="an-fs-trigger-sub">12 维特征 · 通义千问抽取 · 线性加权百分制</span>
            </button>
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
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
}

.an-fs-modal {
  width: min(520px, 100%);
  max-height: min(88vh, 720px);
  overflow-y: auto;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  padding: 18px 18px 16px;
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
  font-size: 13px;
  line-height: 1.5;
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
  font-size: 11px;
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
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.3;
}

.an-fs-section {
  margin-bottom: 14px;
}

.an-fs-h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.an-fs-list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 13px;
  line-height: 1.55;
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
  font-size: 12px;
}

.an-fs-table th,
.an-fs-table td {
  padding: 7px 10px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.an-fs-table thead th {
  font-size: 10px;
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
