/**
 * statusBar.js — Shell Status Bar controller.
 *
 * Manages the job-state slot (left) and progress fill (behind content).
 *
 * States:
 *   idle   — green dot + "IDLE"
 *   active — ring spinner + operation label + pct + elapsed time
 *   done   — brief "DONE" flash, then back to idle
 *
 * Hover delegation: any element with [data-info] shows its value in the
 * status bar while hovered, temporarily overlaying the job state.
 *
 * Elapsed timer: starts on progress.start(), ticks every second.
 * On complete()/cancel() emits Events('generation:timing', { elapsed, label })
 * so meta cards and future consumers can record generation time.
 *
 * Usage:
 *   StatusBar.progress.start('UPSCALING CROP_002');
 *   StatusBar.progress.update(0.38);   // 0.0–1.0
 *   StatusBar.progress.complete('Done!');
 *   StatusBar.progress.cancel();
 */

import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { Events } from '../events.js';
import { gid } from '../utils/dom.js';
import { state } from '../state.js';

// ── DOM refs ───────────────────────────────────────────────────────────────────
let _job       = null;  // #shell-info-job
let _jobDot    = null;  // .shell-info__job-dot
let _jobLabel  = null;  // #shell-info-job-label
let _jobPct    = null;  // #shell-info-job-pct
let _jobTime   = null;  // #shell-info-job-time
let _hoverText = null;  // .shell-info__hover-text (injected by init)
let _fill      = null;  // #shell-info-fill

// ── Internal state ────────────────────────────────────────────────────────────
let _state        = 'idle';   // 'idle' | 'active'
let _hoverTarget  = null;
let _hoverObs     = null;
let _currentLabel = '';
let _elapsedSec   = 0;
let _timerInterval = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function _setFill(pct) {
    if (!_fill) return;
    _fill.style.setProperty('--sb-progress', String(Math.min(100, Math.max(0, pct))));
}

function _startTimer() {
    _stopTimer();
    _elapsedSec = 0;
    _timerInterval = setInterval(() => {
        _elapsedSec++;
        if (_jobTime) _jobTime.textContent = _fmtTime(_elapsedSec);
    }, 1000);
}

function _stopTimer() {
    if (_timerInterval !== null) {
        clearInterval(_timerInterval);
        _timerInterval = null;
    }
}

function _setIdle() {
    _state = 'idle';
    _job.className = 'shell-info__job';
    _jobLabel.textContent = 'IDLE';
    _currentLabel = '';

    const last = state.lastGeneration;
    _jobPct.textContent  = '';
    _jobTime.textContent = last ? _fmtTime(last.elapsed) : '';
}

function _setActive(label) {
    _state = 'active';
    _job.classList.add('shell-info__job--active');
    _currentLabel = label;
    _jobLabel.textContent = label;
    _jobPct.textContent   = '';
    _jobTime.textContent  = '';  // blank until timer actually starts
}

// ── Public API ────────────────────────────────────────────────────────────────

