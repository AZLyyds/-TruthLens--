<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login as loginApi, register as registerApi } from '../api/auth'

const router = useRouter()
const mode = ref('login')
const form = ref({
  username: '',
  email: '',
  password: '',
})
const errorMessage = ref('')
const isSubmitting = ref(false)

function apiErrMessage(error) {
  const d = error?.response?.data
  const fromBody = d && typeof d === 'object' ? d.message : null
  const m = error?.payload?.message || fromBody
  if (m) return String(m)
  return error?.message || '请求失败，请稍后重试'
}

async function doLoginAfterAuth(username, password) {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true'
  let result = null
  if (!useMock) {
    result = await loginApi({
      username,
      password,
    })
  }
  if (result?.userId != null) {
    localStorage.setItem('truthlens_user_id', String(result.userId))
  }
  if (result?.accessToken) {
    localStorage.setItem('truthlens_access_token', result.accessToken)
  }
  if (result?.refreshToken) {
    localStorage.setItem('truthlens_refresh_token', result.refreshToken)
  }
  localStorage.setItem('truthlens_username', username)
  router.push('/portal-screen')
}

const submit = async () => {
  const u = form.value.username.trim()
  if (!u) {
    errorMessage.value = '请填写用户名'
    return
  }
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    if (mode.value === 'login') {
      const useMock = import.meta.env.VITE_USE_MOCK === 'true'
      const password = form.value.password || 'demo123'
      if (!useMock && !form.value.password.trim()) {
        errorMessage.value = '请输入密码'
        return
      }
      await doLoginAfterAuth(u, password)
      return
    }

    const pwd = form.value.password.trim()
    if (pwd.length < 6) {
      errorMessage.value = '注册密码至少 6 位'
      return
    }
    const useMock = import.meta.env.VITE_USE_MOCK === 'true'
    if (!useMock) {
      await registerApi({
        username: u,
        password: pwd,
        email: form.value.email.trim() || undefined,
      })
      await doLoginAfterAuth(u, pwd)
    } else {
      await doLoginAfterAuth(u, pwd || 'demo123')
    }
  } catch (error) {
    errorMessage.value = apiErrMessage(error)
  } finally {
    isSubmitting.value = false
  }
}

function setMode(next) {
  mode.value = next
  errorMessage.value = ''
}
</script>

<template>
  <div class="page page-login">
    <section class="login-card card anim-up login-wrap-card">
      <div class="login-main login-main--single">
        <div class="login-brand-row">
          <img class="login-logo" src="/logo/red.svg" width="54" height="54" alt="" />
          <div class="login-brand-text">
            <span class="brand-tag">TruthLens</span>
            <h1>{{ mode === 'login' ? '登录账号' : '注册账号' }}</h1>
          </div>
        </div>
        <p class="sub">国际涉华信息可信度智能分析平台</p>

        <div class="login-mode-tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="mode === 'login'" class="login-tab" :class="{ active: mode === 'login' }" @click="setMode('login')">登录</button>
          <button type="button" role="tab" :aria-selected="mode === 'register'" class="login-tab" :class="{ active: mode === 'register' }" @click="setMode('register')">注册</button>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <label class="login-label">
            <span>用户名</span>
            <input v-model="form.username" type="text" autocomplete="username" placeholder="用户名" />
          </label>
          <label v-if="mode === 'register'" class="login-label">
            <span>邮箱（可选）</span>
            <input v-model="form.email" type="email" autocomplete="email" placeholder="name@example.com" />
          </label>
          <label class="login-label">
            <span>密码</span>
            <input v-model="form.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :placeholder="mode === 'login' ? '密码（演示可留空则用 demo123）' : '至少 6 位'" />
          </label>
          <button type="submit" class="login-submit" :disabled="isSubmitting">
            {{ isSubmitting ? '处理中…' : mode === 'login' ? '登录' : '注册并登录' }}
          </button>
        </form>
        <div v-if="errorMessage" class="login-alert">{{ errorMessage }}</div>
        <p v-if="mode === 'login'" class="tips">演示账号：用户名 demo，密码 demo123</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-wrap-card {
  max-width: 560px;
  margin: 0 auto;
  border-radius: 22px;
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 560px;
}

.login-brand-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.login-logo {
  flex-shrink: 0;
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(127, 29, 29, 0.15);
}

.login-brand-text h1 {
  margin: 4px 0 0;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.brand-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
  background: linear-gradient(135deg, #fef2f2, #fff7ed);
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(254, 202, 202, 0.9);
}

.login-mode-tabs {
  display: flex;
  gap: 8px;
  margin: 8px 0 18px;
  padding: 4px;
  border-radius: 14px;
  background: #f5f5f4;
  border: 1px solid var(--border);
}

.login-tab {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.login-tab.active {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.login-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #44403c;
}

.login-label input {
  width: 100%;
}

.login-submit {
  margin-top: 6px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  color: #fff;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: linear-gradient(168deg, #7f1d1d 0%, #b91c1c 52%, #991b1b 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 8px 22px rgba(127, 29, 29, 0.2);
  transition: filter 0.2s ease, transform 0.15s ease;
}

.login-submit:hover:not(:disabled) {
  filter: brightness(1.05);
}

.login-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.login-alert {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid rgba(254, 202, 202, 0.95);
}

.login-main--single {
  min-height: 560px;
  padding: 26px 24px 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.sub {
  margin: 0 0 16px;
}

.tips {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .login-wrap-card,
  .login-main--single {
    min-height: 520px;
  }
  .login-main--single {
    padding: 22px 16px 18px;
  }
}
</style>
