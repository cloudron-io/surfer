<template>
  <div class="loading" v-show="$parent.busy">
    <i class="pi pi-spin pi-spinner" style="fontSize: 2rem"></i>
  </div>
  <div class="table" v-show="!$parent.busy" @drop.stop.prevent="drop(null)" @dragover.stop.prevent="dragOver(null)" @dragexit="dragExit" :class="{ 'drag-active': dragActive === 'table' }" v-cloak>
    <div class="th p-d-none p-d-md-flex">
      <div class="td" style="max-width: 50px;"></div>
      <div class="td hand" style="flex-grow: 2;" @click="onSort('fileName')">Name <i class="pi" :class="{'pi-sort-alpha-down': sort.desc, 'pi-sort-alpha-up-alt': !sort.desc }" v-show="sort.prop === 'fileName'"></i></div>
      <div class="td hand" style="max-width: 100px;" @click="onSort('size')">Size <i class="pi" :class="{'pi-sort-numeric-down': sort.desc, 'pi-sort-numeric-up-alt': !sort.desc }" v-show="sort.prop === 'size'"></i></div>
      <div class="td hand" style="max-width: 150px;" @click="onSort('mtime')">Last Modified <i class="pi" :class="{'pi-sort-numeric-down': sort.desc, 'pi-sort-numeric-up-alt': !sort.desc }" v-show="sort.prop === 'mtime'"></i></div>
      <div class="td" style="max-width: 140px; justify-content: flex-end;"></div>
    </div>
    <div class="tbody">
      <div class="tr-placeholder" v-show="entries.length === 0">Folder is empty</div>
      <div class="tr-placeholder" v-show="entries.length !== 0 && filteredAndSortedEntries.length === 0">Nothing found</div>
      <div class="tr" v-for="entry in filteredAndSortedEntries" :key="entry.fileName" @dblclick="onEntryOpen(entry, false)" @click="onEntrySelect(entry)" @drop.stop.prevent="drop(entry)" @dragover.stop.prevent="dragOver(entry)" :class="{ 'selected': selected.includes(entry.filePath), 'active': entry === active,  'drag-active': entry === dragActive }">
        <div class="td" style="max-width: 50px;"><img :src="entry.previewUrl" style="width: 32px; height: 32px; vertical-align: middle;"/></div>
        <div class="td" style="flex-grow: 2;">
          <InputText @keyup.enter="onRenameSubmit(entry)" @keyup.esc="onRenameEnd(entry)" @blur="onRenameEnd(entry)" v-model="entry.filePathNew" :id="'filePathRenameInputId-' + entry.fileName" v-show="entry.rename" class="rename-input"/>
          <a v-show="!entry.rename" :href="entry.filePath" @click.stop.prevent="onEntryOpen(entry, true)">{{ entry.fileName }}</a>
          <Button class="p-button-sm p-button-rounded p-button-text rename-action" icon="pi pi-pencil" v-show="editable && !entry.rename" @click.stop="onRename(entry)"/>
        </div>
        <div class="td p-d-none p-d-md-flex" style="max-width: 100px;">{{ prettyFileSize(entry.size) }}</div>
        <div class="td p-d-none p-d-md-flex" style="max-width: 150px;"><span v-tooltip.top="prettyLongDate(entry.mtime)">{{ prettyDate(entry.mtime) }}</span></div>
        <div class="td" style="max-width: 140px; justify-content: flex-end;">
          <span class="action-buttons">
              <Button class="p-button-sm p-button-rounded p-button-text" icon="pi pi-download" v-tooltip.top="'Download'" v-show="!entry.rename && entry.isFile" @click.stop="onDownload(entry)"/>
              <Button class="p-button-sm p-button-rounded p-button-text" icon="pi pi-copy" v-tooltip.top="'Copy Link'" v-show="!entry.rename && entry.isFile" @click.stop="onCopyLink(entry)"/>
              <a :href="entry.filePath" target="_blank" @click.stop>
                <Button class="p-button-sm p-button-rounded p-button-text" icon="pi pi-external-link" v-tooltip.top="'Open'" v-show="!entry.rename"/>
              </a>
              <Button class="p-button-sm p-button-rounded p-button-danger p-button-text" icon="pi pi-trash" v-tooltip.top="'Delete'" v-show="editable && !entry.rename" @click.stop="onDelete(entry)"/>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import { nextTick } from 'vue';
