<template>
  <div
    class="preview-panel"
    :class="{ 'visible': entry.filePath }"
  >
    <div class="preview-main-column">
      <div style="display: flex; padding-bottom: 10px;">
        <div class="header-filename">
          <span v-if="showFilenameInHeader">{{ entry.fileName }}</span>
        </div>
      </div>
      <div class="preview-body">
        <div v-if="staticPreviewSrc" class="preview-folder">
          <img :src="staticPreviewSrc" alt="" class="preview-folder-image"/>
          <span v-if="entry.fileName" class="preview-static-filename">{{ entry.fileName }}</span>
        </div>
        <iframe
          v-else-if="entry.filePath"
          id="previewIframe"
          ref="iframe"
          :src="iFrameSource"
          class="preview-iframe"
          @load="onIframeLoad"
        />
      </div>
      <div class="actions">
        <Button outline v-show="entry.isFile" icon="fa-solid fa-download" @click="onDownload(entry)">Download</Button>
        <Button outline icon="fa-regular fa-copy" @click="onCopyLink(entry)">Copy link</Button>
        <Button outline icon="fa-solid fa-arrow-up-right-from-square" :href="encode(entry.filePath)" target="_blank">Open</Button>
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, computed, watch } from 'vue';
import { Button } from '@cloudron/pankow';
import { download, encode, getPreviewUrl, hasViewer, sanitize } from '../utils.js';
import { copyToClipboard } from '@cloudron/pankow/utils';

const props = defineProps({
  entry: {
    type: Object,
    default: () => ({})
  }
});

const iFrameSource = ref('about:blank');
let iframeSourceTimeout = null;

const showFilenameInHeader = computed(() => {
  return !!(props.entry.filePath && hasViewer(props.entry));
});

const staticPreviewSrc = computed(() => {
  const e = props.entry;
  if (!e.filePath || hasViewer(e)) return '';
  if (e.isDirectory) {
    return e.previewUrl || getPreviewUrl({ isDirectory: true }, e.filePath);
  }
  const i = e.filePath.lastIndexOf('/');
  const parent = i <= 0 ? '/' : sanitize(e.filePath.slice(0, i));
  return e.previewUrl || getPreviewUrl(e, parent);
});

watch(() => props.entry, (newEntry) => {
  if (iframeSourceTimeout) {
    clearTimeout(iframeSourceTimeout);
    iframeSourceTimeout = null;
  }

  if (!newEntry.filePath) {
    iFrameSource.value = 'about:blank';
    return;
  }

  if (!hasViewer(newEntry)) {
    iFrameSource.value = 'about:blank';
    return;
  }

  if (!newEntry.fileName) return;

  iFrameSource.value = newEntry.previewUrl || 'about:blank';

  iframeSourceTimeout = setTimeout(() => { iFrameSource.value = encode(newEntry.filePath); }, 100);
});

function onIframeLoad(e) {
  const doc = e.target.contentWindow && e.target.contentWindow.document;
  if (!doc || !doc.body) return;

  doc.body.style.margin = 0;
  doc.body.style.display = 'flex';
  doc.body.style.justifyContent = 'center';
  doc.body.style.alignItems = 'center';
  doc.body.style.height = '100%';

  if (doc.body.firstChild) {
    doc.body.firstChild.style.maxWidth = '100%';
    doc.body.firstChild.style.maxHeight = '100%';
    doc.body.firstChild.style.margin = '0';
  }
}

function onDownload(entry) {
  download(entry);
}

function onCopyLink(entry) {
  copyToClipboard(location.origin + encode(entry.filePath));
  window.pankow.notify({ type:'success', text: 'Link copied to clipboard' });
}

</script>

<style scoped>

.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--pankow-color-background);
  padding: 0;
}

.preview-main-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.preview-panel.visible .preview-main-column {
  padding: 10px 10px 0px 10px;
}

.header-filename {
  margin: auto;
  white-space: nowrap;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
}

.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.preview-folder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 0;
  padding: 0 8px;
}

.preview-static-filename {
  max-width: 100%;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
  color: var(--pankow-color-text, inherit);
}

.preview-folder-image {
  width: 128px;
  height: 128px;
  object-fit: contain;
  vertical-align: middle;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
  min-height: 0;
}

.actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 20px;
}

@media only screen and (max-width: 767px) {
  .preview-panel {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden;
    pointer-events: none;
  }
}

</style>
