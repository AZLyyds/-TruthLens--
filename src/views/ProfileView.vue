<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchHistory, fetchHistoryDetail, fetchMyProfile, formatHistoryTime } from '../api/profile'
import AnalysisResultViz from '../components/AnalysisResultViz.vue'

const router = useRouter()
const profile = ref({
  username: localStorage.getItem('truthlens_username') || 'user',
  preferences: [],
  stats: { viewed: 0, analyzed: 0, highRiskHits: 0 },
})
const history = ref([])
const errorMessage = ref('')
const expandedId = ref(null)
const detailById = ref({})
const detailLoadingId = ref(null)

const preferenceHistogram = computed(() => {
  const pref = Array.isArray(profile.value?.preferences) ? profile.value.preferences : []
  const rows = Array.isArray(history.value) ? history.value : []
  const bucket = new Map()

  pref.forEach((p, idx) => {
    const key = String(p || '').trim()
    if (!key) return
    bucket.set(key, Math.max(6, 20 - idx * 2))
  })

  rows.forEach((row) => {
    const type = String(row?.queryType || '常规分析').trim()
    bucket.set(type, (bucket.get(type) || 0) + 4)
    const title = String(row?.newsTitle || row?.inputTitle || '')
    if (title.includes('涉华')) bucket.set('涉华议题', (bucket.get('涉华议题') || 0) + 3)
    if (title.includes('风险')) bucket.set('风险追踪', (bucket.get('风险追踪') || 0) + 2)
  })

  const arr = Array.from(bucket.entries())
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const max = arr[0]?.score || 1
  return arr.map((x) => ({
    ...x,
    pct: Math.max(12, Math.round((x.score / max) * 100)),
  }))
})

const loadProfileData = async () => {
  errorMessage.value = ''
  try {
    const [profileData, historyData] = await Promise.all([fetchMyProfile(), fetchHistory({ page: 1, pageSize: 50 })])
    profile.value = profileData
    history.value = (historyData || []).map((item) => ({
      ...item,
      id: item?.id != null ? Number(item.id) : item?.id,
    }))
  } catch (error) {
    errorMessage.value = error?.message || '个人中心数据加载失败'
  }
}

