/**
 * js/utils/openExternal.js — open a URL in the user's own browser, not in the app.
 *
 * Electron routes it through the main process (`shell.openExternal`); the browser dev
 * server has no `electron` module, so it falls back to `window.open`.
 *
 * Two older copies of this pattern predate the util and were left alone (MpiErrorDialog,
 * MpiEngineInstall) — fold them in the next time either is touched.
 *
 * A ROOT-RELATIVE url ('/licences/…') is resolved against the app's own origin first.
 * `shell.openExternal` needs an absolute URL and silently does nothing with a bare path,
 * and the port is not fixed (CUBRIC_PORT, MPI-448), so it cannot be hardcoded. This is
 * what lets a licence we must ship OFFLINE (MiniMax H3 §III.1) be opened the same way as
 * a hosted one — see `licenceUrl` in js/data/modelConstants/licences.js.
 *
 * @param {string} url - Absolute URL, or a path relative to the app origin.
 */
export function openExternal(url) {
    const href = new URL(url, window.location.href).href;
    try {
        const { ipcRenderer } = require('electron');
        if (ipcRenderer) { ipcRenderer.invoke('open-external', href); return; }
    } catch { /* browser dev mode — no electron module */ }
    window.open(href, '_blank', 'noopener');
}
