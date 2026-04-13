<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { analyzeMulti } from '../api/analysis'
import { renderAiMarkdown } from '../utils/aiMarkdown.js'

const router = useRouter()
const inputItems = ref(['', ''])
const output = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')
const conflictsOpen = ref(true)
const hoveredRadarAxis = ref(-1)
const animatedRadar = ref([0, 0, 0, 0])
const radarAnimating = ref(false)
const MULTI_CACHE_KEY = 'truthlens_multi_analysis_cache_v2'

const isUrlInput = (value) => /^https?:\/\//i.test(String(value || '').trim())
const hasEnoughInputs = computed(() => inputItems.value.filter((v) => String(v || '').trim()).length >= 2)
const multiSummaryDisplay = computed(() => {
  const o = output.value
  if (!o) return ''
  const deep = o.deepAnalysis || {}
  const raw = String(o.detailedReport || '').trim()
  if (raw.length >= 80) return raw
  const conflicts = Array.isArray(deep.factDifferences) ? deep.factDifferences.filter(Boolean) : []
  return [
    conflicts.length ? `关键分歧集中在：${conflicts.slice(0, 2).join('；')}。` : '',
    deep.verificationConclusion ? `核查结论：${deep.verificationConclusion}` : '',
    Array.isArray(deep.actionSuggestions) && deep.actionSuggestions.length
      ? `执行建议：${deep.actionSuggestions.slice(0, 2).join('；')}`
      : '',
  ]
    .filter(Boolean)
    .join('')
})

const multiSummaryHtml = computed(() => renderAiMarkdown(multiSummaryDisplay.value))

const deepCoreFacts = computed(() => {
  const rows = output.value?.deepAnalysis?.coreFacts
  return Array.isArray(rows) && rows.length ? rows : ['暂无稳定一致事实']
})
const deepDifferences = computed(() => {
  const rows = output.value?.deepAnalysis?.factDifferences
  return Array.isArray(rows) && rows.length ? rows : ['暂无明确分歧点']
})
const deepMissing = computed(() => {
  const rows = output.value?.deepAnalysis?.missingInfo
  return Array.isArray(rows) && rows.length ? rows : ['暂无明显缺失项']
})
const deepConclusion = computed(() =>
  String(output.value?.deepAnalysis?.verificationConclusion || output.value?.recommendation || '暂无核查结论'),
)
const deepActions = computed(() => {
  const rows = output.value?.deepAnalysis?.actionSuggestions
  return Array.isArray(rows) && rows.length ? rows : ['建议回查原文并补齐关键细节后再传播']
})

function addInput() {
  inputItems.value.push('')
}

function removeInput(index) {
  if (inputItems.value.length <= 2) return
  inputItems.value.splice(index, 1)
}

const radarMeta = [
  { key: 'timeline', label: '时间线', icon: '⏱️', tip: '两篇文章在时间叙述与事件顺序上的一致程度' },
  { key: 'subject', label: '主体一致', icon: '👤', tip: '关键人物、机构等主体指称是否对齐' },
  { key: 'data', label: '数据一致', icon: '📊', tip: '比分、数字、统计等可量化信息是否一致' },
  { key: 'conclusion', label: '结论一致', icon: '📝', tip: '整体结论与叙事方向是否相容' },
]

/** 基于接口返回的 consistencyScore 与冲突数量推导四轴分数（不新增接口字段，与旧版「同源分数」逻辑一致） */
function deriveRadarScores(o) {
  if (!o || typeof o.consistencyScore !== 'number') {
    return [0, 0, 0, 0]
  }
  const base = Math.max(0, Math.min(100, Number(o.consistencyScore)))
  const n = Array.isArray(o.conflicts) ? o.conflicts.length : 0
  const timeline = Math.max(0, Math.min(100, base - Math.min(20, n * 4)))
  const subject = Math.max(0, Math.min(100, base - Math.min(15, n * 3)))
  const data = base
  const conclusion = Math.max(0, Math.min(100, base - Math.min(12, n * 2)))
  return [timeline, subject, data, conclusion]
}

const radarTarget = computed(() => deriveRadarScores(output.value))

