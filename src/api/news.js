import http from './http'
import { mockNewsItems } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export async function fetchNewsList(params = {}) {
  if (useMock) return mockNewsItems
  const data = await http.get('/news', { params })
  return data.items || []
}
