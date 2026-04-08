<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputArea from '../components/analysis/InputArea.vue'
import ResultCard from '../components/analysis/ResultCard.vue'
import { useSingleAnalysisStore } from '../stores/singleAnalysis'
import type { NewsAnalysisParams } from '../types/analysis'

const route = useRoute()
const router = useRouter()
const store = useSingleAnalysisStore()
const inputText = ref('')

const title = computed(() => String(route.query.title || '涉华新闻样例：国际平台出现争议性报道'))
const newsId = computed(() => {
  const raw = route.query.newsId
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
})

const isUrlInput = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

const runAnalysis = async () => {
  const value = inputText.value.trim()
  if (!value) return
  const payload: NewsAnalysisParams = isUrlInput(value) ? { url: value } : { text: value }
  if (newsId.value != null) payload.newsId = newsId.value
  await store.run(payload)
}

const onExport = () => {
  if (!store.result) return
  const blob = new Blob([JSON.stringify(store.result, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analysis-result-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

watch(
  () => [route.query.title, route.query.newsId],
  () => {
    inputText.value = String(route.query.title || title.value || '')
  },
  { immediate: true },
)
</script>

<template>
  <div class="page page-analysis single-analysis">
    <main class="panel-layout single-layout">
      <div class="sa-input-wrap">
        <InputArea v-model="inputText" :loading="store.isLoading" @analyze="runAnalysis" />
      </div>
      <ResultCard
        :loading="store.isLoading"
        :result="store.result"
        :error="store.errorMessage"
        :analyzed-at="store.analyzedAt"
        @export="onExport"
      />
    </main>
  </div>
</template>
