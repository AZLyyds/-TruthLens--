<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login as loginApi } from '../api/auth'

const router = useRouter()
const form = ref({
  username: '',
  password: '',
})
const errorMessage = ref('')
const isSubmitting = ref(false)

const login = async () => {
  if (!form.value.username) return
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const useMock = import.meta.env.VITE_USE_MOCK === 'true'
    const password = form.value.password || 'demo123'
    let result = null
    if (!useMock) {
      result = await loginApi({
        username: form.value.username,
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
    localStorage.setItem('truthlens_username', form.value.username)
    router.push('/portal-screen')
  } catch (error) {
    errorMessage.value = error?.message || '登录失败，请稍后重试'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page page-login">
    <section class="login-card card anim-up">
      <div class="login-shell">
        <div class="login-main">
          <div class="brand">TruthLens</div>
          <h1>用户注册 / 登录</h1>
          <p class="sub">国际涉华信息可信度智能分析平台</p>
          <form class="login-form" @submit.prevent="login">
            <input v-model="form.username" type="text" placeholder="用户名 / 邮箱" />
            <input v-model="form.password" type="password" placeholder="密码" />
            <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? '登录中...' : '登录' }}</button>
          </form>
          <div v-if="errorMessage" class="danger">{{ errorMessage }}</div>
          <div class="tips">演示账号：用户名 demo，密码 demo123；密码可留空时将使用默认密码</div>
        </div>

        <aside class="login-side">
          <h3>平台能力概览</h3>
          <div class="feature-list">
            <div class="feature-item shimmer">全球涉华新闻采集与结构化</div>
            <div class="feature-item shimmer">AI 可信度评分与真假判断</div>
            <div class="feature-item shimmer">高风险事件实时预警推送</div>
            <div class="feature-item shimmer">多源一致性对比分析</div>
          </div>
          <div class="hero-stats">
            <div><span>实时抓取</span><strong>1,248</strong></div>
            <div><span>已分析</span><strong>5,302</strong></div>
            <div><span>预警命中</span><strong class="danger">87</strong></div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
