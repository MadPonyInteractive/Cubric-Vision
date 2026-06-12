'use strict';

import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { HOTKEY_REGISTRY, KEY_TYPE } from './hotkeyRegistry.js';
import { on, qsa } from '../utils/dom.js';
import { state } from '../state.js';
import { applyUiZoom } from '../utils/uiZoom.js';

let ipcRenderer = null;
try {
    if (typeof window.require === 'function') {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) { /* Silent fail — expected in Browser Mode */ }

const TEXT_INPUT_TYPES = new Set([
    '',
    'text',
    'search',
    'url',
    'tel',
    'email',
    'password',
    'number',
    'date',
    'datetime-local',
    'month',
    'time',
    'week',
]);

const ESCAPE_DISMISSABLE_SELECTORS = [
    '.mpi-popup.is-active',
    '.mpi-dropdown__list.is-open',
    '.mpi-ctx-menu',
    '.mpi-slide-over[aria-expanded="true"]',
    '.mpi-media-drop-overlay--visible',
    '.mpi-project-drop-overlay--visible',
    '.mpi-overlay',
    '.mpi-overlay-backdrop',
    '.mpi-modal-wrapper',
    '.mpi-modal-backdrop',
];

function isTextEntryElement(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el.isContentEditable) return true;
    if (!(el instanceof HTMLInputElement)) return false;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
}

class HotkeyManager {
    constructor() {
        /** @type {Map<string, Set<Function>>} key = `${type}:${normalizedKey}` */
        this._handlers = new Map();
        this._cleanupDown = null;
        this._cleanupUp   = null;
        this._cleanupPointer = null;
        this._lastPointer = null;
    }

    /**
     * Call once at shell startup.
     */
    init() {
        this._cleanupDown = on(window, 'keydown', (e) => this._handle(e, KEY_TYPE.DOWN), { capture: true });
        this._cleanupUp   = on(window, 'keyup',   (e) => this._handle(e, KEY_TYPE.UP),   { capture: true });
        this._cleanupPointer = on(window, 'pointermove', (e) => {
            this._lastPointer = { x: e.clientX, y: e.clientY };
        }, { capture: true });

        // Built-in: fullscreen
        this.bind('system.fullscreen', () => {
            if (ipcRenderer) ipcRenderer.send('window-fullscreen');
        });

        // Built-in: devtools (when gate in registry)
        this.bind('devtools.toggle', () => {
            if (ipcRenderer) ipcRenderer.send('toggle-dev-tools');
        });

        // Built-in: keyboard context menu. Dev mode leaves this unhandled so
        // Electron can show its native Inspect Element menu.
        this.bind('system.contextMenu', () => this._openContextMenuAtPointer());
        this.bind('system.contextMenu.shiftF10', () => this._openContextMenuAtPointer());

        // Built-in: global UI size (webFrame zoom) — Ctrl+ / Ctrl- equivalents
        // of the Ctrl+wheel handler in init.js.
        this.bind('system.uiZoom.in.plus',  () => applyUiZoom(1));
        this.bind('system.uiZoom.in.equal', () => applyUiZoom(1));
        this.bind('system.uiZoom.out',      () => applyUiZoom(-1));
    }

    /**
     * Bind a handler to a registry entry by id.
     * Multiple handlers per id are allowed — all are called in bind order.
     * @param {string} id
     * @param {Function} handler
     * @returns {Function} unbind function
     */
    bind(id, handler) {
        const mapKey = this._mapKey(id);
        if (!mapKey) {
            console.warn(`[Hotkeys] bind: unknown id "${id}"`);
            return () => {};
        }
        if (!this._handlers.has(mapKey)) this._handlers.set(mapKey, new Set());
        this._handlers.get(mapKey).add(handler);
        return () => this.unbind(id, handler);
    }

    /**
     * @param {string} id
     * @param {Function} handler
     */
    unbind(id, handler) {
        const mapKey = this._mapKey(id);
        if (!mapKey) return;
        this._handlers.get(mapKey)?.delete(handler);
    }

