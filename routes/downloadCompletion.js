'use strict';

const fs = require('fs-extra');
const path = require('path');

const DOWNLOAD_MARKER_SUFFIX = '.cubricdl';

function getDownloadMarkerPath(filePath) {
    return `${filePath}${DOWNLOAD_MARKER_SUFFIX}`;
}

async function hasDownloadMarker(filePath) {
    return fs.pathExists(getDownloadMarkerPath(filePath));
}

async function isCompleteOnDisk(filePath) {
    return (await fs.pathExists(filePath)) && !(await hasDownloadMarker(filePath));
}

async function markDownloadInProgress(filePath, details = {}) {
    const markerPath = getDownloadMarkerPath(filePath);
    await fs.ensureDir(path.dirname(markerPath));
    await fs.writeJson(markerPath, {
        schema: 'cubric/download-marker/v1',
        file: filePath,
        startedAt: new Date().toISOString(),
        ...details,
    }, { spaces: 2 });
}

async function clearDownloadMarker(filePath) {
    await fs.remove(getDownloadMarkerPath(filePath));
}

async function getPartialDownloadState(filePath) {
    if (!(await hasDownloadMarker(filePath))) return { resumable: false, reason: 'no-marker' };
    if (!(await fs.pathExists(filePath))) return { resumable: false, reason: 'missing-file' };
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) return { resumable: false, reason: 'empty-or-not-file' };
    return {
        resumable: true,
        filePath,
        fileName: path.basename(filePath),
        downloaded: stat.size,
    };
}

async function getPartialBytes(filePath) {
    const partial = await getPartialDownloadState(filePath);
    return partial.resumable ? partial.downloaded : 0;
}

module.exports = {
    DOWNLOAD_MARKER_SUFFIX,
    getDownloadMarkerPath,
    hasDownloadMarker,
    isCompleteOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
    getPartialDownloadState,
    getPartialBytes,
};
