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
