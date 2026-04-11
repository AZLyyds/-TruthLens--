import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: true,
})

/**
 * 将 AI 返回的 Markdown 转为可安全用于 v-html 的 HTML。
 */
export function renderAiMarkdown(source) {
  const raw = String(source || '').trim()
  if (!raw) return ''
  const html = marked.parse(raw)
  return DOMPurify.sanitize(html)
}
