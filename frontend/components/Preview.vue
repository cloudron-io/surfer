<template>
  <div class="container" :class="{ 'visible': entry.filePath }">
    <div style="display: flex; padding-bottom: 10px;">
      <div class="header-filename">
        {{ entry.fileName }}
      </div>
      <div>
        <Icon icon="fa-solid fa-xmark" style="font-size: 20px; margin-right: 16px; cursor: pointer;" @click="onClose"/>
      </div>
    </div>
    <iframe id="previewIframe" ref="iframe" :src="iFrameSource" style="width: 100%; height: 100%; border: none;"></iframe>
    <div class="actions">
      <Button outline v-show="entry.isFile" icon="fa-solid fa-download" @click="onDownload(entry)">Download</Button>
      <Button outline icon="fa-solid fa-arrow-up-right-from-square" :href="encode(entry.filePath)" target="_blank">Open</Button>
      <Button outline icon="fa-regular fa-copy" @click="onCopyLink(entry)">Copy Link</Button>
    </div>
  </div>
</template>

<script>

import { Button, Icon } from 'pankow';
import { download, encode, hasViewer } from '../utils.js';
import { copyToClipboard } from 'pankow/utils';

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
  data() {
    return {
      iFrameSource: 'about:blank'
    };
  },
  watch: {
    entry(newEntry) {
      if (!newEntry.fileName) return;

      this.iFrameSource = newEntry.previewUrl || 'about:blank';

      if (newEntry.isDirectory || !hasViewer(newEntry)) return;

      setTimeout(() => { this.iFrameSource = encode(newEntry.filePath); }, 100);
    }
  },
  mounted() {
    // this injects some styling for the preview once the document is loaded
    this.$refs.iframe.addEventListener('load', (e) => {
      if (!e.target.contentWindow.document.body) return;

      e.target.contentWindow.document.body.style.margin = 0;
      e.target.contentWindow.document.body.style.display = 'flex';
      e.target.contentWindow.document.body.style.justifyContent = 'center';
      e.target.contentWindow.document.body.style.alignItems = 'center';
      e.target.contentWindow.document.body.style.height = '100%';

      // this will ensure the content for example img is scaled
      if (e.target.contentWindow.document.body.firstChild) {
        e.target.contentWindow.document.body.firstChild.style.maxWidth = '100%';
        e.target.contentWindow.document.body.firstChild.style.maxHeight = '100%';
        e.target.contentWindow.document.body.firstChild.style.margin = '0';
      }
    });
  },
  methods: {
    encode,
    onDownload(entry) {
      download(entry);
    },
    onCopyLink(entry) {
      copyToClipboard(location.origin + encode(entry.filePath));
      window.pankow.notify({ type:'success', text: 'Link copied to Clipboard' });
    },
    onClose() {
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
}

.actions {
  text-align: center;
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
