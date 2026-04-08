<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TruthLensTopNav from './components/layout/TruthLensTopNav.vue'

const route = useRoute()
const showTopNav = computed(() => route.path !== '/login')
</script>

<template>
  <TruthLensTopNav v-if="showTopNav" />
  <router-view />
</template>
