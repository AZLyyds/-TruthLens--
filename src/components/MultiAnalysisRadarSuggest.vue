<script setup>
const radarMeta = [
  { key: 'timeline', label: '时间线', icon: '⏱️', tip: '两篇文章在时间叙述与事件顺序上的一致程度' },
  { key: 'subject', label: '主体一致', icon: '👤', tip: '关键人物、机构等主体指称是否对齐' },
  { key: 'data', label: '数据一致', icon: '📊', tip: '比分、数字、统计等可量化信息是否一致' },
  { key: 'conclusion', label: '结论一致', icon: '📝', tip: '整体结论与叙事方向是否相容' },
]

const radarGridRadii = [18, 36, 54, 72]

defineProps({
  output: { type: Object, default: null },
  radarPolygonPoints: { type: String, required: true },
  animatedRadar: { type: Array, required: true },
  actionCards: { type: Array, required: true },
})

const hoveredAxis = defineModel('hoveredAxis', { default: -1 })
</script>

<template>
  <section class="analysis-extra multi-extra">
    <article class="card block multi-card-enter multi-hover-card multi-radar-card" style="--delay: 0.3s">
      <h3>一致性雷达</h3>
      <div class="multi-radar-wrap">
        <div v-if="hoveredAxis >= 0" class="multi-radar-tooltip">
          {{ radarMeta[hoveredAxis].tip }}
        </div>
        <svg class="multi-radar-svg" viewBox="0 0 200 200" role="img" aria-label="一致性雷达图">
          <defs>
            <linearGradient id="multiRadarFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fecaca" stop-opacity="0.62" />
              <stop offset="55%" stop-color="#f87171" stop-opacity="0.38" />
              <stop offset="100%" stop-color="#b91c1c" stop-opacity="0.35" />
            </linearGradient>
            <filter id="multiRadarGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="1.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            v-for="(rr, ri) in radarGridRadii"
            :key="`rg-${ri}`"
            cx="100"
            cy="100"
            :r="rr"
            fill="none"
            stroke="#e7e5e4"
            stroke-width="1"
            opacity="0.9"
          />
          <line
            v-for="(meta, idx) in radarMeta"
            :key="`ax-${meta.key}`"
            x1="100"
            y1="100"
            :x2="100 + 72 * Math.cos(-Math.PI / 2 + (idx * Math.PI) / 2)"
            :y2="100 + 72 * Math.sin(-Math.PI / 2 + (idx * Math.PI) / 2)"
            stroke="#d6d3d1"
            :stroke-width="hoveredAxis === idx ? 2 : 1"
            :opacity="hoveredAxis === idx ? 0.95 : 0.5"
            class="multi-radar-axis-line"
          />
          <polygon
            :points="radarPolygonPoints"
            fill="url(#multiRadarFill)"
            stroke="#b91c1c"
            stroke-width="2"
            stroke-linejoin="round"
            filter="url(#multiRadarGlow)"
            class="multi-radar-fill-poly"
          />
          <circle
            v-for="(meta, idx) in radarMeta"
            :key="`pt-${meta.key}`"
            :cx="100 + ((animatedRadar[idx] || 0) / 100) * 72 * Math.cos(-Math.PI / 2 + (idx * Math.PI) / 2)"
            :cy="100 + ((animatedRadar[idx] || 0) / 100) * 72 * Math.sin(-Math.PI / 2 + (idx * Math.PI) / 2)"
            r="4"
            fill="#fff"
            stroke="#b91c1c"
            stroke-width="2"
          />
          <circle cx="100" cy="100" r="22" fill="rgba(255,255,255,0.95)" stroke="#fecaca" stroke-width="1.2" />
          <text x="100" y="95" text-anchor="middle" font-size="7.5" fill="#57534e" font-weight="700">综合一致</text>
          <text x="100" y="108" text-anchor="middle" font-size="11" fill="#b91c1c" font-weight="800">
            {{ Math.round(output?.consistencyScore ?? 0) }}
          </text>
        </svg>
        <div
          v-for="(meta, idx) in radarMeta"
          :key="`lbl-${meta.key}`"
          class="multi-radar-label"
          :class="[`axis-${idx}`, { hover: hoveredAxis === idx }]"
          @mouseenter="hoveredAxis = idx"
          @mouseleave="hoveredAxis = -1"
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
          :class="{ active: hoveredAxis === idx }"
          @mouseenter="hoveredAxis = idx"
          @mouseleave="hoveredAxis = -1"
        >
          <span>{{ meta.label }}</span>
          <strong>{{ animatedRadar[idx] }}%</strong>
        </div>
      </div>
      <p class="multi-radar-hint">四轴由综合一致性分与冲突条数推导，可与下方「建议动作」对照阅读。</p>
    </article>

    <article class="card block multi-card-enter multi-hover-card multi-suggest-card" style="--delay: 0.45s">
      <h3>建议动作</h3>
      <p class="multi-suggest-lead">基于本轮一致性分数、模型建议、冲突与缺失信息自动生成。</p>
      <p v-if="!output" class="multi-action-placeholder">完成左侧分析后，将在此生成可执行建议卡片。</p>
      <div v-else class="multi-action-grid">
        <div
          v-for="(card, idx) in actionCards"
          :key="`${card.type}-${idx}-${card.title}`"
          class="multi-action-card"
          :class="`multi-action-card--${card.type}`"
        >
          <span class="multi-action-tag">{{ card.tag }}</span>
          <h4 class="multi-action-title">{{ card.title }}</h4>
          <p class="multi-action-body">{{ card.body }}</p>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.analysis-extra.multi-extra {
  margin-top: 12px;
}

.analysis-extra.multi-extra .card {
  border: 1px solid var(--tl-border, #ead7d7);
  border-radius: 14px;
  background: #fff;
}

.multi-suggest-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: #57534e;
  line-height: 1.5;
}

.multi-action-placeholder {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: #fafaf9;
  border: 1px dashed #d6d3d1;
  font-size: 13px;
  color: #78716c;
  text-align: center;
}

.multi-action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.multi-action-card {
  padding: 12px 12px 11px;
  border-radius: 14px;
  border: 1px solid #e7e5e4;
  background: linear-gradient(165deg, #ffffff 0%, #fafaf9 100%);
  box-shadow: 0 2px 10px rgba(28, 25, 23, 0.04);
}

.multi-action-card--score {
  border-color: rgba(254, 202, 202, 0.85);
  background: linear-gradient(165deg, #fffbfb 0%, #ffffff 100%);
}

.multi-action-card--conflict {
  border-color: rgba(251, 191, 36, 0.45);
}

.multi-action-card--action {
  border-color: rgba(185, 28, 28, 0.2);
}

.multi-action-card--missing {
  border-color: rgba(148, 163, 184, 0.45);
}

.multi-action-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7f1d1d;
  background: #fef2f2;
  border: 1px solid rgba(254, 202, 202, 0.8);
  padding: 3px 8px;
  border-radius: 999px;
  margin-bottom: 8px;
}

.multi-action-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  color: #1c1917;
  line-height: 1.35;
}

.multi-action-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #44403c;
}
</style>
