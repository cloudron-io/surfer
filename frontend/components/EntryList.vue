<template>
  <div class="loading" v-show="busy">
    <Spinner class="pankow-spinner-large"/>
  </div>
  <div class="table" v-show="!busy" @drop.stop.prevent="drop(null, $event)" @dragover.stop.prevent="dragOver(null, $event)" @dragexit="dragExit" :class="{ 'drag-active': dragActive === 'table' }" v-cloak>
    <div class="th" style="display: flex;">
      <div class="td" style="max-width: 50px;"></div>
      <div class="td hand" style="flex-grow: 2;" @click="onSort('fileName')">Name <i class="fa-solid" :class="{'fa-arrow-down-a-z': sort.desc, 'fa-arrow-up-z-a': !sort.desc }" v-show="sort.prop === 'fileName'"></i></div>
      <div class="td hand entry-meta-cell entry-size-cell" style="max-width: 100px;" @click="onSort('size')">Size <i class="fa-solid" :class="{'fa-arrow-down': sort.desc, 'fa-arrow-up': !sort.desc }" v-show="sort.prop === 'size'"></i></div>
      <div class="td hand entry-meta-cell" style="max-width: 150px;" @click="onSort('mtime')">Last Modified <i class="pi" :class="{'fa-arrow-down': sort.desc, 'fa-arrow-up': !sort.desc }" v-show="sort.prop === 'mtime'"></i></div>
      <div class="td entry-actions-cell" style="max-width: 200px; justify-content: flex-end;"></div>
    </div>
    <div class="tbody">
      <div class="tr-placeholder" v-show="entries.length === 0">Folder is empty</div>
      <div class="tr-placeholder" v-show="entries.length !== 0 && filteredAndSortedEntries.length === 0">Nothing found</div>
      <div class="tr" v-for="entry in filteredAndSortedEntries" :key="entry.fileName" @dblclick="onEntryOpen(entry, false)" @click="onEntrySelect(entry)" @drop.stop.prevent="drop(entry, $event)" @dragover.stop.prevent="dragOver(entry, $event)" :class="{ 'selected': selected.includes(entry.filePath), 'active': entry === active,  'drag-active': entry === dragActive }">
        <div class="td" style="max-width: 50px;"><img :src="entry.previewUrl" style="width: 32px; height: 32px; vertical-align: middle; object-fit: cover;"/></div>
        <div class="td entry-name-cell" style="flex-grow: 2;">
          <TextInput @click.stop @keyup.enter="onRenameSubmit(entry)" @keyup.esc="onRenameEnd(entry)" @blur="onRenameEnd(entry)" v-model="entry.filePathNew" :id="'filePathRenameInputId-' + entry.fileName" v-show="entry.rename" class="rename-input"/>
          <a v-show="!entry.rename" class="entry-name-link" :href="entryNameHref(entry)" @click="onEntryNameClick(entry, $event)" :title="entry.fileName">{{ entry.fileName }}</a>
          <div class="rename-action" v-show="editable && !entry.rename" @click.stop="onRename(entry)" v-tooltip.right="'Rename'"><Icon icon="fa-solid fa-pencil"/></div>
        </div>
        <div class="td entry-meta-cell entry-size-cell" style="max-width: 100px;">{{ prettyFileSize(entry.size) }}</div>
        <div class="td entry-meta-cell" style="max-width: 150px;"><span v-tooltip.top="prettyLongDate(entry.mtime)">{{ prettyDate(entry.mtime) }}</span></div>
        <div class="td entry-actions-cell" style="max-width: 200px; white-space: nowrap; justify-content: flex-end;">
          <span class="action-buttons">
            <Button tool outline icon="fa-solid fa-download" v-tooltip.top="'Download'" v-show="!entry.rename && entry.isFile" @click.stop="onDownload(entry)"/>
            <Button tool outline icon="fa-regular fa-copy" v-tooltip.top="'Copy Link'" v-show="!entry.rename && entry.isFile" @click.stop="onCopyLink(entry)"/>
            <Button tool outline icon="fa-solid fa-arrow-up-right-from-square" v-tooltip.top="'Open'" :href="encode(entry.filePath)" v-show="!entry.rename" target="_blank"/>
            <Button tool danger outline icon="fa-solid fa-trash" v-tooltip.top="'Delete'" v-show="editable && !entry.rename" @click.stop="onDelete(entry)"/>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, computed, onMounted, onBeforeUnmount, nextTick, inject } from 'vue';
import { prettyDate, prettyLongDate, prettyFileSize, download, encode } from '../utils.js';
import { Button, Icon, Spinner, TextInput } from '@cloudron/pankow';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

const props = defineProps({
  busy: {
    type: Boolean,
    default: false
  },
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
  },
  useHashForNavigation: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['selection-changed', 'entry-activated', 'entry-renamed', 'entry-delete', 'dropped']);

const inputDialog = inject('inputDialog', null);

