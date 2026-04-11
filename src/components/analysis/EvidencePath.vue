<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AnalysisDimensions } from '../../types/analysis'

/** 与 ResultCard 中定义的 4 步一致 */
interface EvidenceStep {
  key: string
  icon: string
  title: string
  text: string
}

const props = defineProps<{
  steps: EvidenceStep[]
  credibilityScore?: number
  /** 后端返回的原因列表，按步骤轮转分配到 4 步 */
  reasons?: string[]
  /** 后端返回的建议列表，按步骤轮转分配到 4 步 */
  suggestions?: string[]
  /** 事实抽取结果，主要支撑「提取」步骤 */
  facts?: Array<{ time?: string; subject?: string; event?: string; source?: string }>
  dimensions?: AnalysisDimensions
  riskLevel?: string
  verdict?: string
}>()

/** 当前展开的步骤索引，-1 表示全部收起（手风琴：同时只展开一步） */
const openIndex = ref(-1)

function toggleStep(index: number) {
  openIndex.value = openIndex.value === index ? -1 : index
}

/**
 * 将列表尽量均匀切到 4 个步骤（比单纯 i%4 更均衡，避免条目少时全堆在第一步）。
 * 例如 5 条 → [2,1,1,1]，8 条 → [2,2,2,2]。
 */
function itemsForStep<T>(arr: T[] | undefined, stepIndex: number): T[] {
  if (!arr?.length) return []
  const n = arr.length
  const base = Math.floor(n / 4)
  const rem = n % 4
  const size = stepIndex < rem ? base + 1 : base
  let start = 0
  for (let i = 0; i < stepIndex; i++) {
    start += i < rem ? base + 1 : base
  }
  return arr.slice(start, start + size)
}

const flowSteps = computed(() => {
  const n = Math.max(props.steps.length - 1, 1)
  const finalScoreRaw = Number(props.credibilityScore)
  const finalScore = Number.isNaN(finalScoreRaw)
    ? 100
    : Math.max(0, Math.min(100, Math.round(finalScoreRaw)))
  return props.steps.map((s, idx) => ({
    ...s,
    pct: Math.round(((idx + 1) / (n + 1)) * finalScore),
  }))
})

/** 每步固定说明：与业务含义对齐，帮助用户理解该步在整条链路中的作用 */
const stepIntro: Record<string, string> = {
  extract:
    '对应从正文与结构化结果中提取核心陈述、时间点与可核验事实片段，作为后续比对与核验的输入基线。下方列出本环节相关的要点、原因与建议。',
  compare:
    '对应将提取结果与「权威报道对照、事实一致性」思路结合，判断叙事是否对齐、是否存在选择性呈现。下方结合风险维度中的事实一致性、情绪煽动性等给出本环节分析。',
  verify:
    '对应来源真实性、上下文是否支撑关键判断的核验路径。下方结合来源可信度、传播误导性等维度，说明本环节应关注的证据与表述风险。',
  output:
    '对应最终风险说明、传播建议与整体结论的汇总输出。下方整合结论标签、风险等级及可执行建议，形成可对外沟通前的检查清单。',
}

/** 将单条事实格式化为可读一行 */
function formatFactLine(f: { time?: string; subject?: string; event?: string; source?: string }) {
  return [f.time, f.subject, f.event, f.source].filter(Boolean).join(' · ')
}

const factsLines = computed(() => {
  const list = props.facts || []
  return list.map(formatFactLine).filter(Boolean)
})

const dimLineCompare = computed(() => {
  const d = props.dimensions
  if (!d) return null
  return `事实一致性 ${d.factConsistency ?? '—'} · 情绪煽动性 ${d.emotionManipulation ?? '—'}`
})

const dimLineVerify = computed(() => {
  const d = props.dimensions
  if (!d) return null
  return `来源可信度 ${d.sourceCredibility ?? '—'} · 传播误导性 ${d.propagationMisleading ?? '—'}`
})
</script>