/** 建议动作：由接口字段组合，信息密度高 */
const actionCards = computed(() => {
  const o = output.value
  if (!o) return []
  const cards = []
  const score = o.consistencyScore
  if (typeof score === 'number' && !Number.isNaN(score)) {
    const s = Math.round(score)
    let hint = '可优先采信多源重合信息，对单一来源保持审慎。'
    if (s >= 75) hint = '整体对齐度高，可将一致事实作为工作底稿，仍建议保留原文链接备查。'
    else if (s < 40) hint = '冲突信号偏多，建议暂停二次传播，按下列分歧项逐项核对。'
    else if (s < 70) hint = '存在可解释的差异，建议对下列分歧与缺失项做定向核验后再引用。'
    cards.push({
      type: 'score',
      tag: '一致性',
      title: `综合一致性 ${s} 分`,
      body: hint,
    })
  }
  const actions = Array.isArray(o.deepAnalysis?.actionSuggestions)
    ? o.deepAnalysis.actionSuggestions.filter(Boolean)
    : []
  actions.forEach((text, i) => {
    cards.push({
      type: 'action',
      tag: '执行',
      title: `建议 ${i + 1}`,
      body: String(text),
    })
  })
  const conflicts = Array.isArray(o.conflicts) ? o.conflicts.filter(Boolean) : []
  conflicts.slice(0, 5).forEach((text, i) => {
    cards.push({
      type: 'conflict',
      tag: '分歧',
      title: `冲突 ${i + 1}`,
      body: String(text),
    })
  })
  const miss = Array.isArray(o.deepAnalysis?.missingInfo) ? o.deepAnalysis.missingInfo.filter(Boolean) : []
  miss.slice(0, 4).forEach((text, i) => {
    cards.push({
      type: 'missing',
      tag: '缺失',
      title: `待核实 ${i + 1}`,
      body: String(text),
    })
  })
  if (!cards.length) {
    cards.push({
      type: 'fallback',
      tag: '提示',
      title: '暂无结构化建议',
      body: '完成比对后，将基于冲突、缺失与模型建议生成可执行项。',
    })
  }
  return cards.slice(0, 14)
})

const radarGridRadii = [18, 36, 54, 72]

const consistencyBarTone = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 'mid'
  if (v <= 30) return 'low'
  if (v <= 60) return 'mid'
  return 'high'
})

const conclusionTone = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 'neutral'
  if (v < 40) return 'bad'
  if (v < 70) return 'warn'
  return 'good'
})

const authorityStars = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 3
  return Math.max(1, Math.min(5, Math.round(v / 20)))
})

const authorityBarPct = computed(() => {
  const v = output.value?.consistencyScore
  if (v == null) return 50
  return Math.max(0, Math.min(100, v))
})

/** 雷达图顶点：4 轴，从顶部顺时针 */
function radarPoints(values, scale = 1) {
  const cx = 100
  const cy = 100
  const r = 72
  const pts = []
  for (let k = 0; k < 4; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 2
    const t = (Number(values[k]) / 100) * scale
    const x = cx + r * t * Math.cos(angle)
    const y = cy + r * t * Math.sin(angle)
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

const radarPolygonPoints = computed(() => radarPoints(animatedRadar.value, 1))

function runRadarAnimation(targets) {
  radarAnimating.value = true
  const start = animatedRadar.value.slice()
  const duration = 1000
  const t0 = performance.now()
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration)
    const ease = 1 - (1 - p) ** 3
    for (let i = 0; i < 4; i += 1) {
      animatedRadar.value[i] = Math.round(start[i] + (targets[i] - start[i]) * ease)
    }
    if (p < 1) requestAnimationFrame(tick)
    else {
      animatedRadar.value = targets.map((n) => Math.round(n))
      radarAnimating.value = false
    }
  }
  requestAnimationFrame(tick)
}

watch(
  () => output.value,
  (next) => {
    if (!next) {
      animatedRadar.value = [0, 0, 0, 0]
      return
    }
    const t = deriveRadarScores(next)
    runRadarAnimation(t)
  },
)

onMounted(() => {
  try {
    const raw = localStorage.getItem(MULTI_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.inputItems)) inputItems.value = parsed.inputItems.map((x) => String(x || ''))
      if (parsed?.output && typeof parsed.output === 'object') output.value = parsed.output
    }
  } catch {
    /* ignore cache */
  }
  if (output.value) runRadarAnimation(deriveRadarScores(output.value))
})

