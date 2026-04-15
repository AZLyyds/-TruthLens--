import axios from 'axios'

const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const CHAT_COMPLETIONS_PATH = '/chat/completions'
const MODEL = 'qwen-turbo'
const REQUEST_TIMEOUT = 10000
/** 单篇/多篇深度 Markdown 报告：长文生成需要更长等待与更大输出上限 */
const REQUEST_TIMEOUT_REPORT = 120000
const REPORT_MAX_TOKENS = 8192
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

async function requestCompletion(messages, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) return toFailure('DASHSCOPE_API_KEY 未配置')

  const timeout = typeof options.timeout === 'number' ? options.timeout : REQUEST_TIMEOUT
  const body = {
    model: MODEL,
    messages,
    temperature: 0.2,
  }
  if (options.maxTokens != null) {
    body.max_tokens = options.maxTokens
  }

  let attempt = 0
  let lastError = null

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await client.post(
        CHAT_COMPLETIONS_PATH,
        body,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout,
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
    const normalizedText = String(text).replace(/\s+/g, ' ').trim()
    const excerpt = normalizedText.slice(0, 9000)
    const prompt =
      `你是一个“新闻事实抽取器”。请只基于给定新闻正文抽取“可核验事实”，输出严格 JSON，不要多余解释。\n` +
      `\n` +
      `抽取规则（必须遵守）：\n` +
      `1) 只保留原文中明确出现的信息，不得补充常识推断，不得编造机构名/数字/时间。\n` +
      `2) 优先抽取可用于多源比对的事实：时间、主体、关键事件、信息来源（最多 8 条，最少 3 条；若正文信息不足可少于 3 条，但不得胡编）。\n` +
      `3) 每条 event 必须具体，避免“进行了报道/表示关注”等空泛描述；尽量包含动作+对象或结果。\n` +
      `4) 若原文未给出 time/source，请填空字符串 ""，不要写“未知/未提及”。\n` +
      `5) 禁止输出与正文无关的泛化结论。\n` +
      `\n` +
      `输出格式（严格保持）：\n` +
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
      `\n` +
      `新闻内容：\n${excerpt}`

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
    const reasons = Array.isArray(payload?.reasons) ? payload.reasons.slice(0, 8) : []
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.slice(0, 8) : []
    const facts = Array.isArray(payload?.facts) ? payload.facts.slice(0, 10) : []

    if (!title && !summary) return toFailure('report payload 为空')

    const credText = Number.isNaN(credibilityScore) ? '（无）' : String(credibilityScore)
    const reportOpts = { timeout: REQUEST_TIMEOUT_REPORT, maxTokens: REPORT_MAX_TOKENS }

    const prompt =
      `你是资深「涉华新闻核验分析师」，面向专业读者写**超长、超详细**的中文 Markdown 报告（不要 JSON、不要代码围栏、不要表格）。\n` +
      `\n` +
      `【篇幅硬性要求——必须遵守，不可省略】\n` +
      `1) 统计方式：去掉 Markdown 符号（#、-、* 等）后，**正文纯汉字不少于 1100 字**；**理想区间 1300–2000 字**。宁可写长，不要写短。\n` +
      `2) 禁止用几句 bullet 敷衍代替正文；每个二级标题下必须有**多段完整叙述**（每段不少于 80 字）。\n` +
      `\n` +
      `【结构硬性要求】\n` +
      `1) 首行一级标题且仅一个：# 单篇核验报告\n` +
      `2) **至少 6 个**二级标题（##），**不得合并删减到少于 6 个**。建议模块名（可微调措辞，但须覆盖同等信息量）：\n` +
      `   ## 背景与议题界定\n` +
      `   ## 核心事实与可核验要点\n` +
      `   ## 叙事手法与潜在风险\n` +
      `   ## 可信度 ${credText}/100 与风险等级「${riskLevel || '（无）'}」的逐项解读\n` +
      `   ## 与事实片段、关键原因的对照分析\n` +
      `   ## 传播与核查的可执行建议\n` +
      `3) **每个 ## 下**必须包含：至少 **1 个**三级标题（###）作为子论点；至少 **3 条**无序列表（-），且每条列表不少于 25 字、须写清依据（来自输入中的哪条事实/原因/建议）。\n` +
      `4) 正文中必须**显式写出**「风险等级：${riskLevel || '（无）'}」与「可信度 ${credText}/100」**各至少两次**（可在不同小节），数值与措辞不得改写。\n` +
      `5) 禁止空泛套话与无信息量的过渡句；禁止编造输入中不存在的事实、人物、数据或信源。\n\n` +
      `输入信息：\n` +
      `标题：${title || '（无）'}\n` +
      `摘要：${summary || '（无）'}\n` +
      `风险等级：${riskLevel || '（无）'}\n` +
      `可信度：${credText}\n` +
      `关键原因：${reasons.length ? reasons.join('；') : '（无）'}\n` +
      `建议动作：${suggestions.length ? suggestions.join('；') : '（无）'}\n` +
      `事实片段：${facts.length ? facts.map((f) => [f?.time, f?.subject, f?.event, f?.source].filter(Boolean).join(' / ')).join('；') : '（无）'}`

    const normalizeMarkdown = (raw) =>
      String(raw || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n')
        .trim()

    const completion1 = await requestCompletion([{ role: 'user', content: prompt }], reportOpts)
    const draft = completion1.success ? normalizeMarkdown(completion1.data) : ''

    const reprompt =
      `以下是一篇单篇核验 Markdown 草稿。你的任务是：在**不编造新事实**的前提下，**大幅扩写与深化**为终稿。\n` +
      `\n` +
      `【终稿篇幅——硬性】去掉 Markdown 符号后的纯汉字 **不少于 1300 字**；**理想 1500–2200 字**。\n` +
      `【终稿结构——硬性】保留 # 单篇核验报告；**至少 6 个 ##**；每个 ## 下保留或补全 **### 子论点**、**多段叙述**与 **3 条以上**有实质内容的「-」列表。\n` +
      `【必须复述】文中仍须**至少两处**明确写出「风险等级：${riskLevel || '（无）'}」与「可信度 ${credText}/100」。\n` +
      `【禁止】变短、删节成摘要风格；禁止表格。\n\n` +
      `草稿：\n${draft || '（草稿为空，请直接基于下方原始输入生成终稿）'}\n\n` +
      `原始输入：\n${prompt}`
    const completion2 = await requestCompletion([{ role: 'user', content: reprompt }], reportOpts)
    if (completion2.success) {
      const text2 = normalizeMarkdown(completion2.data)
      if (text2) {
        return toSuccess({
          finalText: text2,
          draftText: draft || '',
          refinedText: text2,
          rounds: 2,
          source: 'model_refined',
        })
      }
    }

    if (draft) {
      return toSuccess({
        finalText: draft,
        draftText: draft,
        refinedText: completion2.success ? normalizeMarkdown(completion2.data) : '',
        rounds: 2,
        source: 'model_draft',
      })
    }

    const factLines = facts.length
      ? facts
          .map((f) => {
            const line = [f?.time, f?.subject, f?.event, f?.source].filter(Boolean).join(' / ')
            return line ? `- ${line}` : ''
          })
          .filter(Boolean)
      : ['- （当前可抽取的结构化事实有限，建议结合原文段落复核）']
    const reasonLines = reasons.length
      ? reasons.map((r) => `- ${r}`)
      : ['- 未识别到稳定且可重复验证的核心证据链，建议扩大对照信源']
    const suggestionLines = suggestions.length
      ? suggestions.map((s) => `- ${s}`)
      : ['- 建议保留原始链接与关键片段，补充对照权威来源后再传播']

    const fallbackText =
      `# 单篇核验报告\n\n` +
      `> 说明：模型未返回长文，以下为基于结构化结果的**本地扩写模板**，便于你继续人工补充。\n\n` +
      `## 背景与议题界定\n\n` +
      `本次核验围绕「${title || '该新闻文本'}」展开。输入摘要要点如下：${summary || '（无单独摘要）'}。系统给出的**风险等级：${riskLevel || '未判定'}**，**可信度 ${
        Number.isNaN(credibilityScore) ? '—' : credibilityScore
      }/100**，仅反映当前自动化维度下的综合判断，不能替代人工对原文语境、信源层级与引用链的完整复核。\n\n` +
      `### 阅读与引用建议\n\n` +
      `${suggestionLines.join('\n')}\n\n` +
      `## 核心事实与可核验要点\n\n` +
      `下列条目来自事实抽取模块，请逐条对照原文核对时间、主体与事件是否被断章取义或过度概括。\n\n` +
      `${factLines.join('\n')}\n\n` +
      `## 叙事手法与潜在风险\n\n` +
      `以下「关键原因」反映模型在情绪煽动、误导性、立场倾向等维度上的线索，用于提示**何处需要加验**，而非直接定性。\n\n` +
      `${reasonLines.join('\n')}\n\n` +
      `## 可信度 ${Number.isNaN(credibilityScore) ? '—' : credibilityScore}/100 与风险等级「${riskLevel || '未判定'}」的逐项解读\n\n` +
      `请在本节人工补充：为何综合风险会落在当前档位；各维度分数（若前端有展示）与文本中哪些表述相互印证；是否存在「高风险表述 + 低风险评分」或相反的张力。\n\n` +
      `### 与自动化评分的关系\n\n` +
      `- 可信度 ${Number.isNaN(credibilityScore) ? '—' : credibilityScore}/100 与 **风险等级：${riskLevel || '未判定'}** 应一并理解：前者偏「可采信空间」，后者偏「传播与误导风险」。\n` +
      `- 若需对外引用，请同时披露分析边界与数据来源。\n\n` +
      `## 与事实片段、关键原因的对照分析\n\n` +
      `建议将「事实片段」与「关键原因」做成一一映射：哪些事实被同一叙事框架串联；哪些原因缺乏事实支撑应标注为「待证」。\n\n` +
      `## 传播与核查的可执行建议\n\n` +
      `${suggestionLines.join('\n')}\n\n` +
      `### 下一步核查清单\n\n` +
      `- 回查原文是否含条件从句、限定语被标题省略。\n` +
      `- 对关键数字、机构名、职务表述做二次检索。\n` +
      `- 对「独家」「内部」等信源标签要求可追溯链接或文档。\n`
    return toSuccess({
      finalText: fallbackText,
      draftText: draft || '',
      refinedText: completion2.success ? normalizeMarkdown(completion2.data) : '',
      rounds: 2,
      source: 'fallback_template',
    })
  } catch (error) {
    return toFailure(error?.message || 'generateDetailedSingleReport 执行失败')
  }
}