    /**
     * @returns {Array} full registry array
     */
    getRegistry() {
        return HOTKEY_REGISTRY;
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Build internal map key from registry id.
     * @param {string} id
     * @returns {string|null}
     */
    _mapKey(id) {
        const entry = HOTKEY_REGISTRY.find(e => e.id === id);
        if (!entry) return null;
        return `${entry.type ?? KEY_TYPE.DOWN}:${entry.key}`;
    }

    /**
     * @param {KeyboardEvent} e
     * @param {string} type KEY_TYPE.DOWN | KEY_TYPE.UP
     */
    _handle(e, type) {
        const key = this._normalizeKey(e);
        const mapKey = `${type}:${key}`;

        const handlers = this._handlers.get(mapKey);
        if (!handlers || handlers.size === 0) return;

        // Find the matching registry entry for this key+type combo.
        // There may be multiple entries with same key+type (e.g. mask.brush.toolbar + mask.brush.canvas).
        // All bound handlers for this mapKey are eligible; we apply shared gating.
        const entries = HOTKEY_REGISTRY.filter(e => e.key === key && (e.type ?? KEY_TYPE.DOWN) === type);
        if (entries.length === 0) return;

        const activeEl = document.activeElement;
        const isTyping = isTextEntryElement(activeEl);

        const isSingleLetter = e.key.length === 1 && !e.ctrlKey && !e.metaKey;
        const isBareModifier = ['Shift', 'Alt', 'Control', 'Meta'].includes(e.key);
        const isFKey = /^F\d+$/.test(e.key);
        // Named editing/navigation keys the browser uses inside text fields.
        // When focus is in a text input these must stay native so the user
        // can delete characters, move the caret, etc.
        const isTextEditKey = [
            'Delete', 'Backspace',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'PageUp', 'PageDown',
        ].includes(e.key);

        // Determine if ANY bound handler should fire by checking at least one
        // registry entry allows it under current conditions.
        let shouldFire = false;
        for (const entry of entries) {
            // isTyping gate
            if (isTyping && !entry.allowWhileTyping) {
                if (isSingleLetter || (isBareModifier && !isFKey) || isTextEditKey) {
                    continue; // blocked
                }
            }

            // when() gate
            if (entry.when && !entry.when({ state, event: e, activeElement: activeEl, isTyping })) {
                continue;
            }

            shouldFire = true;
            break;
        }

        if (!shouldFire) return;

        if (key === 'escape') {
            e.mpiEscapeContext = this._buildEscapeContext(activeEl);
        }

        e.preventDefault();
        e.stopPropagation();

        handlers.forEach(fn => {
            try { fn(e); }
            catch (err) { console.error(`[Hotkeys] Error in "${mapKey}" handler:`, err); }
        });
    }

    /**
     * Normalize a KeyboardEvent to a lowercase key string.
     * @param {KeyboardEvent} e
     * @returns {string}
     */
    _normalizeKey(e) {
        const rawKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
        const normalizedKey = rawKey === 'apps' ? 'contextmenu' : rawKey;
        const isBareModifier = ['control', 'shift', 'alt', 'meta'].includes(normalizedKey);
        if (isBareModifier) return normalizedKey;

        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('control');
        if (e.shiftKey && normalizedKey !== 'shift') parts.push('shift');
        if (e.altKey) parts.push('alt');
        parts.push(normalizedKey);
        return parts.join('+');
    }

    _openContextMenuAtPointer() {
        const point = this._resolveContextMenuPoint();
        const target = document.elementFromPoint(point.x, point.y);
        if (!target) return;

        target.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: point.x,
            clientY: point.y,
            button: 2,
            buttons: 0,
        }));
    }

    _resolveContextMenuPoint() {
        const point = this._lastPointer;
        if (
            point &&
            point.x >= 0 &&
            point.y >= 0 &&
            point.x <= window.innerWidth &&
            point.y <= window.innerHeight
        ) {
            return point;
        }

        const activeEl = document.activeElement;
        if (activeEl && activeEl !== document.body && typeof activeEl.getBoundingClientRect === 'function') {
            const rect = activeEl.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
                y: Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)),
            };
        }

        return {
            x: Math.max(0, Math.floor(window.innerWidth / 2)),
            y: Math.max(0, Math.floor(window.innerHeight / 2)),
        };
    }

    _buildEscapeContext(activeEl) {
        const activeDismissableUi = qsa(ESCAPE_DISMISSABLE_SELECTORS.join(','))
            .some(el => this._isVisible(el));

        return {
            activeDismissableUi,
            focusModeActive: !!state.focusMode,
            promptBoxFocused: activeEl instanceof HTMLTextAreaElement &&
                !!activeEl.closest?.('.mpi-prompt-box'),
            textEntryFocused: isTextEntryElement(activeEl),
        };
    }

    _isVisible(el) {
        if (!el || !document.contains(el)) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            el.getClientRects().length > 0;
    }
}

/** @type {HotkeyManager} Singleton */
export const Hotkeys = new HotkeyManager();
