<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputArea from '../components/analysis/InputArea.vue'
import ResultCard from '../components/analysis/ResultCard.vue'
import { useSingleAnalysisStore } from '../stores/singleAnalysis'
import type { NewsAnalysisParams } from '../types/analysis'
import { renderAiMarkdown } from '../utils/aiMarkdown.js'

const route = useRoute()
const router = useRouter()
const store = useSingleAnalysisStore()
const inputText = ref('')

const title = computed(() => String(route.query.title || '涉华新闻样例：国际平台出现争议性报道'))

/** 单篇分析固定为上下布局（输入在上、输出在下） */
const stackReportLayout = true
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

    /** 将过高的 canvas 按页纵向切片写入 PDF，避免长文（如 Markdown 总结）在页底被裁切 */
    const addCanvasPaged = (
      pdf: { addPage: () => void; addImage: (...args: unknown[]) => void },
      canvas: HTMLCanvasElement,
      targetWmm: number,
      pageHmm: number,
      sideMargin: number,
      yState: { y: number },
      gapMm = 1.5,
    ) => {
      if (!canvas.width || !canvas.height) return
      const fullHmm = (canvas.height / canvas.width) * targetWmm
      const mmPerPx = fullHmm / canvas.height
      let srcTop = 0
      while (srcTop < canvas.height) {
        let avail = pageHmm - sideMargin - yState.y
        if (avail < 4) {
          pdf.addPage()
          yState.y = sideMargin
          avail = pageHmm - sideMargin - yState.y
        }
        const maxPx = Math.min(canvas.height - srcTop, Math.max(1, Math.floor(avail / mmPerPx)))
        const slicePx = maxPx
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = slicePx
        const ctx = slice.getContext('2d')
        if (!ctx) break
        ctx.drawImage(canvas, 0, srcTop, canvas.width, slicePx, 0, 0, canvas.width, slicePx)
        const sliceHmm = (slicePx / canvas.width) * targetWmm
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', sideMargin, yState.y, targetWmm, sliceHmm)
        yState.y += sliceHmm + gapMm
        srcTop += slicePx
        if (srcTop < canvas.height) {
          pdf.addPage()
          yState.y = sideMargin
        }
      }
    }

    const sectionList: Array<
      { title: string; body: string[] } | { title: string; markdownBody: string }
    > = [
      {
        title: '概览与核心结果',
        body: [
          `报告时间：${store.analyzedAt || '—'}`,
          `新闻标题：${reportTitle}`,
          `来源：${r.meta?.sourceName || '—'}`,
          `可信度：${r.credibilityScore ?? '—'} / 100`,
          `风险等级：${r.riskLevel || '—'}`,
          `结论：${r.verdict || '—'}`,
          `原始简要总结：${r.aiSummary || r.meta?.newsSummary || '—'}`,
        ],
      },
      {
        title: '详细总结（最终版）',
        markdownBody: r.detailedReport || r.detailedReportTrace?.finalText || '—',
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

    const sectionEls: HTMLElement[] = []
    for (const section of sectionList) {
      const el = document.createElement('section')
      el.style.cssText = 'margin:0 0 10px;padding:10px 12px;border:1px solid #f1d0d0;border-radius:10px;background:#fffafa;'
      if ('markdownBody' in section) {
        const rawMd = String(section.markdownBody || '').trim()
        const inner = !rawMd || rawMd === '—' ? escapeHtml(rawMd || '—') : renderAiMarkdown(rawMd)
        el.innerHTML = `
          <h2 style="margin:0 0 8px;font-size:16px;color:#7f1d1d;">${escapeHtml(section.title)}</h2>
          <div class="tl-md-export">${inner}</div>
        `
      } else {
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
      }
      root.appendChild(el)
      sectionEls.push(el)
    }

    document.body.appendChild(root)
    const yState = { y: margin }
    try {
      const headerCanvas = await html2canvas(header, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      addCanvasPaged(pdf, headerCanvas, contentW, pageH, margin, yState, 2)

      for (const el of sectionEls) {
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        })
        addCanvasPaged(pdf, canvas, contentW, pageH, margin, yState, 2)
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
    <main class="panel-layout single-layout single-layout--stack">
      <div class="sa-input-wrap anim-up delay-1">
        <InputArea
          v-model="inputText"
          :loading="store.isLoading"
          :result="store.result"
          :layout-stacked="true"
          @analyze="runAnalysis"
        />
      </div>
      <div class="anim-up delay-2">
        <ResultCard
          :loading="store.isLoading"
          :result="store.result"
          :error="store.errorMessage"
          :analyzed-at="store.analyzedAt"
          @export="onExport"
        />
      </div>
    </main>
  </div>
</template>
