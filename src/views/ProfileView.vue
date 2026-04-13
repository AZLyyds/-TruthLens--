<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  fetchHistory,
  fetchHistoryDetail,
  fetchMyProfile,
  formatHistoryTime,
  updateProfile,
  uploadAvatar,
} from '../api/profile'
import AnalysisResultViz from '../components/AnalysisResultViz.vue'

const profile = ref({
  username: localStorage.getItem('truthlens_username') || 'user',
  email: null,
  avatarUrl: null,
  preferences: [],
  stats: { viewed: 0, analyzed: 0, highRiskHits: 0 },
})

const editUsername = ref('')
const editEmail = ref('')
const editAvatarUrl = ref('')
const editCurrentPassword = ref('')
const editNewPassword = ref('')
const editConfirmPassword = ref('')
const editSaving = ref(false)
const editMessage = ref('')
const avatarUploading = ref(false)
const editModalOpen = ref(false)

function openEditModal() {
  syncEditFromProfile()
  editMessage.value = ''
  editModalOpen.value = true
}

function closeEditModal() {
  editModalOpen.value = false
}

watch(editModalOpen, (open) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('tl-modal-open', Boolean(open))
})

function syncEditFromProfile() {
  editUsername.value = profile.value.username || ''
  editEmail.value = profile.value.email || ''
  editAvatarUrl.value = profile.value.avatarUrl || ''
  editCurrentPassword.value = ''
  editNewPassword.value = ''
  editConfirmPassword.value = ''
}

const avatarDisplayUrl = computed(() => {
  const u = profile.value?.avatarUrl
  if (!u || !String(u).trim()) return ''
  return String(u).trim()
})
const history = ref([])
const errorMessage = ref('')
const expandedId = ref(null)
const detailById = ref({})
const detailLoadingId = ref(null)

function isBailianWorkflowLabel(label) {
  const s = String(label || '').trim()
  if (!s) return false
  if (s.includes('百炼工作流')) return true
  return /百炼/.test(s) && /工作流/.test(s)
}

const preferenceHistogram = computed(() => {
  const pref = Array.isArray(profile.value?.preferences) ? profile.value.preferences : []
  const rows = Array.isArray(history.value) ? history.value : []
  const bucket = new Map()

  pref.forEach((p, idx) => {
    const key = String(p || '').trim()
    if (!key || isBailianWorkflowLabel(key)) return
    bucket.set(key, Math.max(6, 20 - idx * 2))
  })

  rows.forEach((row) => {
    const type = String(row?.queryType || '常规分析').trim()
    if (!isBailianWorkflowLabel(type)) {
      bucket.set(type, (bucket.get(type) || 0) + 4)
    }
    const title = String(row?.newsTitle || row?.inputTitle || '')
    if (title.includes('涉华')) bucket.set('涉华议题', (bucket.get('涉华议题') || 0) + 3)
    if (title.includes('风险')) bucket.set('风险追踪', (bucket.get('风险追踪') || 0) + 2)
  })

  const arr = Array.from(bucket.entries())
    .map(([label, score]) => ({ label, score }))
    .filter((x) => !isBailianWorkflowLabel(x.label))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const max = arr[0]?.score || 1
  return arr.map((x) => ({
    ...x,
    pct: Math.max(12, Math.round((x.score / max) * 100)),
  }))
})

const PREF_BAR_GRADIENTS = [
  'linear-gradient(90deg, #fecaca, #ef4444)',
  'linear-gradient(90deg, #fde68a, #f59e0b)',
  'linear-gradient(90deg, #bbf7d0, #22c55e)',
  'linear-gradient(90deg, #e7e5e4, #a8a29e)',
]

function prefBarStyle(index) {
  return { background: PREF_BAR_GRADIENTS[index % PREF_BAR_GRADIENTS.length] }
}

const loadProfileData = async () => {
  errorMessage.value = ''
  try {
    const [profileData, historyData] = await Promise.all([fetchMyProfile(), fetchHistory({ page: 1, pageSize: 50 })])
    profile.value = profileData
    syncEditFromProfile()
    history.value = (historyData || []).map((item) => ({
      ...item,
      id: item?.id != null ? Number(item.id) : item?.id,
    }))
  } catch (error) {
    errorMessage.value = error?.message || '个人中心数据加载失败'
  }
}

