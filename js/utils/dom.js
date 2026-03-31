/**
 * js/utils/dom.js — Lightweight DOM utilities for MpiAiSuite.
 * Import these instead of writing querySelector boilerplate.
 */

'use strict';

/**
 * Shorthand for querySelector. Scopes to document if root is omitted.
 * @param {string} sel - CSS selector
 * @param {Element|Document} [root=document]
 * @returns {Element|null}
 */
export const qs = (sel, root = document) => root.querySelector(sel);

/**
 * Shorthand for querySelectorAll, returns Array (not NodeList).
 * @param {string} sel - CSS selector
 * @param {Element|Document} [root=document]
 * @returns {Element[]}
 */
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Convenience addEventListener. Returns a cleanup function.
 * @param {EventTarget} el
 * @param {string} event
 * @param {Function} fn
 * @param {AddEventListenerOptions} [opts]
 * @returns {Function} cleanup — call to remove the listener
 */
export const on = (el, event, fn, opts) => {
    el.addEventListener(event, fn, opts);
    return () => el.removeEventListener(event, fn, opts);
};

/**
 * Convenience removeEventListener.
 * @param {EventTarget} el
 * @param {string} event
 * @param {Function} fn
 */
export const off = (el, event, fn) => el.removeEventListener(event, fn);
