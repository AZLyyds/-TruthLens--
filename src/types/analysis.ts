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

export interface AnalysisResult {
  credibilityScore: number
  verdict: string
  riskLevel: string
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
