/**
 * MpiTrimBar — video trim seek bar (Compound).
 *
 * Self-contained track + two trim handles (in/out) + a playhead. Used by
 * MpiVideoControlBar to surface the active range and current playhead.
 * Stage-token only, BEM, no raw SVG.
 *
 * Props:
 *   duration: number   — total clip length in seconds (>= 0)
 *   fps:      number   — frames per second (used for snap; defaults to 30)
 *   value:    number   — initial playhead in seconds (clamped to [in,out])
 *   inPoint:  number   — initial in point in seconds (defaults to 0)
 *   outPoint: number   — initial out point in seconds (defaults to duration)
 *
 * Instance API (on el):
 *   setDuration(d)              — replace duration; clamps in/out/value
 *   setFps(fps)                 — change snap granularity
 *   setValue(t) / setValueQuiet(t)
 *   setRange(in, out) / setRangeQuiet(in, out)
 *   getValue()                  — current playhead seconds
 *   getRange()                  — { in, out }
 *   destroy()
 *
 * Emits (component-local):
 *   'seek'         { time }       — playhead committed (drag end or click)
 *   'seek-preview' { time }       — playhead value during drag (throttled ~50ms)
 *   'in-change'    { time }       — in handle committed
 *   'out-change'   { time }       — out handle committed
 *   'range-change' { in, out }    — fired alongside in/out commits
 *
 * Drag coalescing: pointer moves accumulate a target seconds value and
 * commit on the next RAF tick. Final value re-emits on pointerup so
 * downstream consumers see a stable end state.
 */

import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';