watch(
  () => [inputItems.value, output.value],
  () => {
    try {
      localStorage.setItem(
        MULTI_CACHE_KEY,
        JSON.stringify({
          inputItems: inputItems.value,
          output: output.value,
        }),
      )
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

const onExport = async () => {
  if (!output.value) return
  const o = output.value
  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const sectionList = [
    {
      title: '核心事实一致点',
      body: [
        ...(Array.isArray(o?.deepAnalysis?.coreFacts) && o.deepAnalysis.coreFacts.length
          ? o.deepAnalysis.coreFacts
          : ['暂无稳定一致事实']),
      ],
    },
    {
      title: '事实分歧点',
      body:
        Array.isArray(o?.deepAnalysis?.factDifferences) && o.deepAnalysis.factDifferences.length
          ? o.deepAnalysis.factDifferences
          : ['暂无明确分歧点'],
    },
    {
      title: '信息缺失项',
      body:
        Array.isArray(o?.deepAnalysis?.missingInfo) && o.deepAnalysis.missingInfo.length
          ? o.deepAnalysis.missingInfo
          : ['暂无明显缺失项'],
    },
    {
      title: '核查结论',
      body: [String(o?.deepAnalysis?.verificationConclusion || o.recommendation || '—')],
    },
    {
      title: '执行建议',
      body:
        Array.isArray(o?.deepAnalysis?.actionSuggestions) && o.deepAnalysis.actionSuggestions.length
          ? o.deepAnalysis.actionSuggestions
          : ['建议回查原文并补齐关键细节后再传播'],
    },
    {
      title: 'AI总结',
      markdown: String(o?.detailedReport || '').trim() || '—',
    },
    {
      title: '输入文本',
      body: inputItems.value.map((t, i) => `来源 ${i + 1}：${String(t || '').trim() || '—'}`),
    },
  ]

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const margin = 12
  const contentW = pageW - margin * 2
  let y = margin
  const ensureSpace = (need) => {
    if (y + need <= pageH - margin) return
    pdf.addPage()
    y = margin
  }

  const root = document.createElement('div')
  root.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    'width: 920px',
    'background: #ffffff',
    'padding: 18px 20px',
    "font-family: 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    'color: #1f2937',
    'line-height: 1.6',
  ].join(';')
  const header = document.createElement('div')
  header.style.cssText = 'margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #b91c1c;'
  header.innerHTML = `
    <h1 style="margin:0;font-size:24px;color:#7f1d1d;">TruthLens 多篇一致性分析导出报告</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">多源新闻比对结果与AI总结</p>
  `
  root.appendChild(header)

  const mdStyle = document.createElement('style')
  mdStyle.textContent = `
    .tl-md-export{font-size:13px;line-height:1.65;color:#1f2937;word-break:break-word;}
    .tl-md-export h1{font-size:18px;margin:0 0 10px;color:#7f1d1d;font-weight:700;}
    .tl-md-export h2{font-size:15px;margin:14px 0 8px;color:#991b1b;font-weight:700;}
    .tl-md-export h3{font-size:14px;margin:10px 0 6px;color:#374151;font-weight:600;}
    .tl-md-export p{margin:0 0 8px;}
    .tl-md-export ul{margin:0 0 8px;padding-left:1.2rem;}
    .tl-md-export li{margin:0 0 4px;}
    .tl-md-export strong{color:#111827;}
  `
  root.appendChild(mdStyle)

  const sectionEls = []
  for (const s of sectionList) {
    const el = document.createElement('section')
    el.style.cssText = 'margin:0 0 10px;padding:10px 12px;border:1px solid #f1d0d0;border-radius:10px;background:#fffafa;'
    if ('markdown' in s) {
      const md = s.markdown === '—' ? escapeHtml('—') : renderAiMarkdown(s.markdown)
      el.innerHTML = `
        <h2 style="margin:0 0 8px;font-size:16px;color:#7f1d1d;">${escapeHtml(s.title)}</h2>
        <div class="tl-md-export">${md}</div>
      `
    } else {
      el.innerHTML = `
        <h2 style="margin:0 0 8px;font-size:16px;color:#7f1d1d;">${escapeHtml(s.title)}</h2>
        ${s.body
          .map(
            (line) =>
              `<p style="margin:0 0 6px;font-size:13px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
                String(line),
              )}</p>`,
          )
          .join('')}
      `
    }
    root.appendChild(el)
    sectionEls.push(el)
  }
  document.body.appendChild(root)
  try {
    const headerCanvas = await html2canvas(header, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const headerH = (headerCanvas.height * contentW) / headerCanvas.width
    pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, y, contentW, headerH)
    y += headerH + 4
    for (const el of sectionEls) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const h = (canvas.height * contentW) / canvas.width
      ensureSpace(h + 3)
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, h)
      y += h + 3
    }
  } finally {
    root.remove()
  }
  pdf.save(`truthlens-multi-analysis-${Date.now()}.pdf`)
}

