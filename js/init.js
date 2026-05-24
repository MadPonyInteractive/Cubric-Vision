/**
 * init.js — Application entry point.
 */
import { initShell } from './shell.js';
import { initPaths } from './data/modelRegistry.js';

// Capture native dialogs before any override to prevent mutual recursion.
const _nativeAlert   = window.alert.bind(window);
const _nativeConfirm = window.confirm.bind(window);
const _nativePrompt  = window.prompt.bind(window);

// Global dialog stubs — will be replaced by MpiOkCancel component.
// Do NOT override window.alert — doing so causes infinite recursion with MpiAlert.
window.MpiAlert   = (msg)      => _nativeAlert(msg);
window.MpiConfirm = (msg)      => _nativeConfirm(msg);
window.MpiPrompt  = (msg, def) => _nativePrompt(msg, def);

// Mouse wheel on number inputs — standalone, no external dependency
document.addEventListener('wheel', (e) => {
    const el = e.target.closest('input[type="range"], input[type="number"]');
    if (el) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const step = parseFloat(el.step) || 1;
        el.value = parseFloat(el.value) + delta * step;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}, { passive: false });

// Ctrl+wheel — global UI zoom (Electron webFrame).
const _webFrame = (() => {
    try { return window.require?.('electron')?.webFrame ?? null; } catch { return null; }
})();
if (_webFrame) {
    const ZOOM_MIN = 0.5;
    const ZOOM_MAX = 3.0;
    const ZOOM_STEP = 0.1;
    document.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const current = _webFrame.getZoomFactor();
        const next = e.deltaY < 0
            ? Math.min(ZOOM_MAX, current + ZOOM_STEP)
            : Math.max(ZOOM_MIN, current - ZOOM_STEP);
        _webFrame.setZoomFactor(Number(next.toFixed(2)));
    }, { passive: false });
}

async function init() {
    await initPaths();
    await initShell();
}

init();
