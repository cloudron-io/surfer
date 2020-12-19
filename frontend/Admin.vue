<template>
  <input type="file" ref="upload" style="display: none" multiple/>
  <input type="file" ref="uploadFolder" style="display: none" multiple webkitdirectory directory/>

  <div class="login-container" v-show="ready && !session.valid">
    <form @submit="onLogin" @submit.prevent>
      <h1>Login</h1>
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
      <Button type="submit" label="Login" @click="onLogin"/>
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
          <span class="p-buttonset">
            <Button class="p-button-sm" label="Upload File" icon="pi pi-upload" @click="onUpload"/>
            <Button class="p-button-sm" label="Upload Folder" icon="pi pi-cloud-upload" @click="onUploadFolder"/>
            <Button class="p-button-sm" label="New Folder" icon="pi pi-plus" @click="openNewFolderDialog"/>
          </span>
          <Button icon="pi pi-ellipsis-h" class="p-ml-2 p-button-sm p-button-outlined" @click="toggleMenu"/>
          <Menu ref="menu" :model="mainMenu" :popup="true"/>
        </template>
      </Toolbar>
    </div>
    <div class="main-container-body">
      <div class="main-container-content">
        <EntryList :entries="entries" :sort-folders-first="settings.sortFoldersFirst" @entry-activated="onEntryOpen" editable/>
      </div>
      <Preview :entry="activeEntry" @download="onDownload"/>
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
  <Dialog v-model:visible="settingsDialog.visible" header="Settings" :modal="true" :closable="false" :style="{width: '50vw'}">
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
      <div class="p-field-checkbox">
        <Checkbox id="sortShowFoldersFirst" v-model="settingsDialog.sortFoldersFirst" :binary="true"/>
        <label for="sortShowFoldersFirst">Always show folders first</label>
      </div>
    </div>

    <hr/>

    <div>
      <h3>WebDAV access</h3>
      <p>WebDAV provides a framework for users to create, change and move documents on a server.</p>
      <ul>
        <li>Windows: <a href="/_webdav/" target="_blank">{{ origin }}/_webdav/</a></li>
        <li>MacOS: <a href="/_webdav/" target="_blank">{{ origin }}/_webdav/</a></li>
        <li>Gnome: <a :href="'davs://' + domain  + '/_webdav/'" target="_blank">davs://{{ domain }}/_webdav/</a></li>
        <li>KDE: <a href="/_webdav/" target="_blank">{{ origin }}/_webdav/</a></li>
      </ul>
    </div>

    <template #footer>
      <Button label="Close" icon="pi pi-times" class="p-button-text" @click="settingsDialog.visible = false" :disabled="settingsDialog.busy"/>
      <Button label="Save" icon="pi pi-check" class="p-button-text p-button-success" @click="onSaveSettingsDialog" :disabled="settingsDialog.busy"/>
    </template>
  </Dialog>

  <!-- Access Token Dialog -->
  <Dialog v-model:visible="accessTokenDialog.visible" header="Access Tokens" :modal="true" :closable="false" :style="{width: '50vw'}">
    Access tokens are useful to programmatically deploy assets for example within a CI/CD pipeline.
    See the <a href="https://cloudron.io/documentation/apps/surfer/" target="_blank">docs</a> for more information on how to use this token.
    <br/>
    <br/>
    <Message severity="warn" :closable="false">Tokens are shared between all users.</Message>
    <br/>
    <div class="p-fluid">
      <div v-for="accessToken in accessTokens" :key="accessToken" class="p-grid">
        <div class="p-col">
          <span class="p-input-icon-right">
            <i class="pi pi-copy"></i>
            <InputText type="text" class="p-inputtext-sm" model="{{ accessToken }}" @click="onCopyAccessToken" readonly style="cursor: copy !important;" v-tooltip.top.focus="'Token copied to clipboard'"/>
          </span>
        </div>
        <div class="p-col-fixed">
          <!-- <p-confirmpopup></p-confirmpopup> -->
          <Button class="p-col-12 p-button-sm p-button-danger" icon="pi pi-trash" @click="onDeleteAccessToken(accessToken, $event)"/>
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
  <Dialog header="New Foldername" v-model:visible="newFolderDialog.visible" :closable="false" :style="{width: '350px'}" :modal="true">
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
  <Dialog header="About Cloudron Surfer" v-model:visible="aboutDialog.visible" :closable="false" :style="{width: '450px'}" :modal="true">
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
import { sanitize, encode, decode, getPreviewUrl, getExtension } from './utils.js';

