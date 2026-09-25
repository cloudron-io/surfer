<template>
  <div
    class="preview-panel"
    :class="{ 'visible': entry.filePath }"
  >
    <div v-if="entry.filePath" class="preview-main-column">
      <img :src="previewSrc" alt="" class="preview-image" :class="{ shadow: isImagePreview }" @error="onIconError"/>
      <p v-if="entry.fileName" class="preview-name">{{ entry.fileName }}</p>
      <div class="actions">
        <Button outline v-show="entry.isFile || entry.isDirectory" icon="fa-solid fa-download" @click="onDownload(entry)">Download</Button>
        <Button outline icon="fa-regular fa-copy" @click="onCopyLink(entry)">Copy link</Button>
        <Button outline icon="fa-solid fa-arrow-up-right-from-square" :href="openHref" target="_blank">Open</Button>
      </div>
    </div>
  </div>
</template>

<script setup>

import { computed } from 'vue';
import { Button } from '@cloudron/pankow';
import { download, encode, fileApiUrl, getPreviewUrl, sanitize } from '../utils.js';
import { copyToClipboard } from '@cloudron/pankow/utils';

const props = defineProps({
  entry: {
    type: Object,
    default: () => ({})
  }
});

const isImagePreview = computed(function () {
  const type = props.entry.mimeType || '';
  return type.startsWith('image/') && type !== 'image/vnd.adobe.photoshop';
});

const previewSrc = computed(function () {
  const e = props.entry;
  if (!e.filePath) return '';
  if (isImagePreview.value) {
    if (e.deployment) return fileApiUrl(e.filePath, e.deployment, true);
    return e.previewUrl || encode(e.filePath);
  }
  if (e.previewUrl && !(e.mimeType || '').startsWith('image/')) return e.previewUrl;
  if (e.isDirectory || !e.mimeType) return getPreviewUrl({ isDirectory: true }, e.filePath);
  const i = e.filePath.lastIndexOf('/');
  const parent = i <= 0 ? '/' : sanitize(e.filePath.slice(0, i));
  return getPreviewUrl(e, parent);
});

const openHref = computed(function () {
  if (props.entry.openUrl) return props.entry.openUrl;
  return encode(props.entry.filePath);
});

function onIconError(event) {
  event.target.onerror = null;
  event.target.src = '/_admin/mime-types/application-x-generic.svg';
}

function onDownload(entry) {
  download(entry);
}

function onCopyLink(entry) {
  copyToClipboard(entry.openUrl || (location.origin + encode(entry.filePath)));
  window.pankow.notify({ type:'success', text: 'Link copied to clipboard' });
}

</script>

<style scoped>

.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  background-color: white;
  padding: 0;
}

.preview-main-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 20px 30px;
}

.preview-image {
  width: 90%;
  max-width: 128px;
  object-fit: contain;
}

.preview-image.shadow {
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.preview-name {
  max-width: 100%;
  margin: 12px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 24px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  width: 100%;
  margin-top: 12px;
}

@media (prefers-color-scheme: dark) {
  .preview-panel {
    background-color: black;
  }
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