const runCompare = async () => {
  if (!hasEnoughInputs.value) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    const items = inputItems.value
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .map((v) => (isUrlInput(v) ? { url: v } : { text: v }))
    output.value = await analyzeMulti({
      items,
    })
  } catch (error) {
    errorMessage.value = error?.message || '一致性分析失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="page page-analysis multi-analysis">
    <main class="panel-layout multi-main">
      <section class="card io-panel multi-card-enter multi-hover-card multi-input-panel" style="--delay: 0s">
        <div class="multi-input-head">
          <h2>多源输入</h2>
          <button class="action-btn ghost" type="button" @click="addInput">增加来源</button>
        </div>
        <p class="multi-input-lead">每行一个正文或 http(s) 链接，至少两条；样式与单篇分析输入区一致。</p>
        <div v-for="(item, idx) in inputItems" :key="idx" class="mi-card">
          <div class="mi-decor" aria-hidden="true">
            <svg class="mi-decor-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="78" stroke="currentColor" stroke-width="1.2" opacity="0.22" />
              <circle cx="100" cy="100" r="52" stroke="currentColor" stroke-width="1" opacity="0.32" />
              <circle cx="100" cy="100" r="26" fill="currentColor" opacity="0.07" />
            </svg>
          </div>
          <div class="mi-blobs" aria-hidden="true" />
          <div class="mi-shell">
            <div class="mi-row-title">
              <h3 class="mi-title">来源 {{ idx + 1 }}</h3>
              <button
                v-if="inputItems.length > 2"
                type="button"
                class="mi-remove"
                @click="removeInput(idx)"
              >
                删除
              </button>
            </div>
            <p class="mi-hint">正文或链接</p>
            <textarea
              v-model="inputItems[idx]"
              class="mi-field"
              rows="4"
              spellcheck="false"
              :placeholder="`粘贴第 ${idx + 1} 条新闻全文或可访问链接`"
            />
          </div>
        </div>
        <button class="action-btn mi-run" :disabled="isLoading || !hasEnoughInputs" @click="runCompare">
          {{ isLoading ? '分析中…' : '开始一致性分析' }}
        </button>
      </section>

      <section class="card io-panel multi-card-enter multi-hover-card multi-output-card" style="--delay: 0.15s">
        <div class="multi-output-head">
          <h3>输出（output）</h3>
          <button type="button" class="action-btn ghost" :disabled="!output" @click="onExport">导出PDF</button>
        </div>
        <div v-if="isLoading" class="multi-loading-skeleton" role="status" aria-live="polite">
          <div class="ml-row ml-row--title shimmer" />
          <div class="ml-row shimmer" />
          <div class="ml-row shimmer" />
          <div class="ml-grid">
            <div class="ml-card shimmer" />
            <div class="ml-card shimmer" />
          </div>
          <p class="ml-tip">多源一致性分析中…</p>
        </div>
        <div v-if="errorMessage" class="multi-output-inner danger">{{ errorMessage }}</div>
        <div v-else-if="output" class="multi-output-inner multi-output-structured">
          <header class="multi-out-title">多源一致性分析结果</header>

          <section class="multi-ai-summary multi-ai-summary--primary">
            <span class="multi-label">AI总结</span>
            <div class="multi-ai-summary-scroll markdown-body" v-html="multiSummaryHtml" />
          </section>

          <section class="multi-ai-section">
            <h4>核心事实一致点</h4>
            <ul>
              <li v-for="(line, idx) in deepCoreFacts" :key="`core-${idx}`">{{ line }}</li>
            </ul>
          </section>

          <section class="multi-ai-section">
            <h4>事实分歧点</h4>
            <ul>
              <li v-for="(line, idx) in deepDifferences" :key="`diff-${idx}`">{{ line }}</li>
            </ul>
          </section>

          <section class="multi-ai-section">
            <h4>信息缺失项</h4>
            <ul>
              <li v-for="(line, idx) in deepMissing" :key="`miss-${idx}`">{{ line }}</li>
            </ul>
          </section>

          <section class="multi-ai-section">
            <h4>核查结论</h4>
            <p class="multi-ai-conclusion">{{ deepConclusion }}</p>
          </section>

          <section class="multi-ai-section">
            <h4>执行建议</h4>
            <ul>
              <li v-for="(line, idx) in deepActions" :key="`act-${idx}`">{{ line }}</li>
            </ul>
          </section>
        </div>
        <div v-else class="multi-output-inner placeholder">填写两条输入后点击按钮，查看多源一致性结果。</div>
      </section>
    </main>

    <section class="analysis-extra multi-extra">
      <article class="card block multi-card-enter multi-hover-card multi-radar-card" style="--delay: 0.3s">
        <h3>一致性雷达</h3>
        <div class="multi-radar-wrap">
          <div v-if="hoveredRadarAxis >= 0" class="multi-radar-tooltip">
            {{ radarMeta[hoveredRadarAxis].tip }}
          </div>
          <svg class="multi-radar-svg" viewBox="0 0 200 200" role="img" aria-label="一致性雷达图">
            <defs>
              <linearGradient id="multiRadarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fecaca" stop-opacity="0.62" />
                <stop offset="55%" stop-color="#f87171" stop-opacity="0.38" />
                <stop offset="100%" stop-color="#b91c1c" stop-opacity="0.35" />
              </linearGradient>
              <filter id="multiRadarGlow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="1.8" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle
              v-for="(rr, ri) in radarGridRadii"
              :key="`rg-${ri}`"
              cx="100"
              cy="100"
              :r="rr"
              fill="none"
              stroke="#e7e5e4"
              stroke-width="1"
              opacity="0.9"
            />
            <line
              v-for="(meta, idx) in radarMeta"
              :key="`ax-${meta.key}`"
              x1="100"
              y1="100"
              :x2="100 + 72 * Math.cos(-Math.PI / 2 + (idx * Math.PI) / 2)"
              :y2="100 + 72 * Math.sin(-Math.PI / 2 + (idx * Math.PI) / 2)"
              stroke="#d6d3d1"
              :stroke-width="hoveredRadarAxis === idx ? 2 : 1"
              :opacity="hoveredRadarAxis === idx ? 0.95 : 0.5"
              class="multi-radar-axis-line"
            />
            <polygon
              :points="radarPolygonPoints"
              fill="url(#multiRadarFill)"
              stroke="#b91c1c"
              stroke-width="2"
              stroke-linejoin="round"
              filter="url(#multiRadarGlow)"
              class="multi-radar-fill-poly"
            />
            <circle
              v-for="(meta, idx) in radarMeta"
              :key="`pt-${meta.key}`"
              :cx="100 + ((animatedRadar[idx] || 0) / 100) * 72 * Math.cos(-Math.PI / 2 + (idx * Math.PI) / 2)"
              :cy="100 + ((animatedRadar[idx] || 0) / 100) * 72 * Math.sin(-Math.PI / 2 + (idx * Math.PI) / 2)"
              r="4"
              fill="#fff"
              stroke="#b91c1c"
              stroke-width="2"
            />
            <circle cx="100" cy="100" r="22" fill="rgba(255,255,255,0.95)" stroke="#fecaca" stroke-width="1.2" />
            <text x="100" y="95" text-anchor="middle" font-size="7.5" fill="#57534e" font-weight="700">综合一致</text>
            <text x="100" y="108" text-anchor="middle" font-size="11" fill="#b91c1c" font-weight="800">
              {{ Math.round(output?.consistencyScore ?? 0) }}
            </text>
          </svg>
          <div
            v-for="(meta, idx) in radarMeta"
            :key="`lbl-${meta.key}`"
            class="multi-radar-label"
            :class="[`axis-${idx}`, { hover: hoveredRadarAxis === idx }]"
            @mouseenter="hoveredRadarAxis = idx"
            @mouseleave="hoveredRadarAxis = -1"
          >
            <span class="multi-radar-ico">{{ meta.icon }}</span>
            <span>{{ meta.label }}</span>
          </div>
        </div>
        <div class="multi-radar-scores">
          <div
            v-for="(meta, idx) in radarMeta"
            :key="`sc-${meta.key}`"
            class="multi-radar-score-chip"
            :class="{ active: hoveredRadarAxis === idx }"
            @mouseenter="hoveredRadarAxis = idx"
            @mouseleave="hoveredRadarAxis = -1"
          >
            <span>{{ meta.label }}</span>
            <strong>{{ animatedRadar[idx] }}%</strong>
          </div>
        </div>
        <p class="multi-radar-hint">四轴由综合一致性分与冲突条数推导，可与下方「建议动作」对照阅读。</p>
      </article>

      <article class="card block multi-card-enter multi-hover-card multi-suggest-card" style="--delay: 0.45s">
        <h3>建议动作</h3>
        <p class="multi-suggest-lead">基于本轮一致性分数、模型建议、冲突与缺失信息自动生成。</p>
        <p v-if="!output" class="multi-action-placeholder">完成左侧分析后，将在此生成可执行建议卡片。</p>
        <div v-else class="multi-action-grid">
          <div
            v-for="(card, idx) in actionCards"
            :key="`${card.type}-${idx}-${card.title}`"
            class="multi-action-card"
            :class="`multi-action-card--${card.type}`"
          >
            <span class="multi-action-tag">{{ card.tag }}</span>
            <h4 class="multi-action-title">{{ card.title }}</h4>
            <p class="multi-action-body">{{ card.body }}</p>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.multi-analysis {
  --tl-red: #b91c1c;
  --tl-red-soft: #fef2f2;
  --tl-border: #ead7d7;
  --tl-text: #1f2937;
}

.multi-main {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.multi-loading-skeleton {
  margin: 8px 0 12px;
  padding: 12px;
  border: 1px solid #efe2e2;
  border-radius: 12px;
  background: #fff;
}

.ml-row {
  height: 12px;
  border-radius: 999px;
  background: #efeceb;
  margin-bottom: 8px;
}

.ml-row--title {
  width: 52%;
  height: 14px;
}

.ml-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 6px;
}

.ml-card {
  height: 56px;
  border-radius: 10px;
  background: #f3f0ef;
}

.ml-tip {
  margin: 10px 0 0;
  font-size: 13px;
  color: #7f1d1d;
}

.multi-main .io-panel {
  border-radius: 14px;
  border: 1px solid var(--tl-border);
  background: linear-gradient(180deg, #fff, #fffafa);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
  padding: 14px;
}

.multi-main h2,
.multi-main h3 {
  margin: 0 0 8px;
  color: #111827;
}

.multi-input-head,
.multi-output-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 4px 0 12px;
  padding-top: 6px;
  text-align: center;
}

.multi-input-head h2,
.multi-output-head h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.multi-input-head .action-btn,
.multi-output-head .action-btn {
  flex-shrink: 0;
  margin-left: 0;
}

.multi-input-lead {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: #57534e;
}

.mi-card {
  position: relative;
  margin-bottom: 14px;
  padding: 18px 16px 16px;
  border-radius: 16px;
  overflow: hidden;
  background:
    radial-gradient(ellipse 120% 90% at 100% 0%, rgba(185, 28, 28, 0.08), transparent 55%),
    radial-gradient(ellipse 90% 70% at 0% 100%, rgba(120, 8, 14, 0.06), transparent 50%),
    linear-gradient(168deg, #f5f6f8 0%, #ebecef 100%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 2px 12px rgba(0, 0, 0, 0.04);
}

.mi-decor {
  position: absolute;
  right: -48px;
  top: 50%;
  width: 200px;
  height: 200px;
  transform: translateY(-50%);
  color: rgba(185, 28, 28, 0.14);
  pointer-events: none;
}

.mi-decor-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.mi-blobs {
  position: absolute;
  width: 160px;
  height: 160px;
  left: -70px;
  top: 55%;
  transform: translateY(-50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(185, 28, 28, 0.09), transparent 68%);
  filter: blur(2px);
  pointer-events: none;
}

.mi-shell {
  position: relative;
  z-index: 1;
}

.mi-row-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.mi-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: #1c1917;
}

.mi-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #78716c;
}

