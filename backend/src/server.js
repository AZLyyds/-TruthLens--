import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import axios from 'axios'
import { randomUUID, createHash } from 'node:crypto'
import { fail, parsePagination, success } from './utils.js'
import { getPool, initDatabase } from './db.js'
import { runNewsIngestion, startNewsCollector } from './newsPipeline.js'
import {
  analyzeRisk,
  extractFacts,
  extractNewsTitleAndSummary,
  generateDetailedMultiReport,
  generateDetailedSingleReport,
  summarize,
} from '../../src/backend/services/aiService.js'
import { cleanArticleText, isLikelyUrl } from './newsCleaner.js'

const app = express()
const pool = getPool()
const PORT = Number(process.env.PORT || 3000)
let alertRule = { riskThreshold: 70, enabled: true }
const agentTasks = []

const defaultAllowlist = ['http://localhost:5173', 'http://127.0.0.1:5173']
const allowlist = (process.env.CORS_ALLOWLIST || defaultAllowlist.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const isLocalDevOrigin = (origin) => {
  return /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
}

/** 局域网 IP 访问前端（如 http://192.168.x.x:5173）时浏览器会带该 Origin，开发环境放行 */
const isPrivateLanOrigin = (origin) => {
  try {
    const u = new URL(origin)
    const h = u.hostname
    const parts = h.split('.').map((x) => Number(x))
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
    const [a, b] = parts
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  } catch {
    return false
  }
}

app.use(express.json())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowlist.includes(origin) || isLocalDevOrigin(origin) || isPrivateLanOrigin(origin)) {
        return callback(null, true)
      }
      return callback(new Error('CORS rejected'))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-User-Name'],
    credentials: true,
    maxAge: 86400,
  }),
)

async function ensureSeedData() {
  const [rows] = await pool.execute('SELECT id FROM users LIMIT 1')
  if (!rows.length) {
    const passwordHash = await bcrypt.hash('demo123', 10)
    await pool.execute(
      `
      INSERT INTO users (username, email, password_hash, preferences_json)
      VALUES (?, ?, ?, ?)
      `,
      ['demo', 'demo@example.com', passwordHash, JSON.stringify(['国际政治', '科技', '财经'])],
    )
    return
  }
  const [legacy] = await pool.execute("SELECT id FROM users WHERE username = 'jiwei' LIMIT 1")
  if (legacy.length) {
    const passwordHash = await bcrypt.hash('demo123', 10)
    await pool.execute(
      `UPDATE users SET username = 'demo', email = 'demo@example.com', password_hash = ? WHERE username = 'jiwei'`,
      [passwordHash],
    )
  }
}

async function getCurrentUser() {
  const [rows] = await pool.execute(
    'SELECT id, username, preferences_json FROM users ORDER BY id ASC LIMIT 1',
  )
  return rows[0] || null
}

async function getRequestUser(req) {
  const raw = req.headers.authorization || ''
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim()
  const matched = /^token_(\d+)_/.exec(token)
  if (matched) {
    const userId = Number(matched[1])
    if (!Number.isNaN(userId)) {
      const [rows] = await pool.execute(
        'SELECT id, username, preferences_json FROM users WHERE id = ? LIMIT 1',
        [userId],
      )
      if (rows.length) return rows[0]
    }
  }
  return getCurrentUser()
}

async function resolveHistoryUserId(req) {
  const user = await getRequestUser(req)
  if (user?.id != null) return user.id
  const fallback = await getCurrentUser()
  return fallback?.id ?? null
}

async function repairOrphanQueryHistory() {
  try {
    const [users] = await pool.execute('SELECT id FROM users ORDER BY id ASC LIMIT 1')
    if (!users.length) return
    const firstId = users[0].id
    await pool.execute('UPDATE query_history SET user_id = ? WHERE user_id IS NULL', [firstId])
  } catch (e) {
    console.warn('repairOrphanQueryHistory:', e.message)
  }
}

function pickRow(row, ...names) {
  if (!row) return ''
  for (const name of names) {
    const v = row[name]
    if (v != null && v !== '') return v
  }
  const lowerMap = {}
  for (const k of Object.keys(row)) {
    lowerMap[k.toLowerCase()] = row[k]
  }
  for (const name of names) {
    const v = lowerMap[String(name).toLowerCase()]
    if (v != null && v !== '') return v
  }
  return ''
}

function normalizeHistoryListItem(row) {
  if (!row) return null
  const id = row.id != null ? Number(row.id) : NaN
  const queryType = pickRow(row, 'queryType', 'query_type', 'querytype')
  const newsTitle = pickRow(row, 'newsTitle', 'news_title', 'inputTitle', 'input_title', 'inputtitle')
  const newsSummary = pickRow(row, 'newsSummary', 'news_summary', 'inputSummary', 'input_summary', 'inputsummary')
  const title = newsTitle || ''
  const summary = newsSummary || (title ? String(title).slice(0, 120) : '')
  return {
    id: Number.isNaN(id) ? null : id,
    queryType,
    newsTitle: title,
    newsSummary: summary,
    inputTitle: title,
    inputSummary: summary,
    status: pickRow(row, 'status') || 'success',
    createdAt: row.createdAt ?? row.query_time ?? row.created_at ?? row.querytime,
  }
}

function normalizeHistoryDetailPayload(row) {
  const base = normalizeHistoryListItem(row)
  let fullJson =
    row.fullAnalysisJson ??
    row.full_analysis_json ??
    row.resultJson ??
    row.result_json
  if (Buffer.isBuffer(fullJson)) fullJson = fullJson.toString('utf8')
  if (typeof fullJson === 'string') {
    try {
      fullJson = JSON.parse(fullJson)
    } catch {
      fullJson = null
    }
  }
  const newsTitle = pickRow(row, 'newsTitle', 'news_title', 'inputTitle', 'input_title') || base.newsTitle
  const newsSummary = pickRow(row, 'newsSummary', 'news_summary', 'inputSummary', 'input_summary') || base.newsSummary
  const newsBody = pickRow(row, 'newsBody', 'news_body', 'inputContent', 'input_content')
  const sourceUrl = row.sourceUrl ?? row.source_url ?? row.inputUrl ?? row.input_url ?? null
  return {
    ...base,
    newsTitle,
    newsSummary,
    newsBody,
    sourceUrl,
    inputTitle: newsTitle,
    inputContent: newsBody,
    inputUrl: sourceUrl,
    sourceName: row.sourceName ?? row.source_name ?? null,
    fullAnalysisJson: fullJson,
    resultJson: fullJson,
  }
}

async function insertQueryHistory({
  userId,
  queryType,
  newsSummary,
  newsTitle,
  newsBody,
  sourceUrl,
  sourceName,
  fullAnalysisJson,
  status = 'success',
  analysisRecordId = null,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO query_history (
      user_id, query_type, news_summary, news_title, news_body,
      source_url, source_name, full_analysis_json, status, analysis_record_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      queryType,
      String(newsSummary || '').slice(0, 500),
      String(newsTitle || ''),
      String(newsBody || '').slice(0, 12000) || null,
      sourceUrl || null,
      sourceName || null,
      typeof fullAnalysisJson === 'string' ? fullAnalysisJson : JSON.stringify(fullAnalysisJson),
      status,
      analysisRecordId,
    ],
  )
  return result.insertId
}

