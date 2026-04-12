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
