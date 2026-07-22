import { ComponentFactory } from '../../factory.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { on, qs, qsa } from '../../../utils/dom.js';
import { ICONS } from '../../../utils/icons.js';

/**
 * MpiRadialMenu — Radial navigation primitive.
 *
 * Hold Tab to show items in ghost style.
 * Uses Pointer Lock API to capture raw mouse deltas — no OS cursor warp needed.
 * A direction line shows virtual cursor position from centre.
 * Move mouse > moveDist px (virtual) from centre to highlight nearest item.
 * Release Tab while outside centre → selects highlighted item.
 * Release Tab while inside centre → no selection, menu closes.
 *
 * Single-item context: dead-zone bypassed — cone + selection active immediately.
 *
 * @param {string} [context='root'] - Active context key.
 * @param {boolean} [open=false]    - Force-open state (first-run).
 * @param {Array<{action:string, label:string, icon:string}>} [extraItems=[]]
 *
 * Emits:
 * 'select'    { action: string }
 * 'will-open' {}                  — fires BEFORE items render; listeners can
 *                                  push fresh items via setContextItems and
 *                                  they will appear in the upcoming render.
 * 'open'      {}
 * 'close'     {}
 */
export const MpiRadialMenu = ComponentFactory.create({
    name: 'MpiRadialMenu',
    css: ['js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css'],

    template: () => `<div class="mpi-radial" aria-label="Radial Menu" role="navigation"></div>`,

    setup: (el, props, emit) => {

        // ── Dead-zone radius (virtual px from centre to activate item) ──────────
        // Pointer lock movementX/Y are in physical pixels on HiDPI screens,
        // so normalise by devicePixelRatio to get consistent CSS-px distance.
        const _dpr = window.devicePixelRatio || 1;
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

        // Virtual cursor — accumulated delta from centre since menu opened.
        // Does NOT correspond to real cursor screen position.
        let _vx = 0;
        let _vy = 0;
        let _activeIndex = -1;

        // Cached item angles (set on render)
        /** @type {number[]} */
        let _itemAngles = [];
        // MPI-337: per-index disabled flag — disabled items render dimmed and are
        // skipped by the resolver so they can never be highlighted or selected.
        /** @type {boolean[]} */
        let _itemDisabled = [];
        let _itemCount = 0;

        // Direction line SVG elements (set in _render)
        let _lineSvg = null;
        let _lineEl = null;
        let _dotVirtual = null;

        // ── SVG icon helper ─────────────────────────────────────────────────────
        function _icon(name) {
            const paths = ICONS[name];
            if (paths) {
                return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">${paths}</svg>`;
            }
            return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>`;
        }

        // ── Pointer lock ────────────────────────────────────────────────────────
        function _requestLock() {
            if (document.pointerLockElement === el) return;
            el.requestPointerLock();
        }

        function _releaseLock() {
            if (document.pointerLockElement === el) {
                document.exitPointerLock();
            }
        }

        // ── Direction line update ───────────────────────────────────────────────
        // SVG coordinate space: centre = (50%, 50%) of el.
        // We use a fixed large viewBox and place centre at (500,500).
        const SVG_CX = 500;
        const SVG_CY = 500;
        const SVG_SCALE = 1; // 1 virtual px = 1 SVG unit

        function _updateLine() {
            if (!_lineEl || !_lineSvg || !_dotVirtual) return;

            const tx = SVG_CX + _vx * SVG_SCALE;
            const ty = SVG_CY + _vy * SVG_SCALE;
            const dist = Math.sqrt(_vx * _vx + _vy * _vy);
            const active = dist >= moveDist;

            _lineEl.setAttribute('x1', SVG_CX);
            _lineEl.setAttribute('y1', SVG_CY);
            _lineEl.setAttribute('x2', tx.toFixed(1));
            _lineEl.setAttribute('y2', ty.toFixed(1));
            _lineEl.style.opacity = dist < 4 ? '0' : '1';

            _dotVirtual.setAttribute('cx', tx.toFixed(1));
            _dotVirtual.setAttribute('cy', ty.toFixed(1));
            _dotVirtual.style.opacity = dist < 4 ? '0' : '1';

            // Line colour: active = primary, dead-zone = dim
            const colour = active ? 'var(--primary)' : 'var(--text-3)';
            _lineEl.setAttribute('stroke', colour);
            _dotVirtual.setAttribute('fill', colour);
        }

        // ── Render ──────────────────────────────────────────────────────────────
        function _render() {
            const items = [...(CONTEXTS[_context] || CONTEXTS.root || []), ..._extraItems];
            _itemCount = items.length;
            _itemAngles = [];
            _itemDisabled = [];

            el.innerHTML = '';

            // Centre dot
            const dot = document.createElement('div');
            dot.className = 'mpi-radial__dot';
            el.appendChild(dot);

            // Cone SVG
            const cone = document.createElement('div');
            cone.className = 'mpi-radial__cone';
            cone.innerHTML = _buildConeSvg(_itemCount);
            el.appendChild(cone);

            // Direction line SVG — full-size overlay, pointer-events none
            const svgNS = 'http://www.w3.org/2000/svg';
            _lineSvg = document.createElementNS(svgNS, 'svg');
            _lineSvg.setAttribute('viewBox', '0 0 1000 1000');
            _lineSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            _lineSvg.classList.add('mpi-radial__dir-svg');

            _lineEl = document.createElementNS(svgNS, 'line');
            _lineEl.setAttribute('x1', SVG_CX);
            _lineEl.setAttribute('y1', SVG_CY);
            _lineEl.setAttribute('x2', SVG_CX);
            _lineEl.setAttribute('y2', SVG_CY);
            _lineEl.style.stroke = 'var(--accent-heat)';
            _lineEl.setAttribute('stroke-width', '2');
            _lineEl.setAttribute('stroke-linecap', 'round');
            _lineEl.style.opacity = '0';

            _dotVirtual = document.createElementNS(svgNS, 'circle');
            _dotVirtual.setAttribute('cx', SVG_CX);
            _dotVirtual.setAttribute('cy', SVG_CY);
            _dotVirtual.setAttribute('r', '5');
            _dotVirtual.style.fill = 'var(--accent-heat)';
            _dotVirtual.style.opacity = '0';
            _dotVirtual.style.transition = 'opacity 0.1s ease';

            _lineSvg.appendChild(_lineEl);
            _lineSvg.appendChild(_dotVirtual);
            el.appendChild(_lineSvg);

            items.forEach((item, i) => {
                const angleDeg = -90 + (360 / _itemCount) * i;
                const angleRad = (angleDeg * Math.PI) / 180;
                _itemAngles.push(angleRad);

                const R = 7.5; // em
                const x = Math.cos(angleRad) * R;
                const y = Math.sin(angleRad) * R;

                const disabled = !!item.disabled;
                _itemDisabled.push(disabled);

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mpi-radial__item' + (disabled ? ' mpi-radial__item--disabled' : '');
                if (disabled) btn.setAttribute('aria-disabled', 'true');
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
            _vx = 0;
            _vy = 0;
        }

        // ── Cone SVG builder ────────────────────────────────────────────────────
        function _buildConeSvg(count) {
            const size = 600;
            const cx = size / 2;
            const cy = size / 2;
            const outerR = size / 2;

            let pathD;
            let gradAttrs;

            if (count <= 1) {
                // Single item — full circle ring with centre-radial gradient so user
                // sees immediately there's exactly one option.
                pathD = [
                    `M ${cx - outerR} ${cy}`,
                    `A ${outerR} ${outerR} 0 1 0 ${cx + outerR} ${cy}`,
                    `A ${outerR} ${outerR} 0 1 0 ${cx - outerR} ${cy}`,
                    'Z'
                ].join(' ');
                gradAttrs = 'cx="50%" cy="50%" r="50%" fx="50%" fy="50%"';
            } else {
                const halfAngle = (360 / count / 2) * (Math.PI / 180);
                const x1 = cx + outerR * Math.cos(-halfAngle);
                const y1 = cy + outerR * Math.sin(-halfAngle);
                const x2 = cx + outerR * Math.cos(halfAngle);
                const y2 = cy + outerR * Math.sin(halfAngle);
                const largeArc = halfAngle * 2 > Math.PI ? 1 : 0;
                pathD = [
                    `M ${cx} ${cy}`,
                    `L ${x1.toFixed(2)} ${y1.toFixed(2)}`,
                    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
                    'Z'
                ].join(' ');
                gradAttrs = 'cx="0%" cy="50%" r="100%" fx="0%" fy="50%"';
            }

            return `<svg xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 ${size} ${size}"
                        width="${size}" height="${size}"
                        class="mpi-radial__cone-svg">
                        <defs>
                            <radialGradient id="mpi-cone-grad" ${gradAttrs}>
                                <stop offset="0%"   style="stop-color: var(--accent-heat); stop-opacity: 0.55"/>
                                <stop offset="100%" style="stop-color: var(--accent-heat); stop-opacity: 0"/>
                            </radialGradient>
                        </defs>
                        <path d="${pathD}" fill="url(#mpi-cone-grad)"/>
                    </svg>`;
        }

        // ── Active item tracking ────────────────────────────────────────────────
        function _resolveActiveIndex(dx, dy) {
            if (_itemCount === 0) return -1;
            // Single item — always active. Cone fills as full ring; no direction
            // needed. Tab-release immediately selects the only option. MPI-337: a
            // lone disabled op is not selectable.
            if (_itemCount === 1) return _itemDisabled[0] ? -1 : 0;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < moveDist) return -1;

            const mouseAngle = Math.atan2(dy, dx);
            let best = -1;
            let bestD = Infinity;

            for (let i = 0; i < _itemCount; i++) {
                if (_itemDisabled[i]) continue; // MPI-337: dimmed ops can't be picked
                let diff = mouseAngle - _itemAngles[i];
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                const absDiff = Math.abs(diff);
                if (absDiff < bestD) { bestD = absDiff; best = i; }
            }
            return best;
        }

        function _applyActive(index) {
            if (index === _activeIndex) return;
            _activeIndex = index;

            const items = qsa('.mpi-radial__item', el);
            items.forEach((btn, i) => {
                btn.classList.toggle('mpi-radial__item--active', i === index);
            });

            const cone = qs('.mpi-radial__cone', el);
            if (!cone) return;

            if (index === -1) {
                cone.classList.remove('mpi-radial__cone--visible');
            } else {
                const angleDeg = (_itemAngles[index] * 180 / Math.PI);
                cone.style.setProperty('--cone-angle', `${angleDeg.toFixed(1)}deg`);
                cone.classList.add('mpi-radial__cone--visible');
            }
        }

        // ── Pointer lock mouse move — raw deltas, no absolute position ──────────
        const _onPointerMove = (e) => {
            if (!_visible) return;
            _vx += e.movementX / _dpr;
            _vy += e.movementY / _dpr;
            _updateLine();
            _applyActive(_resolveActiveIndex(_vx, _vy));
        };

        // ── Visibility ──────────────────────────────────────────────────────────
        function _show() {
            if (_visible) return;
            _visible = true;
            // Pre-render hook: listeners can call setContextItems synchronously
            // here to refresh availability based on live workspace state (e.g.
            // mask presence) without waiting for tool-mode exit events.
            emit('will-open', {});
            _render();
            el.classList.remove('mpi-radial--hidden');
            el.classList.add('mpi-radial--visible');
            _requestLock();
            // Single-item contexts auto-activate — cone visible from open with
            // no mouse motion required.
            _applyActive(_resolveActiveIndex(_vx, _vy));
            emit('open', {});
        }

        function _hide() {
            if (!_visible && !el.classList.contains('mpi-radial--visible')) return;
            _visible = false;
            el.classList.remove('mpi-radial--visible');
            el.classList.add('mpi-radial--hidden');
            _applyActive(-1);
            _releaseLock();
            // Reset virtual cursor and hide line immediately so it doesn't
            // persist visibly during the CSS fade-out transition.
            _vx = 0;
            _vy = 0;
            if (_lineEl) { _lineEl.style.opacity = '0'; _lineEl.setAttribute('x2', SVG_CX); _lineEl.setAttribute('y2', SVG_CY); }
            if (_dotVirtual) { _dotVirtual.style.opacity = '0'; _dotVirtual.setAttribute('cx', SVG_CX); _dotVirtual.setAttribute('cy', SVG_CY); }
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
                // Snapshot active index before hide resets it
                const idx = _activeIndex;
                if (idx !== -1) {
                    const btn = qs(`.mpi-radial__item[data-index="${idx}"]`, el);
                    const action = btn?.dataset?.action;
                    if (action) _selectItem(action);
                    else _hide();
                } else {
                    _hide();
                }
            }
        };

        // Pointer lock change — if lock lost externally, clean up
        const _onPointerLockChange = () => {
            if (document.pointerLockElement !== el && _visible) {
                _hide();
            }
        };

        const _unbindTab = Hotkeys.bind('radialMenu.toggle', _onTabDown);
        const _removeKeyUp = on(window, 'keyup', _onTabUp);
        const _removePointerMove = on(el, 'mousemove', _onPointerMove);
        const _removeLockChange = on(document, 'pointerlockchange', _onPointerLockChange);

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
        _cleanups.push(_removeKeyUp, _removePointerMove, _removeLockChange);
        _cleanups.push(_unbindTab);

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                _releaseLock();
                _cleanups.forEach(fn => fn());
                _cleanups = [];
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
