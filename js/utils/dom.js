/**
 * js/utils/dom.js — Lightweight DOM utilities for Cubric Studio.
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
 * Shorthand for getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export const gid = (id) => document.getElementById(id);

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
 * Convenience removeEventListener. Returns a re-add function.
 * @param {EventTarget} el
 * @param {string} event
 * @param {Function} fn
 * @param {AddEventListenerOptions} [opts]
 * @returns {Function} re-add — call to re-attach the listener
 */
export const off = (el, event, fn, opts) => {
    el.removeEventListener(event, fn, opts);
    return () => el.addEventListener(event, fn, opts);
};

/**
 * Shorthand for document.createElement with optional properties and children.
 * @param {string} tag
 * @param {Object} [props] - Properties to assign (e.g. { className, id, onclick })
 * @param {Array|Node|string} [children] - Child nodes, text, or an array of both
 * @returns {HTMLElement}
 * Usage:
const myBtn = ce('button', { 
    className: 'primary', 
    onclick: () => console.log('click') 
}, 'Click Me');
 */
export const ce = (tag, props, children) => {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (children) {
        if (Array.isArray(children)) el.append(...children.filter(Boolean));
        else el.append(children);
    }
    return el;
};
