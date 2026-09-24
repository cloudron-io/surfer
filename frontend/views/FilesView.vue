<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>

  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog"/>

  <div class="main-container">
    <div class="main-container-toolbar">
      <TopBar>
        <template #left>
          <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
        </template>

        <template #right>
          <div style="display: flex; gap: 6px">
            <Button icon="fa-solid fa-plus" :menu="newMenu" tool><span class="pankow-no-mobile">New</span></Button>
            <Button :menu="mainMenu" tool secondary title="Menu">
              <span class="pankow-no-mobile">{{ profile.name || profile.username }}</span>
            </Button>
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

  <!-- Access Token Dialog -->
  <Dialog ref="accessTokenDialog" :show-x="true" title="Access tokens">
    <p>
      These tokens are useful to programmatically deploy assets for example within a CI/CD pipeline. They are also used for WebDAV login as the password.<br/>
      <br/>
      <em>Tokens are shared between <b>all</b> users.</em>
    </p>
    <div>
      <h3 style="display: flex; justify-content: space-between; align-items: center;">
        <span v-show="accessTokens.length">Issued tokens:</span>
        <Button success @click="onCreateAccessToken()">Create new access token</Button>
      </h3>
      <div v-for="accessToken in accessTokens" :key="accessToken.value">
        <span @click="onCopyAccessToken(accessToken.value)" style="cursor: copy; font-family: monospace;">{{ accessToken.value }}</span>
        <Button style="margin: 0 6px" primary tool plain icon="fa-regular fa-copy" v-tooltip="'Copy token to clipboard'" @click="onCopyAccessToken(accessToken.value)"/>
        <Button danger tool plain icon="fa-solid fa-trash" v-tooltip="'Revoke token'" @click="onDeleteAccessToken(accessToken.value)"/>
      </div>
    </div>
  </Dialog>
</template>

<script setup>

import { ref, reactive, computed, onMounted, inject } from 'vue';
import { Breadcrumb, Button, Dialog, DirectoryView, InputDialog, ProgressBar, Spinner, SplitLayout, TopBar, fetcher } from '@cloudron/pankow';
import { eachLimit, each } from 'async';
import { sanitize, encode, decode, download, toDirectoryItems, makeCurrentFolderPreviewEntry, getPreviewPanelWidthVw, setPreviewPanelWidthVw, clampPreviewPanelWidthVw } from '../utils.js';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

import Preview from '../components/Preview.vue';

const logout = inject('logout');
const profile = inject('profile');

const upload = ref(null);
const uploadFolder = ref(null);
const inputDialog = ref(null);
const accessTokenDialog = ref(null);

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
  route: '#/'
});
const breadcrumbItems = ref([]);
const entries = ref([]);
const activeEntry = ref({});
const previewWidthVw = ref(getPreviewPanelWidthVw());
const leftWidthPercent = computed(() => 100 - previewWidthVw.value);
const accessTokens = ref([]);

const newMenu = [{
  separator: true,
  label: 'Upload',
}, {
  label: 'Upload file',
  icon: 'fa-solid fa-file-arrow-up',
  action: onUpload
}, {
  label: 'Upload folder',
  icon: 'fa-regular fa-folder-open',
  action: onUploadFolder
}, {
  separator: true,
  label: 'Create new',
}, {
  label: 'New folder',
  icon: 'fa-solid fa-folder-plus',
  action: openNewFolderDialog
}];

const mainMenu = [
  { label: 'Access tokens', icon: 'fa-solid fa-key', action: openAccessTokenDialog },
  { separator: true },
  { label: 'Log out', icon: 'fa-solid fa-arrow-right-from-bracket', action: logout }
];

const previewEntry = computed(() => {
  if (activeEntry.value.filePath) return activeEntry.value;
  return makeCurrentFolderPreviewEntry(path.value);
});

function error(header, message) {
  window.pankow.notify({ type: 'danger', text: header + (message ? ': ' + message : '') });
  console.error(header, message);
}

