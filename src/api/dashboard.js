import http from './http'

export async function fetchDashboardOverview() {
  return http.get('/dashboard/overview')
}

export async function fetchDashboardTrends() {
  return http.get('/dashboard/trends')
}

export async function fetchDashboardRanking() {
  return http.get('/dashboard/ranking')
}

export async function fetchDashboardAlerts() {
  return http.get('/dashboard/alerts')
}

/** 大屏聚合数据（单接口，字段随后端演进由前端自适应解析） */
export async function fetchDashboardScreen() {
  return http.get('/dashboard/screen', { timeout: 60000 })
}
