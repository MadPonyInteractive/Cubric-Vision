/**
 * focusModeService.js — Owns the lifecycle of the global Focus Mode toggle.
 *
 * Responsibilities:
 *   - Registers the `f` hotkey (toggle) on every non-landing page.
 *   - Registers `escape` (exit only) while focus is active.
 *   - Auto-exits focus when navigating to PAGE_LANDING.
 *   - Mirrors `state.focusMode` to a `body.mpi-focus-mode` class for CSS hooks.
 *   - Forces a `window` resize event after toggle so JS-driven layouts (gallery
 *     ResizeObserver, canvas viewport) recompute against the new viewport.
 *
 * Event contract:
 *   - Reads:  state.currentPage, state.focusMode (via Events.onState)
 *   - Writes: state.focusMode
 *
 * Hotkey ownership:
 *   The `escape` key is normally owned by overlayManager. We only register an
 *   escape handler while focus mode is active, and we use the unsub closure
 *   returned by `Hotkeys.register` to restore the previous handler on exit.
 */

'use strict';

import { state } from '../state.js';
import { Events } from '../events.js';
import { Hotkeys } from '../managers/hotkeyManager.js';
import { PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { clientLogger } from '../services/clientLogger.js';
import { qs } from '../utils/dom.js';

const BODY_CLASS = 'mpi-focus-mode';

// Map of router page constant → body className applied while that page is active.
// Lets per-workspace CSS rules target focus mode (e.g. `.mpi-focus-mode.page-gallery`).
const PAGE_BODY_CLASSES = {
    [PAGE_LANDING]:        'page-landing',
    [PAGE_GALLERY]:        'page-gallery',
    [PAGE_GROUP_HISTORY]:  'page-group-history',
};
const ALL_PAGE_CLASSES = Object.values(PAGE_BODY_CLASSES);

let _initialized = false;
let _unregisterF = null;       // Restores previous `f` handler when leaving non-landing pages
let _unregisterEscape = null;  // Active only while focus mode is on

/**
 * Initialize focus mode service. Idempotent.
 */
export function initFocusModeService() {
    if (_initialized) return;
    _initialized = true;

    // Page-change listener — register/unregister F based on current workspace.
    Events.onState('currentPage', (page) => _syncHotkeyForPage(page));

    // Focus-state listener — sync body class + escape hotkey + viewport refresh.
    Events.onState('focusMode', (active) => _applyFocusState(!!active));

    // If the user exits native fullscreen via browser ESC (not our hotkey),
    // mirror that into focusMode = false so chrome reappears in sync.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && state.focusMode) {
            state.focusMode = false;
        }
    });

    // Sync once at boot (state.currentPage may already be set).
    _syncHotkeyForPage(state.currentPage);
}

/**
 * Register / unregister the F hotkey based on the current page.
 * @param {string|undefined} page
 */
function _syncHotkeyForPage(page) {
    // Maintain the page-class on body so per-workspace focus CSS can target.
    document.body.classList.remove(...ALL_PAGE_CLASSES);
    if (page && PAGE_BODY_CLASSES[page]) {
        document.body.classList.add(PAGE_BODY_CLASSES[page]);
    }

    // Always release prior F binding before re-evaluating.
    if (_unregisterF) { _unregisterF(); _unregisterF = null; }

    if (!page || page === PAGE_LANDING) {
        // Leaving non-landing — force focus off so chrome reappears on landing.
        if (state.focusMode) state.focusMode = false;
        return;
    }

    _unregisterF = Hotkeys.register('f', () => {
        // Don't toggle while typing in inputs, textareas, or contenteditable elements.
        const t = document.activeElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
            return;
        }
        state.focusMode = !state.focusMode;
    });
}

/**
 * Apply the current focus state to the DOM and (de)register escape.
 * @param {boolean} active
 */
function _applyFocusState(active) {
    document.body.classList.toggle(BODY_CLASS, active);

    if (active) {
        if (!_unregisterEscape) {
            _unregisterEscape = Hotkeys.register('escape', () => {
                state.focusMode = false;
            });
        }
        // Group-history + video → request native fullscreen on the <video>.
        // Image mode (no <video>) falls back to the chrome-hide CSS path.
        if (state.currentPage === PAGE_GROUP_HISTORY) {
            _enterVideoFullscreenIfPresent();
        }
    } else {
        if (_unregisterEscape) {
            _unregisterEscape();
            _unregisterEscape = null;
        }
        _exitFullscreenIfActive();
    }

    // Trigger layout-dependent components (gallery grid, canvas) to recompute.
    // ResizeObservers fire on element size changes; the body class flip causes
    // chrome to disappear, which resizes mounted Blocks. Belt-and-braces: also
    // dispatch a window resize so listeners that only watch window get a poke.
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (err) {
        clientLogger.warn('focusModeService', 'resize dispatch failed:', err);
    }
}

function _enterVideoFullscreenIfPresent() {
    const toolContainer = qs('#tool-container');
    const video = toolContainer ? qs('video', toolContainer) : null;
    if (!video || typeof video.requestFullscreen !== 'function') return;
    video.requestFullscreen().catch(err => {
        clientLogger.warn('focusModeService', 'video requestFullscreen failed:', err);
    });
}

function _exitFullscreenIfActive() {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => { /* ignore */ });
    }
}
