/**
 * 与 backend/src/fakeScoreModel.js 中 BETA 保持一致，仅用于界面解释（勿改业务计算逻辑）。
 * 分组和：x1–x3 → 0.30；x5–x7 → 0.20；x8–x10 → 0.15；x11–x13 → 0.35；全体 β 之和 = 1（β₀=0）。
 * FakeScore = (Σβx / Σβ) × 100，x 全为 1 时满分 100。
 */
export const FAKE_SCORE_BETA: Record<string, number> = {
  x1: 0.1,
  x2: 0.14,
  x3: 0.06,
  x5: 0.08,
  x6: 0.06,
  x7: 0.06,
  x8: 0.05,
  x9: 0.05,
  x10: 0.05,
  x11: 0.15,
  x12: 0.12,
  x13: 0.08,
}

export const FAKE_SCORE_FEATURE_ORDER = [
  'x1',
  'x2',
  'x3',
  'x5',
  'x6',
  'x7',
  'x8',
  'x9',
  'x10',
  'x11',
  'x12',
  'x13',
] as const

/** 与算法引擎维度一一对应，供界面展示（勿与 β 权重混淆）。 */
export const FAKE_SCORE_FEATURE_LABELS: Record<(typeof FAKE_SCORE_FEATURE_ORDER)[number], string> = {
  x1: '来源不可信度',
  x2: '媒体偏见',
  x3: '报道差错 / 不可核验',
  x5: '情绪煽动',
  x6: '情绪极性极端',
  x7: '主观性',
  x8: '传播链深度',
  x9: '扩散范围',
  x10: '突发性 / 异常节奏',
  x11: '多源不一致 / 孤证',
  x12: '标题党',
  x13: '语言异常',
}
