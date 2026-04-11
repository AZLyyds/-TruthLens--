import http from './http'
import { mockMultiAnalysis, mockSingleAnalysis } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

/** 单篇含多轮长文生成与事实/风险等 AI 调用，需明显长于默认 http 15s */
const ANALYSIS_LONG_TIMEOUT_MS = 360000

export async function analyzeSingle(payload) {
  if (useMock) return mockSingleAnalysis
  return http.post('/analysis/single', payload, {
    timeout: ANALYSIS_LONG_TIMEOUT_MS,
  })
}

export async function analyzeMulti(payload) {
  if (useMock) return mockMultiAnalysis
  return http.post('/analysis/multi', payload, {
    timeout: ANALYSIS_LONG_TIMEOUT_MS,
  })
}