function parsePreferences(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function isHttpUrl(value) {
  if (!value || typeof value !== 'string') return false
  return /^https?:\/\//i.test(value.trim())
}

function sanitizeHtmlToText(html) {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function resolveAnalysisText({ text, url, newsId }) {
  if (text && String(text).trim()) {
    return { text: cleanArticleText(String(text).trim()), fromUrl: false, fetchedFromUrl: false }
  }
  if (url && isHttpUrl(url)) {
    try {
      const response = await axios.get(String(url).trim(), {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        },
      })
      const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')
      const plain = sanitizeHtmlToText(html)
      const cleaned = cleanArticleText(plain)
      if (cleaned && cleaned.length >= 120) {
        return { text: cleaned.slice(0, 12000), fromUrl: true, fetchedFromUrl: true }
      }
      return { text: '', fromUrl: true, fetchedFromUrl: false }
    } catch {
      return { text: '', fromUrl: true, fetchedFromUrl: false }
    }
  }
  if (newsId) {
    const [rows] = await pool.execute('SELECT content, title, description FROM news WHERE id = ? LIMIT 1', [newsId])
    const row = rows[0]
    if (row) {
      const merged = [row.title, row.description, row.content].filter(Boolean).join(' ')
      const cleaned = cleanArticleText(merged)
      if (cleaned.trim()) {
        return { text: cleaned.trim().slice(0, 12000), fromUrl: false, fetchedFromUrl: false }
      }
    }
  }
  return { text: '', fromUrl: false, fetchedFromUrl: false }
}

function buildMultiCompareResult(items, factsGroup) {
  const normalizedFactsGroup = factsGroup.map((group) => (Array.isArray(group) ? group : []))

  const normalizeText = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/不敌|告负|失利|落败/gi, '失败')
      .replace(/击败|战胜|获胜/gi, '胜利')
      .replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
      .trim()

  const toBigrams = (text) => {
    const chars = [...normalizeText(text)]
    if (chars.length <= 1) return new Set(chars)
    const grams = new Set()
    for (let i = 0; i < chars.length - 1; i += 1) {
      grams.add(`${chars[i]}${chars[i + 1]}`)
    }
    return grams
  }

  const similarity = (a, b) => {
    const setA = toBigrams(a)
    const setB = toBigrams(b)
    if (!setA.size || !setB.size) return 0
    let inter = 0
    setA.forEach((token) => {
      if (setB.has(token)) inter += 1
    })
    const union = setA.size + setB.size - inter
    return union === 0 ? 0 : inter / union
  }

  const extractScore = (value) => {
    const match = String(value || '').match(/(\d+)\s*[比\-:：]\s*(\d+)/)
    if (!match) return ''
    return `${match[1]}:${match[2]}`
  }

  const factToEntry = (fact) => {
    const time = String(fact?.time || '').trim()
    const subject = String(fact?.subject || '').trim()
    const event = String(fact?.event || '').trim()
    const key = event ? `${subject}${event}${time}` : `${subject}${time}`
    return {
      subject,
      event,
      score: extractScore(event),
      key,
    }
  }

  const perItemEntries = normalizedFactsGroup.map((facts) =>
    facts
      .map((fact) => factToEntry(fact))
      .filter((item) => normalizeText(item.key).length >= 4),
  )

  const pairScores = []
  const conflicts = []
  const sharedFacts = []
  const diffLines = []
  const missingInfo = new Set()

  for (let i = 0; i < perItemEntries.length; i += 1) {
    for (let j = i + 1; j < perItemEntries.length; j += 1) {
      const left = perItemEntries[i]
      const right = perItemEntries[j]
      if (!left.length || !right.length) {
        pairScores.push(0)
        conflicts.push(`第${i + 1}篇或第${j + 1}篇可抽取事实不足，无法稳定比对`)
        continue
      }

      let matched = 0
      const usedRight = new Set()
      const threshold = 0.36
      left.forEach((leftItem) => {
        let bestIndex = -1
        let bestScore = 0
        right.forEach((rightItem, idx) => {
          if (usedRight.has(idx)) return
          let score = similarity(leftItem.key, rightItem.key)
          if (leftItem.subject && rightItem.subject && leftItem.subject === rightItem.subject) {
            score += 0.25
          }
          if (leftItem.score && rightItem.score && leftItem.score === rightItem.score) {
            score += 0.35
          }
          score = Math.min(1, score)
          if (score > bestScore) {
            bestScore = score
            bestIndex = idx
          }
        })
        if (bestIndex >= 0 && bestScore >= 0.3) {
          usedRight.add(bestIndex)
          matched += 1
        }
      })

      const pairScore = matched / Math.max(left.length, right.length)
      pairScores.push(pairScore)
      if (pairScore < 0.7) {
        conflicts.push(`第${i + 1}篇与第${j + 1}篇核心叙事一致性偏低（${Math.round(pairScore * 100)}%）`)
      }

      const rightPool = right.map((x) => ({ ...x, used: false }))
      left.forEach((l) => {
        let best = null
        let bestScore = 0
        rightPool.forEach((r) => {
          if (r.used) return
          let s = similarity(l.key, r.key)
          if (l.subject && r.subject && l.subject === r.subject) s += 0.2
          s = Math.min(1, s)
          if (s > bestScore) {
            bestScore = s
            best = r
          }
        })
        if (!best || bestScore < 0.3) return
        best.used = true

        const briefL = [l.subject, l.event].filter(Boolean).join(' / ')
        const briefR = [best.subject, best.event].filter(Boolean).join(' / ')
        if (bestScore >= 0.72) {
          sharedFacts.push(`第${i + 1}篇与第${j + 1}篇均提到：${briefL || briefR || '同一核心事件'}`)
        }

        if (l.score && best.score && l.score !== best.score) {
          diffLines.push(`第${i + 1}篇与第${j + 1}篇数字表述冲突：${l.score} vs ${best.score}`)
        }
        if (l.subject && best.subject && l.subject !== best.subject && bestScore >= 0.5) {
          diffLines.push(`第${i + 1}篇与第${j + 1}篇主体指向存在差异：${l.subject} vs ${best.subject}`)
        }
      })
    }
  }

  // 从原始输入补充“数字/时间”冲突检测，避免 AI 事实抽取偏差时漏判
  const rawTexts = (Array.isArray(items) ? items : []).map((it) =>
    String(it?.text || it?.url || '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  const extractPercent = (text) => {
    const m = text.match(/(\d+(?:\.\d+)?)\s*%/)
    return m ? m[1] : ''
  }
  const extractDate = (text) => {
    const m = text.match(/(\d{1,2})月(\d{1,2})[日号]?/)
    return m ? `${m[1]}月${m[2]}日` : ''
  }
  for (let i = 0; i < rawTexts.length; i += 1) {
    for (let j = i + 1; j < rawTexts.length; j += 1) {
      const p1 = extractPercent(rawTexts[i])
      const p2 = extractPercent(rawTexts[j])
      if (p1 && p2 && p1 !== p2) {
        diffLines.push(`第${i + 1}篇与第${j + 1}篇关键数字不一致：${p1}% vs ${p2}%`)
      }
      const d1 = extractDate(rawTexts[i])
      const d2 = extractDate(rawTexts[j])
      if (d1 && d2 && d1 !== d2) {
        diffLines.push(`第${i + 1}篇与第${j + 1}篇时间线不一致：${d1} vs ${d2}`)
      }
    }
  }

  normalizedFactsGroup.forEach((group, idx) => {
    if (!group.length) {
      missingInfo.add(`第${idx + 1}篇缺少可抽取的结构化事实（时间/主体/事件）`)
      return
    }
    let hasTime = false
    let hasSource = false
    group.forEach((f) => {
      if (String(f?.time || '').trim()) hasTime = true
      if (String(f?.source || '').trim()) hasSource = true
    })
    if (!hasTime) missingInfo.add(`第${idx + 1}篇未明确关键事件时间点`)
    if (!hasSource) missingInfo.add(`第${idx + 1}篇未明确消息来源`)
  })

  const consistencyScore =
    pairScores.length === 0 ? 0 : Number(((pairScores.reduce((sum, n) => sum + n, 0) / pairScores.length) * 100).toFixed(2))

  const coreFacts = [...new Set(sharedFacts)].slice(0, 5)
  const factDifferences = [...new Set(diffLines.length ? diffLines : conflicts)].slice(0, 6)
  const missingList = [...missingInfo].slice(0, 5)
  const verificationConclusion =
    consistencyScore >= 70
      ? '多源文本在关键事实上总体一致，现有分歧主要集中在细节表述层面，可作为参考但仍需保留来源链路。'
      : consistencyScore >= 45
        ? '多源文本存在可识别分歧，尤其在时间线或关键细节上未完全对齐，当前仅适合“待核验”传播。'
        : '多源文本在核心事实层面冲突明显，现阶段不宜下确定性结论，应先完成针对性事实核查。'
  const actionSuggestions = [
    factDifferences[0] ? `优先核查分歧点：${factDifferences[0]}` : '',
    missingList[0] ? `补齐缺失信息：${missingList[0]}` : '',
    '回看原文发布时间、原始引述与上下文段落，避免二手转载造成语义偏移',
    '传播时标注“已核验/待核验”状态，并附上对照来源链接',
  ]
    .filter(Boolean)
    .slice(0, 4)

  return {
    consistencyScore,
    conflicts: conflicts.slice(0, 6),
    sourceAuthorityDiff: '来源权威性待结合媒体等级进一步评估',
    recommendation: consistencyScore >= 70 ? '整体一致性较高，可作为参考信息' : '一致性偏低，建议人工复核',
    perItemFacts: normalizedFactsGroup,
    deepAnalysis: {
      coreFacts: coreFacts.length ? coreFacts : ['尚未提炼出稳定的一致事实，请补充更完整文本后重试'],
      factDifferences: factDifferences.length ? factDifferences : ['当前未识别到明确的逐条事实冲突'],
      missingInfo: missingList.length ? missingList : ['当前文本未暴露明显的信息缺失项'],
      verificationConclusion,
      actionSuggestions,
    },
  }
}

function buildSingleReasonsAndSuggestions({ facts, risk }) {
  const reasons = []
  const suggestions = []
  const riskScore = Number(risk?.overall_risk || 0)
  const sensationalScore = Number(risk?.sensational_score || 0)
  const misleadingScore = Number(risk?.misleading_score || 0)
  const stance = String(risk?.stance || '中立')
  const factsCount = Array.isArray(facts) ? facts.length : 0

  if (factsCount === 0) {
    reasons.push('文本中可结构化事实较少，信息可核验性偏弱')
    suggestions.push('补充原始报道时间、主体和数据来源后再传播')
  } else {
    reasons.push(`已识别 ${factsCount} 条关键事实，可用于后续交叉核验`)
  }

  if (misleadingScore >= 70) {
    reasons.push('误导性指标较高，可能存在断章取义或关键信息缺失')
    suggestions.push('对比至少两家权威来源，重点核对核心数字与结论')
  } else if (misleadingScore >= 40) {
    reasons.push('误导性指标中等，需警惕表述与上下文不完整')
    suggestions.push('补充事件上下文与官方通报，避免片段化解读')
  } else {
    reasons.push('误导性指标较低，主要事实表述相对清晰')
    suggestions.push('保留来源链接与原文片段，便于复核追溯')
  }

  if (sensationalScore >= 70) {
    reasons.push('情绪煽动性较强，标题或措辞可能放大恐慌情绪')
    suggestions.push('转述时去除情绪化措辞，采用中性描述')
  } else if (sensationalScore >= 40) {
    reasons.push('存在一定情绪引导倾向，需谨慎判断传播语气')
  } else {
    reasons.push('情绪煽动性较低，文本语气整体相对克制')
  }

  if (stance !== '中立') {
    reasons.push(`文本立场表现为“${stance}”，可能影响受众客观判断`)
    suggestions.push('同时参考不同立场来源，降低单一叙事偏差')
  }

  if (riskScore >= 70) {
    suggestions.push('建议暂缓传播并触发人工复核')
  } else if (riskScore >= 45) {
    suggestions.push('建议加注“待核验”标签后有限传播')
  } else {
    suggestions.push('可作为参考信息传播，但建议持续跟踪更新')
  }

  return {
    reasons: reasons.slice(0, 4),
    suggestions: [...new Set(suggestions)].slice(0, 4),
  }
}

app.get('/api/v1/healthz', (_req, res) => {
  res.json(success({ status: 'up' }))
})

app.post('/api/v1/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(422).json(fail('username/password required', 422, 'VALIDATION_ERROR'))
  }
  const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1', [username])
  const user = rows[0]
  if (!user) return res.status(401).json(fail('invalid username or password', 401, 'AUTH_FAILED'))
  const isValid = await bcrypt.compare(password, user.password_hash)
  if (!isValid) return res.status(401).json(fail('invalid username or password', 401, 'AUTH_FAILED'))
  res.json(
    success({
      userId: user.id,
      username: user.username,
      accessToken: `token_${user.id}_${Date.now()}`,
      refreshToken: `refresh_${user.id}_${Date.now()}`,
    }),
  )
})

app.post('/api/v1/auth/register', async (req, res) => {
  const { username, password, email } = req.body || {}
  if (!username || !password) {
    return res.status(422).json(fail('username/password required', 422, 'VALIDATION_ERROR'))
  }
  const passwordHash = await bcrypt.hash(password, 10)
  try {
    const [result] = await pool.execute(
      `
      INSERT INTO users (username, email, password_hash, preferences_json)
      VALUES (?, ?, ?, ?)
      `,
      [username, email || null, passwordHash, JSON.stringify([])],
    )
    res.json(success({ userId: result.insertId, username }))
  } catch (error) {
    if (String(error.message).includes('Duplicate')) {
      return res.status(409).json(fail('username/email already exists', 409, 'DUPLICATE'))
    }
    throw error
  }
})

app.post('/api/v1/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {}
  if (!refreshToken) {
    return res.status(422).json(fail('refreshToken required', 422, 'VALIDATION_ERROR'))
  }
  res.json(success({ accessToken: `token_refresh_${Date.now()}` }))
})

app.get('/api/v1/news', async (req, res) => {
  const { page, pageSize } = parsePagination(req.query)
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 100))
  const safeOffset = Math.max(0, (Number(page) - 1) * safePageSize)
  const [items] = await pool.query(
    `
    SELECT
      n.id,
      n.title,
      n.source_name AS source,
      n.published_at AS publishedAt,
      ar.risk_level AS risk,
      ar.fake_score AS fakeScore,
      ar.output_json AS outputJson
    FROM news n
    LEFT JOIN analysis_records ar
      ON ar.id = (
        SELECT id
        FROM analysis_records
        WHERE news_id = n.id AND analysis_type = 'single'
        ORDER BY created_at DESC
        LIMIT 1
      )
    ORDER BY n.published_at DESC, n.id DESC
    LIMIT ${safePageSize} OFFSET ${safeOffset}
    `,
  )
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM news')
  const mapped = items.map((row) => {
    const out = parseJsonSafe(row.outputJson, {})
    const wf = coalesceWorkflowPayload(out)
    const fakeFromDb = row.fakeScore != null && !Number.isNaN(Number(row.fakeScore)) ? Number(row.fakeScore) : null
    const fakeScore = normalizeDetailFakeScore(fakeFromDb, wf)
    const fakeForRiskBand = fakeScoreForRiskBand(fakeFromDb, wf)
    const rawRisk =
      wf.riskLevel ??
      wf.risk_level ??
      (typeof wf.risk === 'string' ? wf.risk : null) ??
      row.risk ??
      null
    const riskLevel = workflowRiskLevelForApiPayload(rawRisk, fakeForRiskBand)
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      publishedAt: row.publishedAt,
      risk: riskLevel,
      fakeScore: fakeScore ?? null,
    }
  })
  res.json(success({ items: mapped, page, pageSize, total: countRows[0].total }))
})

