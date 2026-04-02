<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  /** 单篇：含 facts / risk；多篇：含 consistencyScore / conflicts 等 */
  resultJson: { type: Object, default: null },
})

const jsonOpen = ref(false)

const isSingle = computed(() => {
  const r = props.resultJson
  return !!(r && r.risk && Array.isArray(r.facts))
})

const isMulti = computed(() => {
  const r = props.resultJson
  return !!(r && typeof r.consistencyScore === 'number' && !r.risk)
})

const risk = computed(() => props.resultJson?.risk || {})

const facts = computed(() => (Array.isArray(props.resultJson?.facts) ? props.resultJson.facts : []))

const stanceLabel = computed(() => {
  const s = String(risk.value?.stance || '中立')
  const map = { 支持: '支持', 反对: '反对', 中立: '中立' }
  return map[s] || s
})

const stanceClass = computed(() => {
  const s = String(risk.value?.stance || '中立')
  if (s === '中立') return 'stance--neutral'
  if (s === '反对') return 'stance--against'
  return 'stance--lean'
})

function barTone(score) {
  const n = Number(score) || 0
  if (n >= 70) return 'bar--high'
  if (n >= 40) return 'bar--mid'
  return 'bar--low'
}

const jsonPretty = computed(() => {
  try {
    return JSON.stringify(props.resultJson, null, 2)
  } catch {
    return '{}'
  }
})
</script>

<template>
  <div v-if="resultJson" class="arv">
    <template v-if="isSingle">
      <section class="arv-block">
        <h4 class="arv-block__title">风险评估</h4>
        <div class="arv-metrics">
          <div class="arv-metric">
            <div class="arv-metric__head">
              <span>综合风险度</span>
              <b>{{ risk.overall_risk ?? 0 }}</b>
            </div>
            <div class="arv-track">
              <i :class="['arv-fill', barTone(risk.overall_risk)]" :style="{ width: `${Number(risk.overall_risk) || 0}%` }" />
            </div>
          </div>
          <div class="arv-metric">
            <div class="arv-metric__head">
              <span>误导性</span>
              <b>{{ risk.misleading_score ?? 0 }}</b>
            </div>
            <div class="arv-track">
              <i :class="['arv-fill', barTone(risk.misleading_score)]" :style="{ width: `${Number(risk.misleading_score) || 0}%` }" />
            </div>
          </div>
          <div class="arv-metric">
            <div class="arv-metric__head">
              <span>煽动性</span>
              <b>{{ risk.sensational_score ?? 0 }}</b>
            </div>
            <div class="arv-track">
              <i :class="['arv-fill', barTone(risk.sensational_score)]" :style="{ width: `${Number(risk.sensational_score) || 0}%` }" />
            </div>
          </div>
        </div>
      </section>

      <section class="arv-block">
        <h4 class="arv-block__title">事实提取</h4>
        <ul v-if="facts.length" class="arv-facts">
          <li v-for="(f, i) in facts" :key="i" class="arv-fact">
            <div class="arv-fact__main">
              <span v-if="f.time" class="arv-fact__time">{{ f.time }}</span>
              <span class="arv-fact__event">{{ f.event || '（事件未填）' }}</span>
            </div>
            <div class="arv-fact__meta">
              <span v-if="f.subject">主体：{{ f.subject }}</span>
              <span v-if="f.source">来源：{{ f.source }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="arv-empty">未抽取到结构化事实条目</p>
      </section>

      <section class="arv-block arv-block--inline">
        <h4 class="arv-block__title">立场分析</h4>
        <span class="arv-stance" :class="stanceClass">{{ stanceLabel }}</span>
      </section>
    </template>

    <template v-else-if="isMulti">
      <section class="arv-block">
        <h4 class="arv-block__title">多篇一致性</h4>
        <p class="arv-multi-score">
          一致性得分：<strong>{{ resultJson.consistencyScore }}</strong>
        </p>
        <ul v-if="(resultJson.conflicts || []).length" class="arv-conflicts">
          <li v-for="(c, i) in resultJson.conflicts" :key="i">{{ c }}</li>
        </ul>
        <p class="arv-rec">{{ resultJson.recommendation }}</p>
      </section>
    </template>

    <section class="arv-block arv-json-block">
      <button type="button" class="arv-json-toggle" @click="jsonOpen = !jsonOpen">
        {{ jsonOpen ? '▼ 收起完整 JSON' : '▶ 展开完整 JSON' }}
      </button>
      <pre v-show="jsonOpen" class="arv-json-pre">{{ jsonPretty }}</pre>
    </section>
  </div>
</template>

<style scoped>
.arv {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.arv-block {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
}

.arv-block--inline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.arv-block__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.arv-block--inline .arv-block__title {
  margin: 0;
}

.arv-metrics {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.arv-metric__head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
  margin-bottom: 4px;
}

.arv-metric__head b {
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.arv-track {
  height: 8px;
  border-radius: 999px;
  background: #f1f5f9;
  overflow: hidden;
}

.arv-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.35s ease;
}

.bar--low {
  background: linear-gradient(90deg, #34d399, #10b981);
}
.bar--mid {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
}
.bar--high {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

.arv-facts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.arv-fact {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.arv-fact__time {
  font-size: 12px;
  color: #64748b;
  margin-right: 8px;
}

.arv-fact__event {
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.arv-fact__meta {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.arv-empty {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.arv-stance {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
  font-weight: 600;
}

.stance--neutral {
  background: #e0f2fe;
  color: #0369a1;
}
.stance--lean {
  background: #fef3c7;
  color: #b45309;
}
.stance--against {
  background: #fee2e2;
  color: #b91c1c;
}

.arv-multi-score {
  margin: 0 0 8px;
  font-size: 14px;
  color: #334155;
}

.arv-conflicts {
  margin: 0 0 8px;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
}

.arv-rec {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.5;
}

.arv-json-block {
  background: #f8fafc;
}

.arv-json-toggle {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
}

.arv-json-toggle:hover {
  color: #1d4ed8;
}

.arv-json-pre {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  font-size: 11px;
  line-height: 1.45;
  color: #334155;
  overflow-x: auto;
  max-height: 320px;
}
</style>