<template>
  <section class="path-flow-chart" role="region" aria-label="证据路径流程图">
    <p class="path-hint">点击每行右侧箭头可展开该步骤的详细原因与建议（与下方原「关键原因与建议」数据同源）。</p>
    <ol class="path" role="list">
      <li v-for="(item, index) in flowSteps" :key="item.key" class="path-item">
        <div class="path-item-main">
          <div class="path-node">
            <div class="path-index" aria-hidden="true">{{ index + 1 }}</div>
            <span class="path-ico" aria-hidden="true">{{ item.icon }}</span>
          </div>
          <div class="path-body">
            <div class="path-head">
              <span class="path-title">{{ item.title }}</span>
              <span class="path-score">可信度 {{ item.pct }}%</span>
            </div>
            <span class="path-desc">{{ item.text }}</span>
            <div class="path-mini-track" aria-hidden="true"><i :style="{ width: `${item.pct}%` }" /></div>
          </div>
          <button
            type="button"
            class="path-arrow-btn"
            :class="{ 'path-arrow-btn--open': openIndex === index }"
            :aria-expanded="openIndex === index"
            :aria-controls="`path-detail-${index}`"
            @click="toggleStep(index)"
          >
            <span class="path-arrow-icon" aria-hidden="true">➜</span>
            <span class="path-sr-only">展开或收起「{{ item.title }}」详情</span>
          </button>
        </div>

        <!-- 方案 A：在当前步骤下方展开详情，不打断阅读流 -->
        <div
          :id="`path-detail-${index}`"
          class="path-detail"
          :class="{ 'path-detail--open': openIndex === index }"
          role="region"
          :aria-hidden="openIndex !== index"
        >
          <div class="path-detail-inner">
            <p class="path-detail-intro">{{ stepIntro[item.key] || stepIntro.extract }}</p>

            <!-- 提取：展示事实片段作为校验依据 -->
            <template v-if="item.key === 'extract'">
              <div v-if="factsLines.length" class="path-block">
                <h4 class="path-block-title">事实与陈述依据</h4>
                <ul class="path-ul">
                  <li v-for="(line, fi) in factsLines.slice(0, 6)" :key="'f-' + fi">{{ line }}</li>
                </ul>
              </div>
              <p v-else class="path-muted">暂无结构化事实条目，可结合左侧原文复核提取边界。</p>
            </template>

            <template v-else-if="item.key === 'compare'">
              <div v-if="dimLineCompare" class="path-block">
                <h4 class="path-block-title">维度参考（比对视角）</h4>
                <p class="path-dim">{{ dimLineCompare }}</p>
              </div>
            </template>

            <template v-else-if="item.key === 'verify'">
              <div v-if="dimLineVerify" class="path-block">
                <h4 class="path-block-title">维度参考（核验视角）</h4>
                <p class="path-dim">{{ dimLineVerify }}</p>
              </div>
            </template>

            <template v-else-if="item.key === 'output'">
              <div class="path-block">
                <h4 class="path-block-title">整体结论</h4>
                <p class="path-verdict">
                  <strong>{{ verdict || '—' }}</strong>
                  <span class="path-sep">·</span>
                  风险等级：<strong>{{ riskLevel || '—' }}</strong>
                </p>
              </div>
            </template>

            <div class="path-block">
              <h4 class="path-block-title">本环节 · 原因分析</h4>
              <ul v-if="itemsForStep(reasons, index).length" class="path-ul">
                <li v-for="(r, ri) in itemsForStep(reasons, index)" :key="'r-' + ri">{{ r }}</li>
              </ul>
              <p v-else class="path-muted">本环节未分配到独立原因条目（总条目较少时可能为空），可查看相邻步骤。</p>
            </div>

            <div class="path-block path-block--last">
              <h4 class="path-block-title">本环节 · 对应建议</h4>
              <ul v-if="itemsForStep(suggestions, index).length" class="path-ul">
                <li v-for="(s, si) in itemsForStep(suggestions, index)" :key="'s-' + si">{{ s }}</li>
              </ul>
              <p v-else class="path-muted">本环节未分配到独立建议条目，可查看相邻步骤或输出步骤。</p>
            </div>
          </div>
        </div>

        <!-- 步骤之间的视觉连接（非按钮，避免与可点击箭头混淆） -->
        <div v-if="index < flowSteps.length - 1" class="path-connector" aria-hidden="true" />
      </li>
    </ol>
  </section>
