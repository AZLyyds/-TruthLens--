<template>
  <div class="sk" aria-busy="true" aria-live="polite">
    <div class="sk-block sk-hero" />
    <div class="sk-row">
      <div class="sk-pill" />
      <div class="sk-pill sk-pill--sm" />
    </div>
    <div class="sk-block sk-metrics" />
    <div class="sk-block" />
    <div class="sk-block sk-short" />
    <div class="sk-cols">
      <div class="sk-block" />
      <div class="sk-block" />
    </div>
  </div>
</template>

<style scoped>
.sk {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 0 24px;
}

.sk-block {
  border-radius: 12px;
  min-height: 88px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: sk-move 1.2s ease-in-out infinite;
}

.sk-hero {
  min-height: 120px;
}

.sk-metrics {
  min-height: 100px;
}

.sk-short {
  min-height: 56px;
}

.sk-row {
  display: flex;
  gap: 10px;
}

.sk-pill {
  height: 28px;
  width: 120px;
  border-radius: 999px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: sk-move 1.2s ease-in-out infinite;
}

.sk-pill--sm {
  width: 80px;
}

.sk-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 768px) {
  .sk-cols {
    grid-template-columns: 1fr;
  }
}

@keyframes sk-move {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
