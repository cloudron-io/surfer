<template>
    <div class="container" :class="{ 'visible': entry.filePath }">
        <div class="mobile-header">
          <Button class="p-button-sm p-button-rounded p-button-text" icon="pi pi-times" @click="onClose"/>
        </div>
        <iframe id="previewIframe" ref="iframe" :src="entry.filePath" style="width: 100%; height: 100%; border: none;"></iframe>
        <center>
          <Button class="p-button-sm p-button-outlined" label="Download" icon="pi pi-download" style="margin: 10px;" @click="onDownload(entry)"/>
          <a :href="entry.filePath" target="_blank">
            <Button class="p-button-sm p-button-outlined" label="Open" icon="pi pi-external-link" style="margin: 10px;"/>
          </a>
          <Button class="p-button-sm p-button-outlined" label="Copy Link" icon="pi pi-copy" style="margin: 10px;" @click="onCopyLink(entry)"/>
        </center>
    </div>
</template>

<script>

import { download, copyToClipboard } from '../utils.js';

export default {
    name: 'Preview',
    emits: [ 'close' ],
    data() {},
    props: {
        entry: Object
    },
    methods: {
        onDownload: function (entry) {
            download(entry);
        },
        onCopyLink: function (entry) {
            copyToClipboard(location.origin + entry.filePath);

            this.$toast.add({ severity:'success', summary: 'Link copied to Clipboard', life: 1500 });
        },
        onClose: function () {
            this.$emit('close');
        }
    },
    mounted() {
        // this injects some styling for the preview once the document is loaded
        this.$refs.iframe.addEventListener('load', function (e) {
            if (!e.target.contentWindow.document.body) return;

            e.target.contentWindow.document.body.style.margin = 0;
            e.target.contentWindow.document.body.style.display = 'flex';
            e.target.contentWindow.document.body.style.justifyContent = 'center';
            e.target.contentWindow.document.body.style.alignItems = 'center';
            e.target.contentWindow.document.body.style.height = '100%';
        });
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
    background-color: #f8f9fa;
    border-left: solid 1px #e6e6e6;
    padding: 0;
}

.container.visible {
    padding: 10px 10px 0px 10px;
    width: 40%;
}

.mobile-header {
    display: none;
}

.mobile-header button {
    float: right;
}

@media only screen and (max-width: 767px)  {
    .container.visible {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
    }

    .mobile-header {
        display: block;
    }
}

</style>
