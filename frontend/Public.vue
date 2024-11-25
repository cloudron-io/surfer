<template>
  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <TopBar>
        <template #left>
          <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
        </template>

        <template #right>
          <Button href="/_admin" icon="pi pi-sign-in">Login</Button>
        </template>
      </TopBar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @selection-changed="onSelectionChanged" @entry-activated="onEntryOpen"/>
      </div>
      <Preview :entry="activeEntry" @close="onPreviewClose"/>
    </div>
  </div>
</template>

<script>

import { Breadcrumb, Button, TopBar, fetcher } from 'pankow';
import { sanitize, encode, decode, getPreviewUrl, getExtension } from './utils.js';

import EntryList from './components/EntryList.vue';
import Preview from './components/Preview.vue';

const ORIGIN = window.location.origin;

export default {
  name: 'PublicView',
  components: {
    Breadcrumb,
    Button,
    EntryList,
    Preview,
    TopBar
  },
  data() {
    return {
      ready: false,
      busy: false,
      origin: ORIGIN,
      domain: window.location.host,
      path: '/',
      breadcrumbHomeItem: {
        label: '',
        icon: 'pi pi-home',
        route: '/'
      },
      breadcrumbItems: [],
      entries: [],
      // holds settings values stored on backend
      settings: {
        folderListingEnabled: false,
        sortFoldersFirst: false,
        title: false
      },
      activeEntry: {}
    };
  },
  async mounted() {
    // global key handler to unset activeEntry
    window.addEventListener('keyup', () => {
      // only do this if no modal is active - body classlist would be empty
      if (event.key === 'Escape' && event.target.classList.length === 0) this.clearSelection();
    });

    try {
      const result = await fetcher.get(`${this.origin}/api/settings`);
      this.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
      this.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;
      this.settings.title =  result.body.title;
    } catch (error) {
      console.error(error);
    }

    window.document.title = this.settings.title;

    this.loadDirectory(decode(window.location.pathname));

    this.ready = true;
  },
    methods: {
      loadDirectory(folderPath) {
        this.activeEntry = {};

        folderPath = folderPath ? sanitize(folderPath) : '/';

        // this is injected via ejs in server.js
        const entries = window.surfer.entries;

        entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });

        this.entries = entries.map(function (entry) {
          entry.previewUrl = getPreviewUrl(entry, folderPath);
          entry.extension = getExtension(entry);
          entry.rename = false;
          entry.filePathNew = entry.fileName;
          return entry;
        });
        this.path = folderPath;
        this.breadcrumbItems = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
          return {
            label: e,
            route: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
          };
        });
      },
      onDownload(entry) {
        if (entry.isDirectory) return;
        window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.fileName)) + '?access_token=' + localStorage.accessToken;
      },
      onEntryOpen: function (entry) {
        if (entry.isDirectory) {
          window.location.pathname = sanitize(this.path + '/' + entry.fileName);
          return;
        }

        // TODO open file viewer
        console.error('To be implemented');
      },
      onSelectionChanged(selectedEntries) {
        this.activeEntry = selectedEntries[0];
      },
      onPreviewClose() {
        this.activeEntry = {};
      },
      clearSelection() {
        this.activeEntry = {};
      }
    }
};

</script>

<style></style>
