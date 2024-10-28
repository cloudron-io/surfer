<template>
  <div class="loading" v-show="$parent.busy">
    <Spinner class="pankow-spinner-large"/>
  </div>
  <div class="table" v-show="!$parent.busy" @drop.stop.prevent="drop(null)" @dragover.stop.prevent="dragOver(null)" @dragexit="dragExit" :class="{ 'drag-active': dragActive === 'table' }" v-cloak>
    <div class="th" style="display: flex;">
      <div class="td" style="max-width: 50px;"></div>
      <div class="td hand" style="flex-grow: 2;" @click="onSort('fileName')">Name <i class="pi" :class="{'pi-sort-alpha-down': sort.desc, 'pi-sort-alpha-up-alt': !sort.desc }" v-show="sort.prop === 'fileName'"></i></div>
      <div class="td hand" style="max-width: 100px;" @click="onSort('size')">Size <i class="pi" :class="{'pi-sort-numeric-down': sort.desc, 'pi-sort-numeric-up-alt': !sort.desc }" v-show="sort.prop === 'size'"></i></div>
      <div class="td hand" style="max-width: 150px;" @click="onSort('mtime')">Last Modified <i class="pi" :class="{'pi-sort-numeric-down': sort.desc, 'pi-sort-numeric-up-alt': !sort.desc }" v-show="sort.prop === 'mtime'"></i></div>
      <div class="td" style="max-width: 170px; justify-content: flex-end;"></div>
    </div>
    <div class="tbody">
      <div class="tr-placeholder" v-show="entries.length === 0">Folder is empty</div>
      <div class="tr-placeholder" v-show="entries.length !== 0 && filteredAndSortedEntries.length === 0">Nothing found</div>
      <div class="tr" v-for="entry in filteredAndSortedEntries" :key="entry.fileName" @dblclick="onEntryOpen(entry, false)" @click="onEntrySelect(entry)" @drop.stop.prevent="drop(entry)" @dragover.stop.prevent="dragOver(entry)" :class="{ 'selected': selected.includes(entry.filePath), 'active': entry === active,  'drag-active': entry === dragActive }">
        <div class="td" style="max-width: 50px;"><img :src="entry.previewUrl" style="width: 32px; height: 32px; vertical-align: middle;"/></div>
        <div class="td" style="flex-grow: 2;">
          <TextInput @click.stop @keyup.enter="onRenameSubmit(entry)" @keyup.esc="onRenameEnd(entry)" @blur="onRenameEnd(entry)" v-model="entry.filePathNew" :id="'filePathRenameInputId-' + entry.fileName" v-show="entry.rename" class="rename-input"/>
          <a v-show="!entry.rename" :href="entry.filePath" @click.stop.prevent="onEntryOpen(entry, true)">{{ entry.fileName }}</a>
          <div class="rename-action" v-show="editable && !entry.rename" @click.stop="onRename(entry)" v-tooltip.right="'Rename'"><Icon icon="pi pi-pencil"/></div>
        </div>
        <div class="td" style="display: flex; max-width: 100px;">{{ prettyFileSize(entry.size) }}</div>
        <div class="td" style="display: flex; max-width: 150px;"><span v-tooltip.top="prettyLongDate(entry.mtime)">{{ prettyDate(entry.mtime) }}</span></div>
        <div class="td" style="max-width: 200px; white-space: nowrap; justify-content: flex-end;">
          <span class="action-buttons">
            <Button tool outline icon="pi pi-download" v-tooltip.top="'Download'" v-show="!entry.rename && entry.isFile" @click.stop="onDownload(entry)"/>
            <Button tool outline icon="pi pi-copy" v-tooltip.top="'Copy Link'" v-show="!entry.rename && entry.isFile" @click.stop="onCopyLink(entry)"/>
            <Button tool outline icon="pi pi-external-link" v-tooltip.top="'Open'" :href="encode(entry.filePath)" v-show="!entry.rename" target="_blank"/>
            <Button tool danger outline icon="pi pi-trash" v-tooltip.top="'Delete'" v-show="editable && !entry.rename" @click.stop="onDelete(entry)"/>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import { nextTick } from 'vue';
import { prettyDate, prettyLongDate, prettyFileSize, download, encode } from '../utils.js';
import { Button, Icon, Spinner, TextInput } from 'pankow';
import { copyToClipboard } from 'pankow/utils.js';