const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const MpiTrimBar = ComponentFactory.create({
    name: 'MpiTrimBar',
    css: ['js/components/Compounds/MpiTrimBar/MpiTrimBar.css'],

    template: () => `
        <div class="mpi-trim-bar">
            <div class="mpi-trim-bar__track" id="track">
                <div class="mpi-trim-bar__selection" id="selection"></div>
                <div class="mpi-trim-bar__handle mpi-trim-bar__handle--in"
                     id="handle-in" data-role="in" tabindex="0"
                     role="slider" aria-label="Trim in"></div>
                <div class="mpi-trim-bar__handle mpi-trim-bar__handle--out"
                     id="handle-out" data-role="out" tabindex="0"
                     role="slider" aria-label="Trim out"></div>
                <div class="mpi-trim-bar__playhead"
                     id="playhead" data-role="playhead"
                     role="slider" aria-label="Playhead"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        const trackEl     = qs('#track', el);
        const selectionEl = qs('#selection', el);
        const handleInEl  = qs('#handle-in', el);
        const handleOutEl = qs('#handle-out', el);
        const playheadEl  = qs('#playhead', el);

        const _unsubs = [];

        let _duration = Math.max(0, +props.duration || 0);
        let _fps      = +props.fps > 0 ? +props.fps : 30;
        let _in       = _clamp(+props.inPoint  || 0, 0, _duration);
        let _out      = _clamp(props.outPoint == null ? _duration : +props.outPoint, _in, _duration);
        let _value    = _clamp(+props.value || 0, _in, _out);

        // Drag state
        /** @type {null | 'in' | 'out' | 'playhead'} */
        let _dragRole = null;
        let _pendingSeconds = null;     // RAF coalesce buffer
        let _rafId = 0;
        let _lastPreviewTs = 0;         // last seek-preview emit timestamp
        let _lastPreviewValue = null;   // last seek-preview value emitted
        const PREVIEW_MIN_MS = 50;      // throttle floor between previews

        function _frameStep() {
            return _fps > 0 ? (1 / _fps) : 0;
        }

        function _snap(t) {
            if (_fps <= 0) return t;
            const snapped = Math.round(t * _fps) / _fps;
            // Duration is rarely an exact frame multiple (e.g. 20 frames but
            // container dur 0.834 ≠ 20/24). Snapping the last frame lands one
            // tick short of _duration, so the out handle can never sit at the
            // true end and full-range playback/native-loop can't re-engage.
            // Stick to the exact ends when within half a frame.
            const fs = 1 / _fps;
            if (Math.abs(snapped - _duration) < fs * 0.5 || t >= _duration) return _duration;
            if (snapped < fs * 0.5) return 0;
            return snapped;
        }

        function _pctOf(t) {
            if (_duration <= 0) return 0;
            return (t / _duration) * 100;
        }

        function _renderPositions() {
            handleInEl.style.left  = _pctOf(_in)    + '%';
            handleOutEl.style.left = _pctOf(_out)   + '%';
            playheadEl.style.left  = _pctOf(_value) + '%';
            selectionEl.style.left  = _pctOf(_in) + '%';
            selectionEl.style.right = (100 - _pctOf(_out)) + '%';

            handleInEl.setAttribute('aria-valuenow',  _in.toFixed(3));
            handleOutEl.setAttribute('aria-valuenow', _out.toFixed(3));
            playheadEl.setAttribute('aria-valuenow',  _value.toFixed(3));
        }

        function _eventToSeconds(ev) {
            const rect = trackEl.getBoundingClientRect();
            if (rect.width <= 0 || _duration <= 0) return 0;
            const x = (ev.clientX - rect.left) / rect.width;
            return _snap(_clamp(x, 0, 1) * _duration);
        }

        function _applyDrag(rawSec) {
            const fs = _frameStep();
            if (_dragRole === 'in') {
                const next = _clamp(rawSec, 0, Math.max(0, _out - fs));
                if (next === _in) return false;
                _in = next;
                if (_value < _in) _value = _in;
                return true;
            }
            if (_dragRole === 'out') {
                const next = _clamp(rawSec, _in + fs, _duration);
                if (next === _out) return false;
                _out = next;
                if (_value > _out) _value = _out;
                return true;
            }
            // playhead
            const next = _clamp(rawSec, _in, _out);
            if (next === _value) return false;
            _value = next;
            return true;
        }

        function _flush() {
            _rafId = 0;
            if (_pendingSeconds == null || !_dragRole) return;
            const target = _pendingSeconds;
            _pendingSeconds = null;
            const role = _dragRole;
            if (_applyDrag(target)) {
                _renderPositions();
                if (role === 'playhead') {
                    const now = performance.now();
                    if (_value !== _lastPreviewValue && (now - _lastPreviewTs) >= PREVIEW_MIN_MS) {
                        _lastPreviewTs = now;
                        _lastPreviewValue = _value;
                        emit('seek-preview', { time: _value });
                    }
                }
            }
        }

        function _onPointerMove(ev) {
            if (!_dragRole) return;
            _pendingSeconds = _eventToSeconds(ev);
            if (!_rafId) _rafId = requestAnimationFrame(_flush);
        }

        function _onPointerUp(ev) {
            if (!_dragRole) return;
            // Final flush — apply outstanding pending value synchronously
            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            if (_pendingSeconds != null) {
                _applyDrag(_pendingSeconds);
                _pendingSeconds = null;
                _renderPositions();
            }
            const role = _dragRole;
            _dragRole = null;
            _lastPreviewTs = 0;
            _lastPreviewValue = null;
            try { ev.target.releasePointerCapture?.(ev.pointerId); } catch (_) { /* noop */ }

            if (role === 'in') {
                emit('in-change',    { time: _in });
                emit('range-change', { in: _in, out: _out });
            } else if (role === 'out') {
                emit('out-change',   { time: _out });
                emit('range-change', { in: _in, out: _out });
            } else {
                emit('seek', { time: _value });
            }
        }

        function _beginDrag(role, ev) {
            if (_duration <= 0) return;
            _dragRole = role;
            try { ev.target.setPointerCapture?.(ev.pointerId); } catch (_) { /* noop */ }
            // Initial snap to pointer position so click-to-seek on the track
            // (via playhead role) lands at the cursor immediately.
            _pendingSeconds = _eventToSeconds(ev);
            if (!_rafId) _rafId = requestAnimationFrame(_flush);
        }

        // Handle pointerdowns
        _unsubs.push(on(handleInEl,  'pointerdown', (ev) => { ev.preventDefault(); _beginDrag('in',  ev); }));
        _unsubs.push(on(handleOutEl, 'pointerdown', (ev) => { ev.preventDefault(); _beginDrag('out', ev); }));
        _unsubs.push(on(playheadEl,  'pointerdown', (ev) => { ev.preventDefault(); _beginDrag('playhead', ev); }));

        // Track click → drag playhead from cursor
        _unsubs.push(on(trackEl, 'pointerdown', (ev) => {
            // Skip if a child handle already started a drag
            if (_dragRole) return;
            if (ev.target !== trackEl && ev.target !== selectionEl) return;
            ev.preventDefault();
            _beginDrag('playhead', ev);
        }));

        // Window-level listeners cover pointerup outside the track
        _unsubs.push(on(window, 'pointermove', _onPointerMove));
        _unsubs.push(on(window, 'pointerup',   _onPointerUp));
        _unsubs.push(on(window, 'pointercancel', _onPointerUp));

        // ── Public API ─────────────────────────────────────────────────────

        el.setDuration = (d) => {
            _duration = Math.max(0, +d || 0);
            _in    = _clamp(_in,    0, _duration);
            _out   = _clamp(_out,   _in, _duration);
            _value = _clamp(_value, _in, _out);
            _renderPositions();
        };

        el.setFps = (fps) => {
            _fps = +fps > 0 ? +fps : _fps;
        };

        el.setValueQuiet = (t) => {
            const next = _clamp(+t || 0, _in, _out);
            if (next === _value) return;
            _value = next;
            _renderPositions();
        };

        el.setValue = (t) => {
            const before = _value;
            el.setValueQuiet(t);
            if (_value !== before) emit('seek', { time: _value });
        };

        el.setRangeQuiet = (inSec, outSec) => {
            const fs = _frameStep();
            const nextIn  = _clamp(+inSec  || 0, 0, _duration);
            const nextOut = _clamp(+outSec || _duration, nextIn + fs, _duration);
            _in = nextIn;
            _out = nextOut;
            if (_value < _in)  _value = _in;
            if (_value > _out) _value = _out;
            _renderPositions();
        };

        el.setRange = (inSec, outSec) => {
            const beforeIn = _in, beforeOut = _out;
            el.setRangeQuiet(inSec, outSec);
            if (_in !== beforeIn || _out !== beforeOut) {
                emit('range-change', { in: _in, out: _out });
            }
        };

        el.getValue = () => _value;
        el.getRange = () => ({ in: _in, out: _out });

        el.destroy = () => {
            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            _dragRole = null;
            _pendingSeconds = null;
            while (_unsubs.length) {
                const fn = _unsubs.pop();
                try { fn(); } catch (_) { /* noop */ }
            }
        };

        _renderPositions();
    }
});
