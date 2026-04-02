import { randomUUID } from 'node:crypto'

export function success(data = null, message = 'ok') {
  return {
    code: 0,
    message,
    data,
    requestId: randomUUID(),
    ts: new Date().toISOString(),
  }
}

export function fail(message = 'error', code = 1, errorType = 'BUSINESS_ERROR') {
  return {
    code,
    message,
    data: null,
    errorType,
    requestId: randomUUID(),
    ts: new Date().toISOString(),
  }
}

export function parsePagination(query) {
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 20)
  return {
    page: Number.isNaN(page) ? 1 : page,
    pageSize: Number.isNaN(pageSize) ? 20 : pageSize,
  }
}
