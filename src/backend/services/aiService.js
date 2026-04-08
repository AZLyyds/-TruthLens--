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

export async function generateDetailedSingleReport(payload) {
  try {
    const title = String(payload?.title || '').trim()
    const summary = String(payload?.summary || '').trim()
    const riskLevel = String(payload?.riskLevel || '').trim()
    const credibilityScore = Number(payload?.credibilityScore)
    const reasons = Array.isArray(payload?.reasons) ? payload.reasons.slice(0, 4) : []
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.slice(0, 4) : []
    const facts = Array.isArray(payload?.facts) ? payload.facts.slice(0, 3) : []

    if (!title && !summary) return toFailure('report payload 为空')

    const prompt =
      `你是“涉华新闻核验分析师”。请基于输入信息写一段具体、实在的中文分析段落。\n` +
      `要求：\n` +
      `1) 仅输出一段纯文本，不要标题、不要分点、不要 JSON、不要 markdown。\n` +
      `2) 目标约 240 字（允许 200-280 字）。\n` +
      `3) 内容要“有细节”：至少包含 2 个可核验的信息点（来自事实片段/关键原因）。\n` +
      `4) 必须明确写出“可信度X/100”和风险等级，不要改写该分值。\n` +
      `5) 禁止空泛表达（如“值得关注”“建议进一步观察”这类套话），禁止编造输入里没有的事实。\n\n` +
      `输入信息：\n` +
      `标题：${title || '（无）'}\n` +
      `摘要：${summary || '（无）'}\n` +
      `风险等级：${riskLevel || '（无）'}\n` +
      `可信度：${Number.isNaN(credibilityScore) ? '（无）' : credibilityScore}\n` +
      `关键原因：${reasons.length ? reasons.join('；') : '（无）'}\n` +
      `建议动作：${suggestions.length ? suggestions.join('；') : '（无）'}\n` +
      `事实片段：${facts.length ? facts.map((f) => [f?.time, f?.subject, f?.event].filter(Boolean).join(' / ')).join('；') : '（无）'}`

    const normalizeText = (raw) =>
      String(raw || '')
        .replace(/\s+/g, ' ')
        .trim()
    const effectiveLen = (s) => s.replace(/\s/g, '').length

    // 第一轮：先产出信息充分的草稿
    const completion1 = await requestCompletion([{ role: 'user', content: prompt }])
    const draft = completion1.success ? normalizeText(completion1.data) : ''

    // 第二轮：固定执行润色扩写（按你的要求，明确双请求）
    const reprompt =
      `请将下面草稿改写成 220-300 字的一整段中文分析，要求更具体、更可执行：\n` +
      `硬性要求：\n` +
      `1) 必须保留并明确写出“可信度 ${Number.isNaN(credibilityScore) ? '（无）' : credibilityScore}/100”与“风险等级${riskLevel || '（无）'}”。\n` +
      `2) 至少包含两条可核验细节（时间/主体/事件/来源/关键原因）。\n` +
      `3) 只输出一段正文，不要分点、不要标题、不要空话。\n` +
      `4) 不得编造输入中不存在的事实。\n\n` +
      `草稿：${draft || '（草稿为空，请基于给定信息直接生成）'}\n\n` +
      `原始输入：\n${prompt}`
    const completion2 = await requestCompletion([{ role: 'user', content: reprompt }])
    if (completion2.success) {
      const text2 = normalizeText(completion2.data)
      if (text2 && effectiveLen(text2) >= 180) {
        return toSuccess({
          finalText: text2,
          draftText: draft || '',
          refinedText: text2,
          rounds: 2,
          source: 'model_refined',
        })
      }
    }

    // 最终兜底：本地组装成较完整段落，避免页面只剩一行
    const factText = facts.length
      ? facts
          .map((f) => [f?.time, f?.subject, f?.event].filter(Boolean).join('，'))
          .filter(Boolean)
          .slice(0, 2)
          .join('；')
      : '当前文本可抽取到的结构化事实有限'
    const reasonText = reasons.length ? reasons.slice(0, 3).join('；') : '未识别到稳定且可重复验证的核心证据链'
    const suggestionText = suggestions.length ? suggestions.slice(0, 2).join('；') : '建议保留原始链接与关键片段，补充对照来源后再传播'
    const fallbackText =
      `围绕“${title || '该新闻文本'}”的核验结果显示，当前风险等级为${riskLevel || '未判定'}，可信度为 ${
        Number.isNaN(credibilityScore) ? '—' : credibilityScore
      }/100。已识别的关键信息包括：${factText}。从证据链看，主要问题集中在${reasonText}，这会直接影响结论稳定性与传播可靠性。综合判断，该内容不宜脱离原文语境进行二次转述，后续处置建议是：${suggestionText}。`
    return toSuccess({
      finalText: fallbackText,
      draftText: draft || '',
      refinedText: completion2.success ? normalizeText(completion2.data) : '',
      rounds: 2,
      source: 'fallback_template',
    })
  } catch (error) {
    return toFailure(error?.message || 'generateDetailedSingleReport 执行失败')
  }
}

