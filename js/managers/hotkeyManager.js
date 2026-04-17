/**
 * js/managers/hotkeyManager.js — Centralized Shortcut Registration for MpiAiSuite.
 *
 * TODO:
 * - [ ] Implement F5 / Ctrl+F5 for VRAM/Model Unloading
 * - [ ] Implement M, B, E for Masking Mode (Tool Specific)
 * - [ ] Implement Ctrl+Enter for main tool execution (Global)
 */

'use strict';

import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { Events } from '../events.js';

let ipcRenderer = null;
try {
    if (typeof window.require === 'function') {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) { /* Silent fail — expected in Browser Mode */ }

class HotkeyManager {
    constructor() {
        /** @type {Map<string, Function|null>} single handler per key; null = removed but prev was registered */
        this._handlers = new Map();
        this._init();
    }

    /**
     * Start global keydown listener
     * @private
     */
    _init() {
        window.addEventListener('keydown', (e) => this._handleKeyDown(e), { capture: true });
        this._registerBuiltins();
    }

    /**
     * Register built-in system hotkeys.
     * @private
     */
    _registerBuiltins() {
        // F11 — Toggle fullscreen
        this.register('f11', () => {
            if (ipcRenderer) ipcRenderer.send('window-fullscreen');
        });

        // Ctrl+Shift+I — Toggle DevTools (dev mode only)
        this.register('control+shift+i', () => {
            if (APP_CONFIG.dev_mode) {
                if (ipcRenderer) ipcRenderer.send('toggle-dev-tools');
            }
        });
    }

    /**
     * Register a new hotkey callback, replacing any existing handler for this key.
     * Returns an unsubscribe function that restores the previous handler.
     * @param {string} keyString - Example: 'escape', 'control+enter', 'control+shift+i'
     * @param {Function} callback - The function to execute on match
     */
    register(keyString, callback) {
        const key = keyString.toLowerCase();
        const prev = this._handlers.get(key) ?? null;
        this._handlers.set(key, callback);
        return () => {
            this._handlers.set(key, prev);
        };
    }

    /**
     * Unregister a hotkey callback. Only removes if it matches the currently registered handler.
     * @param {string} keyString
     * @param {Function} callback
     */
    unregister(keyString, callback) {
        const key = keyString.toLowerCase();
        if (this._handlers.get(key) === callback) {
            this._handlers.delete(key);
        }
    }

    /**
     * Main event handler logic
     * @param {KeyboardEvent} e 
     * @private
     */
    _handleKeyDown(e) {
        const key = this._getEventKeyString(e);

        // Check for exact matches in the registry
        if (this._handlers.has(key)) {
            const handler = this._handlers.get(key);
            if (handler) {
                // Prevent defaults if we have registered handlers
                e.preventDefault();
                e.stopPropagation();
                try { handler(e); }
                catch (err) { console.error(`[Hotkeys] Error in "${key}" handler:`, err); }
            }
        }

        // Bridge to Event Bus for broad observers
        Events.emit(`hotkey:${key}`, e);
    }

    /**
     * Normalizes KeyboardEvent into a standard string key
     * @param {KeyboardEvent} e 
     * @returns {string} - e.g. 'control+shift+i'
     * @private
     */
    _getEventKeyString(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('control');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');

        const key = e.key.toLowerCase();
        // Don't add if it's just a modifier key release
        if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
            parts.push(key);
        }

        return parts.join('+');
    }
}

/** @type {HotkeyManager} Singleton Manager instance */
export const Hotkeys = new HotkeyManager();
