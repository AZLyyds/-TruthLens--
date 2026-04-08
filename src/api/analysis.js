import http from './http'
import { mockMultiAnalysis, mockSingleAnalysis } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export async function analyzeSingle(payload) {
  if (useMock) return mockSingleAnalysis
  return http.post('/analysis/single', payload)
}

export async function analyzeMulti(payload) {
  if (useMock) return mockMultiAnalysis
  return http.post('/analysis/multi', payload, {
    // 多篇分析会触发多次 AI 调用，给更宽松的超时时间
    timeout: 120000,
  })
}
