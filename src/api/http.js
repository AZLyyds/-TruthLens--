import axios from 'axios'

/**
 * 兼容仅填写主机（如 http://127.0.0.1:3000）而漏掉 /api/v1 的 .env，否则会请求到 /news/... 导致后端 404。
 */
function normalizeApiBase(raw) {
  const fallback = '/api/v1'
  if (raw == null || String(raw).trim() === '') return fallback
  const s = String(raw).trim().replace(/\/$/, '')
  if (s.startsWith('/')) {
    return s.includes('/api') ? s : fallback
  }
  try {
    const u = new URL(s)
    const p = u.pathname.replace(/\/$/, '') || '/'
    if (p === '/' || p === '') {
      u.pathname = '/api/v1'
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return fallback
  }
}

const baseURL = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

const http = axios.create({
  baseURL,
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('truthlens_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code !== 0) {
        const error = new Error(payload.message || 'Request failed')
        error.payload = payload
        throw error
      }
      return payload.data
    }
    return payload
  },
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      localStorage.removeItem('truthlens_access_token')
      localStorage.removeItem('truthlens_refresh_token')
    }
    return Promise.reject(error)
  },
)

export default http
