/**
 * 试用：从数据库取最近 2 条 news，调用千问抽特征 + fakeScoreModel 打分。
 *
 * 从仓库根目录执行（需已配置 .env 中 DASHSCOPE_API_KEY 与 MySQL）：
 *   npm run trial:fake-score
 */
import { getPool } from '../src/db.js'
import { extractFeaturesAndComputeFakeScore } from '../src/featureExtractForFakeScore.js'

async function main() {
  const pool = getPool()
  const [rows] = await pool.query(
    `
    SELECT id, title, content, description, source_name AS sourceName
    FROM news
    ORDER BY id DESC
    LIMIT 2
    `,
  )

  if (!rows?.length) {
    console.error('库中暂无新闻，请先写入 news 表或触发工作流。')
    process.exitCode = 1
    await pool.end().catch(() => {})
    return
  }

  console.log(`共取最近 ${rows.length} 条新闻做特征抽取与 FakeScore 试算。\n`)

  for (const row of rows) {
    console.log('---')
    console.log(`id=${row.id} | ${String(row.title || '').slice(0, 80)}`)
    console.log(`来源: ${row.sourceName || '—'}`)

    const r = await extractFeaturesAndComputeFakeScore({
      title: row.title,
      content: row.content,
      description: row.description,
      sourceName: row.sourceName,
    })

    if (!r.success) {
      console.error('失败:', r.msg)
      if (r.rawContent) console.error('原始片段:', String(r.rawContent).slice(0, 400))
      continue
    }

    console.log('特征(风险向 0~1):', JSON.stringify(r.features, null, 2))
    console.log(
      `FakeScore=${r.score.fakeScore}  P(fake)=${r.score.pFake}  f(x)=${r.score.f}`,
    )
    console.log('')
  }

  await pool.end().catch(() => {})
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
