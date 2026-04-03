/** 新闻详情 API（/news/:id）归一化结构，字段缺省时前端容错渲染 */

/** MCP 相关报道条目（与后端 multiSourceCheck.mcpRelatedArticles 一致） */
export interface McpRelatedArticleRef {
  title: string
  source: string
}

/** 工作流 multiSourceCheck（仅五字段，与后端 output_json.multiSourceCheck 一致） */
export interface NewsMultiSourceCheck {
  isSameEvent: boolean | null
  isConsistent: string | null
  hasAuthoritySource: boolean | null
  description: string
  mcpRelatedArticles: McpRelatedArticleRef[]
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
  rawWorkflow?: Record<string, unknown> | null
}
