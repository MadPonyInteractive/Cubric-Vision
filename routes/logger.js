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

const LOGS_DIR = process.env.APP_USER_DATA
    ? path.join(process.env.APP_USER_DATA, 'logs')
    : path.join(__dirname, '..', 'logs');

const LOG_PATH     = path.join(LOGS_DIR, 'app.log');
const LOG_PATH_BAK = path.join(LOGS_DIR, 'app.log.1');

// ── State ─────────────────────────────────────────────────────────────────────

let _ready  = false;   // true once the logs dir is confirmed to exist
let _ring   = [];      // circular in-memory buffer

// ── Init ──────────────────────────────────────────────────────────────────────

// Ensure logs directory exists asynchronously at startup.
fs.ensureDir(LOGS_DIR)
    .then(() => { _ready = true; })
    .catch(err => console.error('[logger] Failed to create logs dir:', err));

// ── Internal write ────────────────────────────────────────────────────────────

function _write(level, category, message, err, skipFile = false) {
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

    // skipFile: the line was mirrored to the console above (and kept in the ring
    // for live reads) but is too noisy to persist. Used for ComfyUI subprocess
    // churn — see routes/comfy.js. Debugging at a terminal still sees everything;
    // only the durable file is kept lean. (MPI-315)
    if (skipFile) return;

    if (!_ready) return;

    // Async file write — fire-and-forget with rotation check
    _appendToFile(line + '\n').catch(e => console.error('[logger] write failed:', e));
}

async function _appendToFile(line) {
    // Check if rotation is needed
    try {
        const stat = await fs.stat(LOG_PATH).catch(() => null);
        if (stat && stat.size >= MAX_LOG_BYTES) {
            await fs.move(LOG_PATH, LOG_PATH_BAK, { overwrite: true });
        }
    } catch (_) { /* non-fatal */ }

    await fs.appendFile(LOG_PATH, line, 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

const logger = {
    info  : (category, message)      => _write('info',  category, message),
    warn  : (category, message)      => _write('warn',  category, message),
    error : (category, message, err) => _write('error', category, message, err),

    /**
     * Console + ring buffer only — never written to app.log.
     * For high-volume subprocess output that is useful live but would bury the
     * durable log (ComfyUI tqdm redraws, boot banners). (MPI-315)
     */
    consoleOnly: (level, category, message) =>
        _write(['info', 'warn', 'error'].includes(level) ? level : 'info', category, message, undefined, true),

    /** Returns the path to the current log file (for the download route). */
    getLogPath() { return LOG_PATH; },

    /** Returns the in-memory ring buffer as a single string (for quick reads). */
    getRecentLogs() { return _ring.join('\n'); },
};

module.exports = logger;