function parseJsonSafe(v, fallback = {}) {
  if (v == null) return fallback
  if (typeof v === 'object') return v
  try {
    return JSON.parse(String(v))
  } catch {
    return fallback
  }
}

/** 响应体 JSON 序列化前使用，避免 output_json 内循环引用导致整条接口 500 */
function cloneForJsonResponse(obj) {
  if (obj == null) return obj
  if (typeof obj !== 'object') return obj
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    return null
  }
}

function inferChinaRelated(title, content) {
  const t = `${title || ''} ${String(content || '').slice(0, 800)}`
  return /中国|中华|涉华|对华|北京|中共|两岸|港台|\bCN\b|Chinese|china/i.test(t)
}

/** item.result 为多新闻批次外壳时不应当作单条分析体 */
function isWorkflowResultBatchEnvelope(resultVal) {
  return (
    resultVal &&
    typeof resultVal === 'object' &&
    (Array.isArray(resultVal.newsAnalysis) ||
      resultVal.newsCount != null ||
      resultVal.duplicateRemovedCount != null ||
      resultVal.overallConclusion != null)
  )
}

/**
 * 百炼单条新闻入库前合并：条目根上的 multiSourceCheck 不要被错误的 item.result 覆盖。
 * item.result 若为多新闻批次外壳（含 newsAnalysis / newsCount），不得当作单条分析体。
 */
function mergeWorkflowItemForStorage(item) {
  if (!item || typeof item !== 'object') return item
  const resultVal = item.result
  const resultIsBatchEnvelope = isWorkflowResultBatchEnvelope(resultVal)

  let inner = item.output || item.output_json || item.analysis || item.full || null
  if (!inner && resultVal && typeof resultVal === 'object' && !resultIsBatchEnvelope) {
    inner = resultVal
  }
  function hoistMsc(obj) {
    if (!obj || typeof obj !== 'object') return obj
    if (obj.multiSourceCheck == null && obj.multi_source_check != null) {
      obj.multiSourceCheck = obj.multi_source_check
    }
    return obj
  }

  // 内层 output/result 为百炼真实分析体，须覆盖外壳 item 的同名字段；否则外壳上残缺的 multiSourceCheck 会盖住内层完整对象
  if (inner && typeof inner === 'object') {
    return hoistMsc({ ...item, ...inner })
  }
  return hoistMsc({ ...item })
}

/**
 * 详情/列表读取：把 output_json 根对象与 output、output_json、result、data 等内层合并为一层，
 * 内层字段覆盖外层，与入库时 mergeWorkflowItemForStorage 的结构对齐，避免只读到外壳而丢 fakeScore/multiSourceCheck。
 */
function coalesceWorkflowPayload(outputObj) {
  const raw = outputObj && typeof outputObj === 'object' ? outputObj : {}
  const layers = []
  if (raw.output && typeof raw.output === 'object') layers.push(raw.output)
  if (raw.output_json && typeof raw.output_json === 'object') layers.push(raw.output_json)
  const rv = raw.result
  if (rv && typeof rv === 'object' && !isWorkflowResultBatchEnvelope(rv)) layers.push(rv)
  if (raw.data && typeof raw.data === 'object') layers.push(raw.data)
  if (raw.analysis && typeof raw.analysis === 'object') layers.push(raw.analysis)
  if (raw.full && typeof raw.full === 'object') layers.push(raw.full)
  return Object.assign({}, raw, ...layers)
}

function parseMultiSourceCheckBlob(m) {
  if (m == null) return null
  if (typeof m === 'string') {
    m = parseJsonSafe(m, null)
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  return m
}

/** 工作流/库里 isConsistent 的常见别名（只读映射，不编造枚举） */
function pickIsConsistentField(obj) {
  if (!obj || typeof obj !== 'object') return null
  const candidates = [
    obj.isConsistent,
    obj.is_consistent,
    obj.IsConsistent,
    obj.informationConsistency,
    obj.information_consistency,
    obj.infoConsistency,
    obj.info_consistency,
    obj.consistency,
    obj['信息一致性'],
  ]
  for (const c of candidates) {
    if (c == null || c === '') continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function collectMultiSourceCheckBlobs(outputObj) {
  const raw = outputObj && typeof outputObj === 'object' ? outputObj : {}
  const list = []
  const tryPush = (m) => {
    const b = parseMultiSourceCheckBlob(m)
    if (b) list.push(b)
  }
  tryPush(raw.multiSourceCheck ?? raw.multi_source_check)
  const nested = [raw.output, raw.output_json, raw.analysis, raw.full, raw.data]
  const rv = raw.result
  if (rv && typeof rv === 'object' && !isWorkflowResultBatchEnvelope(rv)) nested.push(rv)
  for (const c of nested) {
    if (!c || typeof c !== 'object') continue
    tryPush(c.multiSourceCheck ?? c.multi_source_check)
  }
  return list
}

/** 在多个 multiSourceCheck 候选中选「最完整」的一份（避免根上残缺对象挡住内层完整 JSON） */
function scoreMultiSourceCheckBlob(b) {
  if (!b || typeof b !== 'object') return -1
  const descLen = b.description != null ? String(b.description).trim().length : 0
  const rawA = b.mcpRelatedArticles ?? b.mcp_related_articles
  const artLen = Array.isArray(rawA) ? rawA.length : 0
  const hasCons = pickIsConsistentField(b) ? 1 : 0
  const hasSame = typeof b.isSameEvent === 'boolean' || typeof b.is_same_event === 'boolean' ? 1 : 0
  return descLen * 2 + artLen * 800 + hasCons * 400 + hasSame * 100
}

function findMultiSourceCheckObject(outputObj) {
  const blobs = collectMultiSourceCheckBlobs(outputObj)
  if (!blobs.length) return null
  let best = blobs[0]
  let bestScore = scoreMultiSourceCheckBlob(best)
  for (let i = 1; i < blobs.length; i++) {
    const s = scoreMultiSourceCheckBlob(blobs[i])
    if (s > bestScore) {
      bestScore = s
      best = blobs[i]
    }
  }
  return best
}

/**
 * 详情页 multiSourceCheck：仅透传工作流字段，不注入当前新闻、不臆造文案。
 */
function pickMultiSourceCheckStrict(outputObj) {
  const m = findMultiSourceCheckObject(outputObj)
  if (!m) return null

  const rawArticles = m.mcpRelatedArticles ?? m.mcp_related_articles
  const mcpRelatedArticles = Array.isArray(rawArticles)
    ? rawArticles.map((x) => ({
        title: x?.title != null ? String(x.title) : '',
        source: x?.source != null ? String(x.source) : '',
      }))
    : []

  const isSameEvent =
    typeof m.isSameEvent === 'boolean'
      ? m.isSameEvent
      : typeof m.is_same_event === 'boolean'
        ? m.is_same_event
        : null

  const hasAuthoritySource =
    typeof m.hasAuthoritySource === 'boolean'
      ? m.hasAuthoritySource
      : typeof m.has_authority_source === 'boolean'
        ? m.has_authority_source
        : null

  const isConsistent = pickIsConsistentField(m)

  const description = m.description != null ? String(m.description) : ''

  return {
    isSameEvent,
    isConsistent,
    hasAuthoritySource,
    description,
    mcpRelatedArticles,
  }
}

function pickRiskReason(latest, raw) {
  if (raw.riskReason) return String(raw.riskReason)
  if (raw.risk_reason) return String(raw.risk_reason)
  const r = latest?.reasons
  if (Array.isArray(r) && r.length) return r.join('；')
  const txt = latest?.risk && typeof latest.risk === 'object' ? latest.risk.stance : ''
  return txt ? String(txt) : ''
}

/** 详情页展示：统一为 0–10（工作流协议）；库内可能为 0–100 百分制 */
function normalizeDetailFakeScore(dbStored, outputObj) {
  const out = outputObj?.fakeScore ?? outputObj?.fake_score
  if (out != null && !Number.isNaN(Number(out)) && Number(out) <= 10) return Number(out)
  const fs = Number(dbStored)
  if (!Number.isNaN(fs)) {
    if (fs > 10) return fs / 10
    return fs
  }
  if (out != null && !Number.isNaN(Number(out))) return Number(out)
  if (outputObj?.overall_risk != null && !Number.isNaN(Number(outputObj.overall_risk))) return Number(outputObj.overall_risk)
  return null
}

/**
 * 风险档位（normalizeRiskLevel）按 0–100 与 fake_score 入库列对齐；
 * 勿传入已归一化到 0–10 的展示分，否则会把 9 误判成「低风险」。
 */
function fakeScoreForRiskBand(dbStored, outputObj) {
  const d = Number(dbStored)
  if (!Number.isNaN(d)) {
    if (d > 10) return d
    if (d >= 0 && d <= 10) return d * 10
  }
  const out = outputObj?.fakeScore ?? outputObj?.fake_score ?? outputObj?.overall_risk
  const n = Number(out)
  if (!Number.isNaN(n)) {
    if (n > 10) return n
    if (n >= 0 && n <= 10) return n * 10
  }
  return null
}

/**
 * 可信指数：显式 credibility → 再用 0–10 FakeScore 推导（与工作流一致）→ 最后才用 dimensions（避免陈旧维度盖住真值）。
 */
function pickCredibilityScore(wf, latestAnalysis, fakeScoreDisplay) {
  const raw =
    wf?.credibilityScore ??
    wf?.credibility_score ??
    wf?.credibility ??
    latestAnalysis?.credibilityScore
  if (raw != null && raw !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n)) {
      if (n >= 0 && n <= 1) return Number((n * 100).toFixed(2))
      return Number(n.toFixed(2))
    }
  }
  if (
    fakeScoreDisplay != null &&
    !Number.isNaN(Number(fakeScoreDisplay)) &&
    fakeScoreDisplay >= 0 &&
    fakeScoreDisplay <= 10
  ) {
    return Number((100 - Number(fakeScoreDisplay) * 10).toFixed(2))
  }
  const dim = wf?.dimensions || latestAnalysis?.dimensions
  if (dim && typeof dim === 'object') {
    const nums = [dim.factConsistency, dim.sourceCredibility]
      .map((x) => Number(x))
      .filter((x) => !Number.isNaN(x))
    if (nums.length) {
      return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2))
    }
  }
  return null
}

/**
 * 详情 API：风险等级与工作流样例对齐，输出 low / medium / high；库内中文或缺省时映射，非标字符串原样返回。
 */
function workflowRiskLevelForApiPayload(rawRiskLevel, fakeForRiskBand) {
  const v = rawRiskLevel
  if (v == null || v === '') {
    const inferred = normalizeRiskLevel(null, fakeForRiskBand)
    if (inferred === '低风险') return 'low'
    if (inferred === '中风险') return 'medium'
    if (inferred === '高风险') return 'high'
    return null
  }
  const s = String(v).trim()
  if (/^low$/i.test(s)) return 'low'
  if (/^medium$/i.test(s)) return 'medium'
  if (/^high$/i.test(s)) return 'high'
  if (s === '低风险') return 'low'
  if (s === '中风险') return 'medium'
  if (s === '高风险') return 'high'
  if (s === '待评估' || s === '未知' || /^pending$/i.test(s)) {
    const inferred = normalizeRiskLevel(null, fakeForRiskBand)
    if (inferred === '低风险') return 'low'
    if (inferred === '中风险') return 'medium'
    if (inferred === '高风险') return 'high'
    return null
  }
  return s
}

