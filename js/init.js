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
document.addEventListener('keydown', async (e) => {
    const isEnter = e.key === 'Enter';
    const isEscape = e.key === 'Escape';

    if (isEnter) {
        const currentTool = state.currentTool;
        const isModEnter = (e.ctrlKey || e.metaKey);

        if (isModEnter) {
            e.preventDefault();

            if (currentTool === 'generator') {
                const { triggerGenerate } = await import('./tools/generator.js');
                triggerGenerate();
            } else if (currentTool === 'descriptor') {
                const { _runDescribe, cancelDescriptor } = await import('./tools/descriptor.js');
                triggerToolAction(!!state.descriptorRunning, _runDescribe, cancelDescriptor);
            } else if (currentTool === 'translator') {
                const { _runTranslate, cancelTranslator } = await import('./tools/translator.js');
                triggerToolAction(!!state.translatorRunning, _runTranslate, cancelTranslator);
            } else if (currentTool === 'jsonFormatter') {
                const { _runFormat, cancelJsonFormatter } = await import('./tools/jsonFormatter.js');
                triggerToolAction(!!state.jsonFormatterRunning, _runFormat, cancelJsonFormatter);
            } else if (currentTool === 'llm') {
                const { runLlm, cancelLlm } = await import('./tools/llm.js');
                triggerToolAction(!!state.llmRunning, runLlm, cancelLlm);
            } else if (currentTool === 'detailer') {
                // Guard: only allow cancel if THIS tool owns the run
                if (ComfyUIController.isRunning && state.runningComfyTool && state.runningComfyTool !== 'detailer') return;
                const { triggerEnhance, cancelEnhance } = await import('./tools/detailer.js');
                triggerToolAction(ComfyUIController.isRunning && state.runningComfyTool === 'detailer', triggerEnhance, cancelEnhance);
            } else if (currentTool === 'upscaler') {
                if (ComfyUIController.isRunning && state.runningComfyTool && state.runningComfyTool !== 'upscaler') return;
                const { triggerUpscale, cancelUpscale } = await import('./tools/upscaler.js');
                triggerToolAction(ComfyUIController.isRunning && state.runningComfyTool === 'upscaler', triggerUpscale, cancelUpscale);
            } else if (currentTool === 'promptBuilder') {
                const { showFinalPrompt } = await import('./tools/promptBuilder.js');
                showFinalPrompt();
            }
        }
    }

    if (isEscape) {
        // Cancel active tool generations if applicable
        const currentTool = state.currentTool;
        if (currentTool === 'llm') {
            const { cancelLlm } = await import('./tools/llm.js');
            cancelLlm();
        } else if (currentTool === 'descriptor') {
            const { cancelDescriptor } = await import('./tools/descriptor.js');
            cancelDescriptor();
        } else if (currentTool === 'translator') {
            const { cancelTranslator } = await import('./tools/translator.js');
            cancelTranslator();
        } else if (currentTool === 'jsonFormatter') {
            const { cancelJsonFormatter } = await import('./tools/jsonFormatter.js');
            cancelJsonFormatter();
        }

        const activeModals = document.querySelectorAll('.modal-overlay:not(.hide)');
        if (activeModals.length > 0) {
            // For specifically complex modals like Media Detail, we should call their close function
            const mediaModal = document.getElementById('mediaDetailModal');
            if (mediaModal && !mediaModal.classList.contains('hide')) {
                const { closeMediaModal } = await import('./components/mediaDetailModal.js');
                closeMediaModal();
            }

            // General close for others
            activeModals.forEach(m => m.classList.add('hide'));
        }

        // Close subpages (Provisioning, Advanced Settings)
        if (state.activeSubPage) {
            import('./shell.js').then(m => {
                m.closeActiveSubPage(state.activeSubPage.toolName, state.activeSubPage.isManual);
            });
        }
    }
});

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