.mi-field {
  width: 100%;
  min-height: 100px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--tl-text);
  font-family: inherit;
  resize: vertical;
}

.mi-field:focus {
  outline: none;
  border-color: rgba(185, 28, 28, 0.45);
  box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.12);
}

.mi-remove {
  flex-shrink: 0;
  border: 1px solid rgba(254, 202, 202, 0.95);
  background: #fff5f5;
  color: #991b1b;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;
  font-family: inherit;
}

.mi-run {
  width: 100%;
  margin-top: 4px;
}

.action-btn.ghost {
  background: #fff5f5;
  color: #991b1b;
  border: 1px solid #f1d0d0;
}

.multi-output-inner {
  border: 1px solid #f0e2e2;
  border-radius: 12px;
  background: #fff;
  padding: 16px;
}

.multi-out-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 10px;
}

.multi-ai-section {
  margin-top: 10px;
  padding: 18px 20px;
  border: 1px solid #f1dede;
  border-radius: 10px;
  background: #fffdfd;
}

.multi-ai-section h4 {
  margin: 0 0 12px;
  font-size: 19px;
  color: #7f1d1d;
}

.multi-ai-section ul {
  margin: 0;
  padding-left: 24px;
}

.multi-ai-section li {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.8;
  color: #374151;
}

