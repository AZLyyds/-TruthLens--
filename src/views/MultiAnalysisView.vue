<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const inputA = ref('')
const inputB = ref('')
const output = ref('')

const runCompare = () => {
  if (!inputA.value.trim() || !inputB.value.trim()) return
  output.value = [
    '多源一致性分析结果',
    '- 来源A与来源B在事件时间线存在冲突。',
    '- 核心事实一致性：61%',
    '- 来源权威性差异：A高于B',
    '- 结论：建议标注“待核验”，暂不作为确定事实传播。',
  ].join('\n')
}
</script>

<template>
  <div class="page page-analysis">
    <header class="analysis-header card">
      <button class="ghost-btn" @click="router.push('/portal')">返回新闻门户</button>
      <h1>多篇新闻分析</h1>
    </header>

    <main class="panel-layout">
      <section class="card io-panel anim-up">
        <h2>输入 1（text / URL）</h2>
        <textarea v-model="inputA" rows="4" placeholder="输入第一篇新闻文本或URL" />
        <h2>输入 2（text / URL）</h2>
        <textarea v-model="inputB" rows="4" placeholder="输入第二篇新闻文本或URL" />
        <button class="action-btn" @click="runCompare">开始一致性分析</button>
      </section>

      <section class="card io-panel anim-up delay-1">
        <h3>输出（output）</h3>
        <pre class="output-box">{{ output || '填写两条输入后点击按钮，查看多源一致性结果。' }}</pre>
      </section>
    </main>

    <section class="analysis-extra">
      <article class="card block anim-up">
        <h3>一致性雷达（示意）</h3>
        <div class="radar-fake">
          <span>时间线 62%</span>
          <span>主体一致 77%</span>
          <span>数据一致 54%</span>
          <span>结论一致 59%</span>
        </div>
      </article>
      <article class="card block anim-up delay-1">
        <h3>建议动作</h3>
        <ul class="timeline">
          <li>优先保留高权威来源结论</li>
          <li>标记冲突段落并追溯原出处</li>
          <li>触发人工复核流程</li>
          <li>同步预警到边缘端策略</li>
        </ul>
      </article>
    </section>
  </div>
</template>