const active = ref({});
const selected = ref([]);
const sort = ref({
  prop: 'fileName',
  desc: true
});
const dragActive = ref('');
const isMobileViewport = ref(false);
let mobileMediaQuery = null;
let onMobileViewportChange = null;

const filteredAndSortedEntries = computed(() => {
  function sorting(list) {
    const tmp = list.sort(function (a, b) {
      const av = a[sort.value.prop];
      const bv = b[sort.value.prop];

      if (typeof av === 'string') return (av.toUpperCase() < bv.toUpperCase()) ? -1 : 1;
      else return (av < bv) ? -1 : 1;
    });

    if (sort.value.desc) return tmp;
    return tmp.reverse();
  }

  if (props.sortFoldersFirst) {
    return sorting(props.entries.filter(function (e) { return e.isDirectory; })).concat(sorting(props.entries.filter(function (e) { return !e.isDirectory; })));
  } else {
    return sorting(props.entries);
  }
});

function onSort(prop) {
  if (sort.value.prop === prop) sort.value.desc = !sort.value.desc;
  else sort.value.prop = prop;
}

function onEntrySelect(entry) {
  selected.value = [entry.filePath];
  emit('selection-changed', props.entries.filter((e) => selected.value.includes(e.filePath)));
}

function entryNameHref(entry) {
  var path = encode(entry.filePath) + (entry.isDirectory ? '/' : '');
  if (props.useHashForNavigation && entry.isDirectory) return '#' + path;
  return path;
}

function onEntryNameClick(entry, event) {
  if (entry.rename) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (isMobileViewport.value) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onEntryOpen(entry, true);
}

function onEntryOpen(entry, select) {
  if (entry.rename) return;

  emit('entry-activated', entry);

  if (select) onEntrySelect(entry);
}

function onDownload(entry) {
  download(entry);
}

function onCopyLink(entry) {
  copyToClipboard(location.origin + encode(entry.filePath));
  window.pankow.notify({ type:'success', text: 'Link copied to Clipboard' });
}

function onRename(entry) {
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
}

function onRenameEnd(entry) {
  entry.rename = false;
}

function onRenameSubmit(entry) {
  entry.rename = false;

  if (entry.filePathNew === entry.fileName) return;

  emit('entry-renamed', entry, entry.filePathNew);
}

async function onDelete(entry) {
  if (!inputDialog?.value) return;

  const yes = await inputDialog.value.confirm({
    message: `Really delete ${entry.isDirectory ? 'folder ' : ''} ${entry.fileName}`,
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No',
    modal: false
  });

  if (!yes) return;

  emit('entry-delete', entry);
}

function dragExit() {
  dragActive.value = '';
}

function dragOver(entry, event) {
  if (!props.editable) return;

  event.dataTransfer.dropEffect = 'copy';

  if (!entry || entry.isFile) dragActive.value = 'table';
  else dragActive.value = entry;
}

function drop(entry, event) {
  if (!props.editable) return;

  dragActive.value = '';

  if (!event.dataTransfer.items[0]) return;

  if (entry && entry.isDirectory) emit('dropped', event, entry);
  else emit('dropped', event, null);
}

onMounted(() => {
  mobileMediaQuery = window.matchMedia('(max-width: 767px)');
  isMobileViewport.value = mobileMediaQuery.matches;
  onMobileViewportChange = (e) => { isMobileViewport.value = e.matches; };
  mobileMediaQuery.addEventListener('change', onMobileViewportChange);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (selected.value.length === 0) return;

      var index = filteredAndSortedEntries.value.findIndex((entry) => entry.filePath === selected.value[0]);
      if (index === -1) return;

      if (event.key === 'ArrowUp') {
        if (index === 0) return;
        onEntrySelect(filteredAndSortedEntries.value[index - 1]);
      } else {
        if (index === filteredAndSortedEntries.value.length - 1) return;
        onEntrySelect(filteredAndSortedEntries.value[index + 1]);
      }

      event.preventDefault();
    }
  });
});

onBeforeUnmount(() => {
  if (mobileMediaQuery && onMobileViewportChange) {
    mobileMediaQuery.removeEventListener('change', onMobileViewportChange);
  }
});

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
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.entry-name-cell {
  min-width: 0;
  overflow: hidden;
}

.entry-name-link {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-action {
  cursor: pointer;
  flex-shrink: 0;
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

.th > .td.entry-meta-cell {
  white-space: nowrap;
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
  display: flex;
  gap: 6px;
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
  margin: auto 0;
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

.entry-meta-cell {
  white-space: nowrap;
  flex-shrink: 0;
}

.th > .td.entry-meta-cell {
  text-align: right;
}

.tr .entry-meta-cell {
  justify-content: flex-end;
}

@media (max-width: 767px) {
  .rename-action {
    display: none;
  }

  /* Must beat `.th > .td { display: block }` or header keeps an extra column vs rows */
  .entry-actions-cell,
  .th > .td.entry-actions-cell {
    display: none;
  }

  .entry-size-cell,
  .th > .td.entry-size-cell {
    display: none;
  }
}

</style>
