import http from './http'
import { mockNewsItems, mockSingleAnalysis } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export async function fetchNewsList(params = {}) {
  if (useMock) return mockNewsItems
  const data = await http.get('/news', { params })
  return data.items || []
}

/** 构建 Mock 详情（与后端 enrich 字段对齐，便于离线演示） */
function mockNewsDetail(id) {
  const it = mockNewsItems.find((x) => String(x.id) === String(id)) || mockNewsItems[0]
  const risk = mockSingleAnalysis.risk
  const fakeScore = Number(risk?.overall_risk ?? 42)
  return {
    id: Number(it.id) || 1,
    newsUid: `mock-${it.id}`,
    title: it.title,
    titleCN: '示例：中文标题对齐展示',
    summary:
      mockSingleAnalysis.meta?.newsSummary ||
      '财政部称专项债发行节奏平稳，强调限额内风险可控。以下为 Mock 摘要占位。',
    source: it.source,
    url: 'https://example.com/truthlens/mock-news',
    content:
      'This is sample original-language body text for layout testing. It demonstrates typography separation from the translated column.\n\n机构分析认为短期流动性压力有限，但仍需关注地方项目收益匹配度。',
    contentCN:
      '示例中文正文：与左侧原文区分样式展示。可用于核对涉华表述与数据来源。以下条列为演示占位，不代表真实结论。',
    description: mockSingleAnalysis.meta?.newsSummary,
    publishedAt: new Date().toISOString(),
    lang: 'en',
    language: 'en',
    country: 'global',
    chinaRelated: true,
    facts: mockSingleAnalysis.facts || [],
    fakeScore,
    riskLevel: it.risk || mockSingleAnalysis.riskLevel,
    riskReason: (mockSingleAnalysis.reasons || []).join('；') || '示例风险说明',
    credibilityScore: mockSingleAnalysis.credibilityScore,
    verdict: mockSingleAnalysis.verdict,
    reasons: mockSingleAnalysis.reasons || [],
    suggestions: mockSingleAnalysis.suggestions || [],
    dimensions: mockSingleAnalysis.dimensions,
    multiSourceCheck: {
      consistencyLabel: '部分一致',
      consistencyScore: mockSingleAnalysis.dimensions?.factConsistency ?? 65,
      authorityLabel: '信源参差',
      authorityNote: '基于 Mock 数据：事实一致性、来源可信度维度来自最近一次示例分析。',
      sourcesCompared: 3,
    },
    latestAnalysis: {
      fakeScore,
      riskLevel: it.risk || mockSingleAnalysis.riskLevel,
      credibilityScore: mockSingleAnalysis.credibilityScore,
      verdict: mockSingleAnalysis.verdict,
      reasons: mockSingleAnalysis.reasons,
      suggestions: mockSingleAnalysis.suggestions,
      facts: mockSingleAnalysis.facts,
      risk: mockSingleAnalysis.risk,
      dimensions: mockSingleAnalysis.dimensions,
      meta: mockSingleAnalysis.meta,
      aiSummary: mockSingleAnalysis.aiSummary,
      analyzedAt: new Date().toISOString(),
    },
    rawWorkflow: null,
  }
}

/**
 * @param {string|number} id
 * @returns {Promise<import('../types/newsDetail').NewsDetailPayload>}
 */
export async function fetchNewsDetail(id) {
  if (useMock) return mockNewsDetail(id)
  return http.get(`/news/${id}`)
}
