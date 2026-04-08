import http from './http'
import { mockMultiAnalysis, mockSingleAnalysis } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export async function analyzeSingle(payload) {
  if (useMock) return mockSingleAnalysis
  return http.post('/analysis/single', payload)
}

export async function analyzeMulti(payload) {
  if (useMock) return mockMultiAnalysis
  return http.post('/analysis/multi', payload)
}
