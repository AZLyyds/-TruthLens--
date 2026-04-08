<script setup>
defineEmits(['back', 'share', 'export', 'favorite'])

defineProps({
  /** 是否已收藏（本地） */
  favorited: { type: Boolean, default: false },
  disabledShare: { type: Boolean, default: false },
})
</script>

<template>
  <header class="bar">
    <button type="button" class="bar-back" @click="$emit('back')">
      <span class="bar-back-icon" aria-hidden="true">‹</span>
      首页
    </button>
    <h1 class="bar-title">新闻详情</h1>
    <div class="bar-actions">
      <button
        type="button"
        class="bar-icon-btn"
        :class="{ 'is-on': favorited }"
        :aria-pressed="favorited"
        title="收藏到本地"
        @click="$emit('favorite')"
      >
        {{ favorited ? '★' : '☆' }}
      </button>
      <button
        type="button"
        class="bar-icon-btn"
        title="分享"
        :disabled="disabledShare"
        @click="$emit('share')"
      >
        ↗
      </button>
      <button type="button" class="bar-export" :disabled="disabledShare" @click="$emit('export')">导出</button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  margin: 0 -4px 16px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: saturate(180%) blur(16px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 0 0 14px 14px;
}

.bar-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: #b91c1c;
  background: #fafaf9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.15s;
}

.bar-back:hover {
  background: #fee2e2;
}

.bar-back:active {
  transform: scale(0.98);
}

.bar-back-icon {
  font-size: 18px;
  line-height: 1;
  margin-top: -2px;
}

.bar-title {
  margin: 0;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #0f172a;
  pointer-events: none;
  max-width: 42vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .bar-title {
    display: none;
  }
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 17px;
  line-height: 1;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.15s,
    color 0.2s;
}

.bar-icon-btn:hover:not(:disabled) {
  background: #fff;
  color: #0f172a;
}

.bar-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bar-icon-btn.is-on {
  color: #ca8a04;
  border-color: #fcd34d;
  background: #fffbeb;
}

.bar-export {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: linear-gradient(135deg, #b91c1c, #f87171);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(185, 28, 28, 0.22);
  transition:
    transform 0.15s,
    filter 0.2s;
}

.bar-export:hover:not(:disabled) {
  filter: brightness(1.05);
}

.bar-export:active:not(:disabled) {
  transform: scale(0.98);
}

.bar-export:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