import { prettyDate, prettyLongDate, prettyFileSize, download, encode, copyToClipboard } from '../utils.js';

export default {
    name: 'EntryList',
    emits: [ 'selection-changed', 'entry-activated', 'entry-renamed', 'entry-delete', 'dropped' ],
    data() {
        return {
            active: {},
            selected: [],
            sort: {
                prop: 'fileName',
                desc: true
            },
            dragActive: ''
        };
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
        prettyDate,
        prettyFileSize,
        prettyLongDate,
        onSort: function (prop) {
            if (this.sort.prop === prop) this.sort.desc = !this.sort.desc;
            else this.sort.prop = prop;
        },
        onEntrySelect: function (entry) {
            var that = this;
            // TODO handle multiselect here

            this.selected = [];

            if (!this.selected.includes(entry.filePath)) this.selected.push(entry.filePath);

            var selectedEntries = this.entries.filter(function (e) { return that.selected.includes(e.filePath); });
            this.$emit('selection-changed', selectedEntries);
        },
        onEntryOpen: function (entry, select) {
            if (entry.rename) return;

            this.$emit('entry-activated', entry);

            if (select) this.onEntrySelect(entry);
        },
        onDownload: function (entry) {
            download(entry);
        },
        onCopyLink: function (entry) {
            copyToClipboard(location.origin + encode(entry.filePath));
            this.$toast.add({ severity:'success', summary: 'Link copied to Clipboard', life: 1500 });
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
        },
        onDelete: function (entry) {
            var that = this;

            this.$confirm.require({
                target: event.target,
                header: 'Delete Confirmation',
                message: 'Really delete ' + (entry.isDirectory ? 'folder ' : '') + entry.fileName,
                icon: 'pi pi-exclamation-triangle',
                acceptClass: 'p-button-danger',
                accept: () => {
                    that.$emit('entry-delete', entry);
                },
                reject: () => {}
            });
        },
        dragExit: function () {
            this.dragActive = '';
        },
        dragOver: function (entry) {
            if (!this.editable) return;

            event.dataTransfer.dropEffect = 'copy';

            if (!entry || entry.isFile) this.dragActive = 'table';
            else this.dragActive = entry;
        },
        drop: function (entry) {
            if (!this.editable) return;

            this.dragActive = '';

            if (!event.dataTransfer.items[0]) return;

            if (entry && entry.isDirectory) this.$emit('dropped', event, entry);
            else this.$emit('dropped', event, null);
        }
    }
};

</script>

<style scoped>

.loading {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
}

.table {
    display: flex;
    flex-flow: column nowrap;
    flex: 1 1 auto;
    margin: 10px;
    transition: background-color 200ms, color 200ms;
    border-radius: 3px;
}

.tbody {
    overflow-x: hidden;
    overflow-y: auto;
}

.drag-active {
    background-color: #2196f3;
    color: white;
}

.rename-input {
    width: 100%;
}

.rename-action {
    margin-left: 20px;
}

.tr .rename-action {
    visibility: hidden;
}

.tr:hover .rename-action {
    visibility: visible;
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
    border-radius: 3px;
    cursor: default;
}

.tr:hover {
    background-color: #f5f7fa;
}

.action-buttons {
    visibility: hidden;
}

.tr:hover .action-buttons {
    /*display: inline-block;*/
    visibility: visible;
}

.tr.active, .tr.selected {
    background-color: #dbedfb;
}

.tr-placeholder {
    width: 100%;
    text-align: center;
    margin-top: 20vh;
}

.td > a {
    color: inherit;
}

.td {
    display: flex;
    flex-flow: row nowrap;
    flex-grow: 1;
    flex-basis: 0;
    padding: 0.5em;
    min-width: 0px;
    margin: auto;
}

.th > .td {
    display: block;
    user-select: none;
}

.hand {
    cursor: pointer;
}

</style>
