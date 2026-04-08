<script setup lang="ts">
import { computed } from 'vue'

interface EvidenceStep {
  key: string
  icon: string
  title: string
  text: string
}

const props = defineProps<{
  steps: EvidenceStep[]
  credibilityScore?: number
}>()

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
</script>

<template>
  <section class="path-flow-chart" role="img" aria-label="证据路径流程图">
    <ol class="path" role="list">
      <li v-for="(item, index) in flowSteps" :key="item.key" class="path-item">
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
          <div class="path-mini-track"><i :style="{ width: `${item.pct}%` }" /></div>
        </div>
        <span v-if="index < flowSteps.length - 1" class="path-arrow" aria-hidden="true">➜</span>
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

.path {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  margin: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px 10px;
  border-radius: 8px;
  background: #f5f5f4;
  border: 1px solid rgba(185, 28, 28, 0.08);
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

.path-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

.path-arrow {
  font-size: 14px;
  color: #b91c1c;
  margin-left: 2px;
}

@media (max-width: 560px) {
  .path-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
