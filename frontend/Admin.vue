<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>
  <input type="file" ref="uploadFavicon" style="display: none"/>

  <!-- This is re-used and thus global -->
  <InputDialog ref="inputDialog" />
  <Notification/>

  <div class="main-container" v-show="ready">
    <div class="main-container-toolbar">
      <TopBar>
        <template #left>
          <Breadcrumb :home="breadcrumbHomeItem" :items="breadcrumbItems"/>
        </template>

        <template #right>
          <Button tool icon="pi pi-upload" @click="onUpload"><span class="pankow-no-mobile">Upload </span>File</Button>
          <Button tool icon="pi pi-cloud-upload" @click="onUploadFolder"><span class="pankow-no-mobile">Upload </span>Folder</Button>
          <Button tool icon="pi pi-plus" success @click="openNewFolderDialog"><span class="pankow-no-mobile">New </span>Folder</Button>
          <Button icon="pi pi-ellipsis-h" tool outline :menu="mainMenu" id="burgerMenuButton" :show-dropdown="false"/>
        </template>
      </TopBar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @dropped="onDrop" @entry-activated="onEntryOpen" @entry-renamed="onRename" @entry-delete="onDelete" @selection-changed="onSelectionChanged" editable/>
      </div>
      <Preview :entry="activeEntry" @close="onPreviewClose"/>
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
  <Dialog ref="settingsDialog" title="Settings" :modal="true" reject-label="Cancel" confirm-label="Save" confirm-style="success" :confirm-busy="settingsDialog.busy" @confirm="onSaveSettingsDialog">
    <div>
      <Checkbox v-model="settingsDialog.folderListingEnabled" label="Public Folder Listing"/>
      <p>If this is enabled, all folders and files will be publicly listed. If a folder contains a file with the below set index name, this will be displayed instead.</p>
    </div>

    <hr/>

    <div>
      <h3>Display</h3>
      <p>These settings only apply if public folder listing is enabled and no custom index file is present.</p>
      <Checkbox id="sortShowFoldersFirst" v-model="settingsDialog.sortFoldersFirst" label="Always show folders first"/>
      <div>
        <label for="titleInput">Title</label>
        <TextInput id="titleInput" type="text" placeholder="Surfer" v-model="settingsDialog.title"/>
      </div>
      <div>
        <label>Favicon</label>
        <img ref="faviconImage" :src="'/api/favicon?' + Date.now()" width="64" height="64" style="margin-top: 4px;"/>
      </div>
      <div>
        <Button icon="pi pi-upload" @click="onUploadFavicon">Upload Favicon</Button>
        <Button outline icon="pi pi-replay" @click="onResetFavicon">Reset Favicon</Button>
      </div>
    </div>

    <div>
      <h3>Index Document</h3>
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
      <Radiobutton v-model="settingsDialog.accessRestriction" value="" label="Public (everyone)" /><br/>
      <Radiobutton v-model="settingsDialog.accessRestriction" value="password" label="Password restricted"/><br/>
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
  <Dialog ref="accessTokenDialog" :show-x="true" title="Access Tokens">
    <p>
      Access tokens are useful to programmatically deploy assets for example within a CI/CD pipeline.<br/>
      These tokens are also used for WebDAV login as the password.<br/>
      <em>Tokens are shared between all users.</em>
      <br/>
      <br/>
      See the <a href="https://cloudron.io/documentation/apps/surfer/" target="_blank">docs</a> for more information on how to use this token.
    </p>
    <Button success @click="onCreateAccessToken()">Create Access Token</Button>
    <div>
      <div v-for="accessToken in accessTokens" :key="accessToken.value">
        <code @click="onCopyAccessToken(accessToken.value)" style="cursor: copy !important;">{{ accessToken.value }}</code>
        <Button danger small tool icon="pi pi-trash" @click="onDeleteAccessToken(accessToken.value)"/>
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

<script>

