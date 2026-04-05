import { ComponentFactory } from '../../factory.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { on } from '../../../utils/dom.js';
import { ICONS } from '../../../utils/icons.js';

/**
 * MpiRadialMenu — Radial navigation primitive.
 *
 * Hold Tab to show, release Tab to hide (or click an item to lock-select).
 * Receives a `context` prop and renders the correct option set.
 *
 * @typedef {import('../../types.js').MpiRadialMenuProps} MpiRadialMenuProps
 *
 * @param {string} [context=''] - Active context key. Must match a key injected via el.setContextItems().
 * @param {boolean} [open=false] - Force-open state (used by workspace for first-run)
 * @param {Array<{action:string, label:string, icon:string}>} [extraItems=[]] - Additional items appended to the active context (e.g. dev-only entries)
 *
 * Emits:
 * 'select' { action: string } — user chose an item
 * 'open'   {}                 — menu became visible
 * 'close'  {}                 — menu became hidden
 */
export const MpiRadialMenu = ComponentFactory.create({
    name: 'MpiRadialMenu',
    css: ['js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css'],

    template: () => `<div class="mpi-radial" aria-label="Radial Menu" role="navigation"></div>`,

    setup: (el, props, emit) => {

        // ── Context item definitions ────────────────────────────────────────────

        // Context items are injected externally via el.setContextItems().
        // navigation.js owns all context definitions — this map starts empty.
        /** @type {Record<string, Array<{action:string, label:string, icon:string}>>} */
        const CONTEXTS = {};

        // ── State ───────────────────────────────────────────────────────────────

        let _visible    = props.open || false;
        let _context    = props.context || 'root';
        let _extraItems = props.extraItems || [];
        let _tabHeld    = false;
        let _locked     = false;   // locked open after item click commits
        let _cleanups   = [];      // cleanup fns to run on destroy

        // ── SVG icon helper ─────────────────────────────────────────────────────

        /**
         * Returns an SVG string for the given ICONS registry key.
         * Falls back to a generic dot so items always render.
         * @param {string} name
         * @returns {string} SVG HTML string
         */
        function _icon(name) {
            const paths = ICONS[name];
            if (paths) {
                return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">${paths}</svg>`;
            }
            return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>`;
        }

        // ── Render ──────────────────────────────────────────────────────────────

        /**
         * Re-renders the items for the current context.
         * Called whenever context changes or menu opens.
         */
        function _render() {
            const items = [...(CONTEXTS[_context] || CONTEXTS.root), ..._extraItems];
            const count = items.length;

            // Clear previous items (keep container, reset state classes)
            el.innerHTML = '';

            // Center "hint" label — only shown at root with no prior selection
            const hint = document.createElement('div');
            hint.className = 'mpi-radial__hint';
            hint.textContent = 'Hold Tab to call me';
            el.appendChild(hint);

            items.forEach((item, i) => {
                // Spread items evenly around a full circle
                // Start at the top (−90°) so first item sits at 12 o'clock
                const angleDeg = -90 + (360 / count) * i;
                const angleRad = (angleDeg * Math.PI) / 180;

                // Radius in CSS em units — scales with font size
                const R = 7.5; // em
                const x = Math.cos(angleRad) * R;
                const y = Math.sin(angleRad) * R;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mpi-radial__item';
                btn.dataset.action = item.action;
                btn.dataset.info = item.label;

                // Position via CSS custom properties
                btn.style.setProperty('--rx', `${x.toFixed(3)}em`);
                btn.style.setProperty('--ry', `${y.toFixed(3)}em`);

                // Stagger animation delay
                btn.style.setProperty('--ri', String(i));

                btn.innerHTML = `
                    <span class="mpi-radial__item-icon">${_icon(item.icon)}</span>
                    <span class="mpi-radial__item-label">${item.label}</span>
                `;

                btn.addEventListener('click', () => _selectItem(item.action));

                // Dispatch info bar description on hover
                btn.addEventListener('mouseenter', () => {
                    el.dispatchEvent(new CustomEvent('mpiinfo', {
                        detail: item.label, bubbles: true
                    }));
                });

                el.appendChild(btn);
            });
        }

        // ── Visibility ──────────────────────────────────────────────────────────

        /** Show the radial menu with entrance animation */
        function _show() {
            if (_visible) return;
            _visible = true;
            _render();
            el.classList.remove('mpi-radial--hidden');
            el.classList.add('mpi-radial--visible');
            emit('open', {});
        }

        /** Hide the radial menu */
        function _hide() {
            if (!_visible && !el.classList.contains('mpi-radial--visible')) return;
            _visible = false;
            _locked  = false;
            el.classList.remove('mpi-radial--visible');
            el.classList.add('mpi-radial--hidden');
            emit('close', {});
        }

        /** Handle item selection */
        function _selectItem(action) {
            _locked = true;
            emit('select', { action });
            _hide();
        }

        // ── Tab hold logic ──────────────────────────────────────────────────────

        /**
         * HotkeyManager handles keydown for 'tab'.
         * We add a direct window keyup listener for the release.
         * This is intentional: HotkeyManager has no keyup support.
         */
        const _onTabDown = () => {
            if (_tabHeld || _locked) return;
            _tabHeld = true;
            _show();
        };

        const _onTabUp = (e) => {
            if (e.key !== 'Tab') return;
            _tabHeld = false;
            if (!_locked) _hide();
        };

        Hotkeys.register('tab', _onTabDown);
        const _removeKeyUp = on(window, 'keyup', _onTabUp);

        // ── Public API (attached directly to el) ────────────────────────────────

        /**
         * Programmatically show the menu (used by workspace for first-run state).
         */
        el.show = _show;

        /**
         * Programmatically hide the menu.
         */
        el.hide = _hide;

        /**
         * Update the active context and re-render if visible.
         * @param {'root'|'image'|'video'|'audio'} ctx
         */
        el.setContext = (ctx) => {
            _context = ctx;
            if (_visible) _render();
        };

        /**
         * Replace the extra (injected) items and re-render if visible.
         * @param {Array<{action:string, label:string, icon:string}>} items
         */
        el.setExtraItems = (items) => {
            _extraItems = items;
            if (_visible) _render();
        };

        /**
         * Inject or replace the item set for a named context.
         * Allows external callers (e.g. navigation.js) to define custom contexts
         * without modifying the radial's internal CONTEXTS map.
         * @param {string} ctx - Context name (can be any string, not just built-in ones)
         * @param {Array<{action:string, label:string, icon:string}>} items
         */
        el.setContextItems = (ctx, items) => {
            CONTEXTS[ctx] = items;
            if (_context === ctx && _visible) _render();
        };

        // ── Initial state ───────────────────────────────────────────────────────

        if (props.open) {
            // Auto-open on workspace entry: render and show visually, but keep
            // _visible=false so the first Tab-down can properly pick up state.
            // The first Tab-release will hide it; all subsequent Tab-holds work normally.
            _render();
            el.classList.add('mpi-radial--visible');
            emit('open', {});
        } else {
            el.classList.add('mpi-radial--hidden');
        }

        // ── Cleanup ─────────────────────────────────────────────────────────────

        _cleanups.push(_removeKeyUp);
        _cleanups.push(() => Hotkeys.unregister('tab', _onTabDown));

        // MutationObserver: clean up when el is removed from DOM
        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                _cleanups.forEach(fn => fn());
                _cleanups = [];
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
