<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'

interface EvidenceStep {
  key: string
  icon: string
  title: string
  text: string
}

defineProps<{ steps: EvidenceStep[] }>()
</script>

<template>
  <RecycleScroller
    class="single-evidence-scroller"
    :items="steps"
    :item-size="74"
    key-field="key"
    :buffer="120"
    role="list"
    aria-label="证据路径列表"
  >
    <template #default="{ item, index }">
      <div class="single-evidence-item evidence-step" role="listitem">
        <span class="step-dot" :aria-label="`${item.title}图标`">{{ item.icon }}</span>
        <div class="step-content">
          <b>{{ index + 1 }}. {{ item.title }}</b>
          <p>{{ item.text }}</p>
        </div>
      </div>
    </template>
  </RecycleScroller>
</template>
