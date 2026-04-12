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
    riskLevel: 'medium',
    riskReason: (mockSingleAnalysis.reasons || []).join('；') || '示例风险说明',
    credibilityScore: mockSingleAnalysis.credibilityScore,
    verdict: mockSingleAnalysis.verdict,
    reasons: mockSingleAnalysis.reasons || [],
    suggestions: mockSingleAnalysis.suggestions || [],
    dimensions: mockSingleAnalysis.dimensions,
    multiSourceCheck: {
      isSameEvent: true,
      isConsistent: '基本一致',
      hasAuthoritySource: true,
      description: '【Mock】写实核查说明示例：与后端 multiSourceCheck.description 字段对齐，仅用于离线布局。',
      mcpRelatedArticles: [
        { title: '示例相关报道 A', source: '示例来源 A' },
        { title: '示例相关报道 B', source: '示例来源 B' },
      ],
    },
    latestAnalysis: {
      fakeScore,
      riskLevel: 'medium',
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
    fakeScoreModelStatus: 'ready',
    fakeScoreModelError: null,
    fakeScoreModel: {
      features: {
        x1: 0.22,
        x2: 0.18,
        x3: 0.25,
        x5: 0.35,
        x6: 0.2,
        x7: 0.28,
        x8: 0.5,
        x9: 0.5,
        x10: 0.45,
        x11: 0.3,
        x12: 0.15,
        x13: 0.08,
      },
      featureReasons: {
        x1: '示例：来源为常见通讯社域名，未见钓鱼特征，故来源不可信度中等偏低。',
        x2: '示例：措辞整体克制，未出现明显一边倒口号式定性，偏见信号有限。',
        x3: '示例：部分关键断言缺少可点击的一手链接，核验难度略高。',
        x5: '示例：标题与导语情绪词不多，煽动性一般。',
        x6: '示例：对立阵营标签使用较少，极性不算极端。',
        x7: '示例：夹杂解读性句子，可验证事实密度中等。',
        x8: '示例：单篇转载链信息不足，按缺省给接近中性。',
        x9: '示例：无独立传播数据，保持中性估计。',
        x10: '示例：未见异常节奏描述，略低于中性。',
        x11: '示例：稿内未呈现多源对照，孤证感略升。',
        x12: '示例：标题与正文核心一致，标题党程度低。',
        x13: '示例：语句通顺，未见明显机翻或乱码。',
      },
      fakeScore: 41.7,
      pFake: 0.417,
      f: -0.34,
      computedAt: new Date().toISOString(),
    },
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

/**
 * 为已有分析记录补算或强制重算 FakeScore 模型（需后端 DASHSCOPE_API_KEY）
 * @param {string|number} id
 * @param {{ force?: boolean }} [body]
 * @returns {Promise<import('../types/newsDetail').NewsDetailFakeScoreModel>}
 */
export async function postNewsFakeScoreModel(id, body = {}) {
  if (useMock) return mockNewsDetail(id).fakeScoreModel
  return http.post(`/news/${id}/fake-score-model`, body, { timeout: 120000 })
}