async function saveProfileEdits() {
  editMessage.value = ''
  if (editNewPassword.value || editConfirmPassword.value || editCurrentPassword.value) {
    if (!editCurrentPassword.value) {
      editMessage.value = '修改密码需填写当前密码'
      return
    }
    if (!editNewPassword.value || editNewPassword.value.length < 6) {
      editMessage.value = '新密码至少 6 位'
      return
    }
    if (editNewPassword.value !== editConfirmPassword.value) {
      editMessage.value = '两次输入的新密码不一致'
      return
    }
  }

  const payload = {}
  const u = editUsername.value.trim()
  if (u && u !== (profile.value.username || '')) payload.username = u

  const emailTrim = editEmail.value.trim()
  const curEmail = profile.value.email || ''
  if (emailTrim !== curEmail) {
    payload.email = emailTrim === '' ? null : emailTrim
  }

  const av = editAvatarUrl.value.trim()
  const curAv = profile.value.avatarUrl || ''
  if (av !== curAv) {
    payload.avatarUrl = av === '' ? null : av
  }

  if (editNewPassword.value) {
    payload.currentPassword = editCurrentPassword.value
    payload.newPassword = editNewPassword.value
  }

  if (!Object.keys(payload).length) {
    editMessage.value = '没有修改项'
    return
  }

  editSaving.value = true
  try {
    const data = await updateProfile(payload)
    profile.value = { ...profile.value, ...data }
    if (data.username) {
      localStorage.setItem('truthlens_username', data.username)
    }
    syncEditFromProfile()
    editMessage.value = '已保存'
    editModalOpen.value = false
  } catch (e) {
    editMessage.value = e?.message || '保存失败'
  } finally {
    editSaving.value = false
  }
}

