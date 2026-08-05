/**
 * init.js — Application entry point.
 */
import { initShell } from './shell.js';
import { initPaths } from './data/modelRegistry.js';
import { checkForUpdate } from './services/updateChecker.js';
import { restoreUiZoom } from './utils/uiZoom.js';

// MPI-374: re-apply the stored UI size before anything renders. Deliberately at
// module top level, not inside init() — an await first would let the page paint
// at 1.0 and resize under the user.
restoreUiZoom();

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

// NOTE: there is deliberately NO Ctrl+wheel UI-zoom handler here. macOS delivers
// a trackpad pinch as a wheel event with ctrlKey:true, so such a handler hijacked
// every pinch into a whole-interface zoom instead of letting the canvas zoom the
// image. UI size is keyboard-only: Ctrl+ / Ctrl- (bound in hotkeyManager.init()).
async function init() {
    await initPaths();
    await initShell();
    checkForUpdate(); // MPI-334: fire-and-forget; portable-gated, never blocks boot
}

init();
