<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const history = [
  '2026-04-01 19:40  单篇分析：某国际平台经济报道',
  '2026-04-01 19:12  多篇分析：区域冲突相关新闻对比',
  '2026-04-01 18:35  单篇分析：科技产业链评论文章',
]
</script>

<template>
  <div class="page page-profile">
    <header class="analysis-header card">
      <button class="ghost-btn" @click="router.push('/portal')">返回新闻门户</button>
      <h1>个人中心</h1>
    </header>

    <main class="profile-layout profile-overview card anim-up">
      <div class="profile-top-row">
        <div class="profile-head">
          <div class="avatar lg">J</div>
          <div>
            <h2>jiwei</h2>
            <p class="desc">偏好：国际政治 / 科技 / 财经</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="mini card-in">
            <span>累计浏览新闻</span>
            <strong>126</strong>
          </div>
          <div class="mini card-in">
            <span>累计分析次数</span>
            <strong>59</strong>
          </div>
          <div class="mini card-in">
            <span>高风险命中</span>
            <strong class="danger">12</strong>
          </div>
        </div>
      </div>

      <div class="overview-bottom-row">
        <article class="card-in profile-chip-board">
          <h3>行为偏好画像</h3>
          <div class="tags">
            <span>国际政治 42%</span><span>科技 31%</span><span>财经 27%</span>
            <span>深度阅读</span><span>风险复核</span>
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
      <h3>历史记录</h3>
      <ul>
        <li
          v-for="item in history"
          :key="item"
          class="history-item"
          role="button"
          tabindex="0"
        >
          {{ item }}
        </li>
      </ul>
    </section>
  </div>
</template>
