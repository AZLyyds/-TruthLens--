export interface NewsAnalysisParams {
  text?: string
  url?: string
  newsId?: number
}

export interface AnalysisDimensions {
  sourceCredibility?: number
  factConsistency?: number
  emotionManipulation?: number
  propagationMisleading?: number
}

export interface AnalysisMeta {
  newsTitle?: string
  newsSummary?: string
  sourceName?: string
}

/** 12 维 + 线性加权 FakeScore（单篇分析第二轮千问抽取） */
export interface TruthLensFakeScoreModelPayload {
  features?: Record<string, number>
  featureReasons?: Record<string, string>
  fakeScore?: number
  pFake?: number
  f?: number
  computedAt?: string
}

export interface AnalysisResult {
  credibilityScore: number
  verdict: string
  riskLevel: string
  /** 公式计算的 0–100 FakeScore；与旧版 risk 模型并存时以此为主展示 */
  formulaFakeScore?: number
  truthLensFakeScoreModel?: TruthLensFakeScoreModelPayload | null
  aiSummary?: string
  detailedReport?: string
  facts?: Array<{
    time?: string
    subject?: string
    event?: string
    source?: string
  }>
  detailedReportTrace?: {
    rounds?: number
    source?: string
    draftText?: string
    refinedText?: string
    finalText?: string
  }
  reasons?: string[]
  suggestions?: string[]
  dimensions?: AnalysisDimensions
  meta?: AnalysisMeta
}
