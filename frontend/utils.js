
import filesize from 'filesize';

function prettyDate(value) {
    var date = new Date(value),
    diff = (((new Date()).getTime() - date.getTime()) / 1000),
    day_diff = Math.floor(diff / 86400);

    if (isNaN(day_diff) || day_diff < 0)
        return;

    return day_diff === 0 && (
        diff < 60 && 'just now' ||
        diff < 120 && '1 minute ago' ||
        diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
        diff < 7200 && '1 hour ago' ||
        diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
        day_diff === 1 && 'Yesterday' ||
        day_diff < 7 && day_diff + ' days ago' ||
        day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago' ||
        day_diff < 365 && Math.round( day_diff / 30 ) +  ' months ago' ||
        Math.round( day_diff / 365 ) + ' years ago';
}

function prettyLongDate(value) {
    var date = new Date(value);
    return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
}

function prettyFileSize(value) {
    return filesize(value);
}

function sanitize(path) {
    path = '/' + path;
    return path.replace(/\/+/g, '/');
}

function encode(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

function decode(path) {
    return path.split('/').map(decodeURIComponent).join('/');
}

function download(entry) {
    if (entry.isDirectory) return;
    window.location.href = encode('/api/files/' + entry.filePath);
}

const mimeTypes = {
    images: [ '.png', '.jpg', '.jpeg', '.tiff', '.gif' ],
    text: [ '.txt', '.md' ],
    pdf: [ '.pdf' ],
    html: [ '.html', '.htm', '.php' ],
    music: [ '.mp2', '.mp3', '.ogg', '.flac', '.wav', '.aac' ],
    video: [ '.mp4', '.mpg', '.mpeg', '.mkv', '.avi', '.mov' ]
};

function getPreviewUrl(entry, basePath) {
    var path = '/_admin/mime-types/';

    if (entry.isDirectory) return path + 'directory.png';
    if (mimeTypes.images.some(function (e) { return entry.fileName.endsWith(e); })) return sanitize(basePath + '/' + entry.fileName);
    if (mimeTypes.text.some(function (e) { return entry.fileName.endsWith(e); })) return path +'text.png';
    if (mimeTypes.pdf.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'pdf.png';
    if (mimeTypes.html.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'html.png';
    if (mimeTypes.music.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'music.png';
    if (mimeTypes.video.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'video.png';

    return path + 'unknown.png';
}

// simple extension detection, does not work with double extension like .tar.gz
function getExtension(entry) {
    if (entry.isFile) return entry.fileName.slice(entry.fileName.lastIndexOf('.') + 1);
    return '';
}

function copyToClipboard(value) {
    var elem = document.createElement('input');
    elem.value = value;
    document.body.append(elem);
    elem.select();
    document.execCommand('copy');
    elem.remove();
}

export {
    prettyDate,
    prettyLongDate,
    prettyFileSize,
    sanitize,
    encode,
    decode,
    download,
    getPreviewUrl,
    getExtension,
    copyToClipboard
};
