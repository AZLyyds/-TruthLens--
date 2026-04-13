import http from './http'
import { mockHistoryItems, mockProfile } from './mockData'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

const mockProfileLive = {
  ...mockProfile,
  preferences: Array.isArray(mockProfile.preferences) ? [...mockProfile.preferences] : [],
}

function formatHistoryTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').replace('Z', '')
  }
  const pad = (num) => String(num).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export { formatHistoryTime }

export async function fetchMyProfile() {
  if (useMock) {
    return {
      ...mockProfileLive,
      preferences: [...(mockProfileLive.preferences || [])],
    }
  }
  return http.get('/profile/me')
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function updateProfile(payload) {
  if (useMock) {
    if (payload.username != null) mockProfileLive.username = String(payload.username).trim()
    if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
      mockProfileLive.email = payload.email == null || payload.email === '' ? null : String(payload.email).trim()
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'avatarUrl')) {
      mockProfileLive.avatarUrl =
        payload.avatarUrl == null || payload.avatarUrl === '' ? null : String(payload.avatarUrl).trim()
    }
    return {
      ...mockProfileLive,
      preferences: [...(mockProfileLive.preferences || [])],
      stats: { ...(mockProfileLive.stats || {}) },
    }
  }
  return http.put('/profile/me', payload)
}

/**
 * @param {File} file
 */
export async function uploadAvatar(file) {
  if (useMock) {
    const url = URL.createObjectURL(file)
    mockProfileLive.avatarUrl = url
    return { avatarUrl: url }
  }
  const body = new FormData()
  body.append('file', file)
  return http.post('/profile/me/avatar', body, { timeout: 120000 })
}

export async function fetchHistory(params = {}) {
  if (useMock) {
    return mockHistoryItems.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      queryType: row.queryType,
      newsTitle: row.newsTitle || row.inputTitle,
      newsSummary: row.newsSummary || row.inputSummary,
      inputTitle: row.newsTitle || row.inputTitle,
      inputSummary: row.newsSummary || row.inputSummary,
      status: row.status,
    }))
  }
  const data = await http.get('/profile/history', { params })
  return data.items || []
}

export async function fetchHistoryDetail(id) {
  if (useMock) {
    const row = mockHistoryItems.find((item) => item.id === Number(id))
    if (!row) return null
    const full = row.fullAnalysisJson || row.resultJson
    return {
      id: row.id,
      createdAt: row.createdAt,
      queryType: row.queryType,
      newsTitle: row.newsTitle || row.inputTitle,
      newsSummary: row.newsSummary || row.inputSummary,
      newsBody: row.newsBody || row.inputContent,
      sourceUrl: row.sourceUrl ?? row.inputUrl,
      sourceName: row.sourceName,
      fullAnalysisJson: full,
      resultJson: full,
      inputTitle: row.newsTitle || row.inputTitle,
      inputSummary: row.newsSummary || row.inputSummary,
      inputContent: row.newsBody || row.inputContent,
      inputUrl: row.sourceUrl ?? row.inputUrl,
      status: row.status,
    }
  }
  return http.get(`/profile/history/${id}`)
}