export default {
  name: 'EntryList',
  components: {
    Button,
    Icon,
    Spinner,
    TextInput
  },
  props: {
    editable: {
      type: Boolean,
      default: false
    },
    entries: {
      type: Array,
      default: () => []
    },
    sortFoldersFirst: {
      type: Boolean,
      default: true
    }
  },
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
  computed: {
    filteredAndSortedEntries() {
      var that = this;

      function sorting(list) {
        const tmp = list.sort(function (a, b) {
          const av = a[that.sort.prop];
          const bv = b[that.sort.prop];

          if (typeof av === 'string') return (av.toUpperCase() < bv.toUpperCase()) ? -1 : 1;
          else return (av < bv) ? -1 : 1;
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
  mounted() {
    // global key handler for up/down selection
    window.addEventListener('keydown', () => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (this.selected.length === 0) return;

        var index = this.filteredAndSortedEntries.findIndex(function (entry) { return entry.filePath === this.selected[0]; });
        if (index === -1) return;

        if (event.key === 'ArrowUp') {
          if (index === 0) return;
          this.onEntrySelect(this.filteredAndSortedEntries[index-1]);
        } else {
          if (index === this.filteredAndSortedEntries.length-1) return;
          this.onEntrySelect(this.filteredAndSortedEntries[index+1]);
        }

        // prevents scrolling the viewport
        event.preventDefault();
      }
    });
  },
  methods: {
    encode,
    prettyDate,
    prettyFileSize,
    prettyLongDate,
    onSort(prop) {
      if (this.sort.prop === prop) this.sort.desc = !this.sort.desc;
      else this.sort.prop = prop;
    },
    onEntrySelect(entry) {
      this.selected = [ entry.filePath ];
      this.$emit('selection-changed', this.entries.filter((e) => this.selected.includes(e.filePath)));
    },
    onEntryOpen(entry, select) {
      if (entry.rename) return;

      this.$emit('entry-activated', entry);

      if (select) this.onEntrySelect(entry);
    },
    onDownload(entry) {
      download(entry);
    },
    onCopyLink(entry) {
      copyToClipboard(location.origin + encode(entry.filePath));
      window.pankow.notify({ type:'success', text: 'Link copied to Clipboard' });
    },
    onRename(entry) {
      if (entry.rename) return entry.rename = false;

      entry.filePathNew = entry.fileName;
      entry.rename = true;

      nextTick(function () {
        const elem = document.getElementById('filePathRenameInputId-' + entry.fileName);
        elem.focus();

        if (typeof elem.selectionStart != "undefined") {
          elem.selectionStart = 0;
          elem.selectionEnd = entry.fileName.lastIndexOf('.');
        }
      });
    },
    onRenameEnd(entry) {
      entry.rename = false;
    },
    onRenameSubmit(entry) {
      entry.rename = false;

      if (entry.filePathNew === entry.fileName) return;

      this.$emit('entry-renamed', entry, entry.filePathNew);
    },
    async onDelete(entry) {
      const yes = await this.$root.$refs.inputDialog.confirm({
        message: `Really delete ${entry.isDirectory ? 'folder ' : ''} ${entry.fileName}`,
        confirmStyle: 'danger',
        confirmLabel: 'Yes',
        rejectLabel: 'No',
        modal: false
      });

      if (!yes) return;

      this.$emit('entry-delete', entry);
    },
    dragExit() {
      this.dragActive = '';
    },
    dragOver(entry) {
      if (!this.editable) return;

      event.dataTransfer.dropEffect = 'copy';

      if (!entry || entry.isFile) this.dragActive = 'table';
      else this.dragActive = entry;
    },
    drop(entry) {
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
  cursor: pointer;
  margin-left: 20px;
  font-size: 16px;
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
  background-color: var(--pankow-color-background-hover);
}

.action-buttons {
  visibility: hidden;
}

.tr:hover .action-buttons {
  visibility: visible;
}

.tr.active, .tr.selected {
  background-color: var(--pankow-color-background);
}

.tr-placeholder {
  width: 100%;
  text-align: center;
  margin-top: 20vh;
}

.td > a {
  color: inherit;
  margin: auto 0px;
}

.td {
  display: flex;
  flex-flow: row nowrap;
  flex-grow: 1;
  flex-basis: 0;
  padding: 0.2em;
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
