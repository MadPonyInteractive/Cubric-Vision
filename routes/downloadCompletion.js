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

// MPI-243 / MPI-387 F1: a custom_nodes FOLDER existing does not mean the node is
// installed. A `targetPath` weight resolves UNDER the node folder and downloads
// first (RIFE writes comfyui-frame-interpolation/ckpts/rife/rife47.pth), creating
// a shell that holds nothing but subdirs. A real node always ships top-level FILES
// (__init__.py, install.py, ...). MPI-243 fixed the extraction site with this test;
// F1 is the same test applied to every place that decides INSTALL STATE from disk.
async function isNodeInstalledOnDisk(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return false; // absent or unreadable → not installed
    }
    return entries.some(e => e.isFile());
}

// Install-state for one dep against a resolved path. custom_nodes are folders and
// need the top-level-file test above; everything else is a file and uses the
// download-marker test. Callers must not open-code this branch.
async function isDepInstalledOnDisk(dep, checkPath) {
    return dep && dep.type === 'custom_nodes'
        ? isNodeInstalledOnDisk(checkPath)
        : isCompleteOnDisk(checkPath);
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
    isNodeInstalledOnDisk,
    isDepInstalledOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
    getPartialDownloadState,
    getPartialBytes,
};
