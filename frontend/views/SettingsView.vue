<template>
  <div class="settings-view">
    <div class="settings-content">
      <div class="header">
        <Button plain tool icon="fa-solid fa-arrow-left" aria-label="Back to files" @click="router.push('/')"/>
        <h1>Settings</h1>
      </div>

      <SectionItem title="General">
        <SettingsItem>
          <div>
            <label>Public folder listing</label>
            <div>If enabled, all folders and files will be publicly listed. If a folder contains a file with an index document (see below), this will be displayed instead.</div>
          </div>
          <SaveIndicator ref="folderListingIndicator">
            <Switch v-model="settings.folderListingEnabled" @change="onSaveFolderListing"/>
          </SaveIndicator>
        </SettingsItem>
      </SectionItem>

      <SectionItem title="Display">
        <SettingsItem>
          <div>
            <label>Title</label>
            <div>These settings only apply if public folder listing is enabled and no custom index file is present.</div>
          </div>
          <SaveIndicator ref="titleIndicator">
            <InputGroup>
              <TextInput id="titleInput" v-model="settings.title" placeholder="Surfer" @keydown.enter.prevent="onSaveTitle"/>
              <Button primary tool :disabled="saving.title || !titleChanged" @click="onSaveTitle">Save</Button>
            </InputGroup>
          </SaveIndicator>
        </SettingsItem>

        <SettingsItem>
          <div>
            <label>Favicon</label>
            <div>Shown in the browser tab and when bookmarking the site.</div>
          </div>
          <div class="favicon-controls">
            <img :src="faviconSrc" width="64" height="64"/>
            <div style="display: flex; gap: 6px">
              <Button icon="fa-solid fa-upload" @click="onUploadFavicon">Upload favicon</Button>
              <Button outline icon="fa-solid fa-rotate-left" @click="onResetFavicon">Reset favicon</Button>
            </div>
          </div>
        </SettingsItem>
      </SectionItem>

      <SectionItem title="Index document">
        <SettingsItem>
          <div>
            <label for="indexInput">Filename</label>
            <div>By default files named index.html will be served up automatically in each folder. This setting allows to specify any filename as index document.</div>
          </div>
          <SaveIndicator ref="indexIndicator">
            <InputGroup>
              <TextInput id="indexInput" v-model="settings.index" placeholder="index.html" @keydown.enter.prevent="onSaveIndex"/>
              <Button primary tool :disabled="saving.index || !indexChanged" @click="onSaveIndex">Save</Button>
            </InputGroup>
          </SaveIndicator>
        </SettingsItem>
      </SectionItem>

      <SectionItem title="Access">
        <SettingsItem wrap>
          <div>
            <label>Access restriction</label>
            <div>This controls how the public folder listing or any served up site can be accessed.</div>
          </div>
          <SaveIndicator ref="accessIndicator">
            <Button primary :disabled="saving.access || !accessChanged" @click="onSaveAccess">Save</Button>
          </SaveIndicator>
        </SettingsItem>
        <div class="access-options">
          <RadioButton v-model="settings.accessRestriction" value="" label="Public (everyone)"/>
          <RadioButton v-model="settings.accessRestriction" value="password" label="Password restricted"/>
          <div v-show="settings.accessRestriction === 'password'" class="access-password">
            <PasswordInput ref="passwordInputRef" v-model="accessPassword" :required="true"/>
            <small>Changing the password will require every user to re-login.</small>
          </div>
          <RadioButton v-model="settings.accessRestriction" value="user" label="Private (only logged in users)"/>
        </div>
      </SectionItem>

      <SectionItem title="WebDAV access">
        <SettingsItem wrap>
          <div>
            <p>WebDAV provides a framework for users to create, change and move documents on a server.</p>
            <p class="webdav-subtext">To authenticate the password must be an API access token. The username is ignored.</p>
            <ul class="webdav-instructions">
              <li><b>Windows:</b> Explorer &gt; This PC &gt; Map Network Drive &gt; <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
              <li><b>MacOS:</b> Finder &gt; Go &gt; Connect to Server... &gt; <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
              <li><b>Gnome:</b> Files &gt; Other Locations &gt; Connect to Server &gt; <code style="cursor: copy;" @click="onCopyToClipboard('davs://' + domain + '/_webdav/')">davs://{{ domain }}/_webdav/</code></li>
              <li><b>KDE:</b> Dolphin &gt; Ctrl+L &gt; <code style="cursor: copy;" @click="onCopyToClipboard('webdav://' + domain + '/_webdav/')">webdav://{{ domain }}/_webdav/</code></li>
            </ul>
          </div>
        </SettingsItem>
      </SectionItem>
    </div>

    <input ref="uploadFavicon" type="file" accept="image/*" style="display: none"/>
  </div>
</template>

<script setup>

