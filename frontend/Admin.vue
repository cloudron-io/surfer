<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>
  <input type="file" ref="uploadFavicon" style="display: none"/>

  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog"/>
  <Notification/>

  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <TopBar>
        <template #left>
          <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
        </template>

        <template #right>
          <div style="display: flex; gap: 6px">
            <Button tool icon="fa-solid fa-file-arrow-up" @click="onUpload"><span class="pankow-no-mobile">Upload file</span><span class="pankow-no-desktop">File</span></Button>
            <Button tool icon="fa-solid fa-upload" @click="onUploadFolder"><span class="pankow-no-mobile">Upload folder</span><span class="pankow-no-desktop">Folder</span></Button>
            <Button tool icon="fa-solid fa-plus" success @click="openNewFolderDialog"><span class="pankow-no-mobile">New folder</span><span class="pankow-no-desktop">Folder</span></Button>
            <Button icon="fa-solid fa-ellipsis" tool outline :menu="mainMenu" title="Menu" :show-dropdown="false"/>
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
              ref="directoryView"
              :items="entries"
              :busy="busy"
              :editable="true"
              :show-download="true"
              :show-size="true"
              :show-modified="true"
              :show-rename="true"
              :show-delete="true"
              :show-new-file="false"
              :show-new-folder="true"
              :show-upload-file="true"
              :show-upload-folder="true"
              :show-cut="false"
              :show-copy="false"
              :show-paste="false"
              :show-select-all="false"
              :show-extract="false"
              :download-handler="onDownload"
              :delete-handler="onDelete"
              :new-folder-handler="openNewFolderDialog"
              :upload-file-handler="onUpload"
              :upload-folder-handler="onUploadFolder"
              :drop-handler="onDrop"
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

  <!-- Settings Dialog -->
  <Dialog ref="settingsDialogRef" title="Settings" :modal="true" reject-label="Cancel" confirm-label="Save" confirm-style="success" :confirm-busy="settingsDialog.busy" @confirm="onSaveSettingsDialog">
    <div>
      <Checkbox v-model="settingsDialog.folderListingEnabled" label="Public folder listing"/>
      <p>If enabled, all folders and files will be publicly listed. If a folder contains a file with an index document (see below), this will be displayed instead.</p>
    </div>

    <hr/>

    <div>
      <h3>Display</h3>
      <p>These settings only apply if public folder listing is enabled and no custom index file is present.</p>
      <div>
        <label for="titleInput">Title</label>
        <TextInput id="titleInput" type="text" placeholder="Surfer" v-model="settingsDialog.title"/>
      </div>
      <div>
        <label>Favicon</label>
        <img ref="faviconImage" :src="'/api/favicon?' + Date.now()" width="64" height="64" style="margin-top: 4px;"/>
      </div>
      <div style="display: flex; gap: 6px">
        <Button icon="fa-solid fa-upload" @click="onUploadFavicon">Upload favicon</Button>
        <Button outline icon="fa-solid fa-rotate-left" @click="onResetFavicon">Reset favicon</Button>
      </div>
    </div>

    <div>
      <h3>Index document</h3>
      <p>By default files names index.html will be served up automatically in each folder. This settings allows to specify any filename as index document.</p>
      <div class="p-fluid">
        <div>
          <label for="indexInput">Filename</label>
          <TextInput id="indexInput" type="text" placeholder="index.html" v-model="settingsDialog.index"/>
        </div>
      </div>
    </div>

    <div>
      <h3>Access</h3>
      <p>This controls how the public folder listing or any served up site can be accessed.</p>
      <Radiobutton v-model="settingsDialog.accessRestriction" value="" label="Public (everyone)" />
      <Radiobutton v-model="settingsDialog.accessRestriction" value="password" label="Password restricted"/>
      <div v-show="settingsDialog.accessRestriction === 'password'">
        <PasswordInput v-model="settingsDialog.accessPassword" :required="settingsDialog.accessRestriction === 'password'"/>
        <small>Changing the password will require every user to re-login.</small>
      </div>
      <Radiobutton v-model="settingsDialog.accessRestriction" value="user" label="Private (only logged in users)"/>
    </div>

    <div>
      <h3>WebDAV access</h3>
      <p>WebDAV provides a framework for users to create, change and move documents on a server.</p>
      <p>To authenticate the password must be an API access token. The username is ignored.</p>
      <ul>
        <li><b>Windows:</b> Explorer > This PC > Map Network Drive > <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
        <li><b>MacOS:</b> Finder > Go > Connect to Server... > <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
        <li><b>Gnome:</b> Files > Other Locations > Connect to Server > <code style="cursor: copy;" @click="onCopyToClipboard('davs://' + domain + '/_webdav/')">davs://{{ domain }}/_webdav/</code></li>
        <li><b>KDE:</b> Dolphin > Ctrl+L > <code style="cursor: copy;" @click="onCopyToClipboard('webdav://' + domain + '/_webdav/')">webdav://{{ domain }}/_webdav/</code></li>
      </ul>
    </div>
  </Dialog>

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

  <!-- About Dialog -->
  <Dialog ref="aboutDialog" title="About Cloudron Surfer" :show-x="true" reject-label="Close">
    <div>
      Surfer is a static file server written by <a href="https://cloudron.io" target="_blank">Cloudron</a>.
      <br/>
      <br/>
      The source code is licensed under MIT and available <a href="https://git.cloudron.io/cloudron/surfer" target="_blank">here</a>.
      <br/><br/>
    </div>
  </Dialog>
