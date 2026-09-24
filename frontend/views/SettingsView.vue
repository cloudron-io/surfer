<template>
  <div class="settings-view">
    <div class="settings-content">
      <div class="header">
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
          <ImagePicker mode="editable" :src="faviconSrc" :save-handler="onFaviconSave" :size="512" display-height="128px" fallback-src="/_admin/logo.png"/>
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
        <SettingsItem>
          <div>
            <label>Access restriction</label>
            <div>This controls how the public folder listing or any served up site can be accessed.</div>
          </div>
        </SettingsItem>
        <div class="access-options">
          <RadioButton v-model="settings.accessRestriction" value="" label="Public (everyone)"/>
          <RadioButton v-model="settings.accessRestriction" value="password" label="Password restricted"/>
          <div v-show="settings.accessRestriction === 'password'" class="access-password">
            <PasswordInput ref="passwordInputRef" v-model="accessPassword" :required="true"/>
            <small>Changing the password will require every user to re-login.</small>
          </div>
          <RadioButton v-model="settings.accessRestriction" value="user" label="Private (only logged in users)"/>
          <SaveIndicator ref="accessIndicator" class="access-save">
            <Button primary :disabled="saving.access || !accessChanged" @click="onSaveAccess">Save</Button>
          </SaveIndicator>
        </div>
      </SectionItem>
    </div>
  </div>
</template>

<script setup>

import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import { Button, ImagePicker, InputGroup, PasswordInput, RadioButton, SaveIndicator, SectionItem, SettingsItem, Switch, TextInput, fetcher } from '@cloudron/pankow';

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

async function onFaviconSave(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await fetcher.put('/api/favicon', formData, { access_token: localStorage.accessToken });
    if (result.status !== 201) {
      window.pankow.notify({ type: 'danger', text: 'Could not set favicon' });
      return new Error('Could not set favicon');
    }
    refreshFavicon();
    return null;
  } catch (e) {
    console.error('Failed to upload favicon', e);
    window.pankow.notify({ type: 'danger', text: 'Could not set favicon' });
    return e;
  }
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
  max-width: 1100px;
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

.access-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.access-save {
  margin-top: 8px;
  align-self: flex-start;
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

</style>
