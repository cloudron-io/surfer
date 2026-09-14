<script setup>

import { ref, onMounted, computed } from 'vue';
import { Breadcrumb, Button, DirectoryView, Notification, SplitLayout, TopBar, fetcher } from '@cloudron/pankow';
import { sanitize, encode, decode, download, toDirectoryItems, makeCurrentFolderPreviewEntry, getPreviewPanelWidthVw, setPreviewPanelWidthVw, clampPreviewPanelWidthVw } from './utils.js';

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
  title: false
});
const activeEntry = ref({});
const previewWidthVw = ref(getPreviewPanelWidthVw());
const leftWidthPercent = computed(() => 100 - previewWidthVw.value);

const previewEntry = computed(function () {
  if (activeEntry.value.filePath) return activeEntry.value;
  return makeCurrentFolderPreviewEntry(path.value);
});

function loadDirectory(folderPath) {
  activeEntry.value = {};

  folderPath = folderPath ? sanitize(folderPath) : '/';

  entries.value = toDirectoryItems(window.surfer.entries, folderPath, false);
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

  window.location.href = encode(entry.filePath);
}

function onDownload(entry) {
  download(entry);
}

function refresh() {
  window.location.reload();
}

function onSelectionChanged(selectedEntries) {
  activeEntry.value = selectedEntries[0] || {};
}

function onSplitResize(leftWidth) {
  previewWidthVw.value = clampPreviewPanelWidthVw(100 - leftWidth);
  setPreviewPanelWidthVw(previewWidthVw.value);
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
          <div class="login-in-topbar">
            <Button href="/_admin" icon="fa-solid fa-arrow-right-to-bracket">Log in</Button>
          </div>
        </template>
      </TopBar>
    </div>
    <div class="main-container-body">
      <SplitLayout
        orientation="horizontal"
        :left-width="leftWidthPercent"
        :min-left-width="15"
        :min-right-width="15"
        @update:left-width="onSplitResize"
      >
        <template #left>
          <div class="directory-pane">
            <DirectoryView
              :items="entries"
              :editable="false"
              :show-download="true"
              :multi-download="true"
              :show-size="true"
              :show-modified="true"
              :show-rename="false"
              :show-delete="false"
              :show-new-file="false"
              :show-new-folder="false"
              :show-upload-file="false"
              :show-upload-folder="false"
              :show-cut="false"
              :show-copy="false"
              :show-paste="false"
              :show-select-all="false"
              :show-extract="false"
              :download-handler="onDownload"
              :refresh-handler="refresh"
              :fallback-icon="'/_admin/mime-types/application-x-generic.svg'"
              @selection-changed="onSelectionChanged"
              @item-activated="onEntryOpen"
            />
          </div>
        </template>
        <template #right>
          <Preview :entry="previewEntry"/>
        </template>
      </SplitLayout>
    </div>
    <div class="login-fab-mobile">
      <Button href="/_admin" tool secondary icon="fa-solid fa-arrow-right-to-bracket"/>
    </div>
  </div>
</template>

<style scoped>
.login-fab-mobile {
  display: none;
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 10;
}

.directory-pane {
  overflow: hidden;
  height: 100%;
}

@media only screen and (max-width: 767px) {
  .login-in-topbar {
    display: none;
  }

  .login-fab-mobile {
    display: flex;
  }
}
</style>
