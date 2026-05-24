'use strict';

import { Hotkeys } from './hotkeyManager.js';
import { Events } from '../events.js';

/**
 * @typedef {Object} MpiOverlayInstance
 * @property {function(): void} show - Trigger visibility
 * @property {function(): void} hide - Terminate visibility
 * @property {HTMLElement} [el] - Root element (for focus management)
 */

const BASE_Z = 10000;
const STEP_Z = 10;

class OverlayManager {
    constructor() {
        /** @type {MpiOverlayInstance[]} Stack of active overlays, top = last */
        this._stack = [];

        /** @type {Array<function(): void>} Depth-change subscribers */
        this._depthSubs = [];

        Hotkeys.bind('overlay.close', () => this.closeTopOverlay());
    }

    /**
     * Push instance onto stack and show it immediately.
     * @param {MpiOverlayInstance} instance
     * @returns {{ depth: number, zIndex: number }}
     */
    request(instance) {
        if (!instance || typeof instance.show !== 'function') {
            console.error('[Overlays] Invalid instance — must implement .show()');
            return { depth: 0, zIndex: BASE_Z };
        }

        Events.emit('ui:close-all-popups');
        this._stack.push(instance);
        const depth = this._stack.length;
        const zIndex = BASE_Z + depth * STEP_Z;

        try {
            instance.show();
        } catch (err) {
            console.error('[Overlays] Error showing overlay:', err);
            this._stack.pop();
            return { depth: 0, zIndex: BASE_Z };
        }

        this._notifyDepthChange();
        return { depth, zIndex };
    }

    /**
     * Remove instance from stack (any position).
     * @param {MpiOverlayInstance} instance
     */
    release(instance) {
        const idx = this._stack.indexOf(instance);
        if (idx !== -1) {
            this._stack.splice(idx, 1);
            this._notifyDepthChange();
        }
    }

    /**
     * Close top-of-stack overlay (Escape).
     * @returns {boolean}
     */
    closeTopOverlay() {
        if (!this._stack.length) {
            Events.emit('ui:close-all-popups');
            return false;
        }
        const top = this._stack[this._stack.length - 1];
        if (typeof top.hide === 'function') {
            top.hide();
            return true;
        }
        return false;
    }

    /**
     * Check if instance is the current top of stack.
     * @param {MpiOverlayInstance} instance
     * @returns {boolean}
     */
    isTop(instance) {
        return this._stack.length > 0 && this._stack[this._stack.length - 1] === instance;
    }

    /**
     * Subscribe to stack depth changes (fires after push/pop).
     * @param {function(): void} cb
     * @returns {function(): void} unsubscribe
     */
    onDepthChange(cb) {
        this._depthSubs.push(cb);
        return () => { this._depthSubs = this._depthSubs.filter(s => s !== cb); };
    }

    /**
     * Force-clear all overlay state without calling hide().
     */
    reset() {
        Events.emit('ui:close-all-popups');
        this._stack = [];
        this._notifyDepthChange();
    }

    /** @private */
    _notifyDepthChange() {
        for (const cb of this._depthSubs) {
            try { cb(); } catch (e) { console.error('[Overlays] depthChange subscriber error:', e); }
        }
    }
}

/** @type {OverlayManager} Singleton Controller */
export const Overlays = new OverlayManager();
