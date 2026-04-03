/**
 * init.js — Application entry point.
 *
 * Bootstraps the shell, then the existing Prompt Enhancer modules.
 * The shell mounts the Prompt Enhancer template into #tool-container;
 * the 'tool:mounted' event re-runs the wizard init each time it loads.
 */

import { state } from './state.js';
import { removeImage } from './handlers/imageHandlers.js';
import { initShell } from './shell.js';
import { initMediaDetailModal } from './components/mediaDetailModal.js';
import { showAlert, showConfirm, showPrompt } from './dialogs.js';
import { initTheme } from './themeManager.js';
import { triggerToolAction } from './toolUtils.js';
import { ComfyUIController } from './comfyController.js';
import { Hotkeys } from './managers/hotkeyManager.js';
import { Overlays } from './managers/overlayManager.js';

window.MpiAlert = showAlert;
window.MpiConfirm = showConfirm;
window.MpiPrompt = showPrompt;
window.alert = (msg) => showAlert(msg);

// Expose functions used by inline onclick="" attributes
window.removeImage = removeImage;

async function init() {
    // 0. Init theme (instant, before shell)
    initTheme();

    // 1. Boot the app shell (landing page, sidebar, routing)
    await initShell();

    // 2. Init global modals
    initMediaDetailModal();
    const { initAssetBrowserModal } = await import('./components/assetBrowserModal.js');
    initAssetBrowserModal();
}

// ── Global Keyboard Shortcuts ────────────────────────────────────────────────
// NOTE: Global shortcut handling for Enter/Escape has been moved to js/managers/hotkeyManager.js
// Transitioning to a registration-based system for the new MpiComponent architecture.
// Primitives and Compounds now register their own behavior with Hotkeys/Overlays.


// ── Global Mouse Wheel for Numbers/Sliders ─────────────────────────────────
document.addEventListener('wheel', (e) => {
    const el = e.target.closest('input[type="range"], input[type="number"]');
    if (el) {
        // Only trigger if focused or hovering (closest already handles it)
        // Prevent default only if we actually handle it
        import('./uiHelpers.js').then(m => m.setupWheelControl(el, e));
        e.preventDefault();
    }
}, { passive: false });

init();
