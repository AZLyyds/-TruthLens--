<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const newsList = [
  { id: 1, title: '多国媒体关注中国新能源合作进展', source: 'Global Times', risk: '低风险' },
  { id: 2, title: '某社交平台传播涉华不实经济数据', source: 'World Echo', risk: '高风险' },
  { id: 3, title: '国际机构发布区域贸易新报告', source: 'Reuters', risk: '中风险' },
  { id: 4, title: '海外论坛热议中国科技企业新产品', source: 'Tech Daily', risk: '中风险' },
]

const toDetail = (item) => {
  router.push({ name: 'analysis', query: { title: item.title } })
}
</script>

<template>
  <div class="page page-portal">
    <header class="top-nav card">
      <div class="title">新闻门户</div>
      <nav>
        <span class="dot active" @click="router.push('/portal')">总览</span>
        <span class="dot" @click="router.push('/analysis')">单篇分析</span>
        <span class="dot" @click="router.push('/multi-analysis')">多篇分析</span>
        <span class="dot" @click="router.push('/profile')">个人中心</span>
        <span class="avatar">JW</span>
      </nav>
    </header>

    <main class="portal-layout portal-top-row">
      <section class="card feed-area anim-up">
        <h2>NewsAPI 信息流</h2>
        <p class="desc">被动首页，新闻源来自 NewsAPI，点击卡片进入多源分析。</p>
        <div class="news-grid">
          <article v-for="item in newsList" :key="item.id" class="news-card" @click="toDetail(item)">
            <div class="badge">{{ item.risk }}</div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.source }}</p>
          </article>
        </div>
      </section>

      <aside class="card side-panel anim-up delay-1">
        <h3>实时概览</h3>
        <ul>
          <li><span>今日采集</span><strong>328</strong></li>
          <li><span>高风险条目</span><strong class="danger">19</strong></li>
          <li><span>媒体覆盖</span><strong>42</strong></li>
        </ul>
      </aside>
    </main>

    <section class="portal-bottom portal-bottom-row">
      <article class="card block anim-up">
        <h3>风险趋势（24h）</h3>
        <div class="trend-line">
          <span style="height: 30%"></span>
          <span style="height: 55%"></span>
          <span style="height: 42%"></span>
          <span style="height: 70%"></span>
          <span style="height: 63%"></span>
          <span style="height: 82%"></span>
          <span style="height: 68%"></span>
        </div>
      </article>
      <article class="card block anim-up delay-1">
        <h3>热点关键词</h3>
        <div class="tags">
          <span>地缘政治</span><span>芯片</span><span>贸易协定</span><span>供应链</span><span>舆论战</span>
          <span>AI</span><span>新能源</span><span>数据安全</span>
        </div>
      </article>
      <article class="card block anim-up delay-2">
        <h3>快捷操作</h3>
        <div class="quick-actions">
          <button @click="router.push('/analysis')">单篇分析</button>
          <button @click="router.push('/multi-analysis')">多篇一致性</button>
          <button @click="router.push('/profile')">查看个人中心</button>
        </div>
      </article>
    </section>
  </div>
</template>
