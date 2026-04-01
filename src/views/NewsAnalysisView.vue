<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const title = computed(() => route.query.title || '涉华新闻样例：国际平台出现争议性报道')
const inputText = ref(String(title.value))
const output = ref('')

const runAnalysis = () => {
  if (!inputText.value.trim()) return
  output.value = [
    '可信度评分：68 / 100',
    '真假判断：存疑',
    '风险等级：中风险',
    '关键原因：核心数据来源不透明，且与两家主流媒体结论不一致。',
    '建议：结合更多权威来源做交叉核验后再传播。',
  ].join('\n')
}
</script>

<template>
  <div class="page page-analysis">
    <header class="analysis-header card">
      <button class="ghost-btn" @click="router.push('/portal')">返回新闻门户</button>
      <h1>单篇新闻分析</h1>
    </header>

    <main class="panel-layout analysis-top-row">
      <section class="card io-panel anim-up">
        <h2>输入（text / URL）</h2>
        <textarea
          v-model="inputText"
          placeholder="输入新闻正文或URL，系统将判断是否存在涉华风险与真实性疑点"
          rows="9"
        />
        <button class="action-btn" @click="runAnalysis">开始分析</button>
      </section>

      <section class="card io-panel anim-up delay-1">
        <h3>输出（output）</h3>
        <pre class="output-box">{{ output || '点击“开始分析”后显示判断结果。' }}</pre>
      </section>
    </main>

    <section class="analysis-extra analysis-bottom-row">
      <article class="card block anim-up">
        <h3>证据路径</h3>
        <ul class="timeline">
          <li>提取核心陈述与时间点</li>
          <li>比对权威媒体原始报道</li>
          <li>核验来源真实性与上下文</li>
          <li>输出风险说明与传播建议</li>
        </ul>
      </article>
      <article class="card block anim-up delay-1">
        <h3>风险维度评分</h3>
        <div class="score-rows">
          <div><span>来源可信度</span><b>72</b></div>
          <div><span>事实一致性</span><b>65</b></div>
          <div><span>情绪煽动性</span><b>58</b></div>
          <div><span>传播误导性</span><b>69</b></div>
        </div>
      </article>
    </section>
  </div>
</template>