async function onAvatarFileChange(event) {
  const input = event.target
  const file = input?.files?.[0]
  if (!file) return
  editMessage.value = ''
  avatarUploading.value = true
  try {
    const data = await uploadAvatar(file)
    const url = data?.avatarUrl
    if (url) {
      profile.value = { ...profile.value, avatarUrl: url }
      editAvatarUrl.value = url
      editMessage.value = '头像文件已更新'
    }
  } catch (e) {
    editMessage.value = e?.message || '头像上传失败'
  } finally {
    avatarUploading.value = false
    if (input) input.value = ''
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

function onEditModalKeydown(e) {
  if (e.key === 'Escape' && editModalOpen.value) closeEditModal()
}

onMounted(() => {
  void loadProfileData()
  window.addEventListener('keydown', onEditModalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEditModalKeydown)
  document.documentElement.classList.remove('tl-modal-open')
})
</script>

<template>
  <div class="page page-profile">
    <main class="profile-layout profile-overview card anim-up">
      <div class="profile-top-row">
        <div class="profile-head">
          <div class="profile-head-main">
            <img
              v-if="avatarDisplayUrl"
              class="avatar lg profile-avatar-img"
              :src="avatarDisplayUrl"
              alt=""
              width="56"
              height="56"
            />
            <div v-else class="avatar lg">{{ (profile.username || '?').slice(0, 1).toUpperCase() }}</div>
            <div>
              <h2>{{ profile.username }}</h2>
              <p v-if="profile.email" class="desc profile-email">{{ profile.email }}</p>
              <p class="desc">偏好：{{ (profile.preferences || []).join(' / ') || '暂无偏好数据' }}</p>
            </div>
          </div>
          <button type="button" class="profile-edit-open" @click="openEditModal">编辑资料</button>
        </div>

        <div class="stats-grid">
          <div class="mini card-in mini--view">
            <span class="mini-k">累计浏览新闻</span>
            <strong>{{ profile.stats?.viewed ?? 0 }}</strong>
            <p class="mini-sub">近7日 +{{ Math.max(6, Math.round((profile.stats?.viewed ?? 0) * 0.06)) }}</p>
          </div>
          <div class="mini card-in mini--ana">
            <span class="mini-k">累计分析次数</span>
            <strong>{{ profile.stats?.analyzed ?? 0 }}</strong>
            <p class="mini-sub">任务完成率 94%</p>
          </div>
          <div class="mini card-in mini--risk">
            <span class="mini-k">高风险命中</span>
            <strong class="danger">{{ profile.stats?.highRiskHits ?? 0 }}</strong>
            <p class="mini-sub">高风险占比 {{ Math.max(1, Math.min(99, Math.round(((profile.stats?.highRiskHits ?? 0) / Math.max(1, profile.stats?.analyzed ?? 1)) * 100))) }}%</p>
          </div>
        </div>
      </div>

      <div class="overview-bottom-row">
        <article class="card-in profile-chip-board">
          <h3>行为偏好画像</h3>
          <div v-if="preferenceHistogram.length" class="pref-chart" role="img" aria-label="行为偏好权重直方图">
            <div v-for="(item, pi) in preferenceHistogram" :key="item.label" class="pref-row">
              <span class="pref-label">{{ item.label }}</span>
              <span class="pref-track"><i :style="{ width: `${item.pct}%`, ...prefBarStyle(pi) }" /></span>
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

    <Teleport to="body">
      <div
        v-if="editModalOpen"
        class="profile-modal-root"
        role="presentation"
        @click.self="closeEditModal"
      >
        <div
          class="profile-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          @click.stop
        >
          <header class="profile-modal-head">
            <div>
              <p class="profile-modal-kicker">账户</p>
              <h2 id="profile-modal-title" class="profile-modal-title">编辑个人资料</h2>
            </div>
            <button type="button" class="profile-modal-close" aria-label="关闭" @click="closeEditModal">×</button>
          </header>

          <p
            v-if="editMessage"
            class="profile-modal-banner"
            :class="{ 'is-danger': /失败|不正确|占用|密码/.test(editMessage) }"
          >
            {{ editMessage }}
          </p>

          <div class="profile-modal-body">
            <div class="profile-modal-grid">
              <label class="pm-field">
                <span class="pm-label">用户名</span>
                <input v-model.trim="editUsername" class="pm-input" type="text" autocomplete="username" maxlength="64" />
              </label>
              <label class="pm-field">
                <span class="pm-label">邮箱</span>
                <input v-model.trim="editEmail" class="pm-input" type="email" autocomplete="email" placeholder="可留空" />
              </label>
              <label class="pm-field pm-field--full">
                <span class="pm-label">头像链接（http(s) 或 /uploads/…）</span>
                <input v-model.trim="editAvatarUrl" class="pm-input" type="url" placeholder="粘贴地址，或使用下方上传" />
              </label>
              <div class="pm-field pm-field--full pm-upload">
                <span class="pm-label">头像文件</span>
                <div class="pm-upload-actions">
                  <label class="pm-btn pm-btn--ghost pm-upload-file-label" :class="{ 'is-busy': avatarUploading }">
                    <input
                      type="file"
                      class="pm-file-native"
                      accept="image/png,image/jpeg,image/webp"
                      :disabled="avatarUploading"
                      @change="onAvatarFileChange"
                    />
                    {{ avatarUploading ? '上传中…' : '选择图片' }}
                  </label>
                  <span class="pm-hint pm-hint--inline">支持 PNG / JPEG / WebP</span>
                </div>
              </div>
              <label class="pm-field">
                <span class="pm-label">当前密码</span>
                <input
                  v-model="editCurrentPassword"
                  class="pm-input"
                  type="password"
                  autocomplete="current-password"
                  placeholder="修改密码时必填"
                />
              </label>
              <label class="pm-field">
                <span class="pm-label">新密码</span>
                <input
                  v-model="editNewPassword"
                  class="pm-input"
                  type="password"
                  autocomplete="new-password"
                  placeholder="至少 6 位"
                />
              </label>
              <label class="pm-field">
                <span class="pm-label">确认新密码</span>
                <input v-model="editConfirmPassword" class="pm-input" type="password" autocomplete="new-password" />
              </label>
            </div>
          </div>

          <footer class="profile-modal-foot">
            <button type="button" class="pm-btn pm-btn--ghost" :disabled="editSaving" @click="closeEditModal">取消</button>
            <button type="button" class="pm-btn pm-btn--primary" :disabled="editSaving" @click="saveProfileEdits">
              {{ editSaving ? '保存中…' : '保存' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.profile-avatar-img {
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid rgba(185, 28, 28, 0.2);
  flex-shrink: 0;
}

.profile-email {
  margin: 0 0 4px;
  font-size: 14px;
  color: #57534e;
}

.profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.profile-head-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.profile-edit-open {
  flex-shrink: 0;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-ui);
  color: #fff;
  background: linear-gradient(165deg, #7f1d1d, #b91c1c);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(127, 29, 29, 0.2);
  transition: filter 0.2s ease, transform 0.15s ease;
}

.profile-edit-open:hover {
  filter: brightness(1.05);
}

.profile-edit-open:active {
  transform: scale(0.98);
}

.profile-modal-root {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(4px);
}

.profile-modal {
  width: min(920px, 96vw);
  max-height: min(90vh, 800px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: translateZ(0);
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #fafaf9 100%);
  border: 1px solid rgba(231, 229, 228, 0.95);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 24px 60px rgba(15, 23, 42, 0.18);
}

.mini {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
}
.mini::after {
  content: '';
  position: absolute;
  right: -14px;
  top: -14px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  opacity: 0.14;
  background: currentColor;
}
.mini-k {
  font-weight: 600;
  color: #57534e;
}
.mini-sub {
  margin: 6px 0 0;
  font-size: 12px;
  color: #78716c;
}
.mini--view {
  color: #92400e;
}
.mini--ana {
  color: #7f1d1d;
}
.mini--risk {
  color: #b91c1c;
}

.profile-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.profile-modal-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #a8a29e;
}

.profile-modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0c0a09;
}

.profile-modal-close {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: #f5f5f4;
  color: #57534e;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease;
}

.profile-modal-close:hover {
  background: #e7e5e4;
}

.profile-modal-banner {
  margin: 0 20px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #15803d;
  background: rgba(220, 252, 231, 0.65);
  border: 1px solid rgba(134, 239, 172, 0.6);
}

.profile-modal-banner.is-danger {
  color: #991b1b;
  background: rgba(254, 242, 242, 0.9);
  border-color: rgba(254, 202, 202, 0.9);
}

.profile-modal-body {
  padding: 16px 20px 8px;
  overflow-y: auto;
}

.profile-modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
}

.pm-field--full {
  grid-column: 1 / -1;
}

.pm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pm-label {
  font-size: 12px;
  font-weight: 700;
  color: #57534e;
}

.pm-input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  font-family: var(--font-ui);
  font-size: 15px;
  background: #fff;
  color: #1c1917;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.pm-input:focus {
  outline: none;
  border-color: rgba(185, 28, 28, 0.45);
  box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.12);
}

.pm-hint {
  font-size: 12px;
  color: #78716c;
}

.pm-hint--inline {
  align-self: center;
}

.pm-upload {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed #d6d3d1;
  background: #fafaf9;
}

.pm-upload-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

.pm-upload-file-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 10px 20px;
  margin: 0;
  cursor: pointer;
  overflow: hidden;
}

.pm-upload-file-label.is-busy {
  opacity: 0.65;
  pointer-events: none;
}

.pm-file-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: 0;
}

.profile-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.65);
}

.pm-btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-ui);
  border-radius: 12px;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s ease, filter 0.15s ease;
}

.pm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pm-btn--ghost {
  background: #f5f5f4;
  color: #44403c;
  border: 1px solid #e7e5e4;
}

.pm-btn--ghost:hover:not(:disabled) {
  background: #e7e5e4;
}

.pm-btn--primary {
  color: #fff;
  background: linear-gradient(165deg, #7f1d1d, #b91c1c);
  box-shadow: 0 4px 14px rgba(127, 29, 29, 0.22);
}

.pm-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

@media (max-width: 560px) {
  .profile-modal-grid {
    grid-template-columns: 1fr;
  }
}

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
  min-width: 4px;
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.06);
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