function normalizeStructuredMultiDeepAnalysis(parsed) {
  const obj = parsed && typeof parsed === 'object' ? parsed : {}
  const pickArr = (value, fallback = []) =>
    (Array.isArray(value) ? value : fallback)
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 10)

  const coreFacts = pickArr(obj.coreFacts)
  const factDifferences = pickArr(obj.factDifferences)
  const missingInfo = pickArr(obj.missingInfo)
  const actionSuggestions = pickArr(obj.actionSuggestions)
  const verificationConclusion = String(obj.verificationConclusion || '').trim()

  return {
    coreFacts: coreFacts.length ? coreFacts : ['当前输入中尚未形成可稳定交叉印证的一致事实，请结合原文段落继续核对'],
    factDifferences: factDifferences.length ? factDifferences : ['当前未识别到可稳定复现的逐条事实分歧'],
    missingInfo: missingInfo.length ? missingInfo : ['当前输入未暴露明确的信息缺口'],
    actionSuggestions: actionSuggestions.length ? actionSuggestions : ['建议回查原文关键信息并补充可追溯来源后再传播'],
    verificationConclusion: verificationConclusion || '基于现有输入，建议继续按分歧点与缺失项做针对性核查后再下结论。',
  }
}

export async function generateStructuredMultiDeepAnalysis(payload) {
  try {
    const sourceBriefs = Array.isArray(payload?.sourceBriefs) ? payload.sourceBriefs.slice(0, 8) : []
    const perItemFacts = Array.isArray(payload?.perItemFacts) ? payload.perItemFacts.slice(0, 8) : []
    const conflicts = Array.isArray(payload?.conflicts) ? payload.conflicts.slice(0, 10) : []
    const consistencyScore = Number(payload?.consistencyScore)

    const factsText = perItemFacts
      .map((group, idx) => {
        const rows = Array.isArray(group) ? group : []
        const rowText = rows.length
          ? rows
              .map((f) => {
                const line = [f?.time, f?.subject, f?.event, f?.source].filter(Boolean).join(' / ')
                return line || '（该条事实字段较短）'
              })
              .join('；')
          : '（无可用结构化事实）'
        return `第${idx + 1}篇事实：${rowText}`
      })
      .join('\n')

    const prompt =
      `你是“多源新闻结构化核查助手”。请仅依据输入内容，输出 deepAnalysis JSON。\n` +
      `严禁编造未出现的信息，严禁输出 markdown。\n` +
      `\n` +
      `输出 JSON 结构（字段名必须一致）：\n` +
      `{\n` +
      `  "coreFacts": ["..."],\n` +
      `  "factDifferences": ["..."],\n` +
      `  "missingInfo": ["..."],\n` +
      `  "actionSuggestions": ["..."],\n` +
      `  "verificationConclusion": "..."\n` +
      `}\n` +
      `\n` +
      `生成规则（必须遵守）：\n` +
      `1) coreFacts 至少 1 条，优先提炼“双方都提到/都承认/都围绕”的共同命题；允许写“叙事接近但措辞不同”，不要机械输出“尚未提炼出稳定一致事实”。\n` +
      `2) missingInfo 仅在输入确实缺失时填写。若来源片段或事实中出现“据/来源/记者/通报/公告/官网/官方/媒体名”等线索，不得写“未明确消息来源”。\n` +
      `3) factDifferences 要具体到主体/时间/动作/口径差异，不要只写抽象分数句。\n` +
      `4) actionSuggestions 必须逐条对应已识别分歧或缺失，避免泛化空话。\n` +
      `5) verificationConclusion 控制在 1-2 句，客观中性。\n` +
      `\n` +
      `输入：\n` +
      `一致性分数：${Number.isFinite(consistencyScore) ? consistencyScore : '（无）'}\n` +
      `来源片段：${sourceBriefs.length ? sourceBriefs.join('；') : '（无）'}\n` +
      `局部冲突：${conflicts.length ? conflicts.join('；') : '（无）'}\n` +
      `结构化事实：\n${factsText || '（无）'}`

    const completion = await requestCompletion([{ role: 'user', content: prompt }], {
      timeout: REQUEST_TIMEOUT_REPORT,
      maxTokens: 2200,
    })
    if (!completion.success) return completion
    const parsed = parseStrictJson(completion.data, null)
    if (!parsed || typeof parsed !== 'object') return toFailure('deepAnalysis JSON 解析失败')
    return toSuccess(normalizeStructuredMultiDeepAnalysis(parsed))
  } catch (error) {
    return toFailure(error?.message || 'generateStructuredMultiDeepAnalysis 执行失败')
  }
}