import { Breadcrumb, Button, Checkbox, Dialog, InputDialog, Notification, PasswordInput, ProgressBar, Radiobutton, Spinner, TextInput, TopBar } from 'pankow';
import superagent from 'superagent';
import { eachLimit, each } from 'async';
import { sanitize, encode, decode, getPreviewUrl, getExtension } from './utils.js';
import { copyToClipboard } from 'pankow/utils.js';

import EntryList from './components/EntryList.vue';
import Preview from './components/Preview.vue';

export default {
  name: 'AdminView',
  components: {
    Breadcrumb,
    Button,
    Checkbox,
    Dialog,
    EntryList,
    InputDialog,
    Notification,
    PasswordInput,
    Preview,
    ProgressBar,
    Radiobutton,
    Spinner,
    TextInput,
    TopBar,
  },
  data() {
    return {
      ready: false,
      busy: true,
      origin: window.location.origin,
      domain: window.location.host,
      username: '',
      uploadStatus: {
        busy: false,
        count: 0,
        done: 0,
        size: 0,
        percentDone: 0,
        uploadListCount: 0
      },
      path: '/',
      breadcrumbHomeItem: {
        label: '',
        icon: 'pi pi-home',
        route: '#/'
      },
      breadcrumbItems: [],
      entries: [],
      activeEntry: {},
      accessTokens: [],
      // holds settings values stored on backend
      settings: {
        folderListingEnabled: false,
        sortFoldersFirst: false,
        title: '',
        accessRestriction: ''
      },
      settingsDialog: {
        busy: false,
        // settings copy for modification
        folderListingEnabled: false,
        sortFoldersFirst: false,
        title: '',
        faviconFile: null,
        accessRestriction: '',
        accessPassword: '',
        index: ''
      },
      mainMenu: [{
        label: 'Settings',
        icon: 'pi pi-cog',
        action: this.openSettingsDialog
      }, {
        label: 'Access Tokens',
        icon: 'pi pi-key',
        action: this.openAccessTokenDialog
      }, {
        separator: true
      }, {
        label: 'About',
        icon: 'pi pi-info-circle',
        action: () => this.$refs.aboutDialog.open()
      }, {
        label: 'Logout',
        icon: 'pi pi-sign-out',
        action: this.logout
      }]
    };
  },
  mounted() {
    superagent.get('/api/settings').end((error, result) => {
      if (error) console.error(error);

      this.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
      this.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;
      this.settings.title = result.body.title || 'Surfer';
      this.settings.index = result.body.index || '';
      this.settings.accessRestriction = result.body.accessRestriction || '';
      this.settings.accessPassword = result.body.accessPassword || '';

      window.document.title = this.settings.title;

      this.initWithToken(localStorage.accessToken);
    });

    // global key handler to unset activeEntry
    window.addEventListener('keyup', () => {
      // only do this if no modal is active - body classlist would be empty
      if (event.key === 'Escape' && event.target.classList.length === 0) this.activeEntry = {};
    });

    window.addEventListener('hashchange', () => {
      this.loadDirectory(decode(window.location.hash.slice(1)));
    }, false);

    // upload input event handler
    this.$refs.upload.addEventListener('change', () => {
      this.uploadFiles(this.$refs.upload.files || []);
    });

    this.$refs.uploadFolder.addEventListener('change', () => {
      this.uploadFiles(this.$refs.uploadFolder.files || []);
    });

    this.$refs.uploadFavicon.addEventListener('change', () => {
      this.settingsDialog.faviconFile = this.$refs.uploadFavicon.files[0] || null;
      if (this.settingsDialog.faviconFile) this.$refs.faviconImage.src = URL.createObjectURL(this.settingsDialog.faviconFile);
    });
  },
  methods: {
    error(header, message) {
      window.pankow.notify({ type: 'danger', text: header + message });
      console.error(header, message);
    },
    initWithToken(accessToken) {
      if (!accessToken) return this.login();

      superagent.get('/api/profile').query({ access_token: accessToken }).end((error, result) =>{
        this.ready = true;

        if (error && !error.response) return console.error(error);
        if (result.statusCode !== 200) {
          delete localStorage.accessToken;
          return this.login();
        }

        localStorage.accessToken = accessToken;
        this.username = result.body.username;

        this.loadDirectory(decode(window.location.hash.slice(1)));

        this.refreshAccessTokens();
      });
    },
    loadDirectory(folderPath) {
      if (!folderPath) return window.location.hash = '/';

      this.busy = true;
      this.activeEntry = {};

      folderPath = folderPath ? sanitize(folderPath) : '/';

      superagent.get('/api/files/' + encode(folderPath)).query({ access_token: localStorage.accessToken }).end((error, result) => {
        this.busy = false;

        if (result && result.statusCode === 401) return this.logout();
        if (error) return console.error(error);

        result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
        this.entries = result.body.entries.map(function (entry) {
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

        // update in case this was triggered from code
        window.location.hash = this.path;
      });
    },
    login() {
      // first try to get a new token if we have a session otherwise redirect to oidc login
      superagent.get('/api/token').end((error, result) => {
        if (error) window.location.href = '/api/oidc/login';

        const accessToken = result.body.accessToken;
        localStorage.accessToken = accessToken;

        this.initWithToken(accessToken);
      });
    },
    logout() {
      superagent.del('/api/tokens/' + localStorage.accessToken).query({ access_token: localStorage.accessToken }).end((error) => {
        if (error) console.error('Failed to clear token', error);

        this.username = '';

        delete localStorage.accessToken;

        window.location.href = '/api/oidc/logout';
      });
    },
    refresh() {
      this.loadDirectory(this.path);
    },
    uploadFiles(files, targetPath) {
      if (!files || !files.length) return;

      targetPath = targetPath || this.path;

      this.uploadStatus.busy = true;
      this.uploadStatus.count = files.length;
      this.uploadStatus.size = 0;
      this.uploadStatus.done = 0;
      this.uploadStatus.percentDone = 0;

      for (var i = 0; i < files.length; ++i) {
        this.uploadStatus.size += files[i].size;
      }

      eachLimit(files, 10, (file, callback) => {
        const path = encode(sanitize(targetPath + '/' + (file.webkitRelativePath || file.name)));

        const formData = new FormData();
        formData.append('file', file);

        var finishedUploadSize = 0;

        superagent.post(`/api/files${path}`).query({ access_token: localStorage.accessToken }).send(formData).on('progress', (event) => {
          // only handle upload events
          if (!(event.target instanceof XMLHttpRequestUpload)) return;

          this.uploadStatus.done += event.loaded - finishedUploadSize;
          // keep track of progress diff not absolute
          finishedUploadSize = event.loaded;

          const tmp = Math.round(this.uploadStatus.done / this.uploadStatus.size * 100);
          this.uploadStatus.percentDone = tmp > 100 ? 100 : tmp;
        }).end((error, result) =>{
          if (result && result.statusCode === 401) return this.logout();
          if (result && result.statusCode !== 201) return callback('Error uploading file: ', result.statusCode);
          if (error) return callback(error);

          callback();
        });
      }, (error) => {
        if (error) console.error(error);

        this.uploadStatus.busy = false;
        this.uploadStatus.count = 0;
        this.uploadStatus.size = 0;
        this.uploadStatus.done = 0;
        this.uploadStatus.percentDone = 100;

        this.refresh();
      });
    },
    onDrop(event, entry) {
      if (!event.dataTransfer.items[0]) return;

      // figure if a folder was dropped on a modern browser, in this case the first would have to be a directory
      var folderItem;
      var targetPath = entry ? entry.filePath : null;
      try {
        folderItem = event.dataTransfer.items[0].webkitGetAsEntry();
        if (folderItem.isFile) return this.uploadFiles(event.dataTransfer.files, targetPath);
      } catch (e) {
        return this.uploadFiles(event.dataTransfer.files, targetPath);
      }

      // if we got here we have a folder drop and a modern browser
      // now traverse the folder tree and create a file list
      this.uploadStatus.busy = true;
      this.uploadStatus.uploadListCount = 0;

      var that = this;
      var fileList = [];
      function traverseFileTree(item, path, callback) {
        if (item.isFile) {
          // Get file
          item.file(function (file) {
            fileList.push(file);
            ++that.uploadStatus.uploadListCount;
            callback();
          });
        } else if (item.isDirectory) {
          // Get folder contents
          const dirReader = item.createReader();
          dirReader.readEntries(function (entries) {
            each(entries, function (entry, callback) {
              traverseFileTree(entry, path + item.name + '/', callback);
            }, callback);
          });
        }
      }

      traverseFileTree(folderItem, '', (error) => {
        this.uploadStatus.busy = false;
        this.uploadStatus.uploadListCount = 0;

        if (error) return console.error(error);

        this.uploadFiles(fileList, targetPath);
      });
    },
    async openNewFolderDialog() {
      const newFolderName = await this.$refs.inputDialog.prompt({
        message: 'New Foldername',
        modal: false,
        value: '',
        confirmStyle: 'success',
        confirmLabel: 'Create',
        rejectLabel: 'Cancel'
      });

      if (!newFolderName) return;

      const path = encode(sanitize(this.path + '/' + newFolderName));

      superagent.post(`/api/files${path}`).query({ access_token: localStorage.accessToken, directory: true }).end((error, result) => {
        if (result && result.statusCode === 401) return this.logout();
        if (result && result.statusCode === 403) return window.pankow.notify({ type: 'danger', text: 'Folder name not allowed' });
        if (result && result.statusCode === 409) return window.pankow.notify({ type: 'danger', text: 'Folder already exists' });
        if (result && result.statusCode !== 201) return window.pankow.notify({ type: 'danger', text: 'Error creating folder: ' + result.statusCode });
        if (error) return window.pankow.notify({ type: 'danger', text: error.message });

        this.refresh();
      });
    },
    openAccessTokenDialog() {
      this.$refs.accessTokenDialog.open();
    },
    openSettingsDialog() {
      this.settingsDialog.folderListingEnabled = this.settings.folderListingEnabled;
      this.settingsDialog.sortFoldersFirst = this.settings.sortFoldersFirst;
      this.settingsDialog.title = this.settings.title;
      this.settingsDialog.faviconFile = null;
      this.settingsDialog.index = this.settings.index;
      this.settingsDialog.accessRestriction = this.settings.accessRestriction;

      this.$refs.settingsDialog.open();
    },
    onSaveSettingsDialog() {
      this.settingsDialog.busy = true;

      const data = {
        folderListingEnabled: this.settingsDialog.folderListingEnabled,
        sortFoldersFirst: this.settingsDialog.sortFoldersFirst,
        title: this.settingsDialog.title,
        index: this.settingsDialog.index,
        accessRestriction: this.settingsDialog.accessRestriction
      };

      if (this.settingsDialog.accessPassword) data.accessPassword = this.settingsDialog.accessPassword;

      const query = {
        access_token: localStorage.accessToken
      };

      const that = this;
      function done(error) {
        if (error) return console.error(error);

        that.settings.folderListingEnabled = data.folderListingEnabled;
        that.settings.sortFoldersFirst = data.sortFoldersFirst;
        that.settings.title = data.title;
        that.settings.index = data.index;
        that.settings.accessRestriction = data.accessRestriction;

        // refresh immedately
        document.querySelector('link[rel="icon"]').href = '/api/favicon?' + Date.now();
        window.document.title = that.settings.title;

        that.settingsDialog.busy = false;

        that.$refs.settingsDialog.close();
      }

      superagent.put('/api/settings').send(data).query(query).end((error) => {
        if (error) return console.error(error);

        if (!this.settingsDialog.faviconFile) return done();

        if (this.settingsDialog.faviconFile === 'reset') {
          superagent.delete('/api/favicon').query(query).end(done);
        } else {
          const formData = new FormData();
          formData.append('file', this.settingsDialog.faviconFile);

          superagent.put('/api/favicon').send(formData).query(query).end(done);
        }
      });
    },
    onUploadFavicon() {
      // reset the form first to make the change handler retrigger even on the same file selected
      this.$refs.uploadFavicon.value = '';
      this.$refs.uploadFavicon.click();
    },
    onResetFavicon() {
      // magic 'reset' token to indicate removal and reset to default
      this.settingsDialog.faviconFile = 'reset';
      this.$refs.faviconImage.src = '/_admin/logo.png';
    },
    onUpload() {
      // reset the form first to make the change handler retrigger even on the same file selected
      this.$refs.upload.value = '';
      this.$refs.upload.click();
    },
    onUploadFolder() {
      // reset the form first to make the change handler retrigger even on the same file selected
      this.$refs.uploadFolder.value = '';
      this.$refs.uploadFolder.click();
    },
    onDelete(entry) {
      const path = encode(sanitize(this.path + '/' + entry.fileName));

      superagent.del(`/api/files${path}`).query({ access_token: localStorage.accessToken, recursive: true }).end((error, result) => {
        if (result && result.statusCode === 401) return this.logout();
        if (result && result.statusCode !== 200) return this.error('Error deleting file');
        if (error) return this.error(error.message);

        this.refresh();
      });
    },
    onRename(entry, newFileName) {
      const path = encode(sanitize(this.path + '/' + entry.fileName));
      const newFilePath = sanitize(this.path + '/' + newFileName);

      superagent.put(`/api/files${path}`).query({ access_token: localStorage.accessToken }).send({ newFilePath: newFilePath }).end((error, result) => {
        if (result && result.statusCode === 401) return this.logout();
        if (result && result.statusCode !== 200) return this.error('Error renaming file');
        if (error) return this.error(error.message);

        // update in-place to avoid reload
        entry.fileName = newFileName;
        // FIXME setting this will correctly update the preview, which on some types might trigger a download on rename!
        entry.filePath = newFilePath;
      });
    },
    refreshAccessTokens() {
      superagent.get('/api/tokens').query({ access_token: localStorage.accessToken }).end((error, result) =>{
        if (error && !result) return this.error(error.message);

        // have to create an array of objects for referencing in v-for -> input
        this.accessTokens = result.body.accessTokens.map(function (t) { return { value: t }; });
      });
    },
    onCopyToClipboard(value) {
      copyToClipboard(value);
      window.pankow.notify({ type:'success', text: 'Copied to Clipboard' });
    },
    onCopyAccessToken(value) {
      copyToClipboard(value);
      window.pankow.notify({ type:'success', text: 'Token copied to Clipboard' });
    },
    onCreateAccessToken() {
      superagent.post('/api/tokens').query({ access_token: localStorage.accessToken }).end((error, result) => {
        if (error && !result) return this.error(error.message);

        this.refreshAccessTokens();
      });
    },
    async onDeleteAccessToken(token) {
      const yes = await this.$refs.inputDialog.confirm({
        message: 'Really delete this access token? Any actions currently using this token will fail.',
        confirmStyle: 'danger',
        confirmLabel: 'Yes',
        rejectLabel: 'No',
        modal: false
      });

      if (!yes) return;

      superagent.delete(`/api/tokens/${token}`).query({ access_token: localStorage.accessToken }).end((error, result) => {
        if (error && !result) return this.error(error.message);
        this.refreshAccessTokens();
      });
    },
    onEntryOpen(entry) {
      // ignore item open on row clicks if we are renaming this entry
      if (entry.rename) return;

      const path = sanitize(this.path + '/' + entry.fileName);

      if (entry.isDirectory) {
        window.location.hash = path;
        return;
      }

      this.activeEntry = entry;
    },
    onSelectionChanged(selectedEntries) {
      this.activeEntry = selectedEntries[0];
    },
    onPreviewClose() {
      this.activeEntry = {};
    }
  }
};

</script>

<style>

hr {
    border: none;
    border-top: 1px solid #d0d0d0;
}

label {
    font-weight: bold;
}

.main-container-footer {
  display: flex;
  align-items: center;
}

@media (prefers-color-scheme: dark) {
  .main-container-footer {
    background-color: var(--pankow-color-background);
  }
}

.pankow-breadcrumb {
  overflow: auto;
  white-space: nowrap;
}

</style>