async function loadDirectory(folderPath) {
  if (!folderPath) { window.location.hash = '/'; return; }

  busy.value = true;
  activeEntry.value = {};

  folderPath = folderPath ? sanitize(folderPath) : '/';

  try {
    const result = await fetcher.get('/api/files/' + encode(folderPath), { access_token: localStorage.accessToken });
    if (result.status === 401) return logout();

    busy.value = false;

    entries.value = toDirectoryItems(result.body.entries, folderPath, true);
  } catch (e) {
    return console.error(e);
  }

  path.value = folderPath;
  breadcrumbItems.value = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
    return {
      label: e,
      route: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
    };
  });

  window.location.hash = path.value;
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

      xhr.open('POST', `/api/files${filePath}?access_token=${localStorage.accessToken}`);
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
    const result = await fetcher.post(`/api/files${folderPath}`, {}, { access_token: localStorage.accessToken, directory: true });
    if (result.status === 401) return logout();
    if (result.status === 403) return window.pankow.notify({ type: 'danger', text: 'Folder name not allowed' });
    if (result.status === 409) return window.pankow.notify({ type: 'danger', text: 'Folder already exists' });
    if (result.status !== 201) return window.pankow.notify({ type: 'danger', text: 'Error creating folder: ' + result.status });
  } catch (e) {
    return window.pankow.notify({ type: 'danger', text: e.message });
  }

  window.location.hash = sanitize(path.value + '/' + newFolderName);
}

function openAccessTokenDialog() {
  accessTokenDialog.value.open();
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
      const result = await fetcher.del(`/api/files${filePath}`, {}, { access_token: localStorage.accessToken, recursive: true });
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
    const result = await fetcher.put(`/api/files${filePath}`, { newFilePath: newFilePath }, { access_token: localStorage.accessToken });
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
      const result = await fetcher.put(`/api/files${encode(entry.filePath)}`, { newFilePath: newFilePath, overwrite: 'rename' }, { access_token: localStorage.accessToken });
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
      const result = await fetcher.post('/api/copy', { sources: files.map(function (f) { return f.filePath; }), destination: targetDir }, { access_token: localStorage.accessToken });
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
    const result = await fetcher.post('/api/extract', { path: item.filePath }, { access_token: localStorage.accessToken });
    if (result.status === 401) return logout();
    if (result.status !== 200) return error('Error extracting ' + item.fileName);
  } catch (e) {
    return error('Error extracting ' + item.fileName, e.message);
  }

  window.pankow.notify({ type: 'success', text: 'Extracted ' + item.fileName });
  await refresh();
}

async function refreshAccessTokens() {
  try {
    const result = await fetcher.get('/api/tokens', { access_token: localStorage.accessToken });
    accessTokens.value = result.body.accessTokens.map(function (t) { return { value: t }; });
  } catch (e) {
    error(e.message);
  }
}

function onCopyAccessToken(value) {
  copyToClipboard(value);
  window.pankow.notify({ type:'success', text: 'Token copied to clipboard' });
}

async function onCreateAccessToken() {
  try {
    await fetcher.post('/api/tokens', {}, { access_token: localStorage.accessToken });
  } catch (e) {
    return error(e.message);
  }

  await refreshAccessTokens();
}

async function onDeleteAccessToken(token) {
  const yes = await inputDialog.value.confirm({
    message: 'Really revoke this access token? Any actions currently using this token will fail.',
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No',
    rejectStyle: 'secondary',
    modal: false
  });

  if (!yes) return;

  try {
    await fetcher.delete(`/api/tokens/${token}`, {}, { access_token: localStorage.accessToken });
  } catch (e) {
    return error(e.message);
  }

  await refreshAccessTokens();
}

function onEntryOpen(entry) {
  if (entry.isDirectory) {
    window.location.hash = sanitize(path.value + '/' + entry.fileName);
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

onMounted(() => {
  loadDirectory(decode(window.location.hash.slice(1)));

  refreshAccessTokens();

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Escape' && e.target.classList.length === 0) {
      activeEntry.value = {};
    }
  });

  window.addEventListener('hashchange', () => {
    loadDirectory(decode(window.location.hash.slice(1)));
  }, false);

  upload.value.addEventListener('change', () => {
    uploadFiles(upload.value.files || []);
  });

  uploadFolder.value.addEventListener('change', () => {
    uploadFiles(uploadFolder.value.files || []);
  });
});

</script>

<style>

.main-container-footer {
  display: flex;
  align-items: center;
}

.directory-pane {
  position: relative;
  overflow: hidden;
  height: 100%;
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
