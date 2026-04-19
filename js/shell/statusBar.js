/**
 * statusBar.js — Shell Status Bar controller.
 *
 * Manages the three-slot footer bar:
 *   Left  — hover info text (data-info delegation) + explicit StatusBar.set()
 *   Fill  — full-width progress gradient driven by StatusBar.progress
 *   Right — pulsing dot + process label during active jobs
 *
 * Usage (from any module):
 *   import { StatusBar } from './shell/statusBar.js';
 *
 *   StatusBar.set('Strength: 0.72');
 *   StatusBar.progress.start('Generating image...');
 *   StatusBar.progress.update(0.65);
 *   StatusBar.progress.complete('Image ready!');  // fires toast
 *   StatusBar.progress.cancel();
 */

import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { Events } from '../events.js';

// ── DOM refs (populated by init) ──────────────────────────────────────────────
let _left    = null;  // #shell-info-left
let _fill    = null;  // .shell-info__fill
let _right   = null;  // #shell-info-process
let _dot     = null;  // .shell-info__dot  (created on demand)
let _label   = null;  // .shell-info__process-label (created on demand)

// ── Internal state ────────────────────────────────────────────────────────────
let _hoverTarget  = null;
let _hoverObs     = null;
let _isProgress   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fade-swap the left slot text. Skip animation if text is unchanged. */
function _setText(text) {
    if (!_left || _left.textContent === text) return;
    _left.classList.add('updating');
    setTimeout(() => {
        _left.textContent = text;
        _left.classList.remove('updating');
    }, 80);
}

/** Drive the CSS custom property that controls fill width (0–100). */
function _setFill(pct) {
    if (!_fill) return;
    _fill.style.setProperty('--sb-progress', String(Math.min(100, Math.max(0, pct))));
}

/** Show/hide the right process slot. */
function _showProcess(label) {
    if (!_right) return;
    if (!_dot) {
        _dot = document.createElement('span');
        _dot.className = 'shell-info__dot';
        _label = document.createElement('span');
        _label.className = 'shell-info__process-label';
        _right.appendChild(_dot);
        _right.appendChild(_label);
    }
    _label.textContent = label;
    _right.classList.add('active');
}

function _hideProcess() {
    _right?.classList.remove('active');
}

// ── Public API ────────────────────────────────────────────────────────────────

export const StatusBar = {

    /**
     * Initialise. Called once by shell.js after DOM is ready.
     * Wires up the data-info hover delegation.
     */
    init() {
        _left  = document.getElementById('shell-info-text');
        _fill  = document.getElementById('shell-info-fill');
        _right = document.getElementById('shell-info-process');

        if (!_left) return;

        _hoverObs = new MutationObserver(() => {
            if (!_hoverTarget) return;
            const info = _hoverTarget.getAttribute('data-info');
            if (info && _left.textContent !== info) _left.textContent = info;
        });

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-info]');
            if (target && target !== _hoverTarget) {
                _hoverTarget = target;
                _hoverObs.disconnect();
                _hoverObs.observe(target, { attributes: true, attributeFilter: ['data-info'] });

                const info = target.getAttribute('data-info');
                if (info && _left.textContent !== info) {
                    _left.classList.add('updating');
                    setTimeout(() => {
                        _left.textContent = info;
                        _left.classList.remove('updating');
                    }, 80);
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-info]');
            if (target && target === _hoverTarget && (!e.relatedTarget || !target.contains(e.relatedTarget))) {
                _hoverTarget = null;
                _hoverObs.disconnect();
                if (!_isProgress) _setText('Ready');
            }
        });
    },

    /**
     * Write a message to the left slot explicitly.
     * @param {string} text
     */
    set(text) {
        _setText(text);
    },

    progress: {
        /**
         * Begin a progress job. Shows the right slot and activates the fill.
         * Only one job runs at a time — calling start() while active replaces it.
         * @param {string} label  e.g. 'Generating image...'
         */
        start(label) {
            _isProgress = true;
            _setFill(0);
            _showProcess(label);
        },

        /**
         * Set a CSS variant class on dot and label (e.g. 'primary' applies --primary--* classes).
         * @param {string} variant  e.g. 'primary'
         */
        setVariant(variant) {
            if (!_dot || !_label) return;
            _dot.className = `shell-info__dot shell-info__dot--${variant}`;
            _label.className = `shell-info__process-label shell-info__process-label--${variant}`;
        },

        /**
         * Update the label text without resetting progress.
         * @param {string} label  e.g. 'Generating...'
         */
        updateLabel(label) {
            if (!_label) return;
            _label.textContent = label;
        },

        /**
         * Drive the progress fill.
         * @param {number} value  0.0 – 1.0
         */
        update(value) {
            if (!_isProgress) return;
            _setFill(value * 100);
        },

        /**
         * Mark the job complete. Flashes the fill, fades it out, fires a toast.
         * @param {string} [toastMessage]  Toast text. Defaults to 'Done'.
         */
        complete(toastMessage = 'Done') {
            if (!_isProgress) return;
            _isProgress = false;

            // Flash
            _fill.classList.add('shell-info__fill--flash');

            setTimeout(() => {
                // Fade out
                _fill.classList.remove('shell-info__fill--flash');
                _fill.classList.add('shell-info__fill--fade');

                setTimeout(() => {
                    _setFill(0);
                    _fill.classList.remove('shell-info__fill--fade');
                    _hideProcess();
                    _setText('Ready');
                }, 600);

                // Fire toast
                const wrapper = document.createElement('div');
                document.body.appendChild(wrapper);
                const t = MpiToast.mount(wrapper, {
                    message: toastMessage,
                    variant: 'success',
                    duration: 3000
                });
                t.on('close', () => { t.destroy(); wrapper.remove(); });

            }, 200);
        },

        /**
         * Cancel the active job instantly. No toast.
         */
        cancel() {
            if (!_isProgress) return;
            _isProgress = false;
            _setFill(0);
            _hideProcess();
            _setText('Ready');
        }
    },

    /**
     * Subscribe to tool lifecycle events emitted on the global event bus.
     * Called once by shell.js after init().
     */
    listen() {
        Events.on('tool:running', ({ tool }) => {
            if (tool === 'groupHistory') {
                StatusBar.progress.start('Generating...');
                StatusBar.progress.setVariant('primary');
            }
        });
        Events.on('tool:loading-model', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.updateLabel('Loading model...');
        });
        Events.on('tool:sampling-start', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.updateLabel('Generating...');
        });
        Events.on('tool:cancelled', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.cancel();
        });
        Events.on('tool:idle', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.complete('Done!');
        });
    },
};