app.get('/api/v1/news/:id', async (req, res, next) => {
  try {
  const rawId = req.params.id
  const id = Number(rawId)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(422).json(fail('invalid news id', 422, 'VALIDATION_ERROR'))
  }

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      news_uid AS newsUid,
      title,
      description,
      content,
      source_name AS source,
      url,
      language,
      country,
      published_at AS publishedAt
    FROM news WHERE id = ?
    `,
    [id],
  )
  if (!rows.length) return res.status(404).json(fail('news not found', 404, 'NOT_FOUND'))
  const row = rows[0]

  const [arRows] = await pool.execute(
    `
    SELECT fake_score AS fakeScore, risk_level AS riskLevel, output_json AS outputJson, created_at AS analyzedAt
    FROM analysis_records
    WHERE news_id = ? AND analysis_type = 'single'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [id],
  )

  let latestAnalysis = null
  let outputObj = {}
  let wf = {}
  if (arRows.length) {
    const ar = arRows[0]
    outputObj = parseJsonSafe(ar.outputJson, {})
    wf = coalesceWorkflowPayload(outputObj)
    latestAnalysis = {
      fakeScore: Number(ar.fakeScore),
      riskLevel: ar.riskLevel,
      analyzedAt: ar.analyzedAt,
      credibilityScore: wf.credibilityScore ?? wf.credibility_score,
      verdict: wf.verdict ?? wf.overallConclusion ?? wf.overall_conclusion ?? null,
      reasons: wf.reasons,
      suggestions: wf.suggestions,
      facts: wf.facts,
      risk: wf.risk,
      dimensions: wf.dimensions,
      meta: wf.meta,
      aiSummary: wf.aiSummary ?? wf.ai_summary,
    }
  }

  const langRaw = wf.lang ?? wf.language ?? row.language
  const lang = langRaw != null && String(langRaw).trim() ? String(langRaw).trim() : 'unknown'
  const chinaRelated =
    wf.chinaRelated != null
      ? Boolean(wf.chinaRelated)
      : wf.china_related != null
        ? Boolean(wf.china_related)
        : inferChinaRelated(row.title, row.content)

  const dbFake = arRows.length ? arRows[0].fakeScore : null
  const fakeScore = normalizeDetailFakeScore(dbFake, wf)
  const fakeForRiskBand = fakeScoreForRiskBand(dbFake, wf)

  const rawRiskDetail =
    wf.riskLevel ??
    wf.risk_level ??
    (typeof wf.risk === 'string' ? wf.risk : null) ??
    (arRows.length ? arRows[0].riskLevel : null)
  const riskLevel = workflowRiskLevelForApiPayload(rawRiskDetail, fakeForRiskBand)

  const credibilityScore = pickCredibilityScore(wf, latestAnalysis, fakeScore)

  const summary =
    wf.summary != null && String(wf.summary).trim() ? String(wf.summary).trim() : ''

  const publishedAt = wf.publishedAt ?? wf.published_at ?? row.publishedAt

  const payload = {
    id: row.id,
    newsUid: row.newsUid,
    title: wf.title != null && String(wf.title).trim() ? String(wf.title).trim() : row.title,
    titleCN: wf.titleCN ?? wf.title_cn ?? null,
    summary,
    source: wf.source != null && String(wf.source).trim() ? String(wf.source).trim() : row.source,
    url: wf.url != null && String(wf.url).trim() ? String(wf.url).trim() : row.url,
    content: wf.content ?? wf.body ?? wf.article ?? row.content,
    contentCN: wf.contentCN ?? wf.content_cn ?? null,
    description: row.description,
    publishedAt,
    lang,
    language: lang,
    country: wf.country != null && String(wf.country).trim() ? String(wf.country).trim() : row.country,
    chinaRelated,
    facts: Array.isArray(wf.facts) ? wf.facts : [],
    fakeScore,
    riskLevel,
    riskReason: pickRiskReason(latestAnalysis ? { ...latestAnalysis, risk: wf.risk } : {}, wf),
    multiSourceCheck: arRows.length
      ? (() => {
          const picked = pickMultiSourceCheckStrict(wf)
          return (
            picked || {
              isSameEvent: null,
              isConsistent: null,
              hasAuthoritySource: null,
              description: '',
              mcpRelatedArticles: [],
            }
          )
        })()
      : null,
    credibilityScore,
    verdict:
      wf.verdict ??
      wf.overallConclusion ??
      wf.overall_conclusion ??
      wf.conclusion ??
      latestAnalysis?.verdict ??
      null,
    reasons: Array.isArray(wf.reasons) ? wf.reasons : [],
    suggestions: Array.isArray(wf.suggestions) ? wf.suggestions : [],
    dimensions: wf.dimensions ?? null,
    latestAnalysis,
    rawWorkflow: cloneForJsonResponse(outputObj),
  }

  res.json(success(payload))
  } catch (err) {
    console.error('GET /api/v1/news/:id failed:', err?.stack || err?.message || err)
    next(err)
  }
})

app.post('/api/v1/news', async (req, res) => {
  const { title, sourceName, content, url } = req.body || {}
  if (!title) return res.status(422).json(fail('title required', 422, 'VALIDATION_ERROR'))
  const uid = randomUUID()
  const [result] = await pool.execute(
    `
    INSERT INTO news (news_uid, title, content, source_name, url, published_at)
    VALUES (?, ?, ?, ?, ?, NOW())
    `,
    [uid, title, content || null, sourceName || 'manual', url || null],
  )
  res.json(success({ id: result.insertId }))
})

app.put('/api/v1/news/:id', async (req, res) => {
  const { title, content } = req.body || {}
  await pool.execute('UPDATE news SET title = COALESCE(?, title), content = COALESCE(?, content) WHERE id = ?', [
    title || null,
    content || null,
    req.params.id,
  ])
  res.json(success(true))
})

app.delete('/api/v1/news/:id', async (req, res) => {
  await pool.execute('DELETE FROM news WHERE id = ?', [req.params.id])
  res.json(success(true))
})

function clampSummaryChars(str, max = 100) {
  const s = String(str || '').trim()
  return s.length > max ? s.slice(0, max) : s
}

async function resolveSingleNewsMeta({ cleanBody, newsId, url, rawText }) {
  let sourceUrl = url && String(url).trim() ? String(url).trim() : null
  let sourceName = null
  let fallbackTitle = '单篇正文分析'
  let newsBody = String(cleanBody || '')

  if (newsId) {
    const [newsRows] = await pool.execute(
      'SELECT title, content, description, url, source_name FROM news WHERE id = ? LIMIT 1',
      [newsId],
    )
    if (newsRows.length) {
      const n = newsRows[0]
      fallbackTitle = n.title || `新闻 #${newsId}`
      newsBody =
        cleanArticleText(
          [n.content, n.description, cleanBody].find((c) => c && String(c).trim()) || cleanBody,
        ) || newsBody
      sourceUrl = n.url || sourceUrl
      sourceName = n.source_name || null
    }
  } else if (rawText && String(rawText).trim()) {
    const t = String(rawText).trim()
    const first = t.split(/\n/).map((l) => l.trim()).find(Boolean) || t
    if (!isLikelyUrl(first)) fallbackTitle = first.slice(0, 80)
  }

  const metaAi = await extractNewsTitleAndSummary(newsBody)
  let newsTitle = metaAi.success ? metaAi.data.title : ''
  let newsSummary = metaAi.success ? clampSummaryChars(metaAi.data.summary, 100) : ''

  if (!newsTitle || isLikelyUrl(newsTitle)) {
    newsTitle = fallbackTitle
  }
  if (!newsSummary) {
    const sum = await summarize(newsBody)
    newsSummary = clampSummaryChars(sum.success ? sum.data : newsBody.slice(0, 120), 100)
  }

  return { newsTitle, newsSummary, newsBody, sourceUrl, sourceName }
}

