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
 * ONE FILE, ONE WRITER. Main and the server fork share app.log, so only main
 * writes it — a forked child mirrors to stdout and main relays those lines
 * verbatim (see appendRaw). Two writers raced at rotation and destroyed a whole
 * session of history. (MPI-418)
 *
 * Retention: when app.log reaches MAX_LOG_BYTES it is renamed to
 * app-YYYYMMDD-HHMMSS.log and a fresh app.log is started. Archives are
 * immutable; the newest MAX_ARCHIVES are kept and older ones unlinked.
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
// History comes from file COUNT, not file size: 20 x 256KB ≈ 5MB / ~40k lines,
// while any single file stays small enough for an agent to read whole. One
// install-and-generate blew through 256KB twice, so a single backup evicted the
// engine install — the most valuable thing a bug report carries. (MPI-418)
const MAX_ARCHIVES   = 20;
const RING_SIZE      = 200;             // in-memory lines kept for live reads

// A forked child must not write the file it shares with main. main.js pipes the
// child's stdout/stderr and relays each line verbatim, so the line still lands —
// once. `process.send` exists only in a fork: false in main, and false for a
// standalone `node server.js` in dev, which must keep writing its own file.
const IS_FORK = typeof process.send === 'function';

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

// Appends are serialized: stat → rotate → append is not atomic, so two
// overlapping fire-and-forget writes in ONE process could both rotate and lose a
// file the same way two processes did.
let _queue = Promise.resolve();

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

    _remember(line);

    // The console mirror above is the fork's ONLY output; main relays it.
    if (!IS_FORK) _enqueue(line);
}

function _remember(line) {
    _ring.push(line);
    if (_ring.length > RING_SIZE) _ring.shift();
}

function _enqueue(line) {
    _queue = _queue
        .then(() => _appendToFile(line + '\n'))
        .catch(e => console.error('[logger] write failed:', e));
}

async function _appendToFile(line) {
    const { log, ready } = _resolvePaths();
    await ready;

    try {
        const stat = await fs.stat(log).catch(() => null);
        if (stat && stat.size >= MAX_LOG_BYTES) await _rotate();
    } catch (_) { /* non-fatal */ }

    await fs.appendFile(log, line, 'utf8');
}

/** Renames app.log to a timestamped archive and prunes the oldest ones. */
async function _rotate() {
    const { dir, log } = _resolvePaths();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    let archive = path.join(dir, `app-${stamp}.log`);
    // 256KB inside one second is rare but reachable under pip/ComfyUI spam, and
    // an overwrite here is exactly the history loss this rotation replaced.
    for (let n = 2; await fs.pathExists(archive); n++) {
        archive = path.join(dir, `app-${stamp}-${n}.log`);
    }
    await fs.move(log, archive);

    const archives = (await fs.readdir(dir))
        .filter(f => /^app-\d{8}-\d{6}(-\d+)?\.log$/.test(f))
        .sort();                                    // fixed-width stamp ⇒ chronological
    for (const f of archives.slice(0, -MAX_ARCHIVES)) {
        await fs.remove(path.join(dir, f)).catch(() => {});
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

const logger = {
    info  : (category, message)      => _write('info',  category, message),
    warn  : (category, message)      => _write('warn',  category, message),
    error : (category, message, err) => _write('error', category, message, err),

    /**
     * Appends an already-formatted line from the server fork EXACTLY as given,
     * so the child's own timestamp survives. Re-logging it through info()/error()
     * would stamp main's receive time instead. main.js only. (MPI-418)
     */
    appendRaw(line) {
        console.log(line);   // the fork's stdout is piped, so this is its only echo
        _remember(line);
        _enqueue(line);
    },

    /** Returns the path to the current log file (for the download route). */
    getLogPath() { return _resolvePaths().log; },

    /** Returns the in-memory ring buffer as a single string (for quick reads). */
    getRecentLogs() { return _ring.join('\n'); },
};

module.exports = logger;
