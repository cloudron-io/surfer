<template>
  <!-- This is re-used and thus global -->
  <ConfirmDialog></ConfirmDialog>
  <Toast position="top-center" />

  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <Toolbar>
        <template #left>
          <Button icon="pi pi-chevron-left" class="p-mr-2 p-button-sm" :disabled="breadCrumbs.items.length === 0" @click="onUp"/>
          <Breadcrumb :home="breadCrumbs.home" :model="breadCrumbs.items"/>
        </template>

        <template #right>
          <a href="/_admin"><Button class="p-button-sm" label="Login" icon="pi pi-sign-in"/></a>
        </template>
      </Toolbar>
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

import superagent from 'superagent';
import { sanitize, encode, decode, getPreviewUrl, getExtension } from './utils.js';

const ORIGIN = window.location.origin;

export default {
    name: 'Public',
    data() {
        return {
            ready: false,
            busy: false,
            origin: ORIGIN,
            domain: window.location.host,
            path: '/',
            breadCrumbs: {
                home: { icon: 'pi pi-home', url: '/' },
                items: []
            },
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
    methods: {
        loadDirectory (folderPath) {
            var that = this;

            that.activeEntry = {};

            folderPath = folderPath ? sanitize(folderPath) : '/';

            // this is injected via ejs in server.js
            var entries = window.surfer.entries;

            entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
            that.entries = entries.map(function (entry) {
                entry.previewUrl = getPreviewUrl(entry, folderPath);
                entry.extension = getExtension(entry);
                entry.rename = false;
                entry.filePathNew = entry.fileName;
                return entry;
            });
            that.path = folderPath;
            that.breadCrumbs.items = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
                return {
                    label: e,
                    url: sanitize('/' + a.slice(0, i).join('/') + '/' + e)
                };
            });
        },
        onDownload: function (entry) {
            if (entry.isDirectory) return;
            window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.fileName)) + '?access_token=' + localStorage.accessToken;
        },
        onUp: function () {
            // we slice of last 2 as public paths always end with /
            window.location.href = sanitize(this.path.split('/').slice(0, -2).filter(function (p) { return !!p; }).join('/'));
        },
        onEntryOpen: function (entry) {
            // ignore item open on row clicks if we are renaming this entry
            if (entry.rename) return;

            var path = sanitize(this.path + '/' + entry.fileName);

            if (entry.isDirectory) {
                window.location.pathname = path;
                return;
            }

            // TODO open file viewer
            console.error('To be implemented');
        },
        onSelectionChanged: function (selectedEntries) {
            this.activeEntry = selectedEntries[0];
        },
        onPreviewClose: function () {
            this.activeEntry = {};
        },
        clearSelection: function () {
            this.activeEntry = {};
        }
    },
    mounted() {
        var that = this;

        // global key handler to unset activeEntry
        window.addEventListener('keyup', function () {
            // only do this if no modal is active - body classlist would be empty
            if (event.key === 'Escape' && event.target.classList.length === 0) that.clearSelection();
        });

        superagent.get(`${that.origin}/api/settings`).end(function (error, result) {
            if (error) console.error(error);

            that.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
            that.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;
            that.settings.title =  result.body.title;

            window.document.title = that.settings.title;

            that.loadDirectory(decode(window.location.pathname));

            that.ready = true;
        });
    }
};

</script>

<style></style>