/** 列表展示：超过 20 字截断 + … */
const truncateTitle = (text, max = 20) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max)}...`
}

const listTitleFromRow = (row) => {
  const title = String(row.newsTitle || row.inputTitle || '').trim()
  if (title) return truncateTitle(title, 20)
  const summary = String(row.newsSummary || row.inputSummary || '').trim()
  return truncateTitle(summary.split('｜')[0]?.trim() || row.queryType || '分析记录', 20)
}

const loadDetail = async (rawId) => {
  const id = Number(rawId)
  if (Number.isNaN(id)) return
  if (detailById.value[id]) return
  detailLoadingId.value = id
  try {
    const data = await fetchHistoryDetail(id)
    detailById.value = { ...detailById.value, [id]: data }
  } catch {
    detailById.value = { ...detailById.value, [id]: null }
  } finally {
    detailLoadingId.value = null
  }
}

const toggleHistory = async (row) => {
  const id = Number(row.id)
  if (Number.isNaN(id)) return
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  await loadDetail(id)
}

const onHistoryKeydown = (event, row) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleHistory(row)
  }
}

onMounted(loadProfileData)
</script>

<template>
  <div class="page page-profile">
    <main class="profile-layout profile-overview card anim-up">
      <div class="profile-top-row">
        <div class="profile-head">
          <div class="avatar lg">{{ (profile.username || '?').slice(0, 1).toUpperCase() }}</div>
          <div>
            <h2>{{ profile.username }}</h2>
            <p class="desc">偏好：{{ (profile.preferences || []).join(' / ') || '暂无偏好数据' }}</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="mini card-in">
            <span>累计浏览新闻</span>
            <strong>{{ profile.stats?.viewed ?? 0 }}</strong>
          </div>
          <div class="mini card-in">
            <span>累计分析次数</span>
            <strong>{{ profile.stats?.analyzed ?? 0 }}</strong>
          </div>
          <div class="mini card-in">
            <span>高风险命中</span>
            <strong class="danger">{{ profile.stats?.highRiskHits ?? 0 }}</strong>
          </div>
        </div>
      </div>

      <div class="overview-bottom-row">
        <article class="card-in profile-chip-board">
          <h3>行为偏好画像</h3>
          <div v-if="preferenceHistogram.length" class="pref-chart" role="img" aria-label="行为偏好权重直方图">
            <div v-for="item in preferenceHistogram" :key="item.label" class="pref-row">
              <span class="pref-label">{{ item.label }}</span>
              <span class="pref-track"><i :style="{ width: `${item.pct}%` }" /></span>
              <span class="pref-val">{{ item.score }}</span>
            </div>
          </div>
          <div v-else class="pref-empty">暂无可用偏好数据</div>
          <div class="pref-hint">
            由偏好标签与历史分析行为加权生成
          </div>
        </article>
        <article class="card-in profile-trend-board">
          <h3>本周活跃趋势</h3>
          <div class="trend-line">
            <span style="height: 25%"></span>
            <span style="height: 32%"></span>
            <span style="height: 48%"></span>
            <span style="height: 68%"></span>
            <span style="height: 52%"></span>
            <span style="height: 73%"></span>
            <span style="height: 64%"></span>
          </div>
        </article>
      </div>
    </main>

    <section class="profile-history card anim-up delay-1">
      <h3>历史查询记录</h3>
      <p v-if="errorMessage" class="danger">{{ errorMessage }}</p>
      <p v-else-if="!history.length" class="desc profile-history-empty">暂无分析记录，前往单篇/多篇分析提交后即可在此查看。</p>
      <ul v-else class="history-record-list">
        <li
          v-for="row in history"
          :key="row.id"
          class="history-record"
          :class="{ 'history-record--open': expandedId === row.id }"
        >
          <button
            type="button"
            class="history-record__row"
            :aria-expanded="expandedId === row.id"
            @click.stop="toggleHistory(row)"
            @keydown="onHistoryKeydown($event, row)"
          >
            <span class="history-record__time">{{ formatHistoryTime(row.createdAt) }}</span>
            <span class="history-record__type">{{ row.queryType || '分析' }}</span>
            <span class="history-record__summary">{{ listTitleFromRow(row) }}</span>
            <span class="history-record__chev" aria-hidden="true">{{ expandedId === row.id ? '▼' : '▶' }}</span>
          </button>
          <Transition name="history-detail">
            <div v-show="expandedId === row.id" class="history-detail">
              <div class="history-detail__inner">
                <template v-if="detailLoadingId === row.id && !detailById[row.id]">
                  <p class="history-detail__loading">加载详情…</p>
                </template>
                <template v-else-if="detailById[row.id]">
                  <h4 class="history-detail__title">
                    {{ detailById[row.id].newsTitle || detailById[row.id].inputTitle || '（无标题）' }}
                  </h4>
                  <p class="history-detail__summary">
                    {{ detailById[row.id].newsSummary || detailById[row.id].inputSummary || '（暂无概括）' }}
                  </p>
                  <div class="history-detail__meta">
                    <span v-if="detailById[row.id].sourceName">来源：{{ detailById[row.id].sourceName }}</span>
                    <time>{{ formatHistoryTime(detailById[row.id].createdAt) }}</time>
                    <span v-if="detailById[row.id].status" class="history-detail__status">{{
                      detailById[row.id].status
                    }}</span>
                    <span class="history-detail__badge">{{ detailById[row.id].queryType }}</span>
                  </div>
                  <a
                    v-if="detailById[row.id].sourceUrl || detailById[row.id].inputUrl"
                    class="history-detail__link"
                    :href="detailById[row.id].sourceUrl || detailById[row.id].inputUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    原文链接
                  </a>
                  <div class="history-detail__content">
                    {{ detailById[row.id].newsBody || detailById[row.id].inputContent || '（无正文摘录）' }}
                  </div>
                  <AnalysisResultViz :result-json="detailById[row.id].resultJson || detailById[row.id].fullAnalysisJson" />
                  <button type="button" class="history-detail__collapse" @click.stop="expandedId = null">收起</button>
                </template>
                <p v-else class="history-detail__loading">无法加载该条记录</p>
              </div>
            </div>
          </Transition>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pref-chart {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.pref-row {
  display: grid;
  grid-template-columns: 92px 1fr 36px;
  gap: 8px;
  align-items: center;
}

.pref-label {
  font-size: 12px;
  color: #44403c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pref-track {
  height: 8px;
  border-radius: 999px;
  background: #f3f4f6;
  overflow: hidden;
}

.pref-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #fca5a5, #b91c1c);
}

.pref-val {
  font-size: 12px;
  font-weight: 700;
  color: #7f1d1d;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.pref-empty,
.pref-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #78716c;
}
</style>
