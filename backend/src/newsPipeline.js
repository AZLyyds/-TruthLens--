/**
 * 遗留 NewsAPI 演示采集（可选）。默认通过 NEWS_COLLECT_ENABLED=false 不启动。
 * 正式环境由百炼流水线 / 自建编排拉取新闻并写入 MySQL `news` 表，无需依赖本文件。
 */
import axios from 'axios'
import cron from 'node-cron'
import { createHash } from 'node:crypto'

function toDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeArticle(article) {
  const title = (article.title || '').trim()
  const description = (article.description || '').trim()
  const content = (article.content || '').trim()
  const sourceName = article.source?.name || 'unknown'
  const key = `${title}|${sourceName}|${article.publishedAt || ''}`.toLowerCase()
  const newsUid = createHash('sha1').update(key).digest('hex')
  return {
    newsUid,
    title,
    description: description || null,
    content: content || null,
    sourceName,
    url: article.url || null,
    language: article.language || 'unknown',
    country: article.country || 'global',
    publishedAt: toDateTime(article.publishedAt),
  }
}

export async function runNewsIngestion({ pool }) {
  const apiKey = process.env.NEWS_API_KEY
  const endpoint = process.env.NEWS_API_ENDPOINT || 'https://newsapi.org/v2/everything'
  const q = process.env.NEWS_API_QUERY || 'China'
  const pageSize = Number(process.env.NEWS_API_PAGE_SIZE || 30)

  if (!apiKey) return { skipped: true, reason: 'NEWS_API_KEY missing' }

  const response = await axios.get(endpoint, {
    params: { q, language: 'en', sortBy: 'publishedAt', pageSize, apiKey },
    timeout: 15000,
  })

  const articles = Array.isArray(response.data?.articles) ? response.data.articles : []
  const normalized = articles.map(normalizeArticle).filter((item) => item.title)
  let inserted = 0

  for (const item of normalized) {
    const [result] = await pool.execute(
      `
      INSERT INTO news
      (news_uid, title, description, content, source_name, url, language, country, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      description = VALUES(description),
      content = VALUES(content),
      source_name = VALUES(source_name),
      language = VALUES(language),
      country = VALUES(country),
      published_at = VALUES(published_at)
      `,
      [
        item.newsUid,
        item.title,
        item.description,
        item.content,
        item.sourceName,
        item.url,
        item.language,
        item.country,
        item.publishedAt,
      ],
    )
    if (result.affectedRows === 1) inserted += 1
  }

  const dedupedCount = normalized.length - inserted
  await pool.execute(
    `
    INSERT INTO collector_runs (provider, fetched_count, inserted_count, deduped_count, status)
    VALUES ('newsapi', ?, ?, ?, 'success')
    `,
    [normalized.length, inserted, dedupedCount],
  )

  return { fetched: normalized.length, inserted, deduped: dedupedCount }
}

export function startNewsCollector({ pool }) {
  const cronExpr = process.env.NEWS_COLLECT_CRON || '*/15 * * * *'
  if (process.env.NEWS_COLLECT_ENABLED === 'false') return null
  const task = cron.schedule(cronExpr, async () => {
    try {
      await runNewsIngestion({ pool })
    } catch (error) {
      await pool.execute(
        `
        INSERT INTO collector_runs (provider, fetched_count, inserted_count, deduped_count, status, error_message)
        VALUES ('newsapi', 0, 0, 0, 'failed', ?)
        `,
        [error?.message || 'ingestion failed'],
      )
    }
  })
  return task
}
