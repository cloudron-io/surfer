<template>
  <div class="usage-view">
    <div class="usage-content">
      <div class="header">
        <h1>Usage</h1>
      </div>

      <SectionItem title="WebDAV">
        <p class="webdav-intro">Mount the site as a network folder. Sign in with an API access token as the password. The username is ignored.</p>
        <ul class="webdav-instructions">
          <li><b>Windows:</b> Explorer &gt; This PC &gt; Map Network Drive &gt; <code @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
          <li><b>macOS:</b> Finder &gt; Go &gt; Connect to Server... &gt; <code @click="onCopyToClipboard(origin + '/_webdav/')">{{ origin }}/_webdav/</code></li>
          <li><b>GNOME:</b> Files &gt; Other Locations &gt; Connect to Server &gt; <code @click="onCopyToClipboard('davs://' + domain + '/_webdav/')">davs://{{ domain }}/_webdav/</code></li>
          <li><b>KDE:</b> Dolphin &gt; Ctrl+L &gt; <code @click="onCopyToClipboard('webdav://' + domain + '/_webdav/')">webdav://{{ domain }}/_webdav/</code></li>
        </ul>
      </SectionItem>
    </div>
  </div>
</template>

<script setup>

import { SectionItem } from '@cloudron/pankow';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

const origin = window.location.origin;
const domain = window.location.host;

function onCopyToClipboard(value) {
  copyToClipboard(value);
  window.pankow.notify({ type: 'success', text: 'Copied to clipboard' });
}

</script>

<style scoped>

.usage-view {
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px 24px;
  overflow-y: auto;
}

.usage-content {
  max-width: 1100px;
  width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
}

.webdav-intro {
  margin: 0 0 16px;
  font-size: 14px;
}

.webdav-instructions {
  margin: 0;
  padding-left: 20px;
}

.webdav-instructions li {
  margin-bottom: 6px;
}

.webdav-instructions code {
  cursor: copy;
}

</style>
