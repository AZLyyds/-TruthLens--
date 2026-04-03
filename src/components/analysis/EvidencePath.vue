<script setup lang="ts">
interface EvidenceStep {
  key: string
  icon: string
  title: string
  text: string
}

defineProps<{ steps: EvidenceStep[] }>()
</script>

<template>
  <ol class="path" role="list">
    <li v-for="(item, index) in steps" :key="item.key" class="path-item">
      <div class="path-index" aria-hidden="true">{{ index + 1 }}</div>
      <div class="path-body">
        <span class="path-ico" aria-hidden="true">{{ item.icon }}</span>
        <div class="path-text">
          <span class="path-title">{{ item.title }}</span>
          <span class="path-desc">{{ item.text }}</span>
        </div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.path {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 900px) {
  .path {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .path {
    grid-template-columns: 1fr;
  }
}

.path-item {
  margin: 0;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px 10px;
  border-radius: 8px;
  background: #f5f5f7;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.path-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #86868b;
  font-variant-numeric: tabular-nums;
}

.path-body {
  display: flex;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.path-ico {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.2;
  margin-top: 1px;
}

.path-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.path-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #1d1d1f;
}

.path-desc {
  font-size: 12px;
  line-height: 1.45;
  color: #6e6e73;
}
</style>
