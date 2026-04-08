<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputArea from '../components/analysis/InputArea.vue'
import ResultCard from '../components/analysis/ResultCard.vue'
import { useSingleAnalysisStore } from '../stores/singleAnalysis'
import type { NewsAnalysisParams } from '../types/analysis'

const route = useRoute()
const router = useRouter()
const store = useSingleAnalysisStore()
const inputText = ref('')

const title = computed(() => String(route.query.title || '涉华新闻样例：国际平台出现争议性报道'))
const newsId = computed(() => {
  const raw = route.query.newsId
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
})

const isUrlInput = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

const runAnalysis = async () => {
  const value = inputText.value.trim()
  if (!value) return
  const payload: NewsAnalysisParams = isUrlInput(value) ? { url: value } : { text: value }
  if (newsId.value != null) payload.newsId = newsId.value
  await store.run(payload)
}

const onExport = () => {
  const escapeHtml = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const run = async () => {
    if (!store.result) return
    const r = store.result
    const facts = ((r as any).facts || []) as Array<{ time?: string; subject?: string; event?: string; source?: string }>
    const reportTitle = r.meta?.newsTitle || '单篇新闻分析报告'
    const linesFacts = facts
      .map((f) => [f?.time, f?.subject, f?.event, f?.source].filter(Boolean).join(' / '))
      .filter(Boolean)
    const linesReasons = (r.reasons || []).filter(Boolean)
    const linesSuggestions = (r.suggestions || []).filter(Boolean)

    const sectionList = [
      { title: '基础信息', body: [`报告时间：${store.analyzedAt || '—'}`, `新闻标题：${reportTitle}`, `来源：${r.meta?.sourceName || '—'}`] },
      {
        title: '核心结果',
        body: [
          `可信度：${r.credibilityScore ?? '—'} / 100`,
          `风险等级：${r.riskLevel || '—'}`,
          `结论：${r.verdict || '—'}`,
          `原始简要总结：${r.aiSummary || r.meta?.newsSummary || '—'}`,
        ],
      },
      {
        title: '详细总结（最终版）',
        body: [r.detailedReport || r.detailedReportTrace?.finalText || '—'],
      },
      {
        title: '事实抽取',
        body: linesFacts.length ? linesFacts : ['—'],
      },
      {
        title: '关键原因',
        body: linesReasons.length ? linesReasons : ['—'],
      },
      {
        title: '执行建议',
        body: linesSuggestions.length ? linesSuggestions : ['—'],
      },
      {
        title: '风险维度',
        body: [
          `来源可信度：${r.dimensions?.sourceCredibility ?? '—'}`,
          `事实一致性：${r.dimensions?.factConsistency ?? '—'}`,
          `情绪煽动性：${r.dimensions?.emotionManipulation ?? '—'}`,
          `传播误导性：${r.dimensions?.propagationMisleading ?? '—'}`,
        ],
      },
    ]

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageW = 210
    const pageH = 297
    const margin = 12
    const contentW = pageW - margin * 2
    let y = margin

    const ensureSpace = (need: number) => {
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
      <h1 style="margin:0;font-size:24px;color:#7f1d1d;">TruthLens 单篇新闻分析导出报告</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">内容为单篇分析总结（不含调用追踪）</p>
    `
    root.appendChild(header)

    const sectionEls: HTMLElement[] = []
    for (const section of sectionList) {
      const el = document.createElement('section')
      el.style.cssText = 'margin:0 0 10px;padding:10px 12px;border:1px solid #f1d0d0;border-radius:10px;background:#fffafa;'
      el.innerHTML = `
        <h2 style="margin:0 0 8px;font-size:16px;color:#7f1d1d;">${escapeHtml(section.title)}</h2>
        ${section.body
          .map(
            (line) =>
              `<p style="margin:0 0 6px;font-size:13px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
                String(line),
              )}</p>`,
          )
          .join('')}
      `
      root.appendChild(el)
      sectionEls.push(el)
    }

    document.body.appendChild(root)
    try {
      const headerCanvas = await html2canvas(header, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const headerH = (headerCanvas.height * contentW) / headerCanvas.width
      const headerImg = headerCanvas.toDataURL('image/png')
      pdf.addImage(headerImg, 'PNG', margin, y, contentW, headerH)
      y += headerH + 4

      for (const el of sectionEls) {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
        const h = (canvas.height * contentW) / canvas.width
        ensureSpace(h + 3)
        const img = canvas.toDataURL('image/png')
        pdf.addImage(img, 'PNG', margin, y, contentW, h)
        y += h + 3
      }
    } finally {
      root.remove()
    }

    pdf.save(`truthlens-single-analysis-${Date.now()}.pdf`)
  }

  run()
}

watch(
  () => [route.query.title, route.query.newsId],
  () => {
    inputText.value = String(route.query.title || title.value || '')
  },
  { immediate: true },
)
</script>

<template>
  <div class="page page-analysis single-analysis">
    <main class="panel-layout single-layout">
      <div class="sa-input-wrap">
        <InputArea v-model="inputText" :loading="store.isLoading" :result="store.result" @analyze="runAnalysis" />
      </div>
      <ResultCard
        :loading="store.isLoading"
        :result="store.result"
        :error="store.errorMessage"
        :analyzed-at="store.analyzedAt"
        @export="onExport"
      />
    </main>
  </div>
</template>
