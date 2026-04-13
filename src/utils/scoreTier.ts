export type ScoreTier = 'low' | 'mid' | 'high'

export type ScoreTierMode = 'credibility' | 'fake'

/** 可信指数：越高越好 → tier 表示「风险观感」：low=可信偏高, mid=中等, high=可信偏低 */
/** FakeScore：越高越不可信 → tier：low=风险偏低, mid=中风险, high=高风险 */
export function scoreToTier(score: unknown, mode: ScoreTierMode): ScoreTier {
  const n = Number(score)
  if (Number.isNaN(n)) return 'mid'
  const clamped = Math.min(100, Math.max(0, n))
  if (mode === 'credibility') {
    if (clamped >= 72) return 'low'
    if (clamped >= 42) return 'mid'
    return 'high'
  }
  if (clamped >= 68) return 'high'
  if (clamped >= 38) return 'mid'
  return 'low'
}

export function tierLabel(tier: ScoreTier, mode: ScoreTierMode): string {
  if (mode === 'credibility') {
    if (tier === 'low') return '可信偏高'
    if (tier === 'mid') return '可信中等'
    return '可信偏低'
  }
  if (tier === 'low') return '风险偏低'
  if (tier === 'mid') return '中风险'
  return '高风险'
}

/** CSS class 后缀：可信指数用 cred-*，Fake 用 fake-*，便于不同语义配色 */
export function tierClassSuffix(tier: ScoreTier, mode: ScoreTierMode): string {
  const prefix = mode === 'credibility' ? 'cred' : 'fake'
  return `${prefix}-${tier}`
}
