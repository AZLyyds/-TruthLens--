/**
 * 新闻门户大屏（NewsPortalScreenView）与详情页共用的 picsum 占位：固定 seed，同 id 下图不变。
 * @param {string|number} seedSuffix 拼在 seed 里，如 tlstrip1、tllist3、tlstrip 新闻 id
 * @param {number} width
 * @param {number} height
 */
export function newsPortalPicsumPlaceholder(seedSuffix, width, height) {
  const w = Number(width) || 960
  const h = Number(height) || 720
  return `https://picsum.photos/seed/${String(seedSuffix)}/${w}/${h}`
}
