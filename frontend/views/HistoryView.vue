<template>
  <div class="history-view">
    <div class="history-content">
      <div class="header">
        <h1>History</h1>
        <p class="history-intro">Publish a directory with the Surfer CLI. See <RouterLink class="usage-link" :to="{ path: '/usage', hash: '#command-line' }">Usage</RouterLink>.</p>
      </div>

      <TableView v-if="busy || entries.length" :columns="columns" :model="entries" :busy="busy" default-sort-by="at" default-sort-order="desc">
        <template #at="{ item }">{{ formatWhen(item.at) }}</template>
      </TableView>
      <RouterLink v-else class="history-empty" :to="{ path: '/usage', hash: '#command-line' }">No deploys yet</RouterLink>
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
  site: { label: 'Site', sort: true },
  message: { label: 'Message' },
};

const entries = ref([]);
const busy = ref(true);

onMounted(load);

async function load() {
  busy.value = true;
  try {
    const result = await fetcher.get('/api/history');
    if (result.status !== 200 || !Array.isArray(result.body)) return;
    entries.value = result.body.map(function (entry) {
      return { at: entry.at, who: who(entry), site: deployLabel(entry.site), message: entry.message || '' };
    });
  } catch {
    entries.value = [];
  } finally {
    busy.value = false;
  }
}

function deployLabel(name) {
  if (!name || name === 'default') return 'Default';
  return name;
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

.history-view {
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px 24px;
  overflow-y: auto;
}

.history-content {
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

.history-intro {
  margin: 0;
  font-size: 14px;
}

.history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
}

</style>
