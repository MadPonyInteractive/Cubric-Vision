/**
 * init.js — Application entry point.
 */
import { initShell } from './shell.js';
import { initPaths } from './data/modelRegistry.js';
import { applyUiZoom } from './utils/uiZoom.js';
import { checkForUpdate } from './services/updateChecker.js';

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

// Ctrl+wheel — global UI zoom (Electron webFrame). Ctrl+ / Ctrl- keyboard
// equivalents are bound as built-ins in hotkeyManager.init(). Shared step/bounds
// live in utils/uiZoom.js.
document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    applyUiZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

async function init() {
    await initPaths();
    await initShell();
    checkForUpdate(); // MPI-334: fire-and-forget; portable-gated, never blocks boot
}

init();
