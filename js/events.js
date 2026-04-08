/**
 * js/events.js — Centralized Event Bus for MpiAiSuite.
 *
 * Usage:
 *   import { Events } from './events.js';
 *   Events.on('media:updated', ({ projectId }) => refresh(projectId));
 *   Events.emit('media:updated', { projectId: '123' });
 *   Events.once('comfy:ready', () => startRun());
 *   const ch = Events.channel('generator');
 *   ch.emit('result', { url }); ch.on('result', handler);
 */

'use strict';

class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event. Returns an unsubscribe function.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} unsubscribe
     */
    on(event, handler) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event once — auto-removes after first fire.
     * @param {string} event
     * @param {Function} handler
     */
    once(event, handler) {
        const wrapper = (data) => { handler(data); this.off(event, wrapper); };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe a handler from an event.
     * @param {string} event
     * @param {Function} handler
     */
    off(event, handler) {
        this._listeners.get(event)?.delete(handler);
    }

    /**
     * Emit an event with optional payload.
     * @param {string} event
     * @param {*} [data]
     */
    emit(event, data) {
        this._listeners.get(event)?.forEach(h => {
            try { h(data); } catch (e) { console.error(`[Events] Error in "${event}" handler:`, e); }
        });
    }

    /**
     * Returns a namespaced sub-bus. Useful for tool-level event isolation.
     * @param {string} namespace
     * @returns {{ on: Function, once: Function, off: Function, emit: Function }}
     */
    channel(namespace) {
        return {
            on:   (event, handler) => this.on(`${namespace}:${event}`, handler),
            once: (event, handler) => this.once(`${namespace}:${event}`, handler),
            off:  (event, handler) => this.off(`${namespace}:${event}`, handler),
            emit: (event, data)    => this.emit(`${namespace}:${event}`, data),
        };
    }

    /**
     * Remove all listeners (useful for testing/cleanup).
     */
    clear() {
        this._listeners.clear();
    }
}

/** @type {EventBus} Singleton event bus available app-wide */
export const Events = new EventBus();

/**
 * @typedef {Object} MpiEventMap — Canonical event names for MpiAiSuite
 *
 * 'ui:error'         { title: string, message: string } — show error dialog (shell listens)
 * 'media:updated'    { projectId: string }           — any tool saving to library
 * 'tool:running'     { tool: string, type: string }  — tool started a run
 * 'tool:idle'        { tool: string, type: string }  — tool run finished/cancelled
 * 'project:changed'  { project: Object }             — user switched active project
 * 'state:changed'    { key: string, value: any }     — reactive state mutation
 * 'comfy:starting'   —                               — ComfyUI server is starting up
 * 'comfy:ready'      —                               — ComfyUI server is ready
 * 'comfy:error'      { message: string }             — ComfyUI failed to start
 * 'nav:tool'         { toolName: string }            — user navigated to a tool
 */