</template>

<script setup>

import { ref, reactive, computed, onMounted, provide } from 'vue';
import { Breadcrumb, Button, Checkbox, Dialog, DirectoryView, InputDialog, Notification, PasswordInput, ProgressBar, Radiobutton, Spinner, SplitLayout, TextInput, TopBar, fetcher } from '@cloudron/pankow';
import { eachLimit, each } from 'async';
import { sanitize, encode, decode, download, toDirectoryItems, makeCurrentFolderPreviewEntry, getPreviewPanelWidthVw, setPreviewPanelWidthVw, clampPreviewPanelWidthVw } from './utils.js';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

import Preview from './components/Preview.vue';

const upload = ref(null);
const uploadFolder = ref(null);
const uploadFavicon = ref(null);
const faviconImage = ref(null);
const inputDialog = ref(null);
const directoryView = ref(null);
const settingsDialogRef = ref(null);
const accessTokenDialog = ref(null);
const aboutDialog = ref(null);

provide('inputDialog', inputDialog);

const ready = ref(false);
const busy = ref(true);
const origin = window.location.origin;
const domain = window.location.host;
const username = ref('');
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
const settings = reactive({
  folderListingEnabled: false,
  title: 'Surfer',
  accessRestriction: '',
  accessPassword: '',
  index: ''
});
const settingsDialog = reactive({
  busy: false,
  folderListingEnabled: false,
  title: '',
  faviconFile: null,
  accessRestriction: '',
  accessPassword: '',
  index: ''
});

const mainMenu = [
  { label: 'Settings', icon: 'fa-solid fa-gear', action: openSettingsDialog },
  { label: 'Access tokens', icon: 'fa-solid fa-key', action: openAccessTokenDialog },
  { separator: true },
  { label: 'About', icon: 'fa-solid fa-circle-info', action: () => aboutDialog.value.open() },
  { label: 'Log out', icon: 'fa-solid fa-arrow-right-from-bracket', action: logout }
];

const previewEntry = computed(() => {
  if (activeEntry.value.filePath) return activeEntry.value;
  return makeCurrentFolderPreviewEntry(path.value);
});

function error(header, message) {
  window.pankow.notify({ type: 'danger', text: header + message });
  console.error(header, message);
}