</template>

<style scoped>
.path-flow-chart {
  border: 1px solid rgba(185, 28, 28, 0.12);
  border-radius: 12px;
  background: linear-gradient(180deg, #fff, #fafaf9);
  padding: 10px;
}

.path-hint {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.45;
  color: #86868b;
}

.path {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.path-item {
  margin: 0;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: #f5f5f4;
  border: 1px solid rgba(185, 28, 28, 0.08);
  margin-bottom: 8px;
}

.path-item:last-child {
  margin-bottom: 0;
}

.path-item-main {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px 10px;
}

.path-index {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: #b91c1c;
  font-variant-numeric: tabular-nums;
}

.path-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.path-ico {
  font-size: 18px;
  line-height: 1.2;
}

.path-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.path-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.path-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #1d1d1f;
}

.path-score {
  font-size: 11px;
  font-weight: 700;
  color: #7f1d1d;
}

.path-desc {
  font-size: 12px;
  line-height: 1.45;
  color: #6e6e73;
}

.path-mini-track {
  height: 5px;
  border-radius: 999px;
  background: #e7e5e4;
  overflow: hidden;
}

.path-mini-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #fca5a5, #b91c1c);
}

/* 可点击箭头：明确焦点环与 hover，符合「可交互」预期 */
.path-arrow-btn {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(185, 28, 28, 0.35);
  border-radius: 10px;
  background: linear-gradient(180deg, #fff, #fff5f5);
  color: #b91c1c;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.path-arrow-btn:hover {
  border-color: #b91c1c;
  background: #fff;
  box-shadow: 0 2px 8px rgba(185, 28, 28, 0.15);
}

.path-arrow-btn:active {
  transform: scale(0.94);
}

.path-arrow-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.35);
}

.path-arrow-icon {
  display: block;
  font-size: 15px;
  line-height: 1;
  transition: transform 0.22s ease;
}

.path-arrow-btn--open .path-arrow-icon {
  transform: rotate(90deg);
}

.path-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.path-connector {
  height: 6px;
  margin: 0 0 0 24px;
  border-left: 2px dashed rgba(185, 28, 28, 0.25);
}

.path-detail {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s ease;
  border-top: 1px solid transparent;
}

.path-detail--open {
  grid-template-rows: 1fr;
  border-top-color: rgba(185, 28, 28, 0.12);
}

.path-detail-inner {
  overflow: hidden;
  min-height: 0;
}

.path-detail--open .path-detail-inner {
  padding: 10px 12px 12px;
  max-height: min(70vh, 520px);
  overflow-y: auto;
  background: linear-gradient(180deg, #fffafa, #fff);
  -webkit-overflow-scrolling: touch;
}

.path-detail-intro {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
  color: #4b5563;
}

.path-block {
  margin-bottom: 10px;
}

.path-block--last {
  margin-bottom: 0;
}

.path-block-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #991b1b;
}

.path-ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 12px;
  line-height: 1.5;
  color: #1f2937;
}

.path-ul li {
  margin-bottom: 5px;
}

.path-ul li:last-child {
  margin-bottom: 0;
}

.path-muted {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #9ca3af;
  font-style: italic;
}

.path-dim {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(185, 28, 28, 0.06);
  border: 1px solid rgba(185, 28, 28, 0.1);
}

.path-verdict {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #1f2937;
}

.path-sep {
  margin: 0 6px;
  color: #d1d5db;
}

@media (max-width: 560px) {
  .path-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .path-arrow-btn {
    width: 40px;
    height: 40px;
  }
}
</style>