export async function generateDetailedMultiReport(payload) {
  try {
    const coreFacts = Array.isArray(payload?.coreFacts) ? payload.coreFacts.slice(0, 12) : []
    const factDifferences = Array.isArray(payload?.factDifferences) ? payload.factDifferences.slice(0, 14) : []
    const missingInfo = Array.isArray(payload?.missingInfo) ? payload.missingInfo.slice(0, 10) : []
    const verificationConclusion = String(payload?.verificationConclusion || '').trim()
    const actionSuggestions = Array.isArray(payload?.actionSuggestions) ? payload.actionSuggestions.slice(0, 10) : []
    const sourceBriefs = Array.isArray(payload?.sourceBriefs) ? payload.sourceBriefs.slice(0, 8) : []

    const normalizeMarkdown = (raw) =>
      String(raw || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n')
        .trim()

    const reportOpts = { timeout: REQUEST_TIMEOUT_REPORT, maxTokens: REPORT_MAX_TOKENS }

    const prompt =
      `你是资深「多源事件核查分析师」，面向专业读者写**超长、超详细**的中文 Markdown 多源比对报告（不要 JSON、不要代码围栏、不要表格）。\n` +
      `\n` +
      `【篇幅硬性要求——必须遵守】\n` +
      `1) 去掉 Markdown 符号后的**正文纯汉字不少于 1100 字**；**理想区间 1300–2000 字**。宁可写长，不要写短。\n` +
      `2) 禁止仅用几句列表敷衍；每个二级标题下须有多段完整叙述（每段不少于 80 字）。\n` +
      `\n` +
      `【结构硬性要求】\n` +
      `1) 首行一级标题：# 多源核查总结\n` +
      `2) **至少 6 个**二级标题（##），不得合并到少于 6 个。建议模块：\n` +
      `   ## 总览与多源叙事框架\n` +
      `   ## 一致事实与交叉印证\n` +
      `   ## 关键分歧与逐条证据对读\n` +
      `   ## 信息缺口与不确定性\n` +
      `   ## 核查路径与可重复验证步骤\n` +
      `   ## 传播风险与对外表述建议\n` +
      `3) **每个 ## 下**须含：至少 **1 个** ### 子论点；至少 **3 条**「-」列表，每条不少于 25 字，并说明对应输入中的哪类分歧/缺失/结论。\n` +
      `4) 必须**具体展开至少 3 条**事实分歧（可引用输入原文要点改写），并**至少 2 处**讨论信息缺失项；须写清可落地的核查路径，不得只谈「权威性」或空洞评分。\n` +
      `5) 必须优先引用“来源片段摘录”中的措辞来写，不得写与这些片段语义无关的情节；若片段不足，需明确标注“输入未提供”。\n` +
      `6) 禁止编造输入中没有的信息。\n\n` +
      `输入：\n` +
      `来源片段摘录：${sourceBriefs.length ? sourceBriefs.join('；') : '（无）'}\n` +
      `核心事实一致点：${coreFacts.length ? coreFacts.join('；') : '（无）'}\n` +
      `事实分歧点：${factDifferences.length ? factDifferences.join('；') : '（无）'}\n` +
      `信息缺失项：${missingInfo.length ? missingInfo.join('；') : '（无）'}\n` +
      `核查结论：${verificationConclusion || '（无）'}\n` +
      `执行建议：${actionSuggestions.length ? actionSuggestions.join('；') : '（无）'}`

    const first = await requestCompletion([{ role: 'user', content: prompt }], reportOpts)
    const draft = first.success ? normalizeMarkdown(first.data) : ''
    const secondPrompt =
      `以下是一篇多源核查 Markdown 草稿。在**不编造新事实**的前提下，**大幅扩写与深化**为终稿。\n` +
      `\n` +
      `【终稿篇幅——硬性】纯汉字 **不少于 1300 字**；**理想 1500–2200 字**。\n` +
      `【终稿结构——硬性】保留 # 多源核查总结；**至少 6 个 ##**；每节保留 ###、多段叙述与充实列表。\n` +
      `【内容强化】对「分歧点」做**逐条对读式**展开：每条分歧至少写 2–3 句，说明可能成因（笔误、选择性报道、时间差等）及如何回查原文验证——但不得捏造具体信源名称若输入未提供。\n` +
      `【禁止】变短、写成短讯摘要；禁止表格。\n\n` +
      `草稿：\n${draft || '（草稿为空，请直接基于输入生成）'}\n\n` +
      `原始输入：\n${prompt}`
    const second = await requestCompletion([{ role: 'user', content: secondPrompt }], reportOpts)
    if (second.success) {
      const finalText = normalizeMarkdown(second.data)
      if (finalText) return toSuccess(finalText)
    }
    if (draft) return toSuccess(draft)

    const lines = (arr) => (Array.isArray(arr) && arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- （无）')
    const sug = actionSuggestions.length ? actionSuggestions : ['建议对照原文与权威来源复核后再传播']
    const fallbackText =
      `# 多源核查总结\n\n` +
      `> 说明：模型未返回长文，以下为基于结构化比对的**本地扩写模板**，便于继续人工补充。\n\n` +
      `## 总览与多源叙事框架\n\n` +
      `${verificationConclusion || '当前比对已形成初步核查结论，但自动化长文生成未就绪。以下分模块列出结构化要点，请在人工撰写时扩展为多段论述。'}\n\n` +
      `### 一致性轮廓\n\n` +
      `一致点反映多源在哪些命题上收敛，可作为后续引用的「最低共识」基础；但仍需逐条核对是否仅为措辞一致而实质不同。\n\n` +
      `## 一致事实与交叉印证\n\n` +
      `${lines(coreFacts)}\n\n` +
      `### 如何交叉印证\n\n` +
      `- 对每条一致点回溯各来源原文句子，确认无断章取义。\n` +
      `- 对时间、数字、机构名做检索比对。\n` +
      `- 若仅二手转述一致，应降级为「待核验」。\n\n` +
      `## 关键分歧与逐条证据对读\n\n` +
      `${lines(factDifferences)}\n\n` +
      `### 对读提示\n\n` +
      `- 为每条分歧标注「可能成因」：时间线、主体指代、统计口径、翻译差异等。\n` +
      `- 禁止在缺乏来源时推断「某一方撒谎」。\n\n` +
      `## 信息缺口与不确定性\n\n` +
      `${lines(missingInfo)}\n\n` +
      `### 不确定性管理\n\n` +
      `- 明确哪些结论在补齐缺口前不宜对外断言。\n` +
      `- 建议列出「最小可公布信息集」。\n\n` +
      `## 核查路径与可重复验证步骤\n\n` +
      `${lines(sug)}\n\n` +
      `## 传播风险与对外表述建议\n\n` +
      `${lines(sug)}\n\n` +
      `### 表述清单\n\n` +
      `- 对外引用须同时给出分歧与一致两方面的上下文。\n` +
      `- 对仍存疑的命题使用「尚无法确认」而非绝对化措辞。\n`
    return toSuccess(fallbackText)
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

