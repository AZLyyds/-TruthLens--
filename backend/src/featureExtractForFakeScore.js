/**
 * 调用通义千问从新闻文本抽取 12 维风险向特征（无 x₄），再套 fakeScoreModel 计算 FakeScore。
 * 供脚本或后续工作流异步任务复用，不替代现有 server 内分析路径。
 */
import axios from 'axios'
import { computeFakeScore, FEATURE_KEYS } from './fakeScoreModel.js'

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const CHAT_COMPLETIONS_PATH = '/chat/completions'
const MODEL = 'qwen-turbo'
const TIMEOUT_MS = 45000

function extractJsonText(raw) {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1).trim()
  return trimmed
}

function parseFeatureJson(content) {
  try {
    const text = extractJsonText(content)
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeFeatures(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const out = {}
  for (const k of FEATURE_KEYS) {
    const v = parsed[k] ?? parsed[`x_${k.slice(1)}`]
    const n = Number(v)
    out[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0 // 保留浮点，勿四舍五入成整数
  }
  return out
}

const REASON_MAX_CHARS = 480

/** 与 x 同键的简要依据（通义输出在同一份 JSON 的 reasons 对象内） */
function normalizeFeatureReasons(parsed) {
  const raw =
    parsed?.reasons && typeof parsed.reasons === 'object' && !Array.isArray(parsed.reasons)
      ? parsed.reasons
      : {}
  const out = {}
  for (const k of FEATURE_KEYS) {
    const v = raw[k]
    let s = typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : ''
    if (s.length > REASON_MAX_CHARS) s = `${s.slice(0, REASON_MAX_CHARS)}…`
    out[k] = s
  }
  return out
}

/** 12 维全取同一常数 c 时 f=c·Σβ，FakeScore 恰为 100c（如全 0.9→90）；用于检测千问偷懒 */
function featuresAllNearlyEqual(features) {
  const vals = FEATURE_KEYS.map((k) => Number(features[k]))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  return max - min <= 1e-9
}

/** 传播维 x8/x9/x10 权各仅 0.05，模型常把其余九维粘成同一数（如全 0.92）再微调这三维凑目标 f */
const MAIN_SPREAD_KEYS = FEATURE_KEYS.filter((k) => k !== 'x8' && k !== 'x9' && k !== 'x10')

function featuresMainDimsCollapsed(features) {
  const vals = MAIN_SPREAD_KEYS.map((k) => Number(features[k]))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  return max - min <= 0.065
}

function shouldRetryWeakFeatures(features) {
  return featuresAllNearlyEqual(features) || featuresMainDimsCollapsed(features)
}

const SYSTEM_PROMPT = `你是新闻可信度特征抽取器。只输出一个 JSON 对象，不要 markdown，不要解释。
所有字段取值必须在闭区间 [0,1]，且语义为「风险/异常/操纵」：0 表示几乎无该风险，1 表示很强。
字段含义（风险向）：
- x1：来源/网站历史不可信度（陌生域名、钓鱼感、无权威背书则高）
- x2：媒体偏见/立场极端程度
- x3：报道差错或不可核验程度（事实含糊、无法交叉验证则高）
- x5：情绪煽动强度
- x6：情绪极性极端度（非中立、对立表述强则高）
- x7：主观性（评论性、断言多、少可验证事实则高）
- x8：传播链深度（单篇无旁证可给 0.5 中性）
- x9：扩散范围（无数据可给 0.5）
- x10：突发性/异常传播节奏（无数据可给 0.5）
- x11：多源不一致或孤证程度（只有单一叙事、与其它信源冲突则高）
- x12：标题党程度
- x13：语言异常（机翻感、乱码、怪异句式则高）
不要输出 x4。

你必须在同一 JSON 根级增加 **reasons** 对象：键名与 x 完全一致（x1、x2、x3、x5、x6、x7、x8、x9、x10、x11、x12、x13），每个值为 30～120 字的简体中文，说明**为何给出该维 x**（引用正文或摘要里可观察到的表述；勿复述 x 的数值、勿写 β 或公式）。

重要：12 个 x 在真实稿件上几乎不可能风险完全一致。**禁止**所有键取同一个数；**禁止**把 x1、x2、x3、x5、x6、x7、x11、x12、x13 九维写成同一常数（如全 0.92），再只在 x8、x9、x10 上微调来凑加权总分——β 对后三维权很小，这种写法在数学上仍能凑出「整齐」的 P(fake)，属于无效输出。除 x8/x9/x10 在信息不足时可接近 0.5 外，**上述九维各自独立**估计，两两之间至少多数应对应不同的小数（4～6 位）。

当用户消息中包含【百炼工作流结构化摘要】时，摘要已刻意不包含工作流给出的「可信指数/虚假总分」类数字，请你仅根据事实要点、理由、总结文字与正文独立判断各维 x，不要用「100−可信」之类心算去凑 FakeScore。最终 FakeScore 由服务端用固定 β 对 x 线性合成：FakeScore=(Σβᵢxᵢ/Σβ)×100；你只输出含 x 与 reasons 的一份 JSON。`

/**
 * @param {{ title?: string, content?: string, description?: string, sourceName?: string, workflowContext?: string }} article
 * @returns {Promise<{ success: boolean, msg?: string, features?: object, featureReasons?: object, score?: object, rawContent?: string }>}
 */
export async function extractFeaturesAndComputeFakeScore(article) {
  const apiKey = process.env.DASHSCOPE_API_KEY || ''
  if (!apiKey) {
    return { success: false, msg: 'DASHSCOPE_API_KEY 未配置' }
  }

  const title = String(article?.title || '').trim() || '（无标题）'
  const source = String(article?.sourceName || '').trim() || '未知来源'
  const desc = String(article?.description || '').trim()
  const body = String(article?.content || '').trim()
  const excerpt = [desc, body].filter(Boolean).join('\n\n').slice(0, 12000)

  const wfCtx = String(article?.workflowContext || '').trim()
  const wfBlock =
    wfCtx.length > 0
      ? `\n\n【百炼工作流结构化摘要】（与正文一并阅读；摘要已剔除综合可信/虚假总分与各维可信度分，仅保留叙述性字段，请独立判断各维 x）\n${wfCtx.slice(0, 12000)}`
      : ''

  const userContent =
    `来源：${source}\n标题：${title}\n\n正文与摘要：\n${excerpt || '（无正文）'}${wfBlock}\n\n` +
    `请输出**一个** JSON：根级含 ${FEATURE_KEYS.join(', ')} 及 **reasons** 对象（与 x 同键，每条约 30～120 字中文依据）。x 每个值为 (0,1) 闭区间内 4～6 位小数；**不要** 12 个 x 全相同，**不要** x1/x2/x3/x5/x6/x7/x11/x12/x13 九键同值或彼此相差小于 0.07；避免大量 x 恰好是 0.92、0.9、0.5 这类整齐数。`

  const baseMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  const retryHint =
    '上一版不合格：要么 12 维 x 全相同，要么 x1/x2/x3/x5/x6/x7/x11/x12/x13 九维几乎同一常数、只在 x8/x9/x10 上微调（刻意凑加权分）。请重新只输出一个 JSON：上述九维 x 必须拉开差距（建议任意两维相差 ≥0.08，4～6 位小数）；**同时**根级须含完整 **reasons** 对象（键与 x 一致，每条约 30～120 字中文，说明该维打分依据）。'

  try {
    let messages = baseMessages
    let rawContent = ''
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const temperature = attempt === 0 ? 0.55 : attempt === 1 ? 0.82 : 0.92
      const response = await axios.post(
        `${BASE_URL}${CHAT_COMPLETIONS_PATH}`,
        {
          model: MODEL,
          temperature,
          messages,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: TIMEOUT_MS,
        },
      )

      rawContent = response?.data?.choices?.[0]?.message?.content
      if (typeof rawContent !== 'string' || !rawContent.trim()) {
        return { success: false, msg: '千问返回为空' }
      }

      const parsed = parseFeatureJson(rawContent)
      const features = normalizeFeatures(parsed)
      if (!features) {
        return { success: false, msg: '无法解析特征 JSON', rawContent }
      }

      const featureReasons = normalizeFeatureReasons(parsed)
      const lastAttempt = attempt === maxAttempts - 1
      if (!shouldRetryWeakFeatures(features) || lastAttempt) {
        const score = computeFakeScore(features)
        return { success: true, features, featureReasons, score, rawContent }
      }

      messages = [
        ...baseMessages,
        { role: 'assistant', content: rawContent.trim() },
        { role: 'user', content: retryHint },
      ]
    }
    return { success: false, msg: '特征抽取异常', rawContent }
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      '千问调用失败'
    return { success: false, msg }
  }
}