import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Button, InputGroup, PasswordInput, RadioButton, SaveIndicator, SectionItem, SettingsItem, Switch, TextInput, fetcher } from '@cloudron/pankow';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

const router = useRouter();

const origin = window.location.origin;
const domain = window.location.host;

const uploadFavicon = ref(null);
const folderListingIndicator = ref(null);
const titleIndicator = ref(null);
const indexIndicator = ref(null);
const accessIndicator = ref(null);

const faviconVersion = ref(Date.now());
const faviconSrc = computed(() => '/api/favicon?' + faviconVersion.value);

const accessPassword = ref('');
const passwordInputRef = ref(null);

const saving = reactive({
  title: false,
  index: false,
  access: false,
});

const settings = reactive({
  folderListingEnabled: false,
  title: 'Surfer',
  index: '',
  accessRestriction: '',
});

const loaded = reactive({
  title: 'Surfer',
  index: '',
  accessRestriction: '',
});

const titleChanged = computed(() => settings.title !== loaded.title);
const indexChanged = computed(() => settings.index !== loaded.index);
const accessChanged = computed(() => settings.accessRestriction !== loaded.accessRestriction || !!accessPassword.value);

async function putSettings(indicator) {
  const data = {
    folderListingEnabled: settings.folderListingEnabled,
    title: settings.title,
    index: settings.index,
    accessRestriction: settings.accessRestriction,
  };

  if (accessPassword.value) data.accessPassword = accessPassword.value;

  try {
    const result = await fetcher.put('/api/settings', data, { access_token: localStorage.accessToken });
    if (result.status === 201) {
      settings.folderListingEnabled = data.folderListingEnabled;
      settings.title = data.title;
      settings.index = data.index;
      settings.accessRestriction = data.accessRestriction;
      loaded.title = settings.title;
      loaded.index = settings.index;
      loaded.accessRestriction = settings.accessRestriction;
      accessPassword.value = '';
      window.document.title = settings.title;
      indicator.value?.success();
    } else {
      indicator.value?.error();
    }
  } catch (e) {
    console.error('Failed to save settings', e);
    indicator.value?.error();
  }
}

async function onSaveFolderListing() {
  await putSettings(folderListingIndicator);
}

async function onSaveTitle() {
  saving.title = true;
  try {
    await putSettings(titleIndicator);
  } finally {
    saving.title = false;
  }
}

async function onSaveIndex() {
  saving.index = true;
  try {
    await putSettings(indexIndicator);
  } finally {
    saving.index = false;
  }
}

async function onSaveAccess() {
  saving.access = true;
  try {
    await putSettings(accessIndicator);
  } finally {
    saving.access = false;
  }
}

function refreshFavicon() {
  faviconVersion.value = Date.now();
  document.querySelector('link[rel="icon"]').href = '/api/favicon?' + faviconVersion.value;
}

function onUploadFavicon() {
  uploadFavicon.value.value = '';
  uploadFavicon.value.click();
}

async function onResetFavicon() {
  try {
    await fetcher.delete('/api/favicon', {}, { access_token: localStorage.accessToken });
    refreshFavicon();
  } catch (e) {
    console.error('Failed to reset favicon', e);
  }
}

function onCopyToClipboard(value) {
  copyToClipboard(value);
  window.pankow.notify({ type: 'success', text: 'Copied to clipboard' });
}

watch(() => settings.accessRestriction, async (value) => {
  if (value !== 'password') return;
  await nextTick();
  passwordInputRef.value?.$el.querySelector('input')?.focus();
});

onMounted(async () => {
  try {
    const result = await fetcher.get('/api/settings');
    if (result.status === 200) {
      settings.folderListingEnabled = !!result.body.folderListingEnabled;
      settings.title = result.body.title;
      settings.index = result.body.index;
      settings.accessRestriction = result.body.accessRestriction;
      loaded.title = result.body.title;
      loaded.index = result.body.index;
      loaded.accessRestriction = result.body.accessRestriction;
    } else {
      console.error('Failed to fetch settings', result.status);
    }
  } catch (e) {
    console.error(e);
  }

  window.document.title = settings.title;

  uploadFavicon.value.addEventListener('change', async () => {
    const file = uploadFavicon.value.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetcher.put('/api/favicon', formData, { access_token: localStorage.accessToken });
      refreshFavicon();
    } catch (e) {
      console.error('Failed to upload favicon', e);
    }
  });
});

</script>

<style scoped>

.settings-view {
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px 24px;
  overflow-y: auto;
}

.settings-content {
  max-width: 720px;
  width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
}

.favicon-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.access-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.access-password {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 24px;
}

.access-password small {
  color: var(--pankow-color-text-secondary);
}

.webdav-subtext {
  margin-bottom: 8px;
}

.webdav-instructions {
  margin: 0;
  padding-left: 20px;
}

.webdav-instructions li {
  margin-bottom: 6px;
}

</style>
