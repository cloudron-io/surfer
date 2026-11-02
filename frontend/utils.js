
import { getMimeIcon } from './mimeicons.js';

const MAX_EDITABLE_FILE_SIZE = 5 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
    '.atom', '.babelrc', '.c', '.cfg', '.cjs', '.conf', '.cpp', '.css', '.csv', '.editorconfig', '.env',
    '.eslintrc', '.gitignore', '.go', '.gql', '.graphql', '.h', '.hpp', '.htm', '.html', '.htaccess',
    '.htpasswd', '.ini', '.java', '.js', '.json', '.jsonc', '.jsx', '.kt', '.less', '.lua', '.md',
    '.markdown', '.mjs', '.npmrc', '.nvmrc', '.php', '.pl', '.prettierrc', '.properties', '.py', '.rb',
    '.rs', '.rss', '.sass', '.scss', '.sh', '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx', '.txt',
    '.vue', '.xml', '.yaml', '.yml', '.zsh'
]);

const TEXT_FILENAMES = new Set([
    '.editorconfig', '.env', '.gitignore', '.htaccess', '.htpasswd', 'cname', 'dockerfile', 'license',
    'makefile', 'procfile', 'readme'
]);

const TEXT_MIME_TYPES = new Set([
    'application/atom+xml', 'application/ecmascript', 'application/graphql', 'application/json',
    'application/ld+json', 'application/rss+xml', 'application/sql', 'application/toml',
    'application/x-core', 'application/x-dockerfile', 'application/x-httpd-php', 'application/x-javascript',
    'application/x-lua', 'application/x-makefile', 'application/x-ndjson', 'application/x-perl',
    'application/x-php', 'application/x-python', 'application/x-ruby', 'application/x-sh',
    'application/x-shellscript', 'application/x-yaml', 'application/xml', 'application/xhtml+xml',
    'application/yaml'
]);

const BINARY_MIME_TYPES = new Set([
    'application/gzip', 'application/pdf', 'application/wasm', 'application/x-7z-compressed',
    'application/x-bzip2', 'application/x-gzip', 'application/x-rar-compressed', 'application/x-tar',
    'application/zip'
]);

function isBinaryMimeType(mimeType) {
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/') || mimeType.startsWith('font/')) return true;
    return BINARY_MIME_TYPES.has(mimeType);
}

function isTextFile(entry) {
    if (!entry || entry.isDirectory || entry.isFile === false || !entry.fileName) return false;

    const mimeType = (entry.mimeType || '').split(';')[0].trim().toLowerCase();
    if (isBinaryMimeType(mimeType)) return false;

    const fileName = entry.fileName.toLowerCase();
    if (TEXT_FILENAMES.has(fileName)) return true;

    const extensionIndex = fileName.lastIndexOf('.');
    if (extensionIndex !== -1 && TEXT_EXTENSIONS.has(fileName.slice(extensionIndex))) return true;

    if (mimeType.startsWith('text/')) return true;

    return TEXT_MIME_TYPES.has(mimeType);
}

function canEditTextFile(entry) {
    return isTextFile(entry) && (entry.size || 0) <= MAX_EDITABLE_FILE_SIZE;
}

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

function fileApiUrl(filePath, deployment, inline) {
    const params = new URLSearchParams();
    if (deployment) params.set('deployment', deployment);
    if (inline) params.set('inline', '1');
    const query = params.toString();
    return '/api/files' + encode(filePath) + (query ? '?' + query : '');
}

function siteOrigin(domain) {
    if (!domain || domain === 'localhost') return location.origin;
    return 'https://' + domain;
}

function publicFileUrl(domain, filePath) {
    return siteOrigin(domain) + encode(filePath || '/');
}

function download(entries) {
    if (!Array.isArray(entries)) entries = [ entries ];
    if (!entries.length) return;

    const deployment = entries[0].deployment || '';

    if (entries.length === 1 && entries[0].isFile) {
        if (deployment) {
            window.location.href = fileApiUrl(entries[0].filePath, deployment, false);
            return;
        }
        window.location.href = encode(entries[0].filePath) + '?download';
        return;
    }

    const paths = entries.map(function (entry) { return entry.filePath; });
    const name = entries.length === 1 ? (entries[0].fileName || 'download') : 'download';
    let url = '/api/zip?paths=' + encodeURIComponent(JSON.stringify(paths)) + '&name=' + encodeURIComponent(name);
    if (deployment) url += '&deployment=' + encodeURIComponent(deployment);
    window.location.href = url;
}

function getPreviewUrl(entry, basePath, deployment) {
    const iconPath = '/_admin/mime-types/';

    if (entry.isDirectory || !entry.mimeType) return iconPath + 'inode-directory.svg';
    if (entry.mimeType.startsWith('image/') && entry.mimeType !== 'image/vnd.adobe.photoshop') {
        const filePath = sanitize(basePath + '/' + entry.fileName);
        if (deployment) return fileApiUrl(filePath, deployment, true);
        return encode(filePath);
    }

    return iconPath + getMimeIcon(entry.mimeType);
}

function toDirectoryItems(entries, basePath, useHashNavigation, options) {
    options = options || {};
    return entries.map(function (entry) {
        const previewUrl = getPreviewUrl(entry, basePath, options.deployment);
        const href = entry.isDirectory
            ? (useHashNavigation ? '#' + (options.hashPrefix || '') + encode(entry.filePath) : encode(entry.filePath) + '/')
            : (options.domain ? publicFileUrl(options.domain, entry.filePath) : encode(entry.filePath));

        return {
            ...entry,
            id: entry.filePath,
            name: entry.fileName,
            icon: previewUrl,
            previewUrl: previewUrl,
            href: href,
            openUrl: options.domain ? publicFileUrl(options.domain, entry.filePath) : '',
            deployment: options.deployment || '',
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
    MAX_EDITABLE_FILE_SIZE,
    isTextFile,
    canEditTextFile,
    sanitize,
    encode,
    decode,
    fileApiUrl,
    siteOrigin,
    publicFileUrl,
    download,
    getPreviewUrl,
    toDirectoryItems,
    makeCurrentFolderPreviewEntry,
    getPreviewPanelWidthVw,
    setPreviewPanelWidthVw,
    clampPreviewPanelWidthVw
};
