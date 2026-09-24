<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>

  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog"/>

  <div class="main-container">
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
            <div class="breadcrumb-bar">
              <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
            </div>
            <div class="directory-view-wrap">
              <DirectoryView
                :items="entries"
                :busy="busy"
                :editable="true"
                :show-download="true"
                :multi-download="true"
                :show-size="true"
                :show-modified="true"
                :show-rename="true"
                :show-delete="true"
                :show-new-file="false"
                :show-new-folder="true"
                :show-upload-file="true"
                :show-upload-folder="true"
                :show-cut="true"
                :show-copy="true"
                :show-paste="true"
                :show-select-all="true"
                :show-extract="true"
                :download-handler="onDownload"
                :delete-handler="onDelete"
                :new-folder-handler="openNewFolderDialog"
                :upload-file-handler="onUpload"
                :upload-folder-handler="onUploadFolder"
                :drop-handler="onDrop"
                :paste-handler="onPaste"
                :extract-handler="onExtract"
                :refresh-handler="refresh"
                :fallback-icon="'/_admin/mime-types/application-x-generic.svg'"
                @selection-changed="onSelectionChanged"
                @item-activated="onEntryOpen"
                @rename-requested="onRenameRequested"
              />
              <div class="directory-view-busy" v-show="busy"><Spinner class="pankow-spinner-large"/></div>
            </div>
          </div>
        </template>
        <template #right>
          <Preview :entry="previewEntry"/>
        </template>
      </SplitLayout>
    </div>
    <div class="main-container-footer" v-show="uploadStatus.busy">
      <div v-show="uploadStatus.uploadListCount">
        <Spinner/> Fetching file information for upload <span class="p-badge">{{ uploadStatus.uploadListCount }}</span>
      </div>
      <div style="margin-right: 10px;" v-show="!uploadStatus.uploadListCount">Uploading {{ uploadStatus.count }} files ({{ Math.round(uploadStatus.done/1000/1000) }}MB / {{ Math.round(uploadStatus.size/1000/1000) }}MB)</div>
      <ProgressBar :value="uploadStatus.percentDone" style="flex-grow: 1;" v-show="!uploadStatus.uploadListCount">{{ uploadStatus.percentDone }}%</ProgressBar>
    </div>
  </div>
</template>

<script setup>

import { ref, reactive, computed, onMounted, inject, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Breadcrumb, DirectoryView, InputDialog, ProgressBar, Spinner, SplitLayout, fetcher } from '@cloudron/pankow';
import { eachLimit, each } from 'async';
import { sanitize, encode, decode, download, toDirectoryItems, makeCurrentFolderPreviewEntry, getPreviewPanelWidthVw, setPreviewPanelWidthVw, clampPreviewPanelWidthVw } from '../utils.js';

import Preview from '../components/Preview.vue';

const logout = inject('logout');
const route = useRoute();
const router = useRouter();

const upload = ref(null);
const uploadFolder = ref(null);
const inputDialog = ref(null);

const busy = ref(true);
const uploadStatus = reactive({
  busy: false,
  count: 0,
  done: 0,
  size: 0,
  percentDone: 0,
  uploadListCount: 0
});
const path = ref('/');
const breadcrumbHomeItem = ref({
  label: '',
  icon: 'fa-solid fa-house',
  route: '#/',
  action: onHomeCrumb
});
const breadcrumbItems = ref([]);
const entries = ref([]);
const activeEntry = ref({});
const previewWidthVw = ref(getPreviewPanelWidthVw());
const leftWidthPercent = computed(() => 100 - previewWidthVw.value);

const previewEntry = computed(() => {
  if (activeEntry.value.filePath) return activeEntry.value;
  return makeCurrentFolderPreviewEntry(path.value);
});

function error(header, message) {
  window.pankow.notify({ type: 'danger', text: header + (message ? ': ' + message : '') });
  console.error(header, message);
}

function openPath(folderPath) {
  const next = sanitize(folderPath || '/');
  if (sanitize(decode(route.fullPath)) === next) {
    loadDirectory(next);
    return;
  }

  router.push(next).catch(function () {
    loadDirectory(next);
  });
}

function crumbAction(folderPath, event) {
  if (event) event.preventDefault();
  openPath(folderPath);
}

function onHomeCrumb(item, event) {
  crumbAction('/', event);
}

let loadSerial = 0;

