/**
 * MpiViewerCorners — top-right chip strip for viewers (Compound).
 *
 * Shared corner overlay used by canvas + video viewers to surface short
 * status chips (op label, ratio, clip length, Compare button, etc.).
 * Dumb container — chip behavior is supplied via the `topRight` prop.
 *
 * Props:
 *   topRight: Array<ChipSpec>
 *   topLeft:  Array<ChipSpec>
 *
 * ChipSpec: { text, accent?, disabled?, onClick? }
 *
 * Instance API (on el):
 *   setTopRight(items)            — replace the right chip list (full re-render)
 *   setTopLeft(items)             — replace the left chip list (full re-render)
 *   setChipEnabled(index, bool)   — toggle disabled state without re-render (top-right only)
 *   setChipText(index, text)      — update chip text without re-render (top-right only)
 *   setChipAccent(index, bool)    — toggle accent state (top-right only)
 *   destroy()                     — drop all listeners
 */

import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

export const MpiViewerCorners = ComponentFactory.create({
    name: 'MpiViewerCorners',
    css: ['js/components/Compounds/MpiViewerCorners/MpiViewerCorners.css'],

    template: () => `
        <div class="mpi-viewer-corners">
            <div class="mpi-viewer-corners__top-left"  id="top-left"></div>
            <div class="mpi-viewer-corners__top-right" id="top-right"></div>
        </div>
    `,

    setup: (el, props) => {
        const topRightEl = qs('#top-right', el);
        const topLeftEl  = qs('#top-left',  el);
        const _unsubs = [];
        const _leftUnsubs = [];
        /** @type {Array<{ text: string, accent?: boolean, disabled?: boolean, onClick?: () => void }>} */
        let _items = [];
        /** @type {HTMLElement[]} */
        let _chipEls = [];

        function _clearListeners() {
            while (_unsubs.length) {
                const fn = _unsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
        }

        function _render() {
            _clearListeners();
            topRightEl.innerHTML = '';
            _chipEls = [];

            // Hide box entirely when no chips
            topRightEl.style.display = _items.length ? '' : 'none';

            for (let i = 0; i < _items.length; i++) {
                const item = _items[i] || {};
                const isButton = typeof item.onClick === 'function';
                const tag = isButton ? 'button' : 'span';
                const node = document.createElement(tag);
                node.className = 'mpi-viewer-corners__chip';
                if (isButton) node.classList.add('mpi-viewer-corners__chip--button');
                if (item.accent) node.classList.add('mpi-viewer-corners__chip--accent');
                if (item.disabled) {
                    node.classList.add('mpi-viewer-corners__chip--disabled');
                    if (isButton) node.disabled = true;
                }
                node.textContent = item.text || '';

                if (isButton) {
                    const cb = item.onClick;
                    _unsubs.push(on(node, 'click', (ev) => {
                        if (node.disabled || node.classList.contains('mpi-viewer-corners__chip--disabled')) return;
                        cb(ev);
                    }));
                }

                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'mpi-viewer-corners__sep';
                    sep.textContent = '·';
                    topRightEl.appendChild(sep);
                }
                topRightEl.appendChild(node);
                _chipEls.push(node);
            }
        }

        el.setTopRight = (items) => {
            _items = Array.isArray(items) ? items.slice() : [];
            _render();
        };

        function _clearLeftListeners() {
            while (_leftUnsubs.length) {
                const fn = _leftUnsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
        }

        el.setTopLeft = (items) => {
            _clearLeftListeners();
            topLeftEl.innerHTML = '';
            const list = Array.isArray(items) ? items : [];
            topLeftEl.style.display = list.length ? '' : 'none';
            for (let i = 0; i < list.length; i++) {
                const item = list[i] || {};
                const isButton = typeof item.onClick === 'function';
                const tag = isButton ? 'button' : 'span';
                const node = document.createElement(tag);
                node.className = 'mpi-viewer-corners__chip';
                if (isButton) node.classList.add('mpi-viewer-corners__chip--button');
                if (item.accent) node.classList.add('mpi-viewer-corners__chip--accent');
                if (item.disabled) {
                    node.classList.add('mpi-viewer-corners__chip--disabled');
                    if (isButton) node.disabled = true;
                }
                node.textContent = item.text || '';
                if (isButton) {
                    const cb = item.onClick;
                    _leftUnsubs.push(on(node, 'click', (ev) => {
                        if (node.disabled || node.classList.contains('mpi-viewer-corners__chip--disabled')) return;
                        cb(ev);
                    }));
                }
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'mpi-viewer-corners__sep';
                    sep.textContent = '·';
                    topLeftEl.appendChild(sep);
                }
                topLeftEl.appendChild(node);
            }
        };

        el.setChipEnabled = (index, enabled) => {
            const node = _chipEls[index];
            if (!node) return;
            const disabled = !enabled;
            _items[index] = { ..._items[index], disabled };
            node.classList.toggle('mpi-viewer-corners__chip--disabled', disabled);
            if (node.tagName === 'BUTTON') node.disabled = disabled;
        };

        el.setChipText = (index, text) => {
            const node = _chipEls[index];
            if (!node) return;
            _items[index] = { ..._items[index], text };
            node.textContent = text || '';
        };

        el.setChipAccent = (index, accent) => {
            const node = _chipEls[index];
            if (!node) return;
            _items[index] = { ..._items[index], accent: !!accent };
            node.classList.toggle('mpi-viewer-corners__chip--accent', !!accent);
        };

        el.destroy = () => {
            _clearListeners();
            _clearLeftListeners();
            _items = [];
            _chipEls = [];
        };

        if (Array.isArray(props.topRight)) el.setTopRight(props.topRight);
        if (Array.isArray(props.topLeft))  el.setTopLeft(props.topLeft);
        else                                topLeftEl.style.display = 'none';
    }
});