app.post('/api/v1/analysis/single', async (req, res) => {
  const { text, url, newsId } = req.body || {}
  if (!text && !url && !newsId) {
    return res.status(422).json(fail('text/url/newsId required', 422, 'VALIDATION_ERROR'))
  }
  const resolved = await resolveAnalysisText({ text, url, newsId })
  if (resolved.fromUrl && !resolved.fetchedFromUrl) {
    return res.status(422).json(
      fail('URL 正文抓取失败或内容过短，请直接粘贴新闻正文再分析', 422, 'URL_FETCH_FAILED'),
    )
  }
  if (!resolved.text) {
    return res.status(422).json(fail('未获取到可分析文本，请传入 text 或可抓取的 url', 422, 'VALIDATION_ERROR'))
  }
  const cleanBody = cleanArticleText(resolved.text)
  const meta = await resolveSingleNewsMeta({
    cleanBody,
    newsId,
    url,
    rawText: text,
  })

  const [factsResult, riskResult] = await Promise.all([extractFacts(meta.newsBody), analyzeRisk(meta.newsBody)])

  if (!factsResult.success) {
    return res.status(502).json(fail(`事实抽取失败：${factsResult.msg}`, 502, 'AI_SERVICE_ERROR'))
  }
  if (!riskResult.success) {
    return res.status(502).json(fail(`风险分析失败：${riskResult.msg}`, 502, 'AI_SERVICE_ERROR'))
  }

  const risk = riskResult.data
  const fakeScore = Number(risk?.overall_risk || 0)
  const riskLevel = fakeScore >= 70 ? '高风险' : fakeScore >= 45 ? '中风险' : '低风险'
  const dynamicExplain = buildSingleReasonsAndSuggestions({
    facts: factsResult.data.facts,
    risk,
  })
  const credibilityScore = Number((100 - fakeScore).toFixed(2))
  const detailReportResult = await generateDetailedSingleReport({
    title: meta.newsTitle,
    summary: meta.newsSummary,
    riskLevel,
    credibilityScore,
    reasons: dynamicExplain.reasons,
    suggestions: dynamicExplain.suggestions,
    facts: factsResult.data.facts,
  })
  const detailPayload =
    detailReportResult.success && detailReportResult.data && typeof detailReportResult.data === 'object'
      ? detailReportResult.data
      : null
  const detailReportText = detailPayload?.finalText || ''
  const output = {
    facts: factsResult.data.facts,
    risk,
    aiSummary: meta.newsSummary,
    detailedReport: detailReportText
      ? detailReportText
      : [
          `本条内容当前判定为${riskLevel}，可信度 ${credibilityScore}/100。`,
          dynamicExplain.reasons?.[0] || '',
          dynamicExplain.reasons?.[1] || '',
          dynamicExplain.suggestions?.[0] || '',
        ]
          .filter(Boolean)
          .join(' '),
    detailedReportTrace: {
      rounds: detailPayload?.rounds || 0,
      source: detailPayload?.source || 'fallback_short',
      draftText: detailPayload?.draftText || '',
      refinedText: detailPayload?.refinedText || '',
      finalText: detailReportText || '',
    },
    meta: {
      newsTitle: meta.newsTitle,
      newsSummary: meta.newsSummary,
      sourceUrl: meta.sourceUrl,
      sourceName: meta.sourceName,
    },
    credibilityScore,
    verdict: riskLevel === '高风险' ? '可疑' : riskLevel === '中风险' ? '存疑' : '可信',
    riskLevel,
    reasons: dynamicExplain.reasons,
    suggestions: dynamicExplain.suggestions,
    dimensions: {
      sourceCredibility: Number((100 - fakeScore * 0.8).toFixed(2)),
      factConsistency: Number((100 - fakeScore * 0.9).toFixed(2)),
      emotionManipulation: Number(risk.sensational_score || 0),
      propagationMisleading: Number(risk.misleading_score || 0),
    },
  }

  const uid = await resolveHistoryUserId(req)

  const [result] = await pool.execute(
    `
    INSERT INTO analysis_records (user_id, news_id, analysis_type, input_json, output_json, fake_score, risk_level)
    VALUES (?, ?, 'single', ?, ?, ?, ?)
    `,
    [uid, newsId || null, JSON.stringify({ text, url, newsId }), JSON.stringify(output), fakeScore, riskLevel],
  )

  await insertQueryHistory({
    userId: uid,
    queryType: '单篇分析',
    newsSummary: meta.newsSummary,
    newsTitle: meta.newsTitle,
    newsBody: meta.newsBody,
    sourceUrl: meta.sourceUrl,
    sourceName: meta.sourceName,
    fullAnalysisJson: output,
    status: 'success',
    analysisRecordId: result.insertId,
  })

  if (alertRule.enabled && fakeScore >= alertRule.riskThreshold) {
    await pool.execute(
      `
      INSERT INTO alerts (analysis_id, title, source_name, risk_level, score, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [result.insertId, '高风险新闻分析命中', 'single-analysis', riskLevel, fakeScore, JSON.stringify(output)],
    )
  }
  res.json(success(output))
})

app.post('/api/v1/analysis/multi', async (req, res) => {
  const items = req.body?.items || []
  if (!Array.isArray(items) || items.length < 2) {
    return res.status(422).json(fail('at least two items required', 422, 'VALIDATION_ERROR'))
  }

  const bundles = await Promise.all(
    items.map(async (item, idx) => {
      const resolved = await resolveAnalysisText({
        text: item?.text,
        url: item?.url,
        newsId: item?.newsId,
      })
      const cleanedText = cleanArticleText(resolved.text || '')
      const resolvedClean = { ...resolved, text: cleanedText }
      let inputTitle = ''
      let inputContent = ''
      let inputUrl = item?.url ? String(item.url).trim() : null
      let sourceName = null
      if (item?.newsId) {
        const [nr] = await pool.execute(
          'SELECT title, content, description, url, source_name FROM news WHERE id = ? LIMIT 1',
          [item.newsId],
        )
        if (nr.length) {
          inputTitle = nr[0].title || `新闻 #${item.newsId}`
          inputContent =
            cleanArticleText(
              [nr[0].content, nr[0].description, cleanedText].find((c) => c && String(c).trim()) || '',
            ) || cleanedText
          inputUrl = nr[0].url || inputUrl
          sourceName = nr[0].source_name || null
        }
      }
      if (!inputTitle && item?.text) {
        const t = String(item.text).trim()
        const head = (t.split(/\n/).map((l) => l.trim()).find(Boolean) || t).slice(0, 500)
        inputTitle = isLikelyUrl(head) ? `录入正文 ${idx + 1}` : head
        inputContent = cleanArticleText(t)
      }
      if (!inputTitle && item?.url) {
        /* 多篇主记录标题固定为「多篇交叉分析」；此处仅用占位，避免 N 次额外 AI 调用 */
        inputTitle = `网页来源 ${idx + 1}`
        inputContent = cleanedText
        inputUrl = String(item.url).trim()
      }
      if (!inputContent && cleanedText) inputContent = cleanedText
      return { item, resolved: resolvedClean, inputTitle, inputContent, inputUrl, sourceName }
    }),
  )

  for (const b of bundles) {
    if (b.resolved.fromUrl && !b.resolved.fetchedFromUrl) {
      return res.status(422).json(
        fail('URL 正文抓取失败或内容过短，请改为传入 text', 422, 'URL_FETCH_FAILED'),
      )
    }
    if (!b.resolved.text) {
      return res.status(422).json(fail('未获取到可分析文本，请检查输入', 422, 'VALIDATION_ERROR'))
    }
  }

  // 并发抽取每篇事实，避免串行调用导致总耗时随篇数线性增长
  const factsResults = await Promise.all(bundles.map((b) => extractFacts(b.resolved.text)))
  const firstFailed = factsResults.find((r) => !r.success)
  if (firstFailed) {
    return res.status(502).json(fail(`多篇事实抽取失败：${firstFailed.msg}`, 502, 'AI_SERVICE_ERROR'))
  }

  const factsGroup = factsResults.map((r) => r.data.facts)
  const output = buildMultiCompareResult(items, factsGroup)
  const deep = output.deepAnalysis || {}
  const detailedMulti = await generateDetailedMultiReport({
    coreFacts: deep.coreFacts,
    factDifferences: deep.factDifferences,
    missingInfo: deep.missingInfo,
    verificationConclusion: deep.verificationConclusion,
    actionSuggestions: deep.actionSuggestions,
  })
  if (!detailedMulti.success) {
    return res
      .status(502)
      .json(fail(`多篇深度总结失败：${detailedMulti.msg || '千问调用失败'}`, 502, 'AI_SERVICE_ERROR'))
  }
  output.detailedReport = detailedMulti.data
  const fakeScore = Number((100 - output.consistencyScore).toFixed(2))
  const riskLevel = fakeScore >= 70 ? '高风险' : fakeScore >= 45 ? '中风险' : '低风险'

  const uid = await resolveHistoryUserId(req)
  const [ar] = await pool.execute(
    `
    INSERT INTO analysis_records (user_id, analysis_type, input_json, output_json, fake_score, risk_level)
    VALUES (?, 'multi', ?, ?, ?, ?)
    `,
    [uid, JSON.stringify({ items }), JSON.stringify(output), fakeScore, riskLevel],
  )

  const combinedTitle = bundles.map((b, i) => `【${i + 1}】${b.inputTitle || `第${i + 1}条`}`).join(' ')
  const combinedContent = bundles
    .map((b, i) => `### 来源 ${i + 1}${b.sourceName ? `（${b.sourceName}）` : ''}\n${b.inputContent || ''}`)
    .join('\n\n')
  const newsTitle = `多篇交叉分析（${items.length}条来源）`
  const summaryParts = [output.recommendation, ...(output.conflicts || []).slice(0, 2)].filter(Boolean).join(' ')
  const newsSummary = clampSummaryChars(summaryParts || combinedTitle, 100)

  const sourceJoined = [...new Set(bundles.map((b) => b.sourceName).filter(Boolean))].join(' / ') || null

  await insertQueryHistory({
    userId: uid,
    queryType: '多篇分析',
    newsTitle,
    newsSummary,
    newsBody: combinedContent.slice(0, 12000),
    sourceUrl: null,
    sourceName: sourceJoined,
    fullAnalysisJson: output,
    status: 'success',
    analysisRecordId: ar.insertId,
  })

  res.json(success(output))
})

app.get('/api/v1/analysis/records', async (req, res) => {
  const { page, pageSize } = parsePagination(req.query)
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 100))
  const safeOffset = Math.max(0, (Number(page) - 1) * safePageSize)
  const [rows] = await pool.query(
    `
    SELECT id, user_id AS userId, analysis_type AS analysisType, fake_score AS fakeScore, risk_level AS riskLevel, created_at AS createdAt
    FROM analysis_records
    ORDER BY id DESC
    LIMIT ${safePageSize} OFFSET ${safeOffset}
    `,
  )
  res.json(success({ items: rows, page, pageSize }))
})

app.delete('/api/v1/analysis/records/:id', async (req, res) => {
  await pool.execute('DELETE FROM query_history WHERE analysis_record_id = ?', [req.params.id])
  await pool.execute('DELETE FROM analysis_records WHERE id = ?', [req.params.id])
  res.json(success(true))
})

app.get('/api/v1/profile/me', async (req, res) => {
  const user = await getRequestUser(req)
  if (!user) return res.status(404).json(fail('user not found', 404, 'NOT_FOUND'))
  const [qhRows] = await pool.execute('SELECT COUNT(*) AS analyzed FROM query_history WHERE user_id = ?', [user.id])
  const [statsRows] = await pool.execute(
    `
    SELECT SUM(CASE WHEN risk_level = '高风险' THEN 1 ELSE 0 END) AS highRiskHits
    FROM analysis_records
    WHERE user_id = ?
    `,
    [user.id],
  )
  const [viewRows] = await pool.execute('SELECT COUNT(*) AS viewed FROM news')
  res.json(
    success({
      userId: user.id,
      username: user.username,
      preferences: parsePreferences(user.preferences_json),
      stats: {
        viewed: viewRows[0].viewed || 0,
        analyzed: Number(qhRows[0]?.analyzed || 0),
        highRiskHits: Number(statsRows[0]?.highRiskHits || 0),
      },
    }),
  )
})

app.put('/api/v1/profile/me/preferences', async (req, res) => {
  const { preferences } = req.body || {}
  if (!Array.isArray(preferences)) {
    return res.status(422).json(fail('preferences must be an array', 422, 'VALIDATION_ERROR'))
  }
  const user = await getRequestUser(req)
  if (!user) return res.status(404).json(fail('user not found', 404, 'NOT_FOUND'))
  await pool.execute('UPDATE users SET preferences_json = ? WHERE id = ?', [JSON.stringify(preferences), user.id])
  res.json(success({ preferences }))
})

app.get('/api/v1/profile/history', async (req, res) => {
  const user = await getRequestUser(req)
  if (!user) return res.json(success({ items: [], page: 1, pageSize: 20, total: 0 }))
  const { page, pageSize } = parsePagination(req.query)
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 20, 100))
  const safeOffset = Math.max(0, (Number(page) - 1) * safePageSize)
  const [rows] = await pool.query(
    `
    SELECT
      id,
      query_time AS createdAt,
      query_type AS queryType,
      news_summary AS newsSummary,
      news_title AS newsTitle,
      status
    FROM query_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ${safePageSize} OFFSET ${safeOffset}
    `,
    [user.id],
  )
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM query_history WHERE user_id = ?', [user.id])
  const items = rows.map(normalizeHistoryListItem).filter((item) => item && item.id != null)
  res.json(success({ items, page, pageSize, total: countRows[0].total }))
})

app.get('/api/v1/profile/history/:id', async (req, res) => {
  const user = await getRequestUser(req)
  if (!user) return res.status(401).json(fail('请先登录', 401, 'AUTH_REQUIRED'))
  const id = Number(req.params.id)
  if (Number.isNaN(id)) {
    return res.status(422).json(fail('invalid id', 422, 'VALIDATION_ERROR'))
  }
  const detailSelect = `
    SELECT
      id,
      query_time AS createdAt,
      query_type AS queryType,
      news_summary AS newsSummary,
      news_title AS newsTitle,
      news_body AS newsBody,
      source_url AS sourceUrl,
      source_name AS sourceName,
      full_analysis_json AS fullAnalysisJson,
      status,
      user_id AS userId
    FROM query_history
    WHERE id = ?
    LIMIT 1
  `
  let [rows] = await pool.execute(
    `
    SELECT
      id,
      query_time AS createdAt,
      query_type AS queryType,
      news_summary AS newsSummary,
      news_title AS newsTitle,
      news_body AS newsBody,
      source_url AS sourceUrl,
      source_name AS sourceName,
      full_analysis_json AS fullAnalysisJson,
      status,
      user_id AS userId
    FROM query_history
    WHERE id = ? AND user_id = ?
    LIMIT 1
    `,
    [id, user.id],
  )
  if (!rows.length) {
    const [orphanRows] = await pool.execute(detailSelect, [id])
    if (!orphanRows.length) {
      return res.status(404).json(fail('记录不存在', 404, 'NOT_FOUND'))
    }
    const hit = orphanRows[0]
    const ownerId = hit.userId != null ? Number(hit.userId) : null
    if (ownerId != null && ownerId !== Number(user.id)) {
      return res.status(403).json(fail('无权查看该记录', 403, 'FORBIDDEN'))
    }
    if (ownerId == null) {
      await pool.execute('UPDATE query_history SET user_id = ? WHERE id = ?', [user.id, id])
    }
    rows = orphanRows
  }
  res.json(success(normalizeHistoryDetailPayload(rows[0])))
})

