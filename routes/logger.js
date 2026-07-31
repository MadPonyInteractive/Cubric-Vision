'use strict';

/**
 * routes/logger.js — App-wide file logger.
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('comfy', 'ComfyUI started');
 *   logger.warn('comfy', 'Model not found');
 *   logger.error('system', 'Server crashed', err);
 *
 * Log file location:
 *   - Packaged app: <APP_USER_DATA>/logs/app.log  (set by main.js via env var)
 *   - Development:  <project_root>/logs/app.log
 *
 * Retention: when app.log exceeds MAX_LOG_BYTES it is renamed to app.log.1
 * and a fresh app.log is started. Only one backup is kept.
 *
 * Rotation is the ONLY retention mechanism. A startup line-trim used to also
 * run here; it was removed in MPI-315 because it rewrote app.log in place
 * (destroying history rotation would have preserved) and swallowed its own
 * errors, so a failed trim was silent. Do not reintroduce it — if app.log
 * grows too fast, fix the noise at the source, not by deleting evidence.
 */

const fs   = require('fs-extra');
const path = require('path');
const { redactSecrets } = require('./secretRedaction');

// ── Config ────────────────────────────────────────────────────────────────────

// 256 KB ≈ 2000 lines — deliberately close to the old 2500-line startup cap,
// which is the size this log was comfortable at for months. Two files means a
// ~512 KB ceiling total. Kept small so an agent can read the whole file without
// burning its context; that is a real constraint here, not a disk concern.
const MAX_LOG_BYTES  = 256 * 1024;
const RING_SIZE      = 200;             // in-memory lines kept for live reads

// Resolved LAZILY, on first write — not at module load. main.js requires this
// module on its first line, long before it has resolved userData and exported
// APP_USER_DATA, so an eager read of the env pinned the main process to
// <app>/logs while the server fork (which is handed APP_USER_DATA in its env)
// wrote to <user-data>/logs. The two processes logged to two different files
// and every [server]/[main] line was missing from the app.log a user actually
// sends — the only diagnostic channel we have after release. (MPI-418)
let _paths = null;
function _resolvePaths() {
    if (_paths) return _paths;
    const dir = process.env.APP_USER_DATA
        ? path.join(process.env.APP_USER_DATA, 'logs')
        : path.join(__dirname, '..', 'logs');
    _paths = {
        dir,
        log: path.join(dir, 'app.log'),
        bak: path.join(dir, 'app.log.1'),
        // Awaited by the first append rather than raced against it — resolving
        // lazily means there is no module-load head start any more, so a `_ready`
        // flag would silently drop the first lines (which is exactly where boot
        // failures live).
        ready: fs.ensureDir(dir).catch(err => {
            console.error('[logger] Failed to create logs dir:', err);
            throw err;
        }),
    };
    return _paths;
}

// ── State ─────────────────────────────────────────────────────────────────────

let _ring   = [];      // circular in-memory buffer

// ── Internal write ────────────────────────────────────────────────────────────

function _write(level, category, message, err) {
    const ts   = new Date().toISOString();
    const safeMessage = redactSecrets(message);
    const safeErr = err ? redactSecrets(err.stack || err) : '';
    const base = `[${ts}] [${level.toUpperCase()}] [${category}] ${safeMessage}`;
    const line = err ? `${base}\n  ${safeErr}` : base;

    // Always mirror to console so dev tools still work. Guard against a dead
    // stdout/stderr: when the controlling terminal or pipe closes (app exit on
    // Linux/macOS), a console write throws a synchronous EIO that would surface
    // as an uncaught "JavaScript error in the main process" dialog. The file
    // write below is the durable sink, so dropping the console mirror is safe.
    try {
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
    } catch {
        // stdout/stderr unavailable (closed pipe) — rely on the file log.
    }

    // Update ring buffer
    _ring.push(line);
    if (_ring.length > RING_SIZE) _ring.shift();

    // Async file write — fire-and-forget with rotation check
    _appendToFile(line + '\n').catch(e => console.error('[logger] write failed:', e));
}

async function _appendToFile(line) {
    const { log, bak, ready } = _resolvePaths();
    await ready;

    // Check if rotation is needed
    try {
        const stat = await fs.stat(log).catch(() => null);
        if (stat && stat.size >= MAX_LOG_BYTES) {
            await fs.move(log, bak, { overwrite: true });
        }
    } catch (_) { /* non-fatal */ }

    await fs.appendFile(log, line, 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

const logger = {
    info  : (category, message)      => _write('info',  category, message),
    warn  : (category, message)      => _write('warn',  category, message),
    error : (category, message, err) => _write('error', category, message, err),

    /** Returns the path to the current log file (for the download route). */
    getLogPath() { return _resolvePaths().log; },

    /** Returns the in-memory ring buffer as a single string (for quick reads). */
    getRecentLogs() { return _ring.join('\n'); },
};

module.exports = logger;