async function loadDirectory(folderPath) {
  folderPath = sanitize(folderPath || '/');
  const serial = ++loadSerial;

  busy.value = true;
  activeEntry.value = {};

  try {
    const result = await fetcher.get('/api/files/' + encode(folderPath));
    if (serial !== loadSerial) return;
    if (result.status === 401) return logout();

    busy.value = false;

    entries.value = toDirectoryItems(result.body.entries, folderPath, true);
  } catch (e) {
    if (serial !== loadSerial) return;
    return console.error(e);
  }

  if (serial !== loadSerial) return;

  path.value = folderPath;
  breadcrumbItems.value = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
    const itemPath = sanitize('/' + a.slice(0, i).join('/') + '/' + e);
    function action(item, event) {
      crumbAction(itemPath, event);
    }
    return {
      label: e,
      route: '#' + itemPath,
      action: action
    };
  });
}

async function refresh() {
  await loadDirectory(path.value);
}

function uploadFiles(files, targetPath) {
  if (!files || !files.length) return;

  targetPath = targetPath || path.value;

  uploadStatus.busy = true;
  uploadStatus.count = files.length;
  uploadStatus.size = 0;
  uploadStatus.done = 0;
  uploadStatus.percentDone = 0;

  for (let i = 0; i < files.length; ++i) {
    uploadStatus.size += files[i].size;
  }

  eachLimit(files, 10, async (file) => {
    const filePath = encode(sanitize(targetPath + '/' + (file.webkitRelativePath || file.name)));

    const formData = new FormData();
    formData.append('file', file);

    let finishedUploadSize = 0;

    const req = new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;

      xhr.addEventListener('load', () => {
        resolve({ status: xhr.status, statusText: xhr.statusText });
      });

      xhr.addEventListener('error', () => {
        reject({ status: xhr.status, statusText: xhr.statusText });
      });

      xhr.upload.addEventListener('progress', (event) => {
        if (!(event.target instanceof XMLHttpRequestUpload)) return;

        uploadStatus.done += event.loaded - finishedUploadSize;
        finishedUploadSize = event.loaded;

        const tmp = Math.round(uploadStatus.done / uploadStatus.size * 100);
        uploadStatus.percentDone = tmp > 100 ? 100 : tmp;
      });

      xhr.open('POST', `/api/files${filePath}`);
      xhr.send(formData);
    });

    const result = await req;
    if (result.status === 401) return logout();
    if (result.status !== 201) throw('Error uploading file: ' + result.status);
  }, async (err) => {
    if (err) console.error(err);

    uploadStatus.busy = false;
    uploadStatus.count = 0;
    uploadStatus.size = 0;
    uploadStatus.done = 0;
    uploadStatus.percentDone = 100;

    await refresh();
  });
}

