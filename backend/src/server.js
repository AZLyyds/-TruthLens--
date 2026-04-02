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
    }
  }

  const consistencyScore =
    pairScores.length === 0 ? 0 : Number(((pairScores.reduce((sum, n) => sum + n, 0) / pairScores.length) * 100).toFixed(2))

  return {
    consistencyScore,
    conflicts: conflicts.slice(0, 6),
    sourceAuthorityDiff: '来源权威性待结合媒体等级进一步评估',
    recommendation: consistencyScore >= 70 ? '整体一致性较高，可作为参考信息' : '一致性偏低，建议人工复核',
    perItemFacts: normalizedFactsGroup,
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
    SELECT id, title, source_name AS source, published_at AS publishedAt
    FROM news
    ORDER BY published_at DESC, id DESC
    LIMIT ${safePageSize} OFFSET ${safeOffset}
    `,
  )
  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM news')
  res.json(success({ items, page, pageSize, total: countRows[0].total }))
})

app.get('/api/v1/news/:id', async (req, res) => {
  const [rows] = await pool.execute(
    `
    SELECT id, title, source_name AS source, description, content, url, published_at AS publishedAt
    FROM news WHERE id = ?
    `,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json(fail('news not found', 404, 'NOT_FOUND'))
  res.json(success(rows[0]))
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
  const output = {
    facts: factsResult.data.facts,
    risk,
    aiSummary: meta.newsSummary,
    meta: {
      newsTitle: meta.newsTitle,
      newsSummary: meta.newsSummary,
      sourceUrl: meta.sourceUrl,
      sourceName: meta.sourceName,
    },
    credibilityScore: Number((100 - fakeScore).toFixed(2)),
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

  const factsResults = []
  for (const b of bundles) {
    if (b.resolved.fromUrl && !b.resolved.fetchedFromUrl) {
      return res.status(422).json(
        fail('URL 正文抓取失败或内容过短，请改为传入 text', 422, 'URL_FETCH_FAILED'),
      )
    }
    if (!b.resolved.text) {
      return res.status(422).json(fail('未获取到可分析文本，请检查输入', 422, 'VALIDATION_ERROR'))
    }
    const fr = await extractFacts(b.resolved.text)
    if (!fr.success) {
      return res.status(502).json(fail(`多篇事实抽取失败：${fr.msg}`, 502, 'AI_SERVICE_ERROR'))
    }
    factsResults.push(fr)
  }

  const factsGroup = factsResults.map((r) => r.data.facts)
  const output = buildMultiCompareResult(items, factsGroup)
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
  const [riskRows] = await pool.execute("SELECT COUNT(*) AS highRiskCount FROM analysis_records WHERE risk_level = '高风险'")
  const [mediaRows] = await pool.execute('SELECT COUNT(DISTINCT source_name) AS mediaCoverage FROM news')
  res.json(
    success({
      todayCollected: Number(todayRows[0].todayCollected || 0),
      highRiskCount: Number(riskRows[0].highRiskCount || 0),
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

function normalizeDashscopeWorkflowItems(workflowJson) {
  const obj = workflowJson
  if (!obj) return []
  if (Array.isArray(obj)) return obj
  // 百炼工作流常见返回形态：{ res3: { res: "{...newsAnalysis:[...]}" } }
  if (obj?.res3?.res && typeof obj.res3.res === 'string') {
    const tryParse = (s) => {
      try {
        return JSON.parse(s)
      } catch {
        return null
      }
    }
    // res3.res 通常是“字符串形式的 JSON”，可能会有前后额外字符，因此先直接 parse，再回退到截取解析
    const inner = tryParse(obj.res3.res) || extractJsonFromText(obj.res3.res)
    if (Array.isArray(inner?.newsAnalysis)) return inner.newsAnalysis
    if (Array.isArray(inner?.items)) return inner.items
    if (Array.isArray(inner?.results)) return inner.results
    if (Array.isArray(inner?.news)) return inner.news
  }
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.results)) return obj.results
  if (Array.isArray(obj.news)) return obj.news
  if (Array.isArray(obj.data?.items)) return obj.data.items
  if (obj.news && Array.isArray(obj.news.items)) return obj.news.items
  // 单条对象也尽量处理为 1 条
  if (obj.title || obj.content || obj.url || obj.news_uid || obj.newsUid) return [obj]
  return []
}

function toMysqlDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeRiskLevel(riskLevel, fakeScore) {
  const v = String(riskLevel || '').trim()
  if (['低风险', '中风险', '高风险'].includes(v)) return v
  if (/^low$/i.test(v) || /^Low$/i.test(v)) return '低风险'
  if (/^medium$/i.test(v) || /^Medium$/i.test(v)) return '中风险'
  if (/^high$/i.test(v) || /^High$/i.test(v)) return '高风险'

  const score = Number(fakeScore)
  if (!Number.isNaN(score)) {
    return score >= 70 ? '高风险' : score >= 45 ? '中风险' : '低风险'
  }
  return '低风险'
}

function computeNewsUid({ uniqueId, url, title, publishedAt }) {
  if (uniqueId) return String(uniqueId)
  const basis = [url, title, publishedAt].filter(Boolean).join('|')
  if (basis) return createHash('sha1').update(basis).digest('hex')
  return createHash('sha1').update(String(Date.now() + Math.random())).digest('hex')
}

async function upsertNewsFromWorkflowItem(item) {
  const title = String(item?.title || item?.newsTitle || '').trim()
  const content = item?.content || item?.body || item?.article || ''
  const description = item?.description || item?.summary || null
  const sourceName = item?.source_name || item?.sourceName || item?.source || null
  const url = item?.url || item?.link || item?.source_url || null
  const language = item?.language || item?.lang || 'unknown'
  const publishedAt = item?.published_at || item?.publishedAt || item?.time || null
  const rawJson = item?.raw_json || item?.rawJson || item?.raw || null
  const author = item?.author || null
  const imageUrl = item?.image_url || item?.imageUrl || null
  const newsUid = computeNewsUid({
    uniqueId: item?.news_uid || item?.newsUid || item?.uniqueId || item?.uid || item?.id,
    url,
    title,
    publishedAt,
  })

  if (!newsUid) throw new Error('workflow item 缺少新闻唯一ID')

  const cleanContent = cleanArticleText(String(content || ''))
  const cleanDescription = description ? cleanArticleText(String(description)) : null

  await pool.execute(
    `
      INSERT INTO news (
        news_uid, title, description, content, source_name, author, url, image_url, language, published_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = COALESCE(VALUES(title), title),
        description = COALESCE(VALUES(description), description),
        content = COALESCE(VALUES(content), content),
        source_name = COALESCE(VALUES(source_name), source_name),
        author = COALESCE(VALUES(author), author),
        url = COALESCE(VALUES(url), url),
        image_url = COALESCE(VALUES(image_url), image_url),
        language = COALESCE(VALUES(language), language),
        published_at = COALESCE(VALUES(published_at), published_at),
        raw_json = COALESCE(VALUES(raw_json), raw_json)
    `,
    [
      newsUid,
      title || (url ? url.slice(0, 80) : '新闻工作流分析'),
      cleanDescription,
      cleanContent || null,
      sourceName,
      author,
      url,
      imageUrl,
      language,
      toMysqlDateTime(publishedAt),
      typeof rawJson === 'string' ? rawJson : rawJson ? JSON.stringify(rawJson) : null,
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
    const items = normalizeDashscopeWorkflowItems(parsed)

    if (!items.length) {
      return res.status(502).json(fail('工作流未返回可解析的新闻结果', 502, 'WORKFLOW_PARSE_ERROR'))
    }

    let storedCount = 0

    for (const item of items) {
      const title = String(item?.title || item?.newsTitle || '').trim()
      const content = String(item?.content || item?.body || item?.article || '')
      const sourceName = item?.source_name || item?.sourceName || item?.source || null
      const newsUrl = item?.url || item?.link || item?.source_url || null
      const publishedAt = item?.published_at || item?.publishedAt || item?.time || null
      const language = item?.language || item?.lang || null

      const newsSummary = item?.summary || item?.newsSummary || item?.ai_summary || item?.aiSummary || null

      const fakeScore = Number(
        item?.fake_score ??
          item?.fakeScore ??
          item?.score ??
          item?.overall_risk ??
          item?.risk_score ??
          0,
      )
      const riskLevel = normalizeRiskLevel(item?.risk_level || item?.riskLevel || item?.risk || null, fakeScore)

      const { newsId, newsUid } = await upsertNewsFromWorkflowItem({
        ...item,
        title,
        content,
        source_name: sourceName,
        url: newsUrl,
        publishedAt,
        language,
        // 让 upsertNewsFromWorkflowItem 自己基于 title/url/publishedAt 兜底计算 news_uid
        news_uid: item?.news_uid || item?.newsUid || item?.uniqueId || null,
      })

      const inputJson = item?.input || item?.input_json || item?.request || item?.raw_input || null
      const outputJson = item?.output || item?.output_json || item?.analysis || item?.result || item?.full || item

      const [ar] = await pool.execute(
        `
          INSERT INTO analysis_records (
            user_id, news_id, analysis_type, input_json, output_json, fake_score, risk_level
          ) VALUES (?, ?, 'single', ?, ?, ?, ?)
        `,
        [uid, newsId || null, JSON.stringify(inputJson || { workflowItem: item }), JSON.stringify(outputJson), fakeScore, riskLevel],
      )

      const finalNewsTitle = title || item?.headline || `工作流新闻 ${String(newsId || newsUid).slice(0, 8)}`
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

      if (alertRule.enabled && fakeScore >= alertRule.riskThreshold) {
        await pool.execute(
          `
            INSERT INTO alerts (analysis_id, title, source_name, risk_level, score, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [ar.insertId, '高风险新闻工作流命中', sourceName || 'workflow', riskLevel, fakeScore, JSON.stringify(outputJson)],
        )
      }

      storedCount += 1
    }

    return res.json(success({ storedCount }))
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
