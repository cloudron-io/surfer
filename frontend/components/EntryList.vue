<template>
  <div class="table">
    <div class="th">
      <div class="td" style="max-width: 50px;">Type</div>
      <div class="td" style="flex-grow: 2;">Name</div>
      <div class="td" style="max-width: 100px;">Size</div>
      <div class="td" style="max-width: 150px;">Last Modified</div>
      <div class="td" style="max-width: 100px; justify-content: right;">Actions</div>
    </div>
    <div class="tbody" style="overflow: auto;">
      <div class="tr-placeholder" v-show="entries.length === 0">Folder is empty</div>
      <div class="tr-placeholder" v-show="entries.length !== 0 && filteredAndSortedEntries.length === 0">Nothing found</div>
      <div class="tr" v-for="entry in filteredAndSortedEntries" :key="entry.fileName" @click="onEntryOpen(entry)" :class="{ 'active': (entry === active) }">
        <div class="td" style="max-width: 50px;"><img :src="entry.previewUrl" style="width: 32px; height: 32px; vertical-align: middle;"/></div>
        <div class="td" style="flex-grow: 2;">
          <InputText @keyup.enter="onRenameSubmit(entry)" @keyup.esc="onRenameEnd(entry)" @blur="onRenameEnd(entry)" v-model="entry.filePathNew" :id="'filePathRenameInputId-' + entry.fileName" v-show="entry.rename" class="rename-input"/>
          <span v-show="!entry.rename">{{ entry.fileName }}</span>
          <Button class="p-button-sm p-button-rounded p-button-text rename-action" icon="pi pi-pencil" v-show="editable && !entry.rename" @click.stop="onRename(entry)"/>
        </div>
        <div class="td" style="max-width: 100px;">{{ prettyFileSize(entry.size) }}</div>
        <div class="td" style="max-width: 150px;">{{ prettyDate(entry.mtime) }}</div>
        <div class="td" style="max-width: 100px; justify-content: right;">
          <Button class="p-button-sm p-button-rounded p-button-text" icon="pi pi-download" v-show="!entry.rename && entry.isFile" @click.stop="onDownload(entry)"/>
          <Button class="p-button-sm p-button-rounded p-button-danger p-button-text" icon="pi pi-trash" v-show="editable && !entry.rename" @click.stop="onDelete(entry)"/>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import { nextTick } from 'vue';
import { prettyDate, prettyFileSize, download } from '../utils.js';

export default {
    name: 'EntryList',
    emits: [ 'entry-activated', 'entry-renamed' ],
    data() {
        return {
            active: {},
            sort: {
                prop: 'fileName',
                desc: true
            }
        }
    },
    props: {
        editable: {
            type: Boolean,
            default: false
        },
        entries: Array,
        sortFoldersFirst: {
            type: Boolean,
            default: true
        }
    },
    computed: {
        filteredAndSortedEntries: function () {
            var that = this;

            function sorting(list) {
                var tmp = list.sort(function (a, b) {
                    return (a[that.sort.prop] < b[that.sort.prop]) ? -1 : 1;
                });

                if (that.sort.desc) return tmp;
                return tmp.reverse();
            }

            if (this.sortFoldersFirst) {
                return sorting(this.entries.filter(function (e) { return e.isDirectory; })).concat(sorting(this.entries.filter(function (e) { return !e.isDirectory; })));
            } else {
                return sorting(this.entries);
            }
        }
    },
    methods: {
        prettyDate: prettyDate,
        prettyFileSize: prettyFileSize,
        onEntryOpen: function (entry) {
            if (entry.rename) return;
            this.$emit('entry-activated', entry);
        },
        onDownload: function (entry) {
            download(entry);
        },
        onRename: function (entry) {
            if (entry.rename) return entry.rename = false;

            entry.filePathNew = entry.fileName;
            entry.rename = true;

            nextTick(function () {
                var elem = document.getElementById('filePathRenameInputId-' + entry.fileName);
                elem.focus();

                if (typeof elem.selectionStart != "undefined") {
                    elem.selectionStart = 0;
                    elem.selectionEnd = entry.fileName.lastIndexOf('.');
                }
            });
        },
        onRenameEnd: function (entry) {
            entry.rename = false;
        },
        onRenameSubmit: function (entry) {
            entry.rename = false;

            if (entry.filePathNew === entry.fileName) return;

            this.$emit('entry-renamed', entry, entry.filePathNew);
        }
    }
}

</script>

<style scoped>

.table {
    display: flex;
    flex-flow: column nowrap;
    flex: 1 1 auto;
    margin: 0 10px;
}

.th {
    font-weight: 700;
    width: 100%;
    display: flex;
    flex-flow: row nowrap;
}

.th > .td {
    white-space: normal;
}

.tr {
    width: 100%;
    display: flex;
    flex-flow: row nowrap;
    cursor: pointer;
    border-radius: 3px;
}

.tr:hover {
    background-color: #f5f7fa;
}

.tr.active {
    background-color: #dbedfb;
}

.tr-placeholder {
    width: 100%;
    text-align: center;
    margin-top: 20vh;
}

.td {
    display: flex;
    flex-flow: row nowrap;
    flex-grow: 1;
    flex-basis: 0;
    padding: 0.5em;
    line-height: 2.3rem;
    min-width: 0px;
}

</style>
