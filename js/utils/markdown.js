/**
 * js/utils/markdown.js — the app's ONE markdown renderer.
 *
 * `marked` parses, `DOMPurify` sanitizes, and nothing here hand-rolls a parser.
 * Both ship as zero-dependency browser ESM files, so they import straight from
 * `node_modules/` with no bundler: `express.static(__dirname)` serves the repo
 * root and `electron-builder.yml` packages `node_modules` (`files: ["**\/*"]`).
 *
 * Sanitizing is not optional. Notes come from `project.md` inside a project
 * folder the user may have been handed by someone else, so the HTML that
 * reaches `innerHTML` is untrusted by default.
 *
 * Consumers: MpiNotesEditor (project + card notes preview) and
 * MpiChangelogDialog (release notes).
 */
import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../../node_modules/dompurify/dist/purify.es.mjs';
import { on } from './dom.js';
import { openExternal } from './openExternal.js';

// GFM for tables/strikethrough (project.md uses a table); `breaks` so a single
// newline in hand-typed notes renders as one, which is what a notes field implies.
marked.setOptions({ gfm: true, breaks: true });

/**
 * Render a full markdown document to sanitized HTML.
 * @param {string} src
 * @returns {string} HTML
 */
export function renderMarkdown(src) {
    return DOMPurify.sanitize(marked.parse(String(src ?? '')));
}

/**
 * Render a single line to sanitized HTML — no block wrapper, no `<p>`.
 * For strings that already live inside their own element (a list item, a lead).
 * @param {string} src
 * @returns {string} HTML
 */
export function renderInlineMarkdown(src) {
    return DOMPurify.sanitize(marked.parseInline(String(src ?? '')));
}

/**
 * Render into an element, tagged `.mpi-md` so `styles/markdown.css` styles it.
 * Safe to call repeatedly — it replaces the content and adds no listeners.
 * @param {HTMLElement} el   - Host element; its content is replaced.
 * @param {string}      src  - Markdown source.
 */
export function renderMarkdownInto(el, src) {
    el.classList.add('mpi-md');
    el.innerHTML = renderMarkdown(src);
}

/**
 * Keep rendered links out of the app window — call ONCE per host element.
 *
 * A bare `<a href>` click inside Electron navigates the whole app away with no
 * way back, so every link is routed through `openExternal` instead. Delegated,
 * so it survives re-renders.
 *
 * @param {HTMLElement} el
 * @returns {Function} unsubscribe — collect it in the component's `_unsubs`.
 */
export function wireMarkdownLinks(el) {
    return on(el, 'click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        e.preventDefault();
        openExternal(link.getAttribute('href'));
    });
}
