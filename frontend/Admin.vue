<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>
  <input type="file" ref="uploadFavicon" style="display: none"/>

  <!-- This is re-used and thus global -->
  <ConfirmDialog></ConfirmDialog>
  <Toast position="top-center" />

  <div class="login-container" v-show="ready && !session.valid">
    <form @submit="onLogin" @submit.prevent>
      <h1>Login to {{ settings.title }}</h1>
      <div class="p-fluid">
        <div class="p-field">
          <label for="usernameInput">Username</label>
          <InputText id="usernameInput" type="text" v-model="loginData.username" autofocus/>
        </div>
        <div class="p-field">
          <label for="passwordInput">Password</label>
          <Password id="passwordInput" :feedback="false" v-model="loginData.password" :class="{ 'p-invalid': loginData.error }"/>
          <small v-show="loginData.error" :class="{ 'p-invalid': loginData.error }">Wrong username or password.</small>
        </div>
      </div>
      <Button type="submit" label="Login" id="loginButton" @click="onLogin"/>
    </form>
  </div>

  <div class="main-container" v-show="ready && session.valid">
    <div class="main-container-toolbar">
      <Toolbar>
        <template #left>
          <Button icon="pi pi-chevron-left" class="p-mr-2 p-button-sm" :disabled="breadCrumbs.items.length === 0" @click="onUp"/>
          <Breadcrumb :home="breadCrumbs.home" :model="breadCrumbs.items"/>
        </template>

        <template #right>
          <span class="p-buttonset p-d-none p-d-md-flex">
            <Button class="p-button-sm" label="Upload File" icon="pi pi-upload" @click="onUpload"/>
            <Button class="p-button-sm" label="Upload Folder" icon="pi pi-cloud-upload" @click="onUploadFolder"/>
            <Button class="p-button-sm" label="New Folder" icon="pi pi-plus" @click="openNewFolderDialog"/>
          </span>
          <Button icon="pi pi-ellipsis-h" class="p-ml-2 p-button-sm p-button-outlined" id="burgerMenuButton" @click="toggleMenu"/>
          <Menu ref="menu" :model="mainMenu" :popup="true"/>
        </template>
      </Toolbar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @dropped="onDrop" @entry-activated="onEntryOpen" @entry-renamed="onRename" @entry-delete="onDelete" editable/>
      </div>
      <Preview :entry="activeEntry" @close="onPreviewClose"/>
    </div>
    <div class="main-container-footer" v-show="uploadStatus.busy">
      <div v-show="uploadStatus.uploadListCount">
        <i class="pi pi-spin pi-spinner"></i> Fetching file information for upload <span class="p-badge">{{ uploadStatus.uploadListCount }}</span>
      </div>
      <div style="margin-right: 10px;" v-show="!uploadStatus.uploadListCount">Uploading {{ uploadStatus.count }} files ({{ Math.round(uploadStatus.done/1000/1000) }}MB / {{ Math.round(uploadStatus.size/1000/1000) }}MB)</div>
      <ProgressBar :value="uploadStatus.percentDone" v-show="!uploadStatus.uploadListCount">{{uploadStatus.percentDone}}%</ProgressBar>
    </div>
  </div>

  <!-- Settings Dialog -->
  <Dialog v-model:visible="settingsDialog.visible" header="Settings" :dismissableMask="true" :modal="true" :closable="true" :style="{width: '50vw'}">
    <div>
      <div class="p-field-checkbox">
        <Checkbox id="publicFolderListing" v-model="settingsDialog.folderListingEnabled" :binary="true"/>
        <label for="publicFolderListing" style="font-weight: bold; font-size: 16.38px;">Public Folder Listing</label>
      </div>
      <p>If this is enabled, all folders and files will be publicly listed. If a folder contains an index.html or index.htm file, this will be displayed instead.</p>
    </div>

    <hr/>

    <div>
      <h3>Display</h3>
      <p>These settings only apply if public folder listing is enabled and no custom index file is present.</p>
      <div class="p-field-checkbox">
        <Checkbox id="sortShowFoldersFirst" v-model="settingsDialog.sortFoldersFirst" :binary="true"/>
        <label for="sortShowFoldersFirst">Always show folders first</label>
      </div>
      <div class="p-fluid p-formgrid p-grid">
        <div class="p-field p-col-12">
          <label for="titleInput">Title</label>
          <InputText id="titleInput" type="text" placeholder="Surfer" v-model="settingsDialog.title"/>
        </div>
        <div class="p-field p-col-12">
          <label for="faviconInput">Favicon</label>
          <br/>
          <img ref="faviconImage" :src="'/api/favicon?' + Date.now()" width="64" height="64"/>
        </div>
        <div class="p-field p-col-3">
          <Button id="faviconInput" class="p-button p-button-sm" label="Upload Favicon" icon="pi pi-upload" @click="onUploadFavicon"/>
        </div>
        <div class="p-field p-col-3">
          <Button class="p-button p-button-sm p-button-outlined" label="Reset Favicon" icon="pi pi-replay" @click="onResetFavicon"/>
        </div>
      </div>
    </div>

    <hr/>

    <div>
      <h3>Access</h3>
      <p>This controls how the public folder listing or any served up site can be accessed.</p>
      <div class="p-field-radiobutton">
        <RadioButton id="accessPublic" value="" v-model="settingsDialog.accessRestriction" />
        <label for="accessPublic">Public (everyone)</label>
      </div>
      <div class="p-field-radiobutton">
        <RadioButton id="accessPassword" value="password" v-model="settingsDialog.accessRestriction" />
        <label for="accessPassword">Password restricted</label>
      </div>
      <div class="p-field p-col-12" v-show="settingsDialog.accessRestriction === 'password'">
        <Password :feedback="false" v-model="settingsDialog.accessPassword" :required="settingsDialog.accessRestriction === 'password'"/><br/>
        <small>Changing the password will require every user to re-login.</small>
      </div>
      <div class="p-field-radiobutton">
        <RadioButton id="accessUser" value="user" v-model="settingsDialog.accessRestriction" />
        <label for="accessUser">User restricted</label>
      </div>
    </div>

    <hr/>

    <div>
      <h3>WebDAV access</h3>
      <p>WebDAV provides a framework for users to create, change and move documents on a server.</p>
      <ul>
        <li><b>Windows:</b> Explorer > This PC > Map Network Drive > <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
        <li><b>MacOS:</b> Finder > Go > Connect to Server... > <code style="cursor: copy;" @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
        <li><b>Gnome:</b> Files > Other Locations > Connect to Server > <code style="cursor: copy;" @click="onCopyToClipboard('davs://' + domain  + '/_webdav/')">davs://{{ domain }}/_webdav/</code></li>
        <li><b>KDE:</b> Dolphin > Ctrl+L > <code style="cursor: copy;" @click="onCopyToClipboard('webdav://' + domain  + '/_webdav/')">webdav://{{ domain }}/_webdav/</code></li>
      </ul>
    </div>

    <template #footer>
      <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="settingsDialog.visible = false" :disabled="settingsDialog.busy"/>
      <Button label="Save" icon="pi pi-check" class="p-button-text p-button-success" @click="onSaveSettingsDialog" :disabled="settingsDialog.busy || (settingsDialog.accessRestriction === 'password' && !settingsDialog.accessPassword)"/>
    </template>
  </Dialog>

  <!-- Access Token Dialog -->
  <Dialog v-model:visible="accessTokenDialog.visible" header="Access Tokens" :dismissableMask="true" :modal="true" :closable="true" :style="{width: '50vw'}">
    Access tokens are useful to programmatically deploy assets for example within a CI/CD pipeline.
    See the <a href="https://cloudron.io/documentation/apps/surfer/" target="_blank">docs</a> for more information on how to use this token.
    <br/>
    <br/>
    <Message severity="warn" :closable="false">Tokens are shared between all users.</Message>
    <br/>
    <div class="p-fluid">
      <div v-for="accessToken in accessTokens" :key="accessToken.value" class="p-grid">
        <div class="p-col">
          <span class="p-input-icon-right">
            <i class="pi pi-copy"></i>
            <InputText type="text" class="p-inputtext-sm" v-model="accessToken.value" @click="onCopyAccessToken" readonly style="cursor: copy !important;" />
          </span>
        </div>
        <div class="p-col-fixed">
          <Button class="p-col-12 p-button-sm p-button-danger" icon="pi pi-trash" @click="onDeleteAccessToken(accessToken.value)"/>
        </div>
      </div>
    </div>
    <br/>
    <Button label="Create Access Token" class="p-button-sm" @click="onCreateAccessToken()"/>

    <template #footer>
      <Button label="Close" icon="pi pi-times" class="p-button-text" @click="accessTokenDialog.visible = false"/>
    </template>
  </Dialog>

  <!-- New Folder Dialog -->
  <Dialog header="New Foldername" v-model:visible="newFolderDialog.visible" :dismissableMask="true" :closable="true" :style="{width: '350px'}" :modal="true">
    <form @submit="onSaveNewFolderDialog" @submit.prevent>
      <div class="p-fluid">
        <div class="p-field">
          <InputText type="text" v-model="newFolderDialog.folderName" autofocus required :class="{ 'p-invalid': newFolderDialog.error }"/>
          <small class="p-invalid" v-show="newFolderDialog.error">{{ newFolderDialog.error }}</small>
        </div>
      </div>
    </form>
    <template #footer>
      <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="newFolderDialog.visible = false"/>
      <Button label="Create" icon="pi pi-check" class="p-button-text p-button-success" @click="onSaveNewFolderDialog" :disabled="!newFolderDialog.folderName"/>
    </template>
  </Dialog>

  <!-- About Dialog -->
  <Dialog header="About Cloudron Surfer" v-model:visible="aboutDialog.visible" :dismissableMask="true" :closable="true" :style="{width: '450px'}" :modal="true">
    <div>
      Surfer is a static file server written by <a href="https://cloudron.io" target="_blank">Cloudron</a>.
      The source code is licensed under MIT and available <a href="https://git.cloudron.io/cloudron/surfer" target="_blank">here</a>.
      <br/><br/>
    </div>
    <template #footer>
      <Button label="Close" icon="pi pi-times" class="p-button-text" @click="aboutDialog.visible = false"/>
    </template>
  </Dialog>