async function initWithToken(accessToken) {
  if (!accessToken) return login();

  try {
    const result = await fetcher.get('/api/profile', { access_token: accessToken });
    if (result.status !== 200) {
      delete localStorage.accessToken;
      return login();
    }

    username.value = result.body.username;
  } catch (e) {
    return console.error(e);
  }

  ready.value = true;

  localStorage.accessToken = accessToken;

  loadDirectory(decode(window.location.hash.slice(1)));

  refreshAccessTokens();
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

async function login() {
  try {
    const result = await fetcher.get('/api/token');
    if (result.status !== 201) return window.location.replace('/auth/login?returnTo=/_admin');
    localStorage.accessToken = result.body.accessToken;
  } catch (e) {
    return window.location.replace('/auth/login?returnTo=/_admin');
  }

  await initWithToken(localStorage.accessToken);
}

async function logout() {
  await fetcher.del('/api/tokens/' + localStorage.accessToken, {}, { access_token: localStorage.accessToken });
  username.value = '';
  delete localStorage.accessToken;
  window.location.href = '/auth/logout';
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

function onDrop(targetItemName, dataTransfer) {
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
    rejectLabel: 'Cancel'
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

  await refresh();
}

function openAccessTokenDialog() {
  accessTokenDialog.value.open();
}

function openSettingsDialog() {
  settingsDialog.folderListingEnabled = settings.folderListingEnabled;
  settingsDialog.title = settings.title;
  settingsDialog.faviconFile = null;
  settingsDialog.index = settings.index;
  settingsDialog.accessRestriction = settings.accessRestriction;

  settingsDialogRef.value.open();
}

async function onSaveSettingsDialog() {
  settingsDialog.busy = true;

  const data = {
    folderListingEnabled: settingsDialog.folderListingEnabled,
    title: settingsDialog.title,
    index: settingsDialog.index,
    accessRestriction: settingsDialog.accessRestriction
  };

  if (settingsDialog.accessPassword) data.accessPassword = settingsDialog.accessPassword;

  const query = { access_token: localStorage.accessToken };

  await fetcher.put('/api/settings', data, query);

  if (settingsDialog.faviconFile === 'reset') {
    await fetcher.delete('/api/favicon', {}, query);
  } else if (settingsDialog.faviconFile) {
    const formData = new FormData();
    formData.append('file', settingsDialog.faviconFile);
    await fetcher.put('/api/favicon', formData, query);
  }

  settings.folderListingEnabled = data.folderListingEnabled;
  settings.title = data.title;
  settings.index = data.index;
  settings.accessRestriction = data.accessRestriction;

  document.querySelector('link[rel="icon"]').href = '/api/favicon?' + Date.now();
  window.document.title = settings.title;

  settingsDialog.busy = false;

  settingsDialogRef.value.close();
}

function onUploadFavicon() {
  uploadFavicon.value.value = '';
  uploadFavicon.value.click();
}

function onResetFavicon() {
  settingsDialog.faviconFile = 'reset';
  faviconImage.value.src = '/_admin/logo.png';
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
    rejectLabel: 'Cancel'
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

async function refreshAccessTokens() {
  try {
    const result = await fetcher.get('/api/tokens', { access_token: localStorage.accessToken });
    accessTokens.value = result.body.accessTokens.map(function (t) { return { value: t }; });
  } catch (e) {
    error(e.message);
  }
}

function onCopyToClipboard(value) {
  copyToClipboard(value);
  window.pankow.notify({ type:'success', text: 'Copied to clipboard' });
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

onMounted(async () => {
  try {
    const result = await fetcher.get('/api/settings');
    if (result.status !== 200) {
      console.error('Failed to fetch settings', result.status);
    } else {
      settings.folderListingEnabled = !!result.body.folderListingEnabled;
      settings.title = result.body.title;
      settings.index = result.body.index;
      settings.accessRestriction = result.body.accessRestriction;
      settings.accessPassword = result.body.accessPassword;
    }
  } catch (e) {
    console.error(e);
  }

  window.document.title = settings.title;

  await initWithToken(localStorage.accessToken);

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

  uploadFavicon.value.addEventListener('change', () => {
    settingsDialog.faviconFile = uploadFavicon.value.files[0] || null;
    if (settingsDialog.faviconFile) faviconImage.value.src = URL.createObjectURL(settingsDialog.faviconFile);
  });

  const model = directoryView.value?.contextMenuModel;
  if (model) {
    const downloadItem = model.find(function (item) { return item.id === 'download'; });
    if (downloadItem) {
      downloadItem.visible = () => !!(directoryView.value?.focusItem && directoryView.value.focusItem.isFile);
    }
  }
});

</script>

<style>

hr {
  border: none;
  border-top: 1px solid #d0d0d0;
}

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