app.get('/api/v1/users', async (_req, res) => {
  const [rows] = await pool.execute('SELECT id, username, email, created_at AS createdAt FROM users ORDER BY id DESC')
  res.json(success({ items: rows }))
})

app.get('/api/v1/users/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT id, username, email, preferences_json AS preferencesJson FROM users WHERE id = ?', [req.params.id])
  if (!rows.length) return res.status(404).json(fail('user not found', 404, 'NOT_FOUND'))
  const row = rows[0]
  res.json(success({ ...row, preferences: parsePreferences(row.preferencesJson) }))
})

app.put('/api/v1/users/:id', async (req, res) => {
  const { email, preferences } = req.body || {}
  await pool.execute(
    `
    UPDATE users SET
      email = COALESCE(?, email),
      preferences_json = COALESCE(?, preferences_json)
    WHERE id = ?
    `,
    [email || null, Array.isArray(preferences) ? JSON.stringify(preferences) : null, req.params.id],
  )
  res.json(success(true))
})

app.delete('/api/v1/users/:id', async (req, res) => {
  await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id])
  res.json(success(true))
})

app.get('/api/v1/dashboard/overview', async (_req, res) => {
  const [todayRows] = await pool.execute('SELECT COUNT(*) AS todayCollected FROM news WHERE DATE(created_at) = CURDATE()')
  const [yesterdayRows] = await pool.execute(
    'SELECT COUNT(*) AS yesterdayCollected FROM news WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)',
  )
  const [highRiskRows] = await pool.execute(
    `
    SELECT COUNT(*) AS highRiskCount
    FROM news n
    LEFT JOIN analysis_records ar
      ON ar.id = (
        SELECT id
        FROM analysis_records
        WHERE news_id = n.id AND analysis_type = 'single'
        ORDER BY created_at DESC
        LIMIT 1
      )
    WHERE ar.risk_level = '高风险'
    `,
  )
  const [yesterdayHighRows] = await pool.execute(
    `
    SELECT COUNT(*) AS yesterdayHighRiskCount
    FROM news n
    LEFT JOIN analysis_records ar
      ON ar.id = (
        SELECT id
        FROM analysis_records
        WHERE news_id = n.id AND analysis_type = 'single'
        ORDER BY created_at DESC
        LIMIT 1
      )
    WHERE ar.risk_level = '高风险' AND DATE(n.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
    `,
  )
  const [mediaRows] = await pool.execute('SELECT COUNT(DISTINCT source_name) AS mediaCoverage FROM news')

  const todayCollected = Number(todayRows[0].todayCollected || 0)
  const yesterdayCollected = Number(yesterdayRows[0].yesterdayCollected || 0)
  const highRiskCount = Number(highRiskRows[0].highRiskCount || 0)
  const yesterdayHighRiskCount = Number(yesterdayHighRows[0].yesterdayHighRiskCount || 0)

  const deltaPct = (today, yesterday) => {
    if (!yesterday && today) return 100
    if (!yesterday && !today) return 0
    return Number((((today - yesterday) / Math.max(1, yesterday)) * 100).toFixed(1))
  }

  res.json(
    success({
      todayCollected,
      yesterdayCollected,
      todayCollectedDeltaPct: deltaPct(todayCollected, yesterdayCollected),
      highRiskCount,
      yesterdayHighRiskCount,
      highRiskDeltaPct: deltaPct(highRiskCount, yesterdayHighRiskCount),
      mediaCoverage: Number(mediaRows[0].mediaCoverage || 0),
    }),
  )
})

app.get('/api/v1/dashboard/trends', async (_req, res) => {
  const [rows] = await pool.execute(
    `
    SELECT DATE_FORMAT(created_at, '%H:00') AS time, COUNT(*) AS riskIndex
    FROM analysis_records
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY DATE_FORMAT(created_at, '%H:00')
    ORDER BY time
    `,
  )
  res.json(success({ items: rows }))
})

app.get('/api/v1/dashboard/ranking', async (_req, res) => {
  const [rows] = await pool.execute(
    `
    SELECT source_name AS media, ROUND(100 - AVG(fake_score), 2) AS credibility
    FROM analysis_records ar
    LEFT JOIN news n ON ar.news_id = n.id
    GROUP BY source_name
    ORDER BY credibility DESC
    LIMIT 20
    `,
  )
  res.json(success({ items: rows.filter((item) => item.media) }))
})

app.get('/api/v1/dashboard/alerts', async (_req, res) => {
  const [rows] = await pool.execute(
    `
    SELECT id, title, risk_level AS riskLevel, source_name AS source, created_at AS createdAt
    FROM alerts
    ORDER BY id DESC
    LIMIT 30
    `,
  )
  res.json(success({ items: rows }))
})

app.get('/api/v1/alerts', async (_req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, title, risk_level AS riskLevel, source_name AS source, score, created_at AS createdAt FROM alerts ORDER BY id DESC LIMIT 30',
  )
  res.json(success({ items: rows }))
})

app.post('/api/v1/alerts/rules', (req, res) => {
  const { riskThreshold, enabled } = req.body || {}
  if (typeof riskThreshold !== 'number' || typeof enabled !== 'boolean') {
    return res.status(422).json(fail('riskThreshold(number) and enabled(boolean) required', 422, 'VALIDATION_ERROR'))
  }
  alertRule = { riskThreshold, enabled }
  res.json(success({ ...alertRule }))
})

app.post('/api/v1/agent/tasks/analyze', async (req, res) => {
  const { mode, payload } = req.body || {}
  if (!mode || !['single', 'multi'].includes(mode)) {
    return res.status(422).json(fail('mode must be single|multi', 422, 'VALIDATION_ERROR'))
  }
  const task = {
    taskId: `t_${randomUUID()}`,
    status: 'processing',
    retryCount: 0,
    summary: `agent scheduling ${mode} analysis`,
    payload: payload || {},
    createdAt: new Date().toISOString(),
  }
  agentTasks.push(task)
  setTimeout(() => {
    task.status = 'success'
    task.summary = `agent finished ${mode} analysis`
  }, 200)
  res.json(success(task))
})

app.get('/api/v1/agent/tasks/:taskId', (req, res) => {
  const task = agentTasks.find((item) => item.taskId === req.params.taskId)
  if (!task) return res.status(404).json(fail('task not found', 404, 'NOT_FOUND'))
  res.json(success(task))
})

app.post('/api/v1/pipeline/news/run', async (_req, res) => {
  const result = await runNewsIngestion({ pool })
  res.json(success(result))
})

function extractJsonFromText(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  const text = String(raw).trim()
  if (!text) return null

  // 兼容 markdown code fence 或纯 JSON
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim())
    } catch {
      return null
    }
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim()
    try {
      return JSON.parse(candidate)
    } catch {
      // ignore
    }
  }

  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const candidate = text.slice(firstBracket, lastBracket + 1).trim()
    try {
      return JSON.parse(candidate)
    } catch {
      // ignore
    }
  }

  return null
}

function tryParseJsonString(s) {
  if (s == null || typeof s !== 'string') return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** 深度扫描用：判断数组元素是否像单条新闻工作流条目 */
function isNewsLikeRecord(el) {
  if (!el || typeof el !== 'object' || Array.isArray(el)) return false
  const hasTitle = !!(el.titleCN || el.title_cn || el.title || el.newsTitle || el.headline)
  const hasBody = !!(el.contentCN || el.content_cn || el.content || el.body || el.article || el.summary)
  const hasUrl = !!(el.url || el.link || el.source_url)
  const n = (hasTitle ? 1 : 0) + (hasBody ? 1 : 0) + (hasUrl ? 1 : 0)
  return n >= 2 || (hasTitle && hasBody)
}

/** 在任意嵌套对象中找出「新闻条数最多」的数组（兼容结束节点把列表放在非常规字段） */
function findBestNewsLikeArrayDeep(root) {
  let best = []
  const visit = (node, depth) => {
    if (depth > 14 || node == null) return
    if (Array.isArray(node)) {
      const allPlainObjects =
        node.length > 0 &&
        node.every((el) => el != null && typeof el === 'object' && !Array.isArray(el))
      if (allPlainObjects) {
        if (node.length > best.length) best = node
      } else {
        const hits = node.filter(isNewsLikeRecord)
        if (hits.length > best.length) {
          best = hits.length === node.length ? node : hits
        }
      }
      return
    }
    if (typeof node !== 'object') return
    for (const k of Object.keys(node)) {
      visit(node[k], depth + 1)
    }
  }
  visit(root, 0)
  return best
}

/**
 * 从百炼 Apps completion 整包收集多个「可能含 newsAnalysis 的 JSON 根」，逐一交给 extractWorkflowResult。
 */
function collectWorkflowJsonRoots(apiData) {
  const roots = []
  const seen = new Set()
  const push = (x) => {
    if (x == null) return
    if (typeof x === 'string') {
      const t = x.trim()
      if (!t) return
      const p = tryParseJsonString(t) || extractJsonFromText(t)
      if (p && typeof p === 'object') {
        const sig = JSON.stringify(p).slice(0, 2400)
        if (seen.has(sig)) return
        seen.add(sig)
        roots.push(p)
      }
      return
    }
    if (typeof x === 'object') {
      const sig = JSON.stringify(x).slice(0, 2400)
      if (seen.has(sig)) return
      seen.add(sig)
      roots.push(x)
    }
  }

  if (!apiData || typeof apiData !== 'object') return roots

  const out = apiData.output
  if (typeof out === 'string') {
    push(out)
  } else if (out && typeof out === 'object') {
    if (typeof out.text === 'string') push(out.text)
    if (out.result != null) push(out.result)
    if (out.result && typeof out.result === 'object' && typeof out.result.text === 'string') {
      push(out.result.text)
    }
    push(out)
  }

  push(apiData)
  if (apiData.data != null) push(apiData.data)
  if (typeof apiData.text === 'string') push(apiData.text)

  const choices = apiData.choices || (out && typeof out === 'object' ? out.choices : null)
  if (Array.isArray(choices)) {
    for (const ch of choices) {
      const c = ch?.message?.content ?? ch?.delta?.content ?? ch?.text
      if (typeof c === 'string') push(c)
      if (Array.isArray(c)) {
        for (const part of c) {
          if (typeof part === 'string') push(part)
          else if (part && typeof part === 'object' && typeof part.text === 'string') push(part.text)
        }
      }
    }
  }

  return roots
}
/** 旧版 / 兜底：从任意对象里抽出“新闻条目数组” */
function normalizeDashscopeWorkflowItemsLegacy(obj) {
  if (!obj) return []
  if (Array.isArray(obj)) return obj
  if (Array.isArray(obj.newsAnalysis)) return obj.newsAnalysis
  if (Array.isArray(obj.articles)) return obj.articles
  if (Array.isArray(obj.articleList)) return obj.articleList
  if (Array.isArray(obj.newsList)) return obj.newsList
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.results)) return obj.results
  if (Array.isArray(obj.news)) return obj.news
  if (Array.isArray(obj.records)) return obj.records
  if (Array.isArray(obj.analyses)) return obj.analyses
  if (Array.isArray(obj.list)) return obj.list
  if (Array.isArray(obj.data?.items)) return obj.data.items
  if (Array.isArray(obj.data?.newsAnalysis)) return obj.data.newsAnalysis
  if (Array.isArray(obj.data?.articles)) return obj.data.articles
  if (obj.news && Array.isArray(obj.news.items)) return obj.news.items
  if (obj.title || obj.content || obj.url || obj.news_uid || obj.newsUid) return [obj]
  return []
}