export async function generateDetailedMultiReport(payload) {
  try {
    const coreFacts = Array.isArray(payload?.coreFacts) ? payload.coreFacts.slice(0, 6) : []
    const factDifferences = Array.isArray(payload?.factDifferences) ? payload.factDifferences.slice(0, 8) : []
    const missingInfo = Array.isArray(payload?.missingInfo) ? payload.missingInfo.slice(0, 6) : []
    const verificationConclusion = String(payload?.verificationConclusion || '').trim()
    const actionSuggestions = Array.isArray(payload?.actionSuggestions) ? payload.actionSuggestions.slice(0, 6) : []

    const normalizeText = (raw) =>
      String(raw || '')
        .replace(/\s+/g, ' ')
        .trim()
    const dedupeSentences = (text) => {
      const parts = String(text || '')
        .split(/[。！？!?]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const seen = new Set()
      const kept = []
      for (const p of parts) {
        const key = p.replace(/[，、,\s]/g, '')
        if (!key || seen.has(key)) continue
        seen.add(key)
        kept.push(p)
      }
      return kept.join('。') + (kept.length ? '。' : '')
    }
    const effectiveLen = (s) => s.replace(/\s/g, '').length

    const prompt =
      `你是“多源事件核查分析师”。请写一段具体的深度分析总结，重点围绕事实差异与核查路径。\n` +
      `要求：\n` +
      `1) 只输出一段正文，不要标题，不要分点，不要 JSON。\n` +
      `2) 目标 200-280 字。\n` +
      `3) 必须引用至少2条具体事实差异，并至少提及1个信息缺失项。\n` +
      `4) 必须给出可落地核查结论与传播建议，不得只谈评分或权威性。\n` +
      `5) 禁止编造输入中没有的信息。\n\n` +
      `输入：\n` +
      `核心事实一致点：${coreFacts.length ? coreFacts.join('；') : '（无）'}\n` +
      `事实分歧点：${factDifferences.length ? factDifferences.join('；') : '（无）'}\n` +
      `信息缺失项：${missingInfo.length ? missingInfo.join('；') : '（无）'}\n` +
      `核查结论：${verificationConclusion || '（无）'}\n` +
      `执行建议：${actionSuggestions.length ? actionSuggestions.join('；') : '（无）'}`

    const first = await requestCompletion([{ role: 'user', content: prompt }])
    const draft = first.success ? normalizeText(first.data) : ''
    const secondPrompt =
      `请将以下草稿改写为更具体的一段（220-300字），保留事实冲突细节与核查建议，禁止空泛套话。\n` +
      `草稿：${draft || '（草稿为空，请直接基于输入生成）'}\n\n原始输入：\n${prompt}`
    const second = await requestCompletion([{ role: 'user', content: secondPrompt }])
    if (second.success) {
      const finalText = dedupeSentences(normalizeText(second.data))
      if (finalText && effectiveLen(finalText) >= 160) return toSuccess(finalText)
    }
    if (draft && effectiveLen(draft) >= 160) return toSuccess(dedupeSentences(draft))
    return toFailure('多篇深度总结生成失败：千问返回内容过短或为空')
  } catch (error) {
    return toFailure(error?.message || 'generateDetailedMultiReport 执行失败')
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

