export const mockNewsItems = [
  { id: '1', title: '多国媒体关注中国新能源合作进展', source: 'Global Times', risk: '低风险' },
  { id: '2', title: '某社交平台传播涉华不实经济数据', source: 'World Echo', risk: '高风险' },
  { id: '3', title: '国际机构发布区域贸易新报告', source: 'Reuters', risk: '中风险' },
  { id: '4', title: '海外论坛热议中国科技企业新产品', source: 'Tech Daily', risk: '中风险' },
]

export const mockSingleAnalysis = {
  meta: {
    newsTitle: '财政部回应地方政府债务：风险总体可控',
    newsSummary: '财政部称专项债发行节奏平稳，强调限额内风险可控，市场短期流动性压力有限。',
    sourceUrl: null,
    sourceName: 'Mock',
  },
  aiSummary: '财政部称专项债发行节奏平稳，强调限额内风险可控，市场短期流动性压力有限。',
  facts: [
    { time: '近日', subject: '财政部', event: '回应地方债务风险', source: '通报' },
  ],
  risk: {
    stance: '中立',
    sensational_score: 42,
    misleading_score: 55,
    overall_risk: 48,
  },
  credibilityScore: 68,
  verdict: '存疑',
  riskLevel: '中风险',
  reasons: ['核心数据来源不透明', '与两家主流媒体结论不一致'],
  suggestions: ['结合更多权威来源做交叉核验后再传播'],
  dimensions: {
    sourceCredibility: 72,
    factConsistency: 65,
    emotionManipulation: 58,
    propagationMisleading: 69,
  },
}

export const mockMultiAnalysis = {
  consistencyScore: 61,
  conflicts: ['来源A与来源B在事件时间线存在冲突'],
  sourceAuthorityDiff: 'A高于B',
  recommendation: '建议标注“待核验”，暂不作为确定事实传播。',
}

export const mockProfile = {
  username: 'demo',
  preferences: ['国际政治', '科技', '财经', '深度阅读', '风险复核'],
  stats: {
    viewed: 126,
    analyzed: 59,
    highRiskHits: 12,
  },
}

export const mockHistoryItems = [
  {
    id: 1,
    createdAt: '2026-04-01T11:40:00.000Z',
    queryType: '单篇分析',
    newsSummary: '财政部称地方债务在限额内总体可控，市场短期流动性压力有限。',
    status: 'success',
    newsTitle: '中国债务抵御全球动荡：财政部回应市场关切',
    newsBody: '财政部最新表态称，地方政府专项债务限额内发行节奏平稳，风险总体可控。市场分析人士认为短期流动性压力有限。',
    sourceUrl: 'https://example.com/news/mock-1',
    sourceName: 'Reuters',
    fullAnalysisJson: {
      meta: {
        newsTitle: '中国债务抵御全球动荡：财政部回应市场关切',
        newsSummary: '财政部称地方债务在限额内总体可控，市场短期流动性压力有限。',
      },
      facts: [{ time: '近日', subject: '财政部', event: '债务风险可控', source: '通报' }],
      risk: { stance: '中立', sensational_score: 30, misleading_score: 40, overall_risk: 45 },
      credibilityScore: 72,
      verdict: '存疑',
      riskLevel: '中风险',
      reasons: ['需交叉核对原始财报'],
      suggestions: ['关注后续官方数据'],
    },
    inputSummary: '财政部称地方债务在限额内总体可控，市场短期流动性压力有限。',
    inputTitle: '中国债务抵御全球动荡：财政部回应市场关切',
    inputContent: '财政部最新表态称，地方政府专项债务限额内发行节奏平稳，风险总体可控。市场分析人士认为短期流动性压力有限。',
    inputUrl: 'https://example.com/news/mock-1',
    resultJson: {
      meta: {
        newsTitle: '中国债务抵御全球动荡：财政部回应市场关切',
        newsSummary: '财政部称地方债务在限额内总体可控，市场短期流动性压力有限。',
      },
      facts: [{ time: '近日', subject: '财政部', event: '债务风险可控', source: '通报' }],
      risk: { stance: '中立', sensational_score: 30, misleading_score: 40, overall_risk: 45 },
      credibilityScore: 72,
      verdict: '存疑',
      riskLevel: '中风险',
      reasons: ['需交叉核对原始财报'],
      suggestions: ['关注后续官方数据'],
    },
  },
  {
    id: 2,
    createdAt: '2026-04-01T10:12:00.000Z',
    queryType: '多篇分析',
    newsSummary: '两篇报道在关键数据援引上存在差异，建议待核验。',
    status: 'success',
    newsTitle: '多篇交叉分析（2条来源）',
    newsBody: '### 来源 1\n文本 A\n\n### 来源 2\n文本 B',
    sourceUrl: null,
    sourceName: 'Source A / Source B',
    fullAnalysisJson: {
      consistencyScore: 58,
      conflicts: ['数据口径不一致'],
      recommendation: '待核验',
    },
    inputSummary: '两篇报道在关键数据援引上存在差异，建议待核验。',
    inputTitle: '多篇交叉分析（2条来源）',
    inputContent: '### 来源 1\n文本 A\n\n### 来源 2\n文本 B',
    inputUrl: null,
    resultJson: {
      consistencyScore: 58,
      conflicts: ['数据口径不一致'],
      recommendation: '待核验',
    },
  },
]
