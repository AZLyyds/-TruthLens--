<script setup lang="ts">
defineProps<{ loading: boolean }>()

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ analyze: [] }>()
</script>

<template>
  <section class="card io-panel single-card single-input-card" aria-labelledby="single-input-title">
    <h2 id="single-input-title">输入（text / URL）</h2>
    <textarea
      v-model="model"
      rows="10"
      placeholder="输入新闻正文或 URL，系统将评估可信度、风险等级与关键原因"
      aria-label="单篇新闻输入框"
    />
    <button class="action-btn single-btn" :disabled="loading" @click="emit('analyze')">
      <span v-if="loading" class="single-btn-spinner" aria-hidden="true" />
      {{ loading ? '分析中...' : '开始分析' }}
    </button>
  </section>
</template>