/** 数组是否像「新闻条目列表」（避免误选纯数字、字符串等非新闻长数组） */
function isUsableNewsItemArray(a) {
  if (!Array.isArray(a) || !a.length) return false
  const allPlainObjects = a.every((el) => el != null && typeof el === 'object' && !Array.isArray(el))
  if (allPlainObjects) return true
  return a.some(isNewsLikeRecord)
}

/** 从工作流 result / 顶层对象上多个「新闻列表」字段中取条数最多的一份，避免只用已合并的 newsAnalysis 而丢掉更长的 articles/items */
function pickLongestNewsListArray(obj) {
  if (!obj || typeof obj !== 'object') return null
  const keys = [
    'newsAnalysis',
    'articles',
    'items',
    'articleList',
    'newsList',
    'records',
    'data',
    'fetchedList',
    'rawArticles',
    'allNews',
  ]
  let best = null
  for (const k of keys) {
    const a = obj[k]
    if (!isUsableNewsItemArray(a)) continue
    if (!best || a.length > best.length) best = a
  }
  return best
}
/**
 * 解析百炼工作流 JSON（新约定优先）：
 * - { result: { newsCount, duplicateRemovedCount, newsAnalysis, overallRiskLevel, overallConclusion } }
 * - 或顶层平铺：同上字段但无 result 包裹
 * - 兼容旧版 { res3: { res: "..." } } 字符串内嵌 JSON
 * @returns {{ items: any[], meta: object | null }}
 */
function extractWorkflowResult(workflowJson) {
  const empty = { items: [], meta: null }
  if (workflowJson == null) return empty

  if (Array.isArray(workflowJson)) {
    return { items: workflowJson, meta: null }
  }

  const metaFrom = (obj) => {
    if (!obj || typeof obj !== 'object') return null
    const hasMeta =
      obj.newsCount != null ||
      obj.duplicateRemovedCount != null ||
      obj.overallRiskLevel != null ||
      obj.overallConclusion != null
    if (!hasMeta) return null
    return {
      newsCount: obj.newsCount ?? null,
      duplicateRemovedCount: obj.duplicateRemovedCount ?? null,
      overallRiskLevel: obj.overallRiskLevel ?? null,
      overallConclusion: obj.overallConclusion ?? null,
    }
  }

  // 百炼：output.text 内再包一层 JSON
  if (workflowJson.output?.text != null && typeof workflowJson.output.text === 'string') {
    const inner =
      tryParseJsonString(workflowJson.output.text) || extractJsonFromText(workflowJson.output.text)
    if (inner && typeof inner === 'object') {
      const nested = extractWorkflowResult(inner)
      if (nested.items.length) return nested
    }
  }

  // output 为对象：递归其余字段（避免与上方 output.text 形成无限递归）
  if (workflowJson.output != null && typeof workflowJson.output === 'object' && !Array.isArray(workflowJson.output)) {
    const { text: _omitText, ...restOut } = workflowJson.output
    if (Object.keys(restOut).length > 0) {
      const nested = extractWorkflowResult(restOut)
      if (nested.items.length) return nested
    }
  }

  // result 本身就是多篇数组（新版工作流常见）
  if (Array.isArray(workflowJson.result)) {
    return { items: workflowJson.result, meta: null }
  }

  // result 为字符串：可能是内嵌 JSON，也可能是模型拒答等纯文本
  if (workflowJson.result != null && typeof workflowJson.result === 'string') {
    const s = String(workflowJson.result).trim()
    const inner = tryParseJsonString(s) || extractJsonFromText(s)
    if (inner && typeof inner === 'object') {
      const nested = extractWorkflowResult(inner)
      if (nested.items.length) return nested
      const legacy = normalizeDashscopeWorkflowItemsLegacy(inner)
      if (legacy.length) return { items: legacy, meta: null }
    }
  }

  // 新格式：result 包裹对象（多列表字段并存时取条数最多的一份，保证「有几条写几条」）
  if (workflowJson.result && typeof workflowJson.result === 'object') {
    const r = workflowJson.result

    // 优先兼容已知字段
    if (Array.isArray(r.newsAnalysis)) {
      return { items: r.newsAnalysis, meta: metaFrom(r) }
    }
    if (Array.isArray(r.articles)) {
      return { items: r.articles, meta: metaFrom(r) }
    }
    if (Array.isArray(r.items)) {
      return { items: r.items, meta: metaFrom(r) }
    }
    if (Array.isArray(r.data)) {
      return { items: r.data, meta: metaFrom(r) }
    }
    if (Array.isArray(r.records)) {
      return { items: r.records, meta: metaFrom(r) }
    }

    // 多列表字段并存时取条数最多的一份，保证「有几条写几条」
    const longest = pickLongestNewsListArray(r)
    if (longest && longest.length) {
      return { items: longest, meta: metaFrom(r) }
    }

    const fromR = normalizeDashscopeWorkflowItemsLegacy(r)
    if (fromR.length) {
      return { items: fromR, meta: metaFrom(r) }
    }
  }

  // 顶层平铺（无 result）
  // 顶层平铺（无 result）
  if (Array.isArray(workflowJson.newsAnalysis)) {
    return { items: workflowJson.newsAnalysis, meta: metaFrom(workflowJson) }
  }
  if (Array.isArray(workflowJson.articles)) {
    return { items: workflowJson.articles, meta: metaFrom(workflowJson) }
  }
  if (Array.isArray(workflowJson.items)) {
    return { items: workflowJson.items, meta: metaFrom(workflowJson) }
  }
  const topLongest = pickLongestNewsListArray(workflowJson)
  if (topLongest && topLongest.length) {
    return { items: topLongest, meta: metaFrom(workflowJson) }
  }

  // 旧版：res3.res 为字符串 JSON
  if (workflowJson.res3?.res && typeof workflowJson.res3.res === 'string') {
    const inner = tryParseJsonString(workflowJson.res3.res) || extractJsonFromText(workflowJson.res3.res)
    if (inner && typeof inner === 'object') {
      const nested = extractWorkflowResult(inner)
      if (nested.items.length) return nested
      const legacy = normalizeDashscopeWorkflowItemsLegacy(inner)
      if (legacy.length) return { items: legacy, meta: null }
    }
  }

  const legacy = normalizeDashscopeWorkflowItemsLegacy(workflowJson)
  if (legacy.length) return { items: legacy, meta: null }

  const deep = findBestNewsLikeArrayDeep(workflowJson)
  if (deep.length) return { items: deep, meta: metaFrom(workflowJson) }

  return { items: [], meta: null }
}

function toMysqlDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeRiskLevel(riskLevel, fakeScore) {
  const v = String(riskLevel || '').trim()
  if (v === '待评估' || v === '未知' || /^pending$/i.test(v)) {
    const score = Number(fakeScore)
    if (!Number.isNaN(score)) {
      return score >= 70 ? '高风险' : score >= 45 ? '中风险' : '低风险'
    }
    return null
  }
  if (['低风险', '中风险', '高风险'].includes(v)) return v
  if (/^low$/i.test(v) || /^Low$/i.test(v)) return '低风险'
  if (/^medium$/i.test(v) || /^Medium$/i.test(v)) return '中风险'
  if (/^high$/i.test(v) || /^High$/i.test(v)) return '高风险'

  // 非标准枚举但工作流已经给了字符串，例如“高风险-涉华”，直接尊重原值
  if (v) return v

  // 仅在完全没有传 riskLevel 时，才根据 FakeScore 做一次兜底映射
  const score = Number(fakeScore)
  if (!Number.isNaN(score)) {
    return score >= 70 ? '高风险' : score >= 45 ? '中风险' : '低风险'
  }
  return null
}

function computeNewsUid({ uniqueId, url, title, publishedAt }) {
  if (uniqueId) return String(uniqueId)
  const basis = [url, title, publishedAt].filter(Boolean).join('|')
  if (basis) return createHash('sha1').update(basis).digest('hex')
  return createHash('sha1').update(String(Date.now() + Math.random())).digest('hex')
}

/** 百炼一批次内「条条入库、不去重」：每条唯一 news_uid，且 url 加片段满足 UNIQUE(url) */
function computeWorkflowNewsUid(item, runSalt, itemIndex) {
  const title = String(item?.titleCN || item?.title_cn || item?.title || item?.newsTitle || '').trim()
  const url = item?.url || item?.link || item?.source_url || null
  const publishedAt = item?.published_at || item?.publishedAt || item?.time || null
  const basis = [runSalt, String(itemIndex), item?.news_uid, item?.newsUid, url, title, publishedAt]
    .filter((x) => x != null && x !== '')
    .join('|')
  return createHash('sha1').update(basis || `${runSalt}|${itemIndex}`).digest('hex')
}

