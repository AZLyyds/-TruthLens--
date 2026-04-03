import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { analyzeSingle } from '../api/analysis'
import type { AnalysisResult, NewsAnalysisParams } from '../types/analysis'

type Status = 'idle' | 'loading' | 'success' | 'error'

export const useSingleAnalysisStore = defineStore('single-analysis', () => {
  const status = ref<Status>('idle')
  const result = ref<AnalysisResult | null>(null)
  const errorMessage = ref('')
  const analyzedAt = ref('')

  const isLoading = computed(() => status.value === 'loading')

  const run = async (payload: NewsAnalysisParams) => {
    status.value = 'loading'
    errorMessage.value = ''
    try {
      result.value = await analyzeSingle(payload)
      analyzedAt.value = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
      status.value = 'success'
    } catch (error: unknown) {
      status.value = 'error'
      errorMessage.value = error instanceof Error ? error.message : '分析失败，请稍后重试'
    }
  }

  return { status, result, errorMessage, analyzedAt, isLoading, run }
})
