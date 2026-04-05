import { ComponentFactory } from '../../factory.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { on } from '../../../utils/dom.js';
import { ICONS } from '../../../utils/icons.js';
import { updateProject } from '../../../managers/projectManager.js';
import { state } from '../../../state.js';

/**
 * MpiRadialMenu — Radial navigation primitive.
 *
 * Hold Tab to show items in ghost style.
 * Move mouse > 100px from centre to highlight the nearest item (angle-based).
 * Release Tab while outside centre → selects highlighted item.
 * Release Tab while inside centre → no selection, menu closes.
 *
 * First open shows a tutorial hint ("Hold Tab to call me") until the user
 * completes one Tab-hold cycle; then project.tutorialSeen is set to true.
 *
 * @param {string} [context='root'] - Active context key.
 * @param {boolean} [open=false]    - Force-open state (first-run).
 * @param {Array<{action:string, label:string, icon:string}>} [extraItems=[]]
 *
 * Emits:
 * 'select' { action: string }
 * 'open'   {}
 * 'close'  {}
 */
export const MpiRadialMenu = ComponentFactory.create({
    name: 'MpiRadialMenu',
    css: ['js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css'],

    template: () => `<div class="mpi-radial" aria-label="Radial Menu" role="navigation"></div>`,

    setup: (el, props, emit) => {

        // ── Distance from centre fo trigger visual feedback ────────
        const moveDist = 40;

        // ── Context item definitions ────────────────────────────────────────────
        /** @type {Record<string, Array<{action:string, label:string, icon:string}>>} */
        const CONTEXTS = {};

        // ── State ───────────────────────────────────────────────────────────────
        let _visible = props.open || false;
        let _context = props.context || 'root';
        let _extraItems = props.extraItems || [];
        let _tabHeld = false;
        let _cleanups = [];

        // Mouse-tracking state
        let _centerX = 0;   // page coords of radial centre
        let _centerY = 0;
        let _mouseX = 0;
        let _mouseY = 0;
        let _activeIndex = -1;  // currently highlighted item index (-1 = none / centre)

        // Cached item angles (set on render)
        /** @type {number[]} */
        let _itemAngles = [];
        let _itemCount = 0;

        // ── SVG icon helper ─────────────────────────────────────────────────────
        function _icon(name) {
            const paths = ICONS[name];
            if (paths) {
                return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">${paths}</svg>`;
            }
            return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>`;
        }

        // ── Tutorial state ──────────────────────────────────────────────────────
        function _tutorialSeen() {
            return !!(state.currentProject?.tutorialSeen);
        }

        function _markTutorialSeen() {
            if (_tutorialSeen()) return;
            updateProject({ tutorialSeen: true });
        }

        // ── Centre coords ───────────────────────────────────────────────────────
        function _updateCenter() {
            const rect = el.getBoundingClientRect();
            _centerX = rect.left + rect.width / 2;
            _centerY = rect.top + rect.height / 2;
        }

        // ── Cursor warp ─────────────────────────────────────────────────────────
        // Snaps the OS cursor to the radial centre via Electron IPC.
        // Falls back silently in browser mode.
        let _ipcRenderer = null;
        try {
            if (typeof window.require === 'function') {
                _ipcRenderer = window.require('electron').ipcRenderer;
            }
        } catch (e) { /* browser mode — no warp */ }

        function _warpToCenter() {
            if (!_ipcRenderer) return;
            _updateCenter();
            _ipcRenderer.send('warp-cursor', _centerX, _centerY);
            // Sync our internal mouse position so the first move event
            // is relative to the centre, not the old cursor position.
            _mouseX = _centerX;
            _mouseY = _centerY;
        }

        // ── Render ──────────────────────────────────────────────────────────────
        function _render() {
            const items = [...(CONTEXTS[_context] || CONTEXTS.root || []), ..._extraItems];
            _itemCount = items.length;
            _itemAngles = [];

            el.innerHTML = '';

            // Centre dot
            const dot = document.createElement('div');
            dot.className = 'mpi-radial__dot';
            el.appendChild(dot);

            // Tutorial hint — only if not yet seen
            const hint = document.createElement('div');
            hint.className = 'mpi-radial__hint';
            hint.textContent = 'Hold Tab to call me';
            if (_tutorialSeen()) hint.classList.add('mpi-radial__hint--hidden');
            el.appendChild(hint);

            // Cone SVG (one per menu, rotated/clipped by JS)
            const cone = document.createElement('div');
            cone.className = 'mpi-radial__cone';
            cone.innerHTML = _buildConeSvg(_itemCount);
            el.appendChild(cone);

            items.forEach((item, i) => {
                const angleDeg = -90 + (360 / _itemCount) * i;
                const angleRad = (angleDeg * Math.PI) / 180;
                _itemAngles.push(angleRad);

                const R = 7.5; // em
                const x = Math.cos(angleRad) * R;
                const y = Math.sin(angleRad) * R;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mpi-radial__item';
                btn.dataset.action = item.action;
                btn.dataset.index = String(i);

                btn.style.setProperty('--rx', `${x.toFixed(3)}em`);
                btn.style.setProperty('--ry', `${y.toFixed(3)}em`);
                btn.style.setProperty('--ri', String(i));

                btn.innerHTML = `
                    <span class="mpi-radial__item-icon">${_icon(item.icon)}</span>
                    <span class="mpi-radial__item-label">${item.label}</span>
                `;

                btn.addEventListener('mouseenter', () => {
                    el.dispatchEvent(new CustomEvent('mpiinfo', {
                        detail: item.label, bubbles: true
                    }));
                });

                el.appendChild(btn);
            });

            _activeIndex = -1;
            _updateCenter();
        }

        // ── Cone SVG builder ────────────────────────────────────────────────────
        /**
         * Builds an SVG with a single wedge/cone that spans one item's angular slot.
         * The cone is centred at 0° (pointing right) and rotated via CSS transform.
         * Half-angle = 360 / itemCount / 2
         */
        function _buildConeSvg(count) {
            const size = 600; // px (viewBox)
            const cx = size / 2;
            const cy = size / 2;
            const outerR = size / 2;
            const halfAngle = (360 / Math.max(count, 1) / 2) * (Math.PI / 180);

            // Wedge from centre, pointing right (0°), spanning ±halfAngle
            const x1 = cx + outerR * Math.cos(-halfAngle);
            const y1 = cy + outerR * Math.sin(-halfAngle);
            const x2 = cx + outerR * Math.cos(halfAngle);
            const y2 = cy + outerR * Math.sin(halfAngle);

            const largeArc = halfAngle * 2 > Math.PI ? 1 : 0;

            const d = [
                `M ${cx} ${cy}`,
                `L ${x1.toFixed(2)} ${y1.toFixed(2)}`,
                `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
                'Z'
            ].join(' ');

            return `<svg xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 ${size} ${size}"
                        width="${size}" height="${size}"
                        class="mpi-radial__cone-svg">
                        <defs>
                            <radialGradient id="mpi-cone-grad" cx="0%" cy="50%" r="100%" fx="0%" fy="50%">
                                <stop offset="0%"   stop-color="var(--neon-electric)" stop-opacity="0.55"/>
                                <stop offset="100%" stop-color="var(--neon-electric)" stop-opacity="0"/>
                            </radialGradient>
                        </defs>
                        <path d="${d}" fill="url(#mpi-cone-grad)"/>
                    </svg>`;
        }

        // ── Active item tracking ────────────────────────────────────────────────
        /**
         * Given current mouse offset from centre, returns the item index
         * whose angle is nearest, or -1 if within the dead-zone radius.
         */
        function _resolveActiveIndex(dx, dy) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < moveDist) return -1;

            if (_itemCount === 0) return -1;

            const mouseAngle = Math.atan2(dy, dx);
            let best = -1;
            let bestD = Infinity;

            for (let i = 0; i < _itemCount; i++) {
                let diff = mouseAngle - _itemAngles[i];
                // Normalise to [-π, π]
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                const absDiff = Math.abs(diff);
                if (absDiff < bestD) { bestD = absDiff; best = i; }
            }
            return best;
        }

        /** Apply/remove the is-active class and rotate the cone */
        function _applyActive(index) {
            if (index === _activeIndex) return;
            _activeIndex = index;

            const items = el.querySelectorAll('.mpi-radial__item');
            items.forEach((btn, i) => {
                btn.classList.toggle('mpi-radial__item--active', i === index);
            });

            const cone = el.querySelector('.mpi-radial__cone');
            if (!cone) return;

            if (index === -1) {
                cone.classList.remove('mpi-radial__cone--visible');
            } else {
                // Rotate cone to point at the active item
                // Item angles are in radians; convert to degrees
                const angleDeg = (_itemAngles[index] * 180 / Math.PI);
                cone.style.setProperty('--cone-angle', `${angleDeg.toFixed(1)}deg`);
                cone.classList.add('mpi-radial__cone--visible');
            }
        }

        // ── Mouse move handler ──────────────────────────────────────────────────
        const _onMouseMove = (e) => {
            if (!_visible) return;
            _mouseX = e.clientX;
            _mouseY = e.clientY;
            const dx = _mouseX - _centerX;
            const dy = _mouseY - _centerY;
            _applyActive(_resolveActiveIndex(dx, dy));
        };

        // ── Visibility ──────────────────────────────────────────────────────────
        function _show() {
            if (_visible) return;
            _visible = true;
            _render();
            el.classList.remove('mpi-radial--hidden');
            el.classList.add('mpi-radial--visible');
            _warpToCenter();
            emit('open', {});
        }

        function _hide() {
            if (!_visible && !el.classList.contains('mpi-radial--visible')) return;
            _visible = false;
            el.classList.remove('mpi-radial--visible');
            el.classList.add('mpi-radial--hidden');
            _applyActive(-1);
            emit('close', {});
        }

        function _selectItem(action) {
            emit('select', { action });
            _hide();
        }

        // ── Tab hold logic ──────────────────────────────────────────────────────
        const _onTabDown = () => {
            if (_tabHeld) return;
            _tabHeld = true;
            _show();
        };

        const _onTabUp = (e) => {
            if (e.key !== 'Tab') return;
            _tabHeld = false;

            if (_visible) {
                if (_activeIndex !== -1) {
                    // Grab action before hide clears state
                    const btn = el.querySelector(`.mpi-radial__item[data-index="${_activeIndex}"]`);
                    const action = btn?.dataset?.action;
                    if (action) _selectItem(action);
                    else _hide();
                } else {
                    _hide();
                }
                // First completed Tab cycle marks tutorial as seen
                _markTutorialSeen();
            }
        };

        Hotkeys.register('tab', _onTabDown);
        const _removeKeyUp = on(window, 'keyup', _onTabUp);
        const _removeMouseMove = on(window, 'mousemove', _onMouseMove);

        // ── Public API ──────────────────────────────────────────────────────────
        el.show = _show;
        el.hide = _hide;

        el.setContext = (ctx) => {
            _context = ctx;
            if (_visible) _render();
        };

        el.setExtraItems = (items) => {
            _extraItems = items;
            if (_visible) _render();
        };

        el.setContextItems = (ctx, items) => {
            CONTEXTS[ctx] = items;
            if (_context === ctx && _visible) _render();
        };

        // ── Initial state ───────────────────────────────────────────────────────
        if (props.open) {
            _render();
            el.classList.add('mpi-radial--visible');
            emit('open', {});
        } else {
            el.classList.add('mpi-radial--hidden');
        }

        // ── Cleanup ─────────────────────────────────────────────────────────────
        _cleanups.push(_removeKeyUp, _removeMouseMove);
        _cleanups.push(() => Hotkeys.unregister('tab', _onTabDown));

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
