/**
 * 网页正文净化：去掉常见导航、分享、版权等噪声，避免把百度等平台冗余写进库或当标题。
 */
const BOILERPLATE_PATTERNS = [
  /百度首页/gi,
  /百度一下/gi,
  /分享到[\s\S]{0,20}/gi,
  /微信扫一扫/gi,
  /举报/gi,
  /版权声明/gi,
  /Copyright\s*©?[\s\S]{0,80}/gi,
  /转载请联系/gi,
  /来源\s*[:：]\s*[^\n]{0,60}/gi,
  /原标题\s*[:：]/gi,
  /相关阅读/gi,
  /推荐阅读/gi,
  /点击下一页/gi,
  /上一篇|下一篇/g,
  /APP下载/gi,
  /关注公众号/gi,
  /扫码关注/gi,
  /本文仅代表作者观点/gi,
]

export function isLikelyUrl(str) {
  if (!str || typeof str !== 'string') return false
  const s = str.trim()
  return /^https?:\/\//i.test(s) || /^www\./i.test(s)
}

export function stripWebBoilerplateFromText(text) {
  if (!text || typeof text !== 'string') return ''
  let t = text.replace(/\r\n/g, '\n')
  for (const re of BOILERPLATE_PATTERNS) {
    t = t.replace(re, ' ')
  }
  t = t.replace(/[ \t\u3000]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

export function cleanArticleText(text) {
  return stripWebBoilerplateFromText(String(text || '')).slice(0, 12000)
}