.multi-ai-section li:last-child {
  margin-bottom: 0;
}

.multi-ai-conclusion {
  margin: 0;
  font-size: 16px;
  line-height: 1.86;
  color: #374151;
}

.multi-ai-summary {
  margin-top: 0;
  margin-bottom: 12px;
  padding: 14px 14px 12px;
  border: 1px solid #e7b4b4;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff5f5 0%, #fffafa 100%);
  box-shadow: 0 4px 14px rgba(185, 28, 28, 0.08);
}

.multi-ai-summary--primary .multi-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #7f1d1d;
}

.multi-ai-summary-scroll {
  margin-top: 10px;
  max-height: min(62vh, 620px);
  min-height: 240px;
  overflow-y: auto;
  padding-right: 6px;
  font-size: 15px;
  line-height: 1.75;
  color: #1f2937;
  scrollbar-width: thin;
}

.multi-ai-summary-scroll :deep(h1) {
  margin: 0 0 10px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #7f1d1d;
  line-height: 1.35;
}

.multi-ai-summary-scroll :deep(h2) {
  margin: 14px 0 8px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #991b1b;
  line-height: 1.4;
}

.multi-ai-summary-scroll :deep(h3) {
  margin: 10px 0 6px;
  font-size: 0.98rem;
  font-weight: 600;
  color: #374151;
}

