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
    const exe = process.platform === 'win32' ? `${name}.exe` : name;
    const candidates = [
        process.env.MPI_RESOURCES_PATH,
        process.env.CUBRIC_RESOURCES_PATH,
        process.env.CUBRIC_PORTABLE_ROOT ? path.join(process.env.CUBRIC_PORTABLE_ROOT, 'resources') : null,
        process.resourcesPath,
    ].filter(Boolean);

    for (const base of candidates) {
        const p = path.join(path.resolve(base), exe);
        if (fs.existsSync(p)) {
            _ensureExecutable(p);
            return p;
        }
    }

    return null;
}

// Portable archives (zip/tar built on Windows) may strip the exec bit. The build
// marks these +x, but self-heal at resolve time so a binary that arrived without
// it (old bundle, manual copy) still runs instead of failing with EACCES. Win32
// has no exec bit; skip.
function _ensureExecutable(p) {
    if (process.platform === 'win32') return;
    try {
        const mode = fs.statSync(p).mode & 0o777;
        if ((mode & 0o111) !== 0o111) fs.chmodSync(p, mode | 0o111);
    } catch (_) {
        // Non-fatal — spawn will surface a clearer error if it truly can't run.
    }
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
