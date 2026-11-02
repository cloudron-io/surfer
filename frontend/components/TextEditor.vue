<template>
  <Teleport to="body">
    <div class="text-editor-overlay">
      <div v-if="!ready" class="text-editor-loading">
        <Spinner/>
        <span>Opening {{ entry.fileName }}</span>
      </div>
      <TextViewer v-else ref="textViewer" class="text-editor-viewer" :save-handler="onSave" :tr="translation" @close="onClose"/>
    </div>
  </Teleport>
</template>

<script setup>

import { ref, onMounted, nextTick, useTemplateRef, inject } from 'vue';
import { Spinner, fetcher } from '@cloudron/pankow';
import { TextViewer } from '@cloudron/pankow/viewers';
import { translation } from '@cloudron/pankow/utils';
import { canEditTextFile, encode, fileApiUrl } from '../utils.js';

const props = defineProps({
  entry: {
    type: Object,
    required: true
  },
  deployment: {
    type: String,
    default: ''
  }
});

const emit = defineEmits([ 'close', 'saved' ]);

const logout = inject('logout', function () {
  window.location.href = '/auth/logout';
});
const textViewer = useTemplateRef('textViewer');
const ready = ref(false);

function notify(type, text) {
  window.pankow.notify({ type: type, text: text });
}

async function load() {
  if (!canEditTextFile(props.entry)) {
    notify('danger', 'This file cannot be edited');
    emit('close');
    return;
  }

  try {
    const response = await fetch(fileApiUrl(props.entry.filePath, props.deployment, true));
    if (response.status === 401) return logout();
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const content = await response.text();

    ready.value = true;
    await nextTick();
    textViewer.value.open({ ...props.entry, isBinary: false }, content);
  } catch (e) {
    console.error('Failed to open file', e);
    notify('danger', 'Could not open ' + props.entry.fileName);
    emit('close');
  }
}

async function onSave(entry, content) {
  const formData = new FormData();
  formData.append('file', new Blob([ content ], { type: entry.mimeType || 'text/plain' }), entry.fileName);

  try {
    const result = await fetcher.post('/api/files' + encode(entry.filePath), formData, { deployment: props.deployment });
    if (result.status === 401) {
      logout();
      return false;
    }
    if (result.status !== 201) {
      notify('danger', 'Could not save ' + entry.fileName + ' (' + result.status + ')');
      return false;
    }
  } catch (e) {
    console.error('Failed to save file', e);
    notify('danger', 'Could not save ' + entry.fileName);
    return false;
  }

  notify('success', 'Saved ' + entry.fileName);
  emit('saved', entry);
  return true;
}

function onClose() {
  emit('close');
}

onMounted(load);

</script>

<style scoped>

.text-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 1999;
  display: flex;
  background-color: var(--pankow-body-background-color, white);
}

.text-editor-viewer {
  flex: 1;
  min-width: 0;
}

.text-editor-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--pankow-color-text);
}

</style>
