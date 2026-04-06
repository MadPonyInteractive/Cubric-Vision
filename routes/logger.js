'use strict';

/**
 * routes/logger.js — App-wide file logger.
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('comfy', 'ComfyUI started');
 *   logger.warn('llm', 'Model not found');
 *   logger.error('system', 'Server crashed', err);
 *
 * Log file location:
 *   - Packaged app: <APP_USER_DATA>/logs/app.log  (set by main.js via env var)
 *   - Development:  <project_root>/logs/app.log
 *
 * Rotation: when app.log exceeds MAX_LOG_BYTES it is renamed to app.log.1
 * and a fresh app.log is started. Only one backup is kept.
 */

const fs   = require('fs-extra');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_LOG_BYTES  = 2 * 1024 * 1024; // 2 MB before rotation
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

function _write(level, category, message, err) {
    const ts   = new Date().toISOString();
    const base = `[${ts}] [${level.toUpperCase()}] [${category}] ${message}`;
    const line = err ? `${base}\n  ${err.stack || err}` : base;

    // Always mirror to console so dev tools still work
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);

    // Update ring buffer
    _ring.push(line);
    if (_ring.length > RING_SIZE) _ring.shift();

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

    /** Returns the path to the current log file (for the download route). */
    getLogPath() { return LOG_PATH; },

    /** Returns the in-memory ring buffer as a single string (for quick reads). */
    getRecentLogs() { return _ring.join('\n'); },
};

module.exports = logger;