function onDrop(targetItemName, dataTransfer, selectedItems) {
  if (selectedItems) {
    return moveItems(selectedItems, sanitize(path.value + '/' + targetItemName));
  }

  if (!dataTransfer || !dataTransfer.items[0]) return;

  const targetPath = targetItemName ? sanitize(path.value + '/' + targetItemName) : path.value;

  let folderItem;
  try {
    folderItem = dataTransfer.items[0].webkitGetAsEntry();
    if (folderItem.isFile) return uploadFiles(dataTransfer.files, targetPath);
  } catch (e) {
    return uploadFiles(dataTransfer.files, targetPath);
  }

  uploadStatus.busy = true;
  uploadStatus.uploadListCount = 0;

  const fileList = [];
  function traverseFileTree(item, treePath, callback) {
    if (item.isFile) {
      item.file(function (file) {
        fileList.push(file);
        ++uploadStatus.uploadListCount;
        callback();
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries(function (dirEntries) {
        each(dirEntries, function (dirEntry, cb) {
          traverseFileTree(dirEntry, treePath + item.name + '/', cb);
        }, callback);
      });
    }
  }

  traverseFileTree(folderItem, '', (err) => {
    uploadStatus.busy = false;
    uploadStatus.uploadListCount = 0;

    if (err) return console.error(err);

    uploadFiles(fileList, targetPath);
  });
}

async function openNewFolderDialog() {
  const newFolderName = await inputDialog.value.prompt({
    message: 'New folder name',
    modal: false,
    value: '',
    confirmStyle: 'success',
    confirmLabel: 'Create',
    rejectLabel: 'Cancel',
    rejectStyle: 'secondary'
  });

  if (!newFolderName) return;

  const folderPath = encode(sanitize(path.value + '/' + newFolderName));

  try {
    const result = await fetcher.post(`/api/files${folderPath}`, {}, { directory: true });
    if (result.status === 401) return logout();
    if (result.status === 403) return window.pankow.notify({ type: 'danger', text: 'Folder name not allowed' });
    if (result.status === 409) return window.pankow.notify({ type: 'danger', text: 'Folder already exists' });
    if (result.status !== 201) return window.pankow.notify({ type: 'danger', text: 'Error creating folder: ' + result.status });
  } catch (e) {
    return window.pankow.notify({ type: 'danger', text: e.message });
  }

  openPath(path.value + '/' + newFolderName);
}

function onUpload() {
  upload.value.value = '';
  upload.value.click();
}

function onUploadFolder() {
  uploadFolder.value.value = '';
  uploadFolder.value.click();
}

async function onDelete(items) {
  if (!Array.isArray(items)) items = [ items ];
  if (!items.length) return;

  const names = items.map(function (e) { return e.fileName; }).join(', ');
  const yes = await inputDialog.value.confirm({
    message: `Really delete ${names}`,
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No',
    rejectStyle: 'secondary',
    modal: false
  });

  if (!yes) return;

  for (const entry of items) {
    const filePath = encode(sanitize(path.value + '/' + entry.fileName));

    try {
      const result = await fetcher.del(`/api/files${filePath}`, {}, { recursive: true });
      if (result.status === 401) return logout();
      if (result.status !== 200) return error('Error deleting file');
    } catch (e) {
      return error(e.message);
    }
  }

  await refresh();
}

async function onRenameRequested(entry) {
  const newFileName = await inputDialog.value.prompt({
    message: 'New filename',
    modal: false,
    value: entry.fileName,
    confirmStyle: 'success',
    confirmLabel: 'Rename',
    rejectLabel: 'Cancel',
    rejectStyle: 'secondary'
  });

  if (!newFileName || newFileName === entry.fileName) return;

  const filePath = encode(sanitize(path.value + '/' + entry.fileName));
  const newFilePath = sanitize(path.value + '/' + newFileName);

  try {
    const result = await fetcher.put(`/api/files${filePath}`, { newFilePath: newFilePath });
    if (result.status === 401) return logout();
    if (result.status !== 200) return error('Error renaming file');
  } catch (e) {
    return error(e.message);
  }

  await refresh();
}

function onDownload(entry) {
  download(entry);
}

async function moveItems(items, targetDir) {
  for (const entry of items) {
    const newFilePath = sanitize(targetDir + '/' + entry.fileName);

    if (newFilePath === sanitize(entry.filePath)) continue;
    if (entry.isDirectory && (newFilePath + '/').indexOf(sanitize(entry.filePath) + '/') === 0) continue;

    try {
      const result = await fetcher.put(`/api/files${encode(entry.filePath)}`, { newFilePath: newFilePath, overwrite: 'rename' });
      if (result.status === 401) return logout();
      if (result.status !== 200) return error('Error moving ' + entry.fileName);
    } catch (e) {
      return error(e.message);
    }
  }

  await refresh();
}

async function onPaste(action, files, targetItem) {
  const targetDir = targetItem ? sanitize(path.value + '/' + targetItem.name) : path.value;

  if (action === 'cut') {
    await moveItems(files, targetDir);
    return;
  }

  if (action === 'copy') {
    try {
      const result = await fetcher.post('/api/copy', { sources: files.map(function (f) { return f.filePath; }), destination: targetDir });
      if (result.status === 401) return logout();
      if (result.status !== 201) return error('Error copying files');
    } catch (e) {
      return error(e.message);
    }

    await refresh();
  }
}

async function onExtract(item) {
  try {
    const result = await fetcher.post('/api/extract', { path: item.filePath });
    if (result.status === 401) return logout();
    if (result.status !== 200) return error('Error extracting ' + item.fileName);
  } catch (e) {
    return error('Error extracting ' + item.fileName, e.message);
  }

  window.pankow.notify({ type: 'success', text: 'Extracted ' + item.fileName });
  await refresh();
}

function onEntryOpen(entry) {
  if (entry.isDirectory) {
    openPath(path.value + '/' + entry.fileName);
    return;
  }

  window.open(entry.href, '_blank');
}

function onSelectionChanged(selectedEntries) {
  activeEntry.value = selectedEntries[0] || {};
}

function onSplitResize(leftWidth) {
  previewWidthVw.value = clampPreviewPanelWidthVw(100 - leftWidth);
  setPreviewPanelWidthVw(previewWidthVw.value);
}

defineExpose({ onUpload, onUploadFolder, openNewFolderDialog });

watch(function () { return route.fullPath; }, function (fullPath) {
  if (route.name !== 'files') return;
  loadDirectory(decode(fullPath));
}, { immediate: true });

onMounted(() => {
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Escape' && e.target.classList.length === 0) {
      activeEntry.value = {};
    }
  });

  upload.value.addEventListener('change', () => {
    uploadFiles(upload.value.files || []);
  });

  uploadFolder.value.addEventListener('change', () => {
    uploadFiles(uploadFolder.value.files || []);
  });
});

</script>

<style>

.breadcrumb-bar {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 4px 10px;
  align-items: center;
}

.main-container-footer {
  display: flex;
  align-items: center;
}

.directory-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.directory-view-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.directory-view-busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (prefers-color-scheme: dark) {
  .main-container-footer {
    background-color: var(--pankow-color-background);
  }
}

</style>
