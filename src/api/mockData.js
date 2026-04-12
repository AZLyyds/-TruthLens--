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
  detailedReport:
    '从文本可核验信息看，报道围绕“地方债务风险可控”展开，已明确给出主体为财政部、时间为近日回应、事件为对专项债与流动性压力的公开说明。当前风险等级为中风险，可信度68/100，主要短板在于核心数据来源透明度不足，且与部分主流媒体结论存在口径差异，导致结论稳定性一般。若作为传播素材，建议先补齐原始统计口径与权威来源对照，再进行转述，避免在缺少完整上下文时放大片段信息。',
  detailedReportTrace: {
    rounds: 2,
    source: 'mock_refined',
    draftText:
      '该文本围绕财政部对于地方债务的回应展开，显示风险总体可控，但来源口径尚需交叉核验。',
    refinedText:
      '从可核验信息看，报道核心是财政部对地方债务风险的公开回应，时间锚点清晰，主体明确，但关键统计口径未完整披露，且与部分媒体结论存在差异，导致稳定性一般。当前风险等级中风险、可信度68/100，建议在传播前补齐原始数据来源并做跨源对照。',
    finalText:
      '从文本可核验信息看，报道围绕“地方债务风险可控”展开，已明确给出主体为财政部、时间为近日回应、事件为对专项债与流动性压力的公开说明。当前风险等级为中风险，可信度68/100，主要短板在于核心数据来源透明度不足，且与部分主流媒体结论存在口径差异，导致结论稳定性一般。若作为传播素材，建议先补齐原始统计口径与权威来源对照，再进行转述，避免在缺少完整上下文时放大片段信息。',
  },
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
  formulaFakeScore: 48,
  truthLensFakeScoreModel: {
    fakeScore: 48,
    pFake: 0.48,
    f: 0,
    computedAt: new Date().toISOString(),
    features: { x1: 0.2, x2: 0.2, x3: 0.2, x5: 0.3, x6: 0.2, x7: 0.2, x8: 0.5, x9: 0.5, x10: 0.5, x11: 0.2, x12: 0.2, x13: 0.1 },
    featureReasons: {
      x1: 'Mock：来源域名可识别，未见明显仿冒。',
      x2: 'Mock：叙述相对平稳。',
      x3: 'Mock：部分信息待交叉验证。',
      x5: 'Mock：情绪词适中。',
      x6: 'Mock：对立表述不多。',
      x7: 'Mock：事实与评论比例一般。',
      x8: 'Mock：传播链信息缺失，取中性。',
      x9: 'Mock：无扩散数据，取中性。',
      x10: 'Mock：节奏信息不足，取中性。',
      x11: 'Mock：单源叙事为主。',
      x12: 'Mock：标题未严重夸大。',
      x13: 'Mock：语言正常。',
    },
  },
}

export const mockMultiAnalysis = {
  consistencyScore: 61,
  conflicts: ['来源A与来源B在事件时间线存在冲突'],
  sourceAuthorityDiff: 'A高于B',
  recommendation: '建议标注“待核验”，暂不作为确定事实传播。',
  deepAnalysis: {
    coreFacts: ['两篇稿件都确认事件发生在同一地区并与同一主体相关', '双方都提到核心事件已造成实际影响'],
    factDifferences: ['时间线差异：来源A称“先发生冲突后爆炸”，来源B称“爆炸后出现冲突”', '关键细节冲突：来源A提到具体人数，来源B未给出同口径数字'],
    missingInfo: ['两稿均未明确最初消息来源链路', '两稿均未给出可核验的原始现场材料链接'],
    verificationConclusion: '当前材料可确认“同一事件已发生”，但关键时间顺序与细节口径存在冲突，暂不宜形成确定性叙事。',
    actionSuggestions: ['优先核查事件发生时间的原始发布记录', '针对冲突数字逐条回查一手来源并标注口径', '传播时附“待核验”标识并保留对照来源'],
  },
  detailedReport:
    '本次多源比对的一致性评分为61%，分歧主要集中在时间线描述与核心数据口径：来源A将关键事件时间提前，来源B则强调后续修订信息，导致结论指向不完全一致。结合来源权威性差异（A高于B）看，当前结论可作为参考但不宜直接定性。建议先回查两条来源的原始发布时间与修订记录，再对核心数字做交叉复核后传播。',
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
