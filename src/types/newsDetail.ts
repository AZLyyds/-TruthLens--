/** 新闻详情 API（/news/:id）归一化结构，字段缺省时前端容错渲染 */

/** MCP 相关报道条目（与后端 multiSourceCheck.mcpRelatedArticles 一致） */
export interface McpRelatedArticleRef {
  title: string
  source: string
}

/** 工作流 multiSourceCheck（与 output_json.multiSourceCheck 一致） */
export interface NewsMultiSourceCheck {
  isSameEvent: boolean | null
  isConsistent: string | null
  hasAuthoritySource: boolean | null
  description: string
  mcpRelatedArticles: McpRelatedArticleRef[]
}

/** 12 维风险特征 + 线性加权 FakeScore（output_json.truthLensFakeScoreModel） */
export interface NewsDetailFakeScoreModel {
  features: Record<string, number> | null
  /** 与 features 同键：通义返回的各维打分依据（简体中文） */
  featureReasons?: Record<string, string> | null
  fakeScore: number | null
  pFake: number | null
  f: number | null
  computedAt?: string | null
  error?: string | null
}

export interface NewsDetailLatestAnalysis {
  fakeScore: number
  riskLevel: string
  analyzedAt?: string
  credibilityScore?: number
  verdict?: string
  reasons?: string[]
  suggestions?: string[]
  facts?: unknown[]
  risk?: Record<string, unknown>
  dimensions?: Record<string, number>
  meta?: Record<string, unknown>
  aiSummary?: string
}

export interface NewsDetailPayload {
  id: number
  newsUid?: string
  title: string
  titleCN?: string | null
  summary: string
  source?: string | null
  url?: string | null
  /** 工作流/库内原文配图链接；不可达时详情页会改用占位预览图 */
  image?: string | null
  content?: string | null
  contentCN?: string | null
  description?: string | null
  publishedAt?: string | null
  lang?: string
  language?: string
  country?: string | null
  chinaRelated?: boolean
  facts?: unknown[]
  fakeScore?: number | null
  riskLevel?: string | null
  riskReason?: string
  multiSourceCheck?: NewsMultiSourceCheck
  credibilityScore?: number | null
  verdict?: string | null
  reasons?: string[]
  suggestions?: string[]
  dimensions?: Record<string, number> | null
  latestAnalysis?: NewsDetailLatestAnalysis | null
  /** 12 维特征 + 模型 FakeScore（与 credibilityScore 可能口径不同） */
  fakeScoreModel?: NewsDetailFakeScoreModel | null
  /** pending：后台通义抽取中；ready/failed：终态（旧数据无此字段表示未走新流程） */
  fakeScoreModelStatus?: 'pending' | 'ready' | 'failed' | null
  fakeScoreModelError?: string | null
  rawWorkflow?: Record<string, unknown> | null
}
