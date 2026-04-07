/**
 * clientLogger.js — Frontend → server log bridge.
 *
 * Writes client-side errors into the same app.log file the server uses,
 * so packaged-app users have a single file to send for support.
 *
 * All calls are fire-and-forget — logging failures are silently swallowed
 * to avoid error-handler infinite loops.
 *
 * Usage:
 *   import { clientLogger } from './clientLogger.js';
 *   clientLogger.error('comfy', 'Workflow failed', err);
 *   clientLogger.warn('gallery', 'No Output node found');
 *   clientLogger.info('comfy', 'Generation started');
 */

'use strict';

function _send(level, category, message, err) {
    // Also mirror to browser console for dev convenience
    const detail = err ? (err.stack || String(err)) : '';
    if (level === 'error') console.error(`[${category}] ${message}`, err || '');
    else if (level === 'warn') console.warn(`[${category}] ${message}`);

    fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, category, message, detail }),
    }).catch(() => { /* swallow — logger must never throw */ });
}

export const clientLogger = {
    info  : (category, message)      => _send('info',  category, message),
    warn  : (category, message)      => _send('warn',  category, message),
    error : (category, message, err) => _send('error', category, message, err),
};
