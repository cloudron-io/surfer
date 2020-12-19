<template>
  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <Toolbar>
        <template #left>
          <Button icon="pi pi-chevron-left" class="p-mr-2 p-button-sm" :disabled="breadCrumbs.items.length === 0" @click="onUp"/>
          <Breadcrumb :home="breadCrumbs.home" :model="breadCrumbs.items"/>
        </template>

        <template #right>
          <a href="/_admin"><Button class="p-button-sm" label="Login" icon="pi pi-upload"/></a>
        </template>
      </Toolbar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @entry-activated="onEntryOpen"/>
      </div>
<!--       <div class="main-container-preview" :class="{ 'visible': previewDrawer.visible }">
        <iframe id="previewIframe" :src="previewDrawer.entry.fullPath" style="width: 100%; height: 100%; border: none;"></iframe>
        <center>
          <Button class="p-button-sm" label="Download" icon="pi pi-download" style="margin: 10px;" @click.stop="onDownload(previewDrawer.entry)"/>
          <a :href="previewDrawer.entry.fullPath" target="_blank">
            <Button class="p-button-sm" label="Open" icon="pi pi-external-link" style="margin: 10px;"/>
          </a>
        </center>
      </div> -->
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
                home: { icon: 'pi pi-home', url: '#/' },
                items: []
            },
            entries: [],
            // holds settings values stored on backend
            settings: {
                folderListingEnabled: false,
                sortFoldersFirst: false
            },
            previewDrawer: {
                visible: false,
                entry: {}
            }
        }
    },
    methods: {
        loadDirectory (folderPath) {
            var that = this;

            that.busy = true;

            that.previewDrawer.visible = false
            that.previewDrawer.entry = {};

            folderPath = folderPath ? sanitize(folderPath) : '/';

            superagent.get(`${that.origin}/api/files/` + encode(folderPath)).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                that.busy = false;

                if (result && result.statusCode === 401) return that.logout();
                if (error) return console.error(error);

                result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
                that.entries = result.body.entries.map(function (entry) {
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
                        url: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
                    };
                });

                // update in case this was triggered from code
                window.location.hash = that.path;
            });
        },
        refresh () {
          this.loadDirectory(this.path);
        },
        onDownload: function (entry) {
            if (entry.isDirectory) return;
            window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.fileName)) + '?access_token=' + localStorage.accessToken;
        },
        onUp: function () {
            window.location.hash = sanitize(this.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
        },
        onEntryOpen: function (entry) {
            // ignore item open on row clicks if we are renaming this entry
            if (entry.rename) return;

            var path = sanitize(this.path + '/' + entry.fileName);

            if (entry.isDirectory) {
                window.location.hash = path;
                return;
            }

            this.previewDrawer.visible = true
            this.previewDrawer.entry = entry;

            // need to wait for DOM element to exist
            setTimeout(function () {
                document.getElementById('previewIframe').addEventListener('load', function (e) {
                    if (!e.target.contentWindow.document.body) return;

                    e.target.contentWindow.document.body.style.margin = 0;
                    e.target.contentWindow.document.body.style.display = 'flex';
                    e.target.contentWindow.document.body.style.justifyContent = 'center';
                    e.target.contentWindow.document.body.style.alignItems = 'center';
                    e.target.contentWindow.document.body.style.height = '100%';
                }, { once: true });
            }, 0);
        }
    },
    mounted() {
        var that = this;

        console.log('done')

        superagent.get(`${that.origin}/api/settings`).end(function (error, result) {
            if (error) console.error(error);

            that.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
            that.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;

            that.loadDirectory(decode(window.location.hash.slice(1)));

            that.ready = true;
        });

        window.addEventListener('hashchange', function () {
            that.loadDirectory(decode(window.location.hash.slice(1)));
        }, false);
    }
};

</script>

<style></style>
