/**
 * js/templateLoader.js — Lazy HTML template loader.
 *
 * Fetches <template> blocks from templates/*.html and injects them into the
 * document <head> on first use. Subsequent calls for the same template ID are
 * resolved immediately from the DOM (zero network cost).
 *
 * RULES FOR AGENTS:
 * - All tool templates live in templates/tpl-<name>.html
 * - The file must contain exactly one root <template id="tpl-..."> element
 * - shell.js calls `await ensureTemplate('tpl-foo')` before cloning
 * - Do NOT call document.getElementById('tpl-xxx') without calling ensureTemplate first
 *
 * Usage:
 *   import { ensureTemplate, preloadTemplates } from './templateLoader.js';
 *
 *   // Ensure a single template is in the DOM before use
 *   await ensureTemplate('tpl-generator');
 *   const el = document.getElementById('tpl-generator').content.cloneNode(true);
 *
 *   // Eagerly load multiple templates in parallel (call during app init)
 *   await preloadTemplates(['tpl-provisioning', 'tpl-settings', 'tpl-comingSoon']);
 */

'use strict';

import { gid } from '../utils/dom.js';

const _loading = new Map(); // tplId → Promise (in-flight de-duplication)

/**
 * Ensures a template element with the given ID exists in the DOM.
 * Fetches from templates/<tplId>.html if not already present.
 *
 * @param {string} tplId - e.g. 'tpl-generator'
 * @returns {Promise<HTMLTemplateElement>}
 */
export async function ensureTemplate(tplId) {
    // Fast path: already in DOM
    const existing = gid(tplId);
    if (existing) return existing;

    // De-duplicate concurrent requests for the same template
    if (_loading.has(tplId)) return _loading.get(tplId);

    const promise = _fetchAndInject(tplId);
    _loading.set(tplId, promise);

    try {
        const el = await promise;
        return el;
    } finally {
        _loading.delete(tplId);
    }
}

async function _fetchAndInject(tplId) {
    const url = `templates/${tplId}.html`;
    let html;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        html = await res.text();
    } catch (err) {
        console.error(`[templateLoader] Failed to load ${url}:`, err);
        throw err;
    }

    // Parse the fetched HTML fragment
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tpl = doc.getElementById(tplId);

    if (!tpl || tpl.tagName.toLowerCase() !== 'template') {
        throw new Error(`[templateLoader] ${url} does not contain <template id="${tplId}">`);
    }

    // Import into the current document and append to <head> (hidden, just like inline templates)
    const imported = document.adoptNode(tpl);
    document.head.appendChild(imported);

    return imported;
}

/**
 * Preloads multiple templates in parallel. Call during app init to warm the
 * cache for templates that are always used (provisioning, coming-soon, settings).
 *
 * @param {string[]} tplIds
 * @returns {Promise<void>}
 */
export async function preloadTemplates(tplIds) {
    await Promise.all(tplIds.map(id => ensureTemplate(id).catch(err => {
        // Non-fatal: log and continue — the app will try again when navigating
        console.warn(`[templateLoader] Preload failed for ${id}:`, err);
    })));
}
