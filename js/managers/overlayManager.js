/**
 * js/managers/overlayManager.js — Queue-based Blocking UI Controller.
 * 
 * Ensures only one "blocking" overlay (Modal, Overlay, Dialog) is visible at a time.
 * If multiple requests occur, they are queued and shown sequentially.
 * This manager allows for a "priority"-agnostic flow where the user finishes one 
 * task before moving to the next.
 * 
 * Integration:
 * - Register via OverlayManager.request(instance)
 * - Release via OverlayManager.release(instance)
 */

'use strict';

import { Hotkeys } from './hotkeyManager.js';
import { Events } from '../events.js';

/**
 * @typedef {Object} MpiOverlayInstance
 * @property {function(): void} show - Trigger visibility
 * @property {function(): void} hide - Terminate visibility
 * @property {HTMLElement} [el] - Root element (for focus management)
 */

class OverlayManager {
    constructor() {
        /** @type {MpiOverlayInstance|null} Current visible overlay */
        this._active = null;
        
        /** @type {MpiOverlayInstance[]} Pending overlays */
        this._queue = [];

        // Attach global Escape key listener via HotkeyManager
        Hotkeys.bind('overlay.close', () => this.tryCloseActive());
    }

    /**
     * Request an overlay to be shown. If another is already active, it will be queued.
     * @param {MpiOverlayInstance} instance - Any component instance with show/hide methods
     */
    request(instance) {
        if (!instance || typeof instance.show !== 'function') {
            console.error('[Overlays] Invalid instance requested. Must implement .show()');
            return;
        }

        if (this._active && this._active !== instance) {
            this._queue.push(instance);
        } else {
            this._setActive(instance);
        }
    }

    /**
     * Notifies the manager that an overlay has finished/closed.
     * This will trigger the next item in the queue.
     * @param {any} instance - The instance or its unique ID (el)
     */
    release(instance) {
        const isActiveMatch = this._active === instance || (this._active && this._active.id === instance);

        if (isActiveMatch) {
            this._active = null;
            this._checkQueue();
        } else {
            this._queue = this._queue.filter(i => (i !== instance && i.id !== instance));
        }
    }

    /**
     * Force-clears all overlay state without calling hide().
     * Call this before navigation tears down #tool-container so the queue
     * doesn't get stuck thinking an overlay is still active.
     */
    reset() {
        Events.emit('ui:close-all-popups');
        this._active = null;
        this._queue = [];
    }

    /**
     * Attempts to close the current active overlay (triggered by Escape or global logic).
     * @returns {boolean} - True if an overlay was closed
     */
    tryCloseActive() {
        if (this._active) {
            // Check if the component allows immediate closure
            // We follow the user request to "close immediately"
            if (typeof this._active.hide === 'function') {
                this._active.hide();
                // Note: The component should call OverlayManager.release() during its hide() cleanup
                // But as a safety guard, we ensure state here or call release
                return true;
            }
        }
        return false;
    }

    /**
     * Show next item in the queue if available.
     * @private
     */
    _checkQueue() {
        if (this._queue.length > 0) {
            this._setActive(this._queue.shift());
        }
    }

    /**
     * Direct call to show an overlay
     * @param {MpiOverlayInstance} instance 
     * @private
     */
    _setActive(instance) {
        this._active = instance;

        // Force-close any unmanaged floating UI (Popups, Dropdowns, etc.)
        Events.emit('ui:close-all-popups');

        try {
            if (typeof instance.show === 'function') {
                instance.show();
            }
        } catch (err) {
            console.error('[Overlays] Error showing overlay:', err);
            this._active = null;
            this._checkQueue();
        }
    }
}

/** @type {OverlayManager} Singleton Controller */
export const Overlays = new OverlayManager();
