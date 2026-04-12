/**
 * TruthLens — 可插拔 FakeScore 计算模块（线性加权 + 百分制）
 *
 * 约定：
 * - 所有特征取值应在 [0, 1]；语义为「风险/异常/操纵」分量，越高表示越不利于可信（越像假新闻侧信号）。
 * - 若你手头的原始量是「越高越好」（如网站可信度、历史准确率、多源一致性），请先映射为风险向：
 *   x_risk = 1 - x_good（并 clamp 到 [0,1]）。
 * - 不使用 x₄；β₀ = 0；无交互项。线性项 f(x)=Σβᵢxᵢ，全体非零 β 之和为 1，故 x 全为 1 时 f_max=1。
 * - FakeScore = (f / Σβ) × 100，满分为 100；P(fake) = f/Σβ ∈ [0,1]（与 Sigmoid 版不同，避免 f=1 时只有 ~73 分）。
 *
 * 分组与系数（每组之和严格等于指定老 β）：
 *   β₁+β₂+β₃ = 0.30，β₅+β₆+β₇ = 0.20，β₈+β₉+β₁₀ = 0.15，β₁₁+β₁₂+β₁₃ = 0.35
 */

/** @type {const} 特征键（无 x₄） */
export const FEATURE_KEYS = [
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
]

/**
 * 分组内权重分配说明（业务上可解释）：
 * - 来源：可信度缺失(x₁)与偏见(x₂)并重，历史差错(x₃)略轻（难长期估计）。
 * - 情绪：强度(x₅)略重于极性(x₆)与主观性(x₇)。
 * - 传播：深度/范围/突发性均分（数据常缺时常用中性 0.5）。
 * - 高级：多源不一致(x₁₁)权最高；标题党(x₁₂)次之；语言异常(x₁₃)再次之。
 */
export const BETA = {
  b0: 0,
  b1: 0.1,
  b2: 0.14,
  b3: 0.06,
  b5: 0.08,
  b6: 0.06,
  b7: 0.06,
  b8: 0.05,
  b9: 0.05,
  b10: 0.05,
  b11: 0.15,
  b12: 0.12,
  b13: 0.08,
}

// 分组和校验（浮点用容差）
const _sum = (a) => a.reduce((s, v) => s + v, 0)
const _near = (a, b) => Math.abs(a - b) < 1e-9
if (
  !_near(_sum([BETA.b1, BETA.b2, BETA.b3]), 0.3) ||
  !_near(_sum([BETA.b5, BETA.b6, BETA.b7]), 0.2) ||
  !_near(_sum([BETA.b8, BETA.b9, BETA.b10]), 0.15) ||
  !_near(_sum([BETA.b11, BETA.b12, BETA.b13]), 0.35)
) {
  throw new Error('fakeScoreModel: beta group sums violated')
}

/** Σβᵢ（参与加权的全部 β），用于 f 归一化与满分 100 对齐 */
export const SUM_BETA_X = _sum([
  BETA.b1,
  BETA.b2,
  BETA.b3,
  BETA.b5,
  BETA.b6,
  BETA.b7,
  BETA.b8,
  BETA.b9,
  BETA.b10,
  BETA.b11,
  BETA.b12,
  BETA.b13,
])

function clamp01(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/**
 * 线性部分 f(x)（不含 x₄）
 */
export function computeF(features) {
  const x1 = clamp01(features.x1)
  const x2 = clamp01(features.x2)
  const x3 = clamp01(features.x3)
  const x5 = clamp01(features.x5)
  const x6 = clamp01(features.x6)
  const x7 = clamp01(features.x7)
  const x8 = clamp01(features.x8)
  const x9 = clamp01(features.x9)
  const x10 = clamp01(features.x10)
  const x11 = clamp01(features.x11)
  const x12 = clamp01(features.x12)
  const x13 = clamp01(features.x13)

  const linear =
    BETA.b0 +
    BETA.b1 * x1 +
    BETA.b2 * x2 +
    BETA.b3 * x3 +
    BETA.b5 * x5 +
    BETA.b6 * x6 +
    BETA.b7 * x7 +
    BETA.b8 * x8 +
    BETA.b9 * x9 +
    BETA.b10 * x10 +
    BETA.b11 * x11 +
    BETA.b12 * x12 +
    BETA.b13 * x13

  return {
    f: linear,
    terms: {
      x1: BETA.b1 * x1,
      x2: BETA.b2 * x2,
      x3: BETA.b3 * x3,
      x5: BETA.b5 * x5,
      x6: BETA.b6 * x6,
      x7: BETA.b7 * x7,
      x8: BETA.b8 * x8,
      x9: BETA.b9 * x9,
      x10: BETA.b10 * x10,
      x11: BETA.b11 * x11,
      x12: BETA.b12 * x12,
      x13: BETA.b13 * x13,
    },
    x: {
      x1,
      x2,
      x3,
      x5,
      x6,
      x7,
      x8,
      x9,
      x10,
      x11,
      x12,
      x13,
    },
  }
}

/**
 * 兼容旧代码：Sigmoid。当前主路径 FakeScore 已改为线性映射，本函数仍保留供需要时调用。
 */
export function sigmoid(f) {
  if (f >= 35) return 1
  if (f <= -35) return 0
  return 1 / (1 + Math.exp(-f))
}

/**
 * P(fake) = f / Σβ（虚假强度 0–1）；FakeScore = P(fake)×100。x 全为 1 时 f=Σβ，得 100 分。
 */
export function computeFakeScore(features) {
  const { f, terms, x } = computeF(features)
  const fSafe = Math.max(0, Math.min(SUM_BETA_X, f))
  const denom = SUM_BETA_X > 0 ? SUM_BETA_X : 1
  const pFake = fSafe / denom
  const fakeScore = Number((pFake * 100).toFixed(4))
  return {
    fakeScore,
    pFake: Number(pFake.toFixed(8)),
    f: Number(f.toFixed(8)),
    terms,
    x,
    beta: { ...BETA },
  }
}

/**
 * 可选：由「越高越好」的原始量构造风险向特征（0=无风险，1=最差）
 */
export function invertGoodToRisk(good01) {
  return clamp01(1 - clamp01(good01))
}