export const StatusBar = {

    init() {
        _job      = gid('shell-info-job');
        _jobLabel = gid('shell-info-job-label');
        _jobPct   = gid('shell-info-job-pct');
        _jobTime  = gid('shell-info-job-time');
        _fill     = gid('shell-info-fill');

        if (!_job) return;

        // Inject hover-text overlay span
        _hoverText = document.createElement('span');
        _hoverText.className = 'shell-info__hover-text';
        _job.appendChild(_hoverText);

        _jobDot = _job.querySelector('.shell-info__job-dot');

        // ── Hover delegation ───────────────────────────────────────────────
        // Uses pointermove for reliability — avoids mouseover/mouseout gaps
        // when moving between child elements of the same [data-info] ancestor.
        _hoverObs = new MutationObserver(() => {
            if (!_hoverTarget) return;
            const info = _hoverTarget.getAttribute('data-info');
            if (info) _hoverText.textContent = info;
        });

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-info]');
            if (target === _hoverTarget) return; // same element, no-op

            // Leaving previous target
            if (_hoverTarget) {
                _hoverObs.disconnect();
            }

            if (target) {
                _hoverTarget = target;
                _hoverObs.observe(target, { attributes: true, attributeFilter: ['data-info'] });
                const info = target.getAttribute('data-info');
                if (info) {
                    _hoverText.textContent = info;
                    _job.classList.add('hovering');
                }
            } else {
                _hoverTarget = null;
                _job.classList.remove('hovering');
            }
        });

        document.addEventListener('mouseout', (e) => {
            // Only clear if leaving the document or moving to a non-[data-info] element
            if (e.relatedTarget && e.relatedTarget.closest('[data-info]')) return;
            const leaving = e.target.closest('[data-info]');
            if (leaving && leaving === _hoverTarget) {
                _hoverTarget = null;
                _hoverObs.disconnect();
                _job.classList.remove('hovering');
            }
        });
    },

    /**
     * Explicitly set the job label text (used by legacy callers).
     * @param {string} text
     */
    set(text) {
        if (_state !== 'active') {
            _jobLabel.textContent = text;
        }
    },

    progress: {
        /**
         * Enter active state with label + spinner. Does NOT start the elapsed timer.
         * Use for pre-sampling phases (queuing, model loading) where timing is not meaningful.
         * @param {string} label
         */
        prepare(label) {
            if (_state === 'active') {
                // Already active — just update label
                _currentLabel = label.toUpperCase();
                _jobLabel.textContent = _currentLabel;
                return;
            }
            _setActive(label.toUpperCase());
            _setFill(0);
        },

        /**
         * Start the elapsed timer. Call when actual sampling begins (tool:sampling-start).
         * Safe to call multiple times — restarts only if timer not already running.
         */
        startTimer() {
            if (_state !== 'active') return;
            if (_timerInterval !== null) return; // already running
            _startTimer();
        },

        /**
         * Convenience: prepare(label) + startTimer(). For callers that skip pre-phases.
         * @param {string} label
         */
        start(label) {
            StatusBar.progress.prepare(label);
            StatusBar.progress.startTimer();
        },

        /**
         * Update the fill and pct display. value is 0.0–1.0.
         * @param {number} value
         */
        update(value) {
            if (_state !== 'active') return;
            const pct = Math.round(value * 100);
            _setFill(pct);
            if (_jobPct) _jobPct.textContent = `${pct}%`;
        },

        /**
         * Update job label text mid-job (e.g. phase change). Does not affect timer.
         * @param {string} label
         */
        updateLabel(label) {
            if (_state !== 'active') return;
            _currentLabel = label.toUpperCase();
            _jobLabel.textContent = _currentLabel;
        },

        /**
         * Mark job complete. Flashes fill, fires toast, emits timing event, returns to idle.
         * @param {string} [toastMessage]
         * @param {boolean} [silent]
         */
        complete(toastMessage = 'Done', silent = false) {
            if (_state !== 'active') return;

            const elapsed = _elapsedSec;
            const label   = _currentLabel;
            _stopTimer();

            // Persist to global state — available to meta-card consumers and status bar idle display
            state.lastGeneration = { label, elapsed };
            Events.emit('generation:timing', { elapsed, label });

            _setFill(100);
            _fill.classList.add('shell-info__fill--flash');

            setTimeout(() => {
                _fill.classList.remove('shell-info__fill--flash');
                _fill.classList.add('shell-info__fill--fade');

                setTimeout(() => {
                    _setFill(0);
                    _fill.classList.remove('shell-info__fill--fade');
                    _setIdle();
                }, 600);

                if (!silent) {
                    const wrapper = document.createElement('div');
                    document.body.appendChild(wrapper);
                    const t = MpiToast.mount(wrapper, {
                        message: toastMessage,
                        variant: 'success',
                        duration: 3000,
                    });
                    t.on('close', () => { t.destroy(); wrapper.remove(); });
                }
            }, 400);
        },

        /**
         * Cancel active job instantly. No toast. Emits timing event.
         */
        cancel() {
            if (_state !== 'active') return;

            const elapsed = _elapsedSec;
            const label   = _currentLabel;
            _stopTimer();

            Events.emit('generation:timing', { elapsed, label, cancelled: true });

            _setFill(0);
            _setIdle();
        },

        /**
         * Set a variant class (kept for backwards-compat, no-op now).
         */
        setVariant(_variant) {},
    },

    /**
     * Fire a standalone toast without a progress job.
     * @param {string} message
     * @param {'success'|'info'|'warning'|'danger'} [variant='info']
     */
    notify(message, variant = 'info') {
        const wrapper = document.createElement('div');
        document.body.appendChild(wrapper);
        const t = MpiToast.mount(wrapper, { message, variant, duration: 4000 });
        t.on('close', () => { t.destroy(); wrapper.remove(); });
    },

    /**
     * Subscribe to tool lifecycle events. Called once by shell.js after init().
     */
    listen() {
        // tool:running — ComfyUI graph executing, pre-model phase. Spinner on, no timer.
        Events.on('tool:running', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.prepare('Starting');
        });
        // tool:loading-model — VRAM load phase. Update label only, timer still not running.
        Events.on('tool:loading-model', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.updateLabel('Loading model');
        });
        // tool:sampling-start — KSampler firing. NOW start the timer + update label.
        Events.on('tool:sampling-start', ({ tool }) => {
            if (tool === 'groupHistory') {
                StatusBar.progress.updateLabel('Generating');
                StatusBar.progress.startTimer();
            }
        });
        Events.on('tool:progress', ({ tool, value }) => {
            if (tool === 'groupHistory') StatusBar.progress.update(value);
        });
        Events.on('tool:cancelled', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.cancel();
        });
        Events.on('tool:idle', ({ tool }) => {
            if (tool === 'groupHistory') StatusBar.progress.complete('Generation finished', false);
        });
        Events.on('ui:success', ({ message }) => StatusBar.notify(message, 'success'));
        Events.on('ui:warning', ({ message }) => StatusBar.notify(message, 'warning'));
        Events.on('ui:info',    ({ message }) => StatusBar.notify(message, 'info'));
    },
};
