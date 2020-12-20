<template>
    <div class="container" :class="{ 'visible': entry.filePath }">
        <iframe id="previewIframe" ref="iframe" :src="entry.filePath" style="width: 100%; height: 100%; border: none;"></iframe>
        <center>
          <Button class="p-button-sm" label="Download" icon="pi pi-download" style="margin: 10px;" @click.stop="onDownload(entry)"/>
          <a :href="entry.filePath" target="_blank">
            <Button class="p-button-sm" label="Open" icon="pi pi-external-link" style="margin: 10px;"/>
          </a>
        </center>
    </div>
</template>

<script>

import { download } from '../utils.js';

export default {
    name: 'Preview',
    emits: [ 'download' ],
    data() {},
    props: {
        entry: Object
    },
    methods: {
        onDownload: function (entry) {
            download(entry);
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
}

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

</style>
