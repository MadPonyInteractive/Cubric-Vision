/**
 * init.js — Application entry point.
 */
import { initTheme } from './themeManager.js';
import { initShell } from './shell.js';

// Global alert/confirm system — will be replaced by MpiOkCancel component
// For now wire up basic browser fallbacks to prevent crashes
window.MpiAlert   = (msg) => alert(msg);
window.MpiConfirm = (msg) => confirm(msg);
window.MpiPrompt  = (msg, def) => prompt(msg, def);
window.alert      = (msg) => window.MpiAlert(msg);

// Mouse wheel on number inputs — standalone, no external dependency
document.addEventListener('wheel', (e) => {
    const el = e.target.closest('input[type="range"], input[type="number"]');
    if (el) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const step  = parseFloat(el.step) || 1;
        el.value    = parseFloat(el.value) + delta * step;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}, { passive: false });

async function init() {
    initTheme();
    await initShell();
}

init();
