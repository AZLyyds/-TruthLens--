import axios from 'axios'

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const CHAT_COMPLETIONS_PATH = '/chat/completions'
const MODEL = 'qwen-turbo'
const REQUEST_TIMEOUT = 10000
const MAX_RETRIES = 1

function getApiKey() {
  return process.env.DASHSCOPE_API_KEY || ''
}

function toFailure(msg) {
  return { success: false, data: null, msg }
}

function toSuccess(data, msg = 'ok') {
  return { success: true, data, msg }
}

function extractJsonText(raw) {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim()
  }
  return trimmed
}

function parseStrictJson(raw, fallback) {
  try {
    const jsonText = extractJsonText(raw)
    if (!jsonText) return fallback
    const parsed = JSON.parse(jsonText)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function normalizeFactsPayload(parsed) {
  const facts = Array.isArray(parsed?.facts) ? parsed.facts : []
  return {
    facts: facts.map((item) => ({
      time: String(item?.time || ''),
      subject: String(item?.subject || ''),
      event: String(item?.event || ''),
      source: String(item?.source || ''),
    })),
  }
}

function toScore(value) {
  const num = Number(value)
  if (Number.isNaN(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

function normalizeRiskPayload(parsed) {
  let stance = String(parsed?.stance || '中立').trim()
  if (stance === '偏向') stance = '支持'
  if (!['中立', '支持', '反对'].includes(stance)) stance = '中立'
  return {
    stance,
    sensational_score: toScore(parsed?.sensational_score),
    misleading_score: toScore(parsed?.misleading_score),
    overall_risk: toScore(parsed?.overall_risk),
  }
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
})

async function requestCompletion(messages) {
  const apiKey = getApiKey()
  if (!apiKey) return toFailure('DASHSCOPE_API_KEY 未配置')

  let attempt = 0
  let lastError = null

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await client.post(
        CHAT_COMPLETIONS_PATH,
        {
          model: MODEL,
          messages,
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      )
      const content = response?.data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        return toFailure('AI 返回内容为空')
      }
      return toSuccess(content)
    } catch (error) {
      lastError = error
      attempt += 1
      if (attempt > MAX_RETRIES) break
    }
  }

  const msg =
    lastError?.response?.data?.error?.message ||
    lastError?.response?.data?.message ||
    lastError?.message ||
    '调用 AI 服务失败'
  return toFailure(msg)
}

export async function extractFacts(text) {
  try {
    if (!text || !String(text).trim()) return toFailure('text 不能为空')
    const prompt =
      `你是一个事实抽取助手。请从下面新闻文本中抽取客观事实，输出严格 JSON 格式，不要多余解释：\n` +
      `{\n` +
      `  "facts": [\n` +
      `    {\n` +
      `      "time": "时间",\n` +
      `      "subject": "主体",\n` +
      `      "event": "事件",\n` +
      `      "source": "信息来源"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n` +
      `新闻内容：${text}`

    const completion = await requestCompletion([{ role: 'user', content: prompt }])
    if (!completion.success) return completion
    const parsed = parseStrictJson(completion.data, { facts: [] })
    return toSuccess(normalizeFactsPayload(parsed))
  } catch (error) {
    return toFailure(error?.message || 'extractFacts 执行失败')
  }
}

export async function analyzeRisk(text) {
  try {
    if (!text || !String(text).trim()) return toFailure('text 不能为空')
    const prompt =
      `你是内容安全分析助手。请对下面新闻做风险评估，输出 0–100 分数，仅返回 JSON：\n` +
      `{\n` +
      `  "stance": "中立/支持/反对",\n` +
      `  "sensational_score": 情绪煽动性0-100,\n` +
      `  "misleading_score": 误导性0-100,\n` +
      `  "overall_risk": 综合风险0-100\n` +
      `}\n` +
      `新闻内容：${text}`

    const completion = await requestCompletion([{ role: 'user', content: prompt }])
    if (!completion.success) return completion
    const parsed = parseStrictJson(completion.data, {
      stance: '中立',
      sensational_score: 0,
      misleading_score: 0,
      overall_risk: 0,
    })
    return toSuccess(normalizeRiskPayload(parsed))
  } catch (error) {
    return toFailure(error?.message || 'analyzeRisk 执行失败')
  }
}

export async function translate(text) {
  try {
    if (!text || !String(text).trim()) return toFailure('text 不能为空')
    const prompt = `请将以下内容翻译成中文，仅返回翻译结果：\n${text}`
    const completion = await requestCompletion([{ role: 'user', content: prompt }])
    if (!completion.success) return completion
    return toSuccess(String(completion.data).trim())
  } catch (error) {
    return toFailure(error?.message || 'translate 执行失败')
  }
}

export async function summarize(text) {
  try {
    if (!text || !String(text).trim()) return toFailure('text 不能为空')
    const prompt =
      `你是新闻摘要助手。请基于下面新闻生成中文概括，要求：\n` +
      `1) 只输出 2-3 句\n` +
      `2) 保留核心主体、关键事件、结果\n` +
      `3) 不要加入原文没有的事实\n` +
      `新闻内容：${text}`
    const completion = await requestCompletion([{ role: 'user', content: prompt }])
    if (!completion.success) return completion
    return toSuccess(String(completion.data).trim())
  } catch (error) {
    return toFailure(error?.message || 'summarize 执行失败')
  }
}

/** 单篇流程：在风险/事实分析之前抽取真实标题与 ≤100 字核心概括（禁止输出 URL 作标题） */
export async function extractNewsTitleAndSummary(cleanText) {
  try {
    const excerpt = String(cleanText || '').trim().slice(0, 8000)
    if (!excerpt) return toFailure('正文为空，无法提取标题')
    const prompt =
      `你是新闻编辑。下面是一段已去除网页导航/分享按钮等噪声的新闻正文。\n` +
      `请只输出一个 JSON 对象，不要 markdown 围栏，不要任何解释。\n` +
      `字段要求：\n` +
      `1) title：新闻真实标题，简短；若不是标准标题句式，用一句话概括主题；绝对不要输出 http(s) 链接或整段 URL。\n` +
      `2) summary：中文核心概括，严格不超过 100 个字符，客观、无 HTML。\n\n` +
      `正文：\n${excerpt}`
    const completion = await requestCompletion([{ role: 'user', content: prompt }])
    if (!completion.success) return completion
    const parsed = parseStrictJson(completion.data, null)
    if (!parsed || typeof parsed !== 'object') return toFailure('标题与概括 JSON 解析失败')
    let title = String(parsed.title || '')
      .trim()
      .replace(/\s+/g, ' ')
    let summary = String(parsed.summary || '')
      .trim()
      .replace(/\s+/g, ' ')
    if (/^https?:\/\//i.test(title) || /^www\./i.test(title)) {
      title = ''
    }
    if (summary.length > 100) summary = summary.slice(0, 100)
    if (!title) return toFailure('模型未返回有效标题')
    return toSuccess({ title, summary })
  } catch (error) {
    return toFailure(error?.message || 'extractNewsTitleAndSummary 执行失败')
  }
}

