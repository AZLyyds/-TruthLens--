import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

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
