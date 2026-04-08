export const users = [
  {
    userId: 'u_1',
    username: 'demo',
    password: 'demo123',
    preferences: ['国际政治', '科技', '财经', '深度阅读', '风险复核'],
    stats: { viewed: 126, analyzed: 59, highRiskHits: 12 },
  },
]

export const newsItems = [
  { id: '1', title: '多国媒体关注中国新能源合作进展', source: 'Global Times', risk: '低风险', publishedAt: '2026-04-01T10:40:00.000Z' },
  { id: '2', title: '某社交平台传播涉华不实经济数据', source: 'World Echo', risk: '高风险', publishedAt: '2026-04-01T10:12:00.000Z' },
  { id: '3', title: '国际机构发布区域贸易新报告', source: 'Reuters', risk: '中风险', publishedAt: '2026-04-01T09:35:00.000Z' },
  { id: '4', title: '海外论坛热议中国科技企业新产品', source: 'Tech Daily', risk: '中风险', publishedAt: '2026-04-01T08:20:00.000Z' },
]

export const historyItems = [
  { id: 'h_1', createdAt: '2026-04-01 19:40', title: '单篇分析：某国际平台经济报道', type: 'single' },
  { id: 'h_2', createdAt: '2026-04-01 19:12', title: '多篇分析：区域冲突相关新闻对比', type: 'multi' },
  { id: 'h_3', createdAt: '2026-04-01 18:35', title: '单篇分析：科技产业链评论文章', type: 'single' },
]

export const dashboardOverview = {
  todayCollected: 328,
  highRiskCount: 19,
  mediaCoverage: 42,
}

export const dashboardTrends = [
  { time: '00:00', riskIndex: 30 },
  { time: '04:00', riskIndex: 55 },
  { time: '08:00', riskIndex: 42 },
  { time: '12:00', riskIndex: 70 },
  { time: '16:00', riskIndex: 63 },
  { time: '20:00', riskIndex: 82 },
]

export const dashboardRanking = [
  { media: 'Reuters', credibility: 89 },
  { media: 'Global Times', credibility: 82 },
  { media: 'Tech Daily', credibility: 76 },
  { media: 'World Echo', credibility: 48 },
]

export const alertEvents = [
  {
    id: 'a_1',
    title: '涉华经济数据异常传播',
    riskLevel: '高风险',
    source: 'World Echo',
    createdAt: '2026-04-01T13:30:00.000Z',
  },
  {
    id: 'a_2',
    title: '科技政策解读出现冲突叙事',
    riskLevel: '中风险',
    source: 'Tech Daily',
    createdAt: '2026-04-01T12:00:00.000Z',
  },
]

export const alertRule = {
  riskThreshold: 70,
  enabled: true,
}

export const agentTasks = []
