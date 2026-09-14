
import { getMimeIcon } from './mimeicons.js';

function sanitize(path) {
    path = '/' + path;
    return path.replace(/\/+/g, '/');
}

function encode(path) {
    if (!path) return '';

    return path.split('/').map(encodeURIComponent).join('/');
}

function decode(path) {
    if (!path) return '';

    return path.split('/').map(decodeURIComponent).join('/');
}

function download(entries) {
    if (!Array.isArray(entries)) entries = [ entries ];
    if (!entries.length) return;

    if (entries.length === 1 && entries[0].isFile) {
        window.location.href = encode(entries[0].filePath) + '?download';
        return;
    }

    const paths = entries.map(function (entry) { return entry.filePath; });
    const name = entries.length === 1 ? (entries[0].fileName || 'download') : 'download';

    window.location.href = '/api/zip?paths=' + encodeURIComponent(JSON.stringify(paths)) + '&name=' + encodeURIComponent(name);
}

function getPreviewUrl(entry, basePath) {
    const path = '/_admin/mime-types/';

    if (entry.isDirectory || !entry.mimeType) return path + 'inode-directory.svg';
    if (entry.mimeType.startsWith('image/')) return encode(sanitize(basePath + '/' + entry.fileName));

    return path + getMimeIcon(entry.mimeType);
}

// text subtypes the browser downloads instead of displaying inline
const NON_PREVIEW_TEXT_SUBTYPES = [ 'csv', 'csv-schema', 'tab-separated-values', 'calendar', 'vcard', 'x-vcard', 'directory', 'rtf', 'richtext' ];

function hasViewer(entry) {
    if (entry.isDirectory || !entry.mimeType) return false;
    if (entry.mimeType.startsWith('image/')) return true;
    if (entry.mimeType.startsWith('audio/')) return true;
    if (entry.mimeType.startsWith('video/')) return true;
    if (entry.mimeType === 'application/pdf') return true;
    if (entry.mimeType.startsWith('text/')) return !NON_PREVIEW_TEXT_SUBTYPES.includes(entry.mimeType.slice('text/'.length).split(';')[0].toLowerCase());

    return false;
}

function toDirectoryItems(entries, basePath, useHashNavigation) {
    return entries.map(function (entry) {
        const previewUrl = getPreviewUrl(entry, basePath);
        const href = entry.isDirectory
            ? (useHashNavigation ? '#' + encode(entry.filePath) : encode(entry.filePath) + '/')
            : encode(entry.filePath);

        return {
            ...entry,
            id: entry.filePath,
            name: entry.fileName,
            icon: previewUrl,
            previewUrl: previewUrl,
            href: href,
            size: entry.size,
            modified: new Date(entry.mtime),
            selected: false,
            focused: false
        };
    });
}

function makeCurrentFolderPreviewEntry(folderPath) {
    folderPath = folderPath ? sanitize(folderPath) : '/';
    const segments = decode(folderPath).split('/').filter(function (e) { return !!e; });
    const fileName = segments.length ? segments[segments.length - 1] : '';
    return {
        isDirectory: true,
        isFile: false,
        filePath: folderPath,
        fileName: fileName,
        previewUrl: getPreviewUrl({ isDirectory: true }, folderPath)
    };
}

const PREVIEW_PANEL_WIDTH_VW_KEY = 'surfer.previewPanelWidthVw';
const PREVIEW_PANEL_WIDTH_VW_DEFAULT = 30;
const PREVIEW_PANEL_WIDTH_VW_MIN = 15;
const PREVIEW_PANEL_WIDTH_VW_MAX = 85;

function clampPreviewPanelWidthVw(n) {
    const x = Number(n);
    if (!isFinite(x)) return PREVIEW_PANEL_WIDTH_VW_DEFAULT;
    return Math.min(PREVIEW_PANEL_WIDTH_VW_MAX, Math.max(PREVIEW_PANEL_WIDTH_VW_MIN, x));
}

function getPreviewPanelWidthVw() {
    try {
        const v = localStorage.getItem(PREVIEW_PANEL_WIDTH_VW_KEY);
        if (v === null) return PREVIEW_PANEL_WIDTH_VW_DEFAULT;
        return clampPreviewPanelWidthVw(parseFloat(v));
    } catch (e) {
        return PREVIEW_PANEL_WIDTH_VW_DEFAULT;
    }
}

function setPreviewPanelWidthVw(widthVw) {
    try {
        localStorage.setItem(PREVIEW_PANEL_WIDTH_VW_KEY, String(clampPreviewPanelWidthVw(widthVw)));
    } catch (e) { /* ignore quota / private mode */ }
}

export {
    sanitize,
    encode,
    decode,
    download,
    getPreviewUrl,
    hasViewer,
    toDirectoryItems,
    makeCurrentFolderPreviewEntry,
    getPreviewPanelWidthVw,
    setPreviewPanelWidthVw,
    clampPreviewPanelWidthVw
};
