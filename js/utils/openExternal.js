/**
 * js/utils/openExternal.js — open a URL in the user's own browser, not in the app.
 *
 * Electron routes it through the main process (`shell.openExternal`); the browser dev
 * server has no `electron` module, so it falls back to `window.open`.
 *
 * Two older copies of this pattern predate the util and were left alone (MpiErrorDialog,
 * MpiEngineInstall) — fold them in the next time either is touched.
 *
 * @param {string} url
 */
export function openExternal(url) {
    try {
        const { ipcRenderer } = require('electron');
        if (ipcRenderer) { ipcRenderer.invoke('open-external', url); return; }
    } catch { /* browser dev mode — no electron module */ }
    window.open(url, '_blank', 'noopener');
}