.multi-ai-summary-scroll :deep(p) {
  margin: 0 0 10px;
}

.multi-ai-summary-scroll :deep(ul),
.multi-ai-summary-scroll :deep(ol) {
  margin: 0 0 10px;
  padding-left: 1.25rem;
}

.multi-ai-summary-scroll :deep(li) {
  margin: 0 0 6px;
}

.multi-ai-summary-scroll :deep(strong) {
  color: #111827;
}

.multi-ai-summary-scroll :deep(hr) {
  border: none;
  border-top: 1px solid #f1d0d0;
  margin: 12px 0;
}

.analysis-extra.multi-extra {
  margin-top: 12px;
}

.analysis-extra.multi-extra .card {
  border: 1px solid var(--tl-border);
  border-radius: 14px;
  background: #fff;
}

.multi-suggest-lead {
  margin: 0 0 12px;
  font-size: 13px;
  color: #57534e;
  line-height: 1.5;
}

.multi-action-placeholder {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: #fafaf9;
  border: 1px dashed #d6d3d1;
  font-size: 13px;
  color: #78716c;
  text-align: center;
}

.multi-action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.multi-action-card {
  padding: 12px 12px 11px;
  border-radius: 14px;
  border: 1px solid #e7e5e4;
  background: linear-gradient(165deg, #ffffff 0%, #fafaf9 100%);
  box-shadow: 0 2px 10px rgba(28, 25, 23, 0.04);
}

.multi-action-card--score {
  border-color: rgba(254, 202, 202, 0.85);
  background: linear-gradient(165deg, #fffbfb 0%, #ffffff 100%);
}

.multi-action-card--conflict {
  border-color: rgba(251, 191, 36, 0.45);
}

.multi-action-card--action {
  border-color: rgba(185, 28, 28, 0.2);
}

.multi-action-card--missing {
  border-color: rgba(148, 163, 184, 0.45);
}

.multi-action-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7f1d1d;
  background: #fef2f2;
  border: 1px solid rgba(254, 202, 202, 0.8);
  padding: 3px 8px;
  border-radius: 999px;
  margin-bottom: 8px;
}

.multi-action-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 800;
  color: #1c1917;
  line-height: 1.35;
}

.multi-action-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #44403c;
}

@media (max-width: 980px) {
  .multi-main {
    grid-template-columns: 1fr;
  }
}
</style>
