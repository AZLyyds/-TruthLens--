import http from './http'

export async function runNewsWorkflow(payload = {}) {
  const timeoutMs = Number(payload?.timeoutMs || 360000)
  return http.post(
    '/run-news-workflow',
    {
      ...payload,
      timeoutMs,
    },
    {
      // 覆盖全局 15s：工作流可能耗时数十秒到数分钟
      timeout: timeoutMs + 15000,
    },
  )
}

