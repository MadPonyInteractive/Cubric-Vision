/**
 * js/managers/hotkeyManager.js — Centralized Shortcut Registration for MpiAiSuite.
 * 
 * TODO:
 * - [ ] Move projectManager.js to js/managers/ (Migration)
 * - [ ] Move modelManager.js to js/managers/ (Migration)
 * - [ ] Move templateManager.js to js/managers/ (Migration)
 * - [ ] Move themeManager.js to js/managers/ (Migration)
 * - [ ] Implement Enter for Modal Confirmation (Global)
 * - [ ] Implement F11 for Toggle Full Screen
 * - [ ] Implement F5 / Ctrl+F5 for VRAM/Model Unloading
 * - [ ] Implement M, B, E for Masking Mode (Tool Specific)
 * - [ ] Implement Ctrl+Enter for main tool execution (Global)
 */

'use strict';

import { Events } from '../events.js';

class HotkeyManager {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._handlers = new Map();
        this._init();
        console.log('[Hotkeys] Initialized Manager');
    }

    /**
     * Start global keydown listener
     * @private
     */
    _init() {
        window.addEventListener('keydown', (e) => this._handleKeyDown(e), { capture: true });
    }

    /**
     * Register a new hotkey callback.
     * @param {string} keyString - Example: 'escape', 'control+enter', 'control+shift+i'
     * @param {Function} callback - The function to execute on match
     */
    register(keyString, callback) {
        const key = keyString.toLowerCase();
        if (!this._handlers.has(key)) {
            this._handlers.set(key, new Set());
        }
        this._handlers.get(key).add(callback);
    }

    /**
     * Unregister a hotkey callback.
     * @param {string} keyString 
     * @param {Function} callback 
     */
    unregister(keyString, callback) {
        const key = keyString.toLowerCase();
        this._handlers.get(key)?.delete(callback);
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
            const callbacks = this._handlers.get(key);
            if (callbacks.size > 0) {
                // Prevent defaults if we have registered handlers
                // Note: Some system keys like Escape should usually close the top-most layer
                e.preventDefault();
                e.stopPropagation();
                
                // Execute all registered handlers (most recent first if we want ordering, but Set is insertion order)
                callbacks.forEach(cb => {
                    try { cb(e); } catch (err) { console.error(`[Hotkeys] Error in "${key}" handler:`, err); }
                });
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
