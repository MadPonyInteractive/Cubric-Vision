'use strict';

/**
 * services/ffmpegBinary.js — resolve bundled ffmpeg/ffprobe binary paths.
 *
 * Dev:      uses ffmpeg-static / ffprobe-static npm package paths directly.
 * Packaged: electron-builder extraResources copies binaries into
 *           `process.resourcesPath/ffmpeg(.exe)` and `.../ffprobe(.exe)`.
 *
 * Exports:
 *   ffmpegPath  — absolute path to ffmpeg binary
 *   ffprobePath — absolute path to ffprobe binary
 *   quote(p)    — shell-quote a path (handles spaces on win32)
 */

const path = require('path');
const fs   = require('fs');

function _resolvePackaged(name) {
    // Packaged Electron exposes process.resourcesPath. Server.js runs as a
    // forked child; parent exports MPI_RESOURCES_PATH env in main.js on package.
    const base = process.env.MPI_RESOURCES_PATH || process.resourcesPath || '';
    if (!base) return null;
    const exe = process.platform === 'win32' ? `${name}.exe` : name;
    const p = path.join(base, exe);
    return fs.existsSync(p) ? p : null;
}

function _resolveDev(pkgName) {
    try {
        const p = require(pkgName);
        // ffmpeg-static exports a string; ffprobe-static exports { path }
        return typeof p === 'string' ? p : (p && p.path) || null;
    } catch (_) {
        return null;
    }
}

const ffmpegPath  = _resolvePackaged('ffmpeg')  || _resolveDev('ffmpeg-static')  || 'ffmpeg';
const ffprobePath = _resolvePackaged('ffprobe') || _resolveDev('ffprobe-static') || 'ffprobe';

function quote(p) {
    if (!p) return p;
    // Simple quoting: wrap in double quotes, escape embedded doubles.
    return `"${String(p).replace(/"/g, '\\"')}"`;
}

module.exports = { ffmpegPath, ffprobePath, quote };