function workflowUniqueDbUrl(canonicalUrl, runSalt, itemIndex) {
  if (!canonicalUrl || typeof canonicalUrl !== 'string' || !canonicalUrl.trim()) return null
  const base = canonicalUrl.trim().replace(/#.*$/, '')
  const tag = `${String(itemIndex)}-${runSalt.replace(/-/g, '').slice(0, 12)}`
  return `${base}#tlwf-${tag}`
}

async function upsertNewsFromWorkflowItem(item, workflowOpts = null) {
  const title = String(item?.titleCN || item?.title_cn || item?.title || item?.newsTitle || '').trim()
  const content = item?.content || item?.body || item?.article || ''
  const description = item?.description || item?.summary || null
  const sourceName = item?.source_name || item?.sourceName || item?.source || null
  const canonicalUrl = item?.url || item?.link || item?.source_url || null
  const language = item?.language || item?.lang || 'unknown'
  const publishedAt = item?.published_at || item?.publishedAt || item?.time || null

  let newsUid
  let storageUrl = canonicalUrl
  if (workflowOpts?.runSalt != null) {
    const idx = Number(workflowOpts.itemIndex)
    newsUid = computeWorkflowNewsUid(item, workflowOpts.runSalt, Number.isFinite(idx) ? idx : 0)
    storageUrl = workflowUniqueDbUrl(canonicalUrl, workflowOpts.runSalt, Number.isFinite(idx) ? idx : 0)
  } else {
    newsUid = computeNewsUid({
      uniqueId: item?.news_uid || item?.newsUid || item?.uniqueId || item?.uid || item?.id,
      url: canonicalUrl,
      title,
      publishedAt,
    })
  }

  if (!newsUid) throw new Error('workflow item 缺少新闻唯一ID')

  const bodyText = String(item?.contentCN || item?.content_cn || content || '')
  const cleanContent = cleanArticleText(bodyText)
  const cleanDescription = description ? cleanArticleText(String(description)) : null

  await pool.execute(
    `
      INSERT INTO news (
        news_uid, title, description, content, source_name, url, language, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = COALESCE(VALUES(title), title),
        description = COALESCE(VALUES(description), description),
        content = COALESCE(VALUES(content), content),
        source_name = COALESCE(VALUES(source_name), source_name),
        url = COALESCE(VALUES(url), url),
        language = COALESCE(VALUES(language), language),
        published_at = COALESCE(VALUES(published_at), published_at)
    `,
    [
      newsUid,
      title || (canonicalUrl ? String(canonicalUrl).slice(0, 80) : '新闻工作流分析'),
      cleanDescription,
      cleanContent || null,
      sourceName,
      storageUrl,
      language,
      toMysqlDateTime(publishedAt),
    ],
  )

  const [rows] = await pool.execute('SELECT id FROM news WHERE news_uid = ? LIMIT 1', [newsUid])
  return { newsId: rows?.[0]?.id ?? null, newsUid }
}

async function runNewsWorkflowHandler(req, res) {
  const uid = await resolveHistoryUserId(req)
  const apiKey = process.env.DASHSCOPE_API_KEY
  const appId = process.env.DASHSCOPE_WORKFLOW_APP_ID
  if (!apiKey) return res.status(500).json(fail('DASHSCOPE_API_KEY 未配置', 500, 'AI_SERVICE_ERROR'))
  if (!appId) return res.status(500).json(fail('DASHSCOPE_WORKFLOW_APP_ID 未配置', 500, 'AI_SERVICE_ERROR'))

  // workflow 的 prompt 由你 workflow 配置决定；此处允许用环境变量覆盖
  const prompt =
    String(req.body?.prompt || '').trim() ||
    process.env.DASHSCOPE_WORKFLOW_PROMPT ||
    '请拉取新闻并执行工作流分析，返回可入库的 JSON 结果。'

  const url = `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`
  const data = {
    input: {
      prompt,
    },
    parameters: {},
    debug: {},
  }

  const rawTimeout =
    req.body?.timeoutMs != null ? Number(req.body.timeoutMs) : Number(process.env.DASHSCOPE_WORKFLOW_TIMEOUT_MS || 360000)
  // 允许长工作流，但防止误配无限等待
  const timeoutMs = Number.isNaN(rawTimeout) ? 360000 : Math.max(10000, Math.min(rawTimeout, 600000))

  let workflowText = null
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    })

    workflowText =
      response?.data?.output?.text ||
      response?.data?.output?.result ||
      response?.data?.output ||
      response?.data?.text ||
      null

    let parsed = null
    try {
      parsed = JSON.parse(workflowText)
    } catch {
      parsed = null
    }
    if (!parsed) parsed = extractJsonFromText(workflowText)
    if (!parsed) parsed = response?.data

    // Try to extract items from parsed result (prefer extractWorkflowResult logic)
    let items = []
    let workflowMeta = null
    let rootSource = parsed

    // Try using extractWorkflowResult first
    if (parsed) {
      const res = extractWorkflowResult(parsed)
      items = res.items || []
      workflowMeta = res.meta || null
      rootSource = parsed
    }

    // Fallback: try to extract items from deep news-like arrays if none found
    if (!items.length && parsed && typeof parsed === 'object') {
      const deep = findBestNewsLikeArrayDeep(parsed)
      if (deep.length) items = deep
    }

    // If workflowMeta declares an expected newsCount greater than what we've found, try to find a better array
    const ncMeta = workflowMeta?.newsCount != null ? Number(workflowMeta.newsCount) : NaN
    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(ncMeta) &&
      ncMeta > items.length
    ) {
      const deep = findBestNewsLikeArrayDeep(parsed)
      if (deep.length > items.length && deep.length <= ncMeta) items = deep
    }

    // If still no items, and could be a result string, try the classic "result" extraction from rootSource
    if (!items.length) {
      let r = null
      
      // Try result field in possible root objects (array or plain object)
      if (Array.isArray(rootSource)) {
        for (const root of rootSource) {
          if (root && typeof root === 'object' && typeof root.result === 'string') {
            r = root.result
            break
          }
        }
      } else if (rootSource && typeof rootSource === 'object' && typeof rootSource.result === 'string') {
        r = rootSource.result
      }

      // fallback if previous attempt failed, try response?.data.result string
      if (r == null && response?.data && typeof response.data === 'object' && typeof response.data.result === 'string') {
        r = response.data.result
      }
      if (typeof r === 'string' && r.trim()) {
        const t = r.trim()
        const looksStructured =
          (t.startsWith('{') && t.includes('}')) || (t.startsWith('[') && t.includes(']'))
        if (!looksStructured) {
          return res.status(502).json(
            fail(
              '工作流返回的 result 为普通文本而非新闻 JSON（常见为模型拒答，或结束节点未输出结构化字段）。请在百炼工作流中约束最终输出为含 newsAnalysis / items / articles 等数组的 JSON。',
              502,
              'WORKFLOW_PARSE_ERROR',
            ),
          )
        }
      }
      return res.status(502).json(fail('工作流未返回可解析的新闻结果', 502, 'WORKFLOW_PARSE_ERROR'))
    }

    // 本批次内条条独立入库，不按 url/news_uid 与历史或彼此合并（10 条就写 10 行）
    const workflowRunSalt = randomUUID()

    let storedCount = 0

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex]
      const merged = mergeWorkflowItemForStorage(item)
      const title = String(merged?.titleCN || merged?.title_cn || merged?.title || merged?.newsTitle || '').trim()
      const content = String(merged?.contentCN || merged?.content_cn || merged?.content || merged?.body || merged?.article || '')
      const sourceName = merged?.source_name || merged?.sourceName || merged?.source || null
      const newsUrl = merged?.url || merged?.link || merged?.source_url || null
      const publishedAt = merged?.published_at || merged?.publishedAt || merged?.time || null
      const language = merged?.language || merged?.lang || null

      const newsSummary = merged?.summary || merged?.newsSummary || merged?.ai_summary || merged?.aiSummary || null

      const WORKFLOW_RAW_TEXT_CAP = 600000
      const outputJson = {
        ...merged,
        _truthLensWorkflowCapture: {
          workflowRunSalt,
          workflowItemIndex: itemIndex,
          capturedAt: new Date().toISOString(),
          rawOutputText:
            typeof workflowText === 'string' ? workflowText.slice(0, WORKFLOW_RAW_TEXT_CAP) : null,
          rawOutputTextWasTruncated:
            typeof workflowText === 'string' && workflowText.length > WORKFLOW_RAW_TEXT_CAP,
        },
      }
      const outputObj = merged
      const fakeRaw =
        merged?.fake_score ??
        merged?.fakeScore ??
        merged?.score ??
        merged?.overall_risk ??
        merged?.risk_score ??
        null
      let fakeScore = fakeRaw == null || fakeRaw === '' ? null : Number(fakeRaw)
      // 兼容新工作流协议：fakeScore 为 0-10，riskLevel 为 low/medium/high；仅此场景换算到 0-100
      const riskToken = String(merged?.risk_level || merged?.riskLevel || merged?.risk || '').toLowerCase()
      const isLmH = riskToken === 'low' || riskToken === 'medium' || riskToken === 'high'
      if (fakeScore != null && !Number.isNaN(fakeScore) && fakeScore >= 0 && fakeScore <= 10 && isLmH) {
        fakeScore = Number((fakeScore * 10).toFixed(2))
      }
      const normalizedFakeScore = fakeScore != null && !Number.isNaN(fakeScore) ? fakeScore : null
      // analysis_records.fake_score 为 NOT NULL：缺省时用中性分入库，避免整批工作流因 SQL 报错变成 502
      const dbFakeScore =
        normalizedFakeScore != null && !Number.isNaN(normalizedFakeScore) ? normalizedFakeScore : 50
      let riskLevel = normalizeRiskLevel(
        merged?.risk_level || merged?.riskLevel || merged?.risk || null,
        normalizedFakeScore,
      )
      if (!riskLevel || !['低风险', '中风险', '高风险'].includes(String(riskLevel))) {
        riskLevel = '中风险'
      }

      const { newsId, newsUid } = await upsertNewsFromWorkflowItem(
        {
          ...merged,
          title,
          content,
          source_name: sourceName,
          url: newsUrl,
          publishedAt,
          language,
          news_uid: merged?.news_uid || merged?.newsUid || merged?.uniqueId || null,
        },
        { runSalt: workflowRunSalt, itemIndex },
      )

      const inputJson = merged?.input || merged?.input_json || merged?.request || merged?.raw_input || null

      const [ar] = await pool.execute(
        `
          INSERT INTO analysis_records (
            user_id, news_id, analysis_type, input_json, output_json, fake_score, risk_level
          ) VALUES (?, ?, 'single', ?, ?, ?, ?)
        `,
        [
          uid,
          newsId || null,
          JSON.stringify(
            inputJson || {
              workflowMeta: workflowMeta || undefined,
              workflowRunSalt,
              workflowItemIndex: itemIndex,
              workflowItem: merged,
            },
          ),
          JSON.stringify(outputJson),
          dbFakeScore,
          riskLevel,
        ],
      )

      const finalNewsTitle = title || merged?.headline || `工作流新闻 ${String(newsId || newsUid).slice(0, 8)}`
      const finalNewsSummary = newsSummary
        ? clampSummaryChars(String(newsSummary), 100)
        : clampSummaryChars(content ? content.slice(0, 100) : finalNewsTitle.slice(0, 100), 100)

      await insertQueryHistory({
        userId: uid,
        queryType: '百炼工作流',
        newsTitle: finalNewsTitle,
        newsSummary: finalNewsSummary,
        newsBody: cleanArticleText(content),
        sourceUrl: newsUrl,
        sourceName,
        fullAnalysisJson: outputJson,
        status: 'success',
        analysisRecordId: ar.insertId,
      })

      if (alertRule.enabled && normalizedFakeScore != null && normalizedFakeScore >= alertRule.riskThreshold) {
        await pool.execute(
          `
            INSERT INTO alerts (analysis_id, title, source_name, risk_level, score, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            ar.insertId,
            '高风险新闻工作流命中',
            sourceName || 'workflow',
            riskLevel,
            normalizedFakeScore,
            JSON.stringify(outputJson),
          ],
        )
      }

      storedCount += 1
    }

    return res.json(success({ storedCount, workflow: workflowMeta }))
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      error?.message ||
      '调用百炼工作流失败'
    return res.status(502).json(fail(msg, 502, 'WORKFLOW_CALL_ERROR'))
  }
}

app.post('/api/v1/run-news-workflow', runNewsWorkflowHandler)
app.post('/api/run-news-workflow', runNewsWorkflowHandler)

app.get('/', (_req, res) => {
  res.json(
    success({
      service: 'TruthLens API',
      hint: '页面请用 Vite 开发服：npm run dev → 浏览器打开 http://localhost:5173（或终端里 Network 地址）',
      health: '/api/v1/healthz',
    }),
  )
})

app.use((err, _req, res, _next) => {
  if (String(err.message).includes('CORS')) {
    return res.status(403).json(fail('CORS rejected', 403, 'CORS_ERROR'))
  }
  return res.status(500).json(fail(err.message || 'internal error', 500, 'INTERNAL_ERROR'))
})

app.use((_req, res) => {
  res.status(404).json(fail('not found', 404, 'NOT_FOUND'))
})

async function bootstrap() {
  await initDatabase()
  await ensureSeedData()
  await repairOrphanQueryHistory()
  startNewsCollector({ pool })
  app.listen(PORT, () => {
    console.log(`TruthLens backend running on http://127.0.0.1:${PORT}`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap backend:', error)
  process.exit(1)
})
