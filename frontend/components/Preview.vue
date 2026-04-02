<template>
  <div class="container" :class="{ 'visible': entry.filePath }">
    <div style="display: flex; padding-bottom: 10px;">
      <div class="header-filename">
        <span v-if="showFilenameInHeader">{{ entry.fileName }}</span>
      </div>
      <div v-show="!closeClicked">
        <Icon icon="fa-solid fa-xmark" style="font-size: 20px; margin-right: 16px; cursor: pointer;" @click="onClose"/>
      </div>
    </div>
    <div class="preview-body">
      <div v-if="staticPreviewSrc" class="preview-folder">
        <img :src="staticPreviewSrc" alt="" class="preview-folder-image"/>
        <span v-if="entry.fileName" class="preview-static-filename">{{ entry.fileName }}</span>
      </div>
      <iframe
        v-else-if="entry.filePath"
        id="previewIframe"
        ref="iframe"
        :src="iFrameSource"
        class="preview-iframe"
        @load="onIframeLoad"
      />
    </div>
    <div class="actions">
      <Button outline v-show="entry.isFile" icon="fa-solid fa-download" @click="onDownload(entry)">Download</Button>
      <Button outline icon="fa-solid fa-arrow-up-right-from-square" :href="encode(entry.filePath)" target="_blank">Open</Button>
      <Button outline icon="fa-regular fa-copy" @click="onCopyLink(entry)">Copy Link</Button>
    </div>
  </div>
</template>

<script>

import { Button, Icon } from '@cloudron/pankow';
import { download, encode, getPreviewUrl, hasViewer, sanitize } from '../utils.js';
import { copyToClipboard } from '@cloudron/pankow/utils';

export default {
  name: 'Preview',
  components: {
    Button,
    Icon
  },
  props: {
    entry: {
      type: Object,
      default: () => {}
    }
  },
  emits: [ 'close' ],
  computed: {
    showFilenameInHeader() {
      return !!(this.entry.filePath && hasViewer(this.entry));
    },
    staticPreviewSrc() {
      var e = this.entry;
      if (!e.filePath || hasViewer(e)) return '';
      if (e.isDirectory) {
        return e.previewUrl || getPreviewUrl({ isDirectory: true }, e.filePath);
      }
      var i = e.filePath.lastIndexOf('/');
      var parent = i <= 0 ? '/' : sanitize(e.filePath.slice(0, i));
      return e.previewUrl || getPreviewUrl(e, parent);
    }
  },
  data() {
    return {
      iFrameSource: 'about:blank',
      closeClicked: false
    };
  },
  watch: {
    entry(newEntry) {
      if (newEntry.filePath) {
        this.closeClicked = false;
      }

      if (!newEntry.filePath) {
        this.iFrameSource = 'about:blank';
        return;
      }

      if (!hasViewer(newEntry)) {
        this.iFrameSource = 'about:blank';
        return;
      }

      if (!newEntry.fileName) return;

      this.iFrameSource = newEntry.previewUrl || 'about:blank';

      setTimeout(() => { this.iFrameSource = encode(newEntry.filePath); }, 100);
    }
  },
  methods: {
    encode,
    onIframeLoad(e) {
      var doc = e.target.contentWindow && e.target.contentWindow.document;
      if (!doc || !doc.body) return;

      doc.body.style.margin = 0;
      doc.body.style.display = 'flex';
      doc.body.style.justifyContent = 'center';
      doc.body.style.alignItems = 'center';
      doc.body.style.height = '100%';

      if (doc.body.firstChild) {
        doc.body.firstChild.style.maxWidth = '100%';
        doc.body.firstChild.style.maxHeight = '100%';
        doc.body.firstChild.style.margin = '0';
      }
    },
    onDownload(entry) {
      download(entry);
    },
    onCopyLink(entry) {
      copyToClipboard(location.origin + encode(entry.filePath));
      window.pankow.notify({ type:'success', text: 'Link copied to Clipboard' });
    },
    onClose() {
      this.closeClicked = true;
      this.$emit('close');
    }
  }
};

</script>

<style scoped>

.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  width: 0;
  transition: width 200ms;
  background-color: var(--pankow-color-background);
  padding: 0;
  border-left: solid 1px #e6e6e6;
}

@media (prefers-color-scheme: dark) {
  .container {
    border-left: none;
  }
}

.container.visible {
  padding: 10px 10px 0px 10px;
  width: 40%;
}

.header-filename {
  margin: auto;
  white-space: nowrap;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
}

.preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.preview-folder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 0;
  padding: 0 8px;
}

.preview-static-filename {
  max-width: 100%;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
  color: var(--pankow-color-text, inherit);
}

.preview-folder-image {
  width: 128px;
  height: 128px;
  object-fit: contain;
  vertical-align: middle;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
  min-height: 0;
}

.actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 20px;
}

@media only screen and (max-width: 767px)  {
  .container.visible {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
  }
}

</style>