const ORIGIN = window.location.origin;

// poor man's async
function asyncForEach(items, handler, callback) {
    var cur = 0;

    if (items.length === 0) return callback();

    (function iterator() {
        handler(items[cur], function (error) {
            if (error) return callback(error);
            if (cur >= items.length-1) return callback();
            ++cur;

            iterator();
        });
    })();
}

export default {
    name: 'Admin',
    data() {
        return {
            ready: false,
            busy: false,
            origin: ORIGIN,
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
                sortFoldersFirst: false
            },
            settingsDialog: {
                visible: false,
                busy: false,
                // settings copy for modification
                folderListingEnabled: false,
                sortFoldersFirst: false
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
        }
    },
    components: {
    },
    methods: {
        initWithToken (accessToken) {
            var that = this;

            if (!accessToken) {
                this.ready = true;
                return;
            }

            superagent.get(`${that.origin}/api/profile`).query({ access_token: accessToken }).end(function (error, result) {
                that.ready = true;

                if (error && !error.response) return console.error(error);
                if (result.statusCode !== 200) {
                    delete localStorage.accessToken;
                    return;
                }

                localStorage.accessToken = accessToken;
                that.session.username = result.body.username;
                that.session.valid = true;

                superagent.get(`${that.origin}/api/settings`).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                    if (error) console.error(error);

                    that.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
                    that.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;

                    that.loadDirectory(decode(window.location.hash.slice(1)));

                    that.refreshAccessTokens();
                });
            });
        },
        toggleMenu: function (event) {
            this.$refs.menu.toggle(event);
        },
        loadDirectory (folderPath) {
            var that = this;

            that.busy = true;

            that.activeEntry = {};

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
        logout () {
            var that = this;

            superagent.post(`${that.origin}/api/logout`).query({ access_token: localStorage.accessToken }).end(function (error) {
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
        refresh () {
            this.loadDirectory(this.path);
        },
        uploadFiles (files) {
            var that = this;

            if (!files || !files.length) return;

            that.uploadStatus.busy = true;
            that.uploadStatus.count = files.length;
            that.uploadStatus.size = 0;
            that.uploadStatus.done = 0;
            that.uploadStatus.percentDone = 0;

            for (var i = 0; i < files.length; ++i) {
                that.uploadStatus.size += files[i].size;
            }

            asyncForEach(files, function (file, callback) {
                var path = encode(sanitize(that.path + '/' + (file.webkitRelativePath || file.name)));

                var formData = new FormData();
                formData.append('file', file);

                var finishedUploadSize = that.uploadStatus.done;

                superagent.post(`${that.origin}/api/files${path}`)
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
        dragOver (event) {
            event.stopPropagation();
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        },
        drop(event) {
            var that = this;

            event.stopPropagation();
            event.preventDefault();

            if (!event.dataTransfer.items[0]) return;

            // figure if a folder was dropped on a modern browser, in this case the first would have to be a directory
            var folderItem;
            try {
                folderItem = event.dataTransfer.items[0].webkitGetAsEntry();
                if (folderItem.isFile) return that.uploadFiles(event.dataTransfer.files);
            } catch (e) {
                return that.uploadFiles(event.dataTransfer.files);
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
                        asyncForEach(entries, function (entry, callback) {
                            traverseFileTree(entry, path + item.name + '/', callback);
                        }, callback);
                    });
                }
            }

            traverseFileTree(folderItem, '', function (error) {
                that.uploadStatus.busy = false;
                that.uploadStatus.uploadListCount = 0;

                if (error) return console.error(error);

                that.uploadFiles(fileList);
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

            superagent.post(`${that.origin}/api/files${path}`).query({ access_token: localStorage.accessToken, directory: true }).end(function (error, result) {
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
        },
        onSaveSettingsDialog: function () {
            var that = this;

            this.settingsDialog.busy = true;

            // save here
            var data = {
                folderListingEnabled: this.settingsDialog.folderListingEnabled,
                sortFoldersFirst: this.settingsDialog.sortFoldersFirst
            };

            superagent.put(`${that.origin}/api/settings`).send(data).query({ access_token: localStorage.accessToken }).end(function (error) {
                if (error) return console.error(error);

                // after success, copy to app
                that.settings.folderListingEnabled = data.folderListingEnabled;
                that.settings.sortFoldersFirst = data.sortFoldersFirst;

                that.settingsDialog.busy = false;
                that.settingsDialog.visible = false;
            });
        },
        onLogin: function () {
            var that = this;

            that.loginData.busy = true;
            that.loginData.error = false;

            superagent.post(`${that.origin}/api/login`).send({ username: that.loginData.username, password: that.loginData.password }).end(function (error, result) {
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
        onDownload: function (entry) {
            if (entry.isDirectory) return;
            window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.fileName)) + '?access_token=' + localStorage.accessToken;
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

            var title = 'Really delete ' + (entry.isDirectory ? 'folder ' : '') + entry.fileName;
            this.$confirm('', title, { confirmButtonText: 'Yes', cancelButtonText: 'No' }).then(function () {
                var path = encode(sanitize(that.path + '/' + entry.fileName));

                superagent.del(`${that.origin}/api/files${path}`).query({ access_token: localStorage.accessToken, recursive: true }).end(function (error, result) {
                    if (result && result.statusCode === 401) return that.logout();
                    if (result && result.statusCode !== 200) return that.$message.error('Error deleting file: ' + result.statusCode);
                    if (error) return that.$message.error(error.message);

                    that.refresh();
                });
            }).catch(function () {});
        },
        onRename: function (entry) {
            if (entry.rename) return entry.rename = false;

            entry.filePathNew = entry.fileName;
            entry.rename = true;

            // Vue.nextTick(function () {
            //     var elem = document.getElementById('filePathRenameInputId-' + entry.fileName);
            //     elem.focus();

            //     if (typeof elem.selectionStart != "undefined") {
            //         elem.selectionStart = 0;
            //         elem.selectionEnd = entry.fileName.lastIndexOf('.');
            //     }
            // });
        },
        onRenameEnd: function (entry) {
            entry.rename = false;
        },
        onRenameSubmit: function (entry) {
            var that = this;

            entry.rename = false;

            if (entry.filePathNew === entry.fileName) return;

            var path = encode(sanitize(this.path + '/' + entry.fileName));
            var newFilePath = sanitize(this.path + '/' + entry.filePathNew);

            superagent.put(`${that.origin}/api/files${path}`).query({ access_token: localStorage.accessToken }).send({ newFilePath: newFilePath }).end(function (error, result) {
                if (result && result.statusCode === 401) return that.logout();
                if (result && result.statusCode !== 200) return that.$message.error('Error renaming file: ' + result.statusCode);
                if (error) return that.$message.error(error.message);

                entry.fileName = entry.filePathNew;
            });
        },
        refreshAccessTokens: function () {
            var that = this;

            superagent.get(`${that.origin}/api/tokens`).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                that.accessTokens = result.body.accessTokens;
            });
        },
        onCopyAccessToken: function (event) {
            event.target.select();
            document.execCommand('copy');
        },
        onCreateAccessToken: function () {
            var that = this;

            superagent.post(`${that.origin}/api/tokens`).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                that.refreshAccessTokens();
            });
        },
        onDeleteAccessToken: function (/*token*/) {
            // var that = this;

            // this.$confirm.require({
            //     message: 'Really delete this access token?',
            //     icon: 'pi pi-exclamation-triangle',
            //     accept: () => {
            //         //callback to execute when user confirms the action
            //     },
            //     reject: () => {
            //         //callback to execute when user rejects the action
            //     }
            // });

            // this.$confirm('All actions from apps using this token will fail!', 'Really delete this access token?', { confirmButtonText: 'Yes Delete', cancelButtonText: 'No' }).then(function () {
            //     superagent.delete(`${that.origin}/api/tokens/${token}`).query({ access_token: localStorage.accessToken }).end(function (error, result) {
            //         if (error && !result) return that.$message.error(error.message);

            //         that.refreshAccessTokens();
            //     });
            // }).catch(function () {});

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
        }
    },
    mounted() {
        var that = this;

        that.initWithToken(localStorage.accessToken);

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
    }
};

</script>

<style></style>
