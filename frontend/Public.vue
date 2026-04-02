<script setup>

import { ref, onMounted, computed } from 'vue';
import { Breadcrumb, Button, Notification, TopBar, fetcher } from '@cloudron/pankow';
import { sanitize, encode, decode, getPreviewUrl, getExtension, makeCurrentFolderPreviewEntry, isPreviewPanelOpenPreference, setPreviewPanelOpenPreference } from './utils.js';

import EntryList from './components/EntryList.vue';
import Preview from './components/Preview.vue';

const ORIGIN = window.location.origin;

const ready = ref(false);
const path = ref('/');
const breadcrumbHomeItem = ref({
  label: '',
  icon: 'fa-solid fa-house',
  route: '/'
});
const breadcrumbItems = ref([]);
const entries = ref([]);
// holds settings values stored on backend
const settings = ref({
  folderListingEnabled: false,
  sortFoldersFirst: false,
  title: false
});
const activeEntry = ref({});
const previewSuppressed = ref(!isPreviewPanelOpenPreference());

const previewEntry = computed(function () {
  if (previewSuppressed.value) return {};
  if (activeEntry.value.filePath) return activeEntry.value;
  return makeCurrentFolderPreviewEntry(path.value);
});

function loadDirectory(folderPath) {
  activeEntry.value = {};

  folderPath = folderPath ? sanitize(folderPath) : '/';

  // this is injected via ejs in server.js
  window.surfer.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });

  entries.value = window.surfer.entries.map(function (entry) {
    entry.previewUrl = getPreviewUrl(entry, folderPath);
    entry.extension = getExtension(entry);
    entry.rename = false;
    entry.filePathNew = entry.fileName;
    return entry;
  });
  path.value = folderPath;
  breadcrumbItems.value = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
    return {
      label: e,
      route: sanitize('/' + a.slice(0, i).join('/') + '/' + e)
    };
  });
}

function onEntryOpen(entry) {
  if (entry.isDirectory) {
    window.location.pathname = sanitize(path.value + '/' + entry.fileName);
    return;
  }

  // TODO open file viewer
  console.error('To be implemented');
}

function onSelectionChanged(selectedEntries) {
  activeEntry.value = selectedEntries[0] || {};
}

function onPreviewClose() {
  previewSuppressed.value = true;
  setPreviewPanelOpenPreference(false);
}

function onPreviewOpen() {
  previewSuppressed.value = false;
  setPreviewPanelOpenPreference(true);
}

function clearSelection() {
  activeEntry.value = {};
}

onMounted(async () => {
  // global key handler to unset activeEntry
  window.addEventListener('keyup', (event) => {
    // only do this if no modal is active - body classlist would be empty
    if (event.key === 'Escape' && event.target.classList.length === 0) clearSelection();
  });

  try {
    const result = await fetcher.get(`${ORIGIN}/api/settings`);
    settings.value.folderListingEnabled =  !!result.body.folderListingEnabled;
    settings.value.sortFoldersFirst =  !!result.body.sortFoldersFirst;
    settings.value.title =  result.body.title;
  } catch (error) {
    console.error(error);
  }

  window.document.title = settings.value.title;

  loadDirectory(decode(window.location.pathname));

  ready.value = true;
});

</script>

<template>
  <Notification/>

  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <TopBar>
        <template #left>
          <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
        </template>

        <template #right>
          <Button href="/_admin" icon="fa-solid fa-arrow-right-to-bracket">Login</Button>
        </template>
      </TopBar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @selection-changed="onSelectionChanged" @entry-activated="onEntryOpen"/>
      </div>
      <div class="preview-open-chevron" v-if="previewSuppressed">
        <Button tool plain icon="fa-solid fa-chevron-left" v-tooltip="'Show preview'" @click="onPreviewOpen"/>
      </div>
      <Preview :entry="previewEntry" @close="onPreviewClose"/>
    </div>
  </div>
</template>

<style></style>
