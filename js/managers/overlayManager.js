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
        Hotkeys.register('escape', () => this.tryCloseActive());
        
        console.log('[Overlays] Initialized Manager');
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
            console.log('[Overlays] Queueing request: Busy with active overlay');
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
            console.log('[Overlays] Releasing active overlay');
            this._active = null;
            this._checkQueue();
        } else {
            // Remove from queue if it was still pending
            this._queue = this._queue.filter(i => (i !== instance && i.id !== instance));
        }
    }

    /**
     * Attempts to close the current active overlay (triggered by Escape or global logic).
     * @returns {boolean} - True if an overlay was closed
     */
    tryCloseActive() {
        if (this._active) {
            console.log('[Overlays] Closing active overlay via Hotkey');
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
            const next = this._queue.shift();
            this._setActive(next);
        }
    }

    /**
     * Direct call to show an overlay
     * @param {MpiOverlayInstance} instance 
     * @private
     */
    _setActive(instance) {
        this._active = instance;
        try {
            instance.show();
        } catch (err) {
            console.error('[Overlays] Error showing overlay:', err);
            this._active = null;
            this._checkQueue();
        }
    }
}

/** @type {OverlayManager} Singleton Controller */
export const Overlays = new OverlayManager();
