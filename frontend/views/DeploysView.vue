<template>
  <div class="deploys-view">
    <div class="deploys-content">
      <div class="header">
        <h1>Deploys</h1>
        <p class="deploys-intro">Publish a directory with the Surfer CLI. See <RouterLink class="usage-link" :to="{ path: '/usage', hash: '#command-line' }">Usage</RouterLink>.</p>
      </div>

      <TableView v-if="busy || deploys.length" :columns="columns" :model="deploys" :busy="busy" default-sort-by="at" default-sort-order="desc">
        <template #at="{ item }">{{ formatWhen(item.at) }}</template>
      </TableView>
      <RouterLink v-else class="deploys-empty" :to="{ path: '/usage', hash: '#command-line' }">No deploys yet</RouterLink>
    </div>
  </div>
</template>

<script setup>

import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { TableView, fetcher } from '@cloudron/pankow';

const columns = {
  at: { label: 'When', sort: true },
  who: { label: 'Who', sort: true },
  message: { label: 'Message' },
};

const deploys = ref([]);
const busy = ref(true);

onMounted(load);

async function load() {
  busy.value = true;
  try {
    const result = await fetcher.get('/api/deploys');
    if (result.status !== 200 || !Array.isArray(result.body)) return;
    deploys.value = result.body.map(function (entry) {
      return { at: entry.at, who: who(entry), message: entry.message || '' };
    });
  } catch {
    deploys.value = [];
  } finally {
    busy.value = false;
  }
}

function who(entry) {
  if (entry.name && entry.username && entry.name !== entry.username) return entry.name + ' (' + entry.username + ')';
  return entry.name || entry.username || '';
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

</script>

<style scoped>

.deploys-view {
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px 24px;
  overflow-y: auto;
}

.deploys-content {
  max-width: 1100px;
  width: 100%;
}

.header {
  margin-bottom: 32px;
}

.header h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.deploys-intro {
  margin: 0;
  font-size: 14px;
}

.deploys-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
}

</style>
