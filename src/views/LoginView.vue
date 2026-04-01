<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const form = ref({
  username: '',
  password: '',
})

const login = () => {
  if (!form.value.username || !form.value.password) return
  router.push('/portal')
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
            <button type="submit">登录</button>
          </form>
          <div class="tips">演示环境：任意输入即可进入首页</div>
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