</template>

<script>

import superagent from 'superagent';
import { eachLimit, each } from 'async';
import { sanitize, encode, decode, getPreviewUrl, getExtension, copyToClipboard } from './utils.js';

export default {
    name: 'Admin',
    data() {
        return {
            ready: false,
            busy: true,
            origin: window.location.origin,
            domain: window.location.host,
            uploadStatus: {
                busy: false,
                count: 0,
                done: 0,
                percentDone: 50,
                uploadListCount: 0
            },
            path: '/',
            breadCrumbs: {
                home: { icon: 'pi pi-home', url: '#/' },
                items: []
            },
            session: {
                valid: false
            },
            loginData: {
                busy: false,
                error: false,
                username: '',
                password: ''
            },
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
                visible: false,
                busy: false,
                // settings copy for modification
                folderListingEnabled: false,
                sortFoldersFirst: false,
                title: '',
                faviconFile: null,
                accessRestriction: '',
                accessPassword: ''
            },
            accessTokenDialog: {
                visible: false,
            },
            newFolderDialog: {
                visible: false,
                error: '',
                folderName: ''
            },
            aboutDialog: {
                visible: false
            },
            mainMenu: [{
                label: 'Upload File',
                icon: 'pi pi-upload',
                command: this.onUpload,
                class: 'p-d-md-none'
            }, {
                label: 'Upload Folder',
                icon: 'pi pi-cloud-upload',
                command: this.onUploadFolder,
                class: 'p-d-md-none'
            }, {
                label: 'New Folder',
                icon: 'pi pi-plus',
                command: this.openNewFolderDialog,
                class: 'p-d-md-none'
            }, {
                label: 'Settings',
                icon: 'pi pi-cog',
                command: this.openSettingsDialog
            }, {
                label: 'Access Tokens',
                icon: 'pi pi-key',
                command: this.openAccessTokenDialog
            }, {
                separator: true
            }, {
                label: 'About',
                icon: 'pi pi-info-circle',
                command: () => this.aboutDialog.visible = true
            }, {
                label: 'Logout',
                icon: 'pi pi-sign-out',
                command: this.logout
            }]
        };
    },
    methods: {
        initWithToken: function (accessToken) {
            var that = this;

            if (!accessToken) {
                this.ready = true;
                return;
            }

            superagent.get('/api/profile').query({ access_token: accessToken }).end(function (error, result) {
                that.ready = true;

                if (error && !error.response) return console.error(error);
                if (result.statusCode !== 200) {
                    delete localStorage.accessToken;
                    return;
                }

                localStorage.accessToken = accessToken;
                that.session.username = result.body.username;
                that.session.valid = true;

                that.loadDirectory(decode(window.location.hash.slice(1)));

                that.refreshAccessTokens();
            });
        },
        toggleMenu: function (event) {
            this.$refs.menu.toggle(event);
        },
        loadDirectory: function (folderPath) {
            var that = this;

            that.busy = true;

            that.activeEntry = {};

            folderPath = folderPath ? sanitize(folderPath) : '/';

            superagent.get('/api/files/' + encode(folderPath)).query({ access_token: localStorage.accessToken }).end(function (error, result) {
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
        logout: function () {
            var that = this;

            superagent.post('/api/logout').query({ access_token: localStorage.accessToken }).end(function (error) {
                if (error) console.error(error);

                // close all potential dialogs
                that.newFolderDialog.visible = false;
                that.settingsDialog.visible = false;
                that.accessTokenDialog.visible = false;

                that.loginData.username = '';
                that.loginData.password = '';
                that.loginData.error = false;

                that.session.valid = false;

                delete localStorage.accessToken;
            });
        },
        refresh: function () {
            this.loadDirectory(this.path);
        },
        uploadFiles: function (files, targetPath) {
            var that = this;

            if (!files || !files.length) return;

            targetPath = targetPath || this.path;

            that.uploadStatus.busy = true;
            that.uploadStatus.count = files.length;
            that.uploadStatus.size = 0;
            that.uploadStatus.done = 0;
            that.uploadStatus.percentDone = 0;

            for (var i = 0; i < files.length; ++i) {
                that.uploadStatus.size += files[i].size;
            }

            eachLimit(files, 10, function (file, callback) {
                var path = encode(sanitize(targetPath + '/' + (file.webkitRelativePath || file.name)));

                var formData = new FormData();
                formData.append('file', file);

                var finishedUploadSize = that.uploadStatus.done;

                superagent.post(`/api/files${path}`)
                  .query({ access_token: localStorage.accessToken })
                  .send(formData)
                  .on('progress', function (event) {
                    // only handle upload events
                    if (!(event.target instanceof XMLHttpRequestUpload)) return;

                    that.uploadStatus.done = finishedUploadSize + event.loaded;
                    var tmp = Math.round(that.uploadStatus.done / that.uploadStatus.size * 100);
                    that.uploadStatus.percentDone = tmp > 100 ? 100 : tmp;
                }).end(function (error, result) {
                    if (result && result.statusCode === 401) return that.logout();
                    if (result && result.statusCode !== 201) return callback('Error uploading file: ', result.statusCode);
                    if (error) return callback(error);

                    callback();
                });
            }, function (error) {
                if (error) console.error(error);

                that.uploadStatus.busy = false;
                that.uploadStatus.count = 0;
                that.uploadStatus.size = 0;
                that.uploadStatus.done = 0;
                that.uploadStatus.percentDone = 100;

                that.refresh();
            });
        },
        onDrop: function (event, entry) {
            var that = this;

            if (!event.dataTransfer.items[0]) return;

            // figure if a folder was dropped on a modern browser, in this case the first would have to be a directory
            var folderItem;
            var targetPath = entry ? entry.filePath : null;
            try {
                folderItem = event.dataTransfer.items[0].webkitGetAsEntry();
                if (folderItem.isFile) return that.uploadFiles(event.dataTransfer.files, targetPath);
            } catch (e) {
                return that.uploadFiles(event.dataTransfer.files, targetPath);
            }

            // if we got here we have a folder drop and a modern browser
            // now traverse the folder tree and create a file list
            that.uploadStatus.busy = true;
            that.uploadStatus.uploadListCount = 0;

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
                    var dirReader = item.createReader();
                    dirReader.readEntries(function (entries) {
                        each(entries, function (entry, callback) {
                            traverseFileTree(entry, path + item.name + '/', callback);
                        }, callback);
                    });
                }
            }

            traverseFileTree(folderItem, '', function (error) {
                that.uploadStatus.busy = false;
                that.uploadStatus.uploadListCount = 0;

                if (error) return console.error(error);

                that.uploadFiles(fileList, targetPath);
            });
        },
        openNewFolderDialog: function () {
            this.newFolderDialog.error = '';
            this.newFolderDialog.folderName = '';
            this.newFolderDialog.visible = true;
        },
        onSaveNewFolderDialog: function () {
            var that = this;

            var path = encode(sanitize(this.path + '/' + this.newFolderDialog.folderName));

            superagent.post(`/api/files${path}`).query({ access_token: localStorage.accessToken, directory: true }).end(function (error, result) {
                if (result && result.statusCode === 401) return that.logout();
                if (result && result.statusCode === 403) return that.newFolderDialog.error = 'Folder name not allowed';
                if (result && result.statusCode === 409) return that.newFolderDialog.error = 'Folder already exists';
                if (result && result.statusCode !== 201) return that.newFolderDialog.error = 'Error creating folder: ' + result.statusCode;
                if (error) return console.error(error.message);

                that.refresh();

                that.newFolderDialog.visible = false;
            });
        },
        openAccessTokenDialog: function () {
            this.accessTokenDialog.visible = true;
        },
        openSettingsDialog: function () {
            this.settingsDialog.folderListingEnabled = this.settings.folderListingEnabled;
            this.settingsDialog.sortFoldersFirst = this.settings.sortFoldersFirst;
            this.settingsDialog.visible = true;
            this.settingsDialog.title = this.settings.title;
            this.settingsDialog.faviconFile = null;
            this.settingsDialog.accessRestriction = this.settings.accessRestriction;
            this.settingsDialog.accessPassword = this.settings.accessPassword;
        },
        onSaveSettingsDialog: function () {
            var that = this;

            this.settingsDialog.busy = true;

            var data = {
                folderListingEnabled: this.settingsDialog.folderListingEnabled,
                sortFoldersFirst: this.settingsDialog.sortFoldersFirst,
                title: this.settingsDialog.title,
                accessRestriction: this.settingsDialog.accessRestriction
            };

            if (this.settingsDialog.accessPassword) data.accessPassword = this.settingsDialog.accessPassword;

            var query = {
                access_token: localStorage.accessToken
            };

            function done(error) {
                if (error) return console.error(error);

                that.settings.folderListingEnabled = data.folderListingEnabled;
                that.settings.sortFoldersFirst = data.sortFoldersFirst;
                that.settings.title = data.title;
                that.settings.accessRestriction = data.accessRestriction;

                // refresh immedately
                document.querySelector('link[rel="icon"]').href = '/api/favicon?' + Date.now();
                window.document.title = that.settings.title;

                that.settingsDialog.busy = false;
                that.settingsDialog.visible = false;
            }

            superagent.put('/api/settings').send(data).query(query).end(function (error) {
                if (error) return console.error(error);

                if (!that.settingsDialog.faviconFile) return done();

                if (that.settingsDialog.faviconFile === 'reset') {
                    superagent.delete('/api/favicon').query(query).end(done);
                } else {
                    var formData = new FormData();
                    formData.append('file', that.settingsDialog.faviconFile);

                    superagent.put('/api/favicon').send(formData).query(query).end(done);
                }
            });
        },
        onLogin: function () {
            var that = this;

            that.loginData.busy = true;
            that.loginData.error = false;

            superagent.post('/api/login').send({ username: that.loginData.username, password: that.loginData.password }).end(function (error, result) {
                that.loginData.busy = false;

                if (error || result.statusCode === 401) {
                    that.loginData.error = true;
                    that.loginData.password = '';
                    document.getElementById('passwordInput').focus();
                    return;
                }

                that.initWithToken(result.body.accessToken);
            });
        },
        onUploadFavicon: function () {
            // reset the form first to make the change handler retrigger even on the same file selected
            this.$refs.uploadFavicon.value = '';
            this.$refs.uploadFavicon.click();
        },
        onResetFavicon: function () {
            // magic 'reset' token to indicate removal and reset to default
            this.settingsDialog.faviconFile = 'reset';
            this.$refs.faviconImage.src = '/_admin/logo.png';
        },
        onUpload: function () {
            // reset the form first to make the change handler retrigger even on the same file selected
            this.$refs.upload.value = '';
            this.$refs.upload.click();
        },
        onUploadFolder: function () {
            // reset the form first to make the change handler retrigger even on the same file selected
            this.$refs.uploadFolder.value = '';
            this.$refs.uploadFolder.click();
        },
        onDelete: function (entry) {
            var that = this;

              var path = encode(sanitize(that.path + '/' + entry.fileName));

              superagent.del(`/api/files${path}`).query({ access_token: localStorage.accessToken, recursive: true }).end(function (error, result) {
                  if (result && result.statusCode === 401) return that.logout();
                  if (result && result.statusCode !== 200) return that.$message.error('Error deleting file: ' + result.statusCode);
                  if (error) return that.$message.error(error.message);

                  that.refresh();
              });
        },
        onRename: function (entry, newFileName) {
            var that = this;

            var path = encode(sanitize(this.path + '/' + entry.fileName));
            var newFilePath = sanitize(this.path + '/' + newFileName);

            superagent.put(`/api/files${path}`).query({ access_token: localStorage.accessToken }).send({ newFilePath: newFilePath }).end(function (error, result) {
                if (result && result.statusCode === 401) return that.logout();
                if (result && result.statusCode !== 200) return that.$message.error('Error renaming file: ' + result.statusCode);
                if (error) return that.$message.error(error.message);

                // update in-place to avoid reload
                entry.fileName = newFileName;
                // FIXME setting this will correctly update the preview, which on some types might trigger a download on rename!
                entry.filePath = newFilePath;
            });
        },
        refreshAccessTokens: function () {
            var that = this;

            superagent.get('/api/tokens').query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                // have to create an array of objects for referencing in v-for -> input
                that.accessTokens = result.body.accessTokens.map(function (t) { return { value: t }; });
            });
        },
        onCopyToClipboard: function (value) {
            copyToClipboard(value);

            this.$toast.add({ severity:'success', summary: 'Copied to Clipboard', life: 1500 });
        },
        onCopyAccessToken: function () {
            event.target.select();
            document.execCommand('copy');

            this.$toast.add({ severity:'success', summary: 'Token copied to Clipboard', life: 1500 });
        },
        onCreateAccessToken: function () {
            var that = this;

            superagent.post('/api/tokens').query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                that.refreshAccessTokens();
            });
        },
        onDeleteAccessToken: function (token) {
          var that = this;

          this.$confirm.require({
                target: event.target,
                header: 'Delete Confirmation',
                message: 'Really delete this access token? Any actions currently using this token will fail.',
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-danger',
                accept: () => {
                    superagent.delete(`/api/tokens/${token}`).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                        if (error && !result) return that.$message.error(error.message);

                        that.refreshAccessTokens();
                    });
                },
                reject: () => {}
            });
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

            this.activeEntry = entry;
        },
        onPreviewClose: function () {
            this.activeEntry = {};
        }
    },
    mounted() {
        var that = this;

        superagent.get('/api/settings').end(function (error, result) {
            if (error) console.error(error);

            that.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
            that.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;
            that.settings.title = result.body.title || 'Surfer';
            that.settings.accessRestriction = result.body.accessRestriction || '';
            that.settings.accessPassword = result.body.accessPassword || '';

            window.document.title = that.settings.title;

            that.initWithToken(localStorage.accessToken);
        });

        // global key handler to unset activeEntry
        window.addEventListener('keyup', function () {
            // only do this if no modal is active - body classlist would be empty
            if (event.key === 'Escape' && event.target.classList.length === 0) that.activeEntry = {};
        });

        window.addEventListener('hashchange', function () {
            that.loadDirectory(decode(window.location.hash.slice(1)));
        }, false);

        // upload input event handler
        this.$refs.upload.addEventListener('change', function () {
            that.uploadFiles(that.$refs.upload.files || []);
        });

        this.$refs.uploadFolder.addEventListener('change', function () {
            that.uploadFiles(that.$refs.uploadFolder.files || []);
        });

        this.$refs.uploadFavicon.addEventListener('change', function () {
            that.settingsDialog.faviconFile = that.$refs.uploadFavicon.files[0] || null;
            if (that.settingsDialog.faviconFile) that.$refs.faviconImage.src = URL.createObjectURL(that.settingsDialog.faviconFile);
        });
    }
};

</script>

<style>

.login-container {
    max-width: 480px;
    margin: auto;
    padding: 20px;
}

hr {
    border: none;
    border-top: 1px solid #d0d0d0;
}

label {
    font-weight: bold;
}

.p-toast {
    z-index: 2000 !important;
}

</style>
