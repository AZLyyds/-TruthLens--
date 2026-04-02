function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num))
}

export function calculateFakeScore({
  sourceCredibility = 60,
  factConsistency = 60,
  emotionManipulation = 40,
  propagationMisleading = 40,
}) {
  const normalized = {
    sourceCredibility: clamp(Number(sourceCredibility), 0, 100),
    factConsistency: clamp(Number(factConsistency), 0, 100),
    emotionManipulation: clamp(Number(emotionManipulation), 0, 100),
    propagationMisleading: clamp(Number(propagationMisleading), 0, 100),
  }

  // 分数越高风险越高：可信度/一致性是负向，操纵性/误导性是正向。
  const score =
    (100 - normalized.sourceCredibility) * 0.3 +
    (100 - normalized.factConsistency) * 0.35 +
    normalized.emotionManipulation * 0.2 +
    normalized.propagationMisleading * 0.15

  const fakeScore = Number(clamp(score, 0, 100).toFixed(2))
  const riskLevel = fakeScore >= 70 ? '高风险' : fakeScore >= 45 ? '中风险' : '低风险'
  return { fakeScore, riskLevel, dimensions: normalized }
}
