/**
 * uiZoom.js — global UI size control via Electron webFrame zoom factor.
 *
 * Single source of truth for the zoom bounds/step shared by the Ctrl+wheel
 * handler (init.js) and the Ctrl+ / Ctrl- hotkeys (hotkeyManager.js). No-ops
 * in Browser Mode where webFrame is unavailable.
 */
'use strict';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
export const ZOOM_STEP = 0.1;

const _webFrame = (() => {
    try { return window.require?.('electron')?.webFrame ?? null; } catch { return null; }
})();

/**
 * Step the global UI zoom factor by one ZOOM_STEP, clamped to [MIN, MAX].
 * @param {1|-1} dir 1 = enlarge UI, -1 = shrink UI
 */
export function applyUiZoom(dir) {
    if (!_webFrame) return;
    const current = _webFrame.getZoomFactor();
    const next = dir > 0
        ? Math.min(ZOOM_MAX, current + ZOOM_STEP)
        : Math.max(ZOOM_MIN, current - ZOOM_STEP);
    _webFrame.setZoomFactor(Number(next.toFixed(2)));
}
