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
import { gid, qs } from '../utils/dom.js';
import { state } from '../state.js';
import { getCommandProgressLabel } from '../data/commandRegistry.js';
import { generationStore } from '../services/generationStore.js';

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
let _stageText  = '';   // " · 2/3" stage suffix (MPI-147), '' when no multi-stage
let _queueDepth = 0;
let _elapsedSec   = 0;
let _activeStartedAt = null;
let _remoteConnected = false; // MPI-64 4.4: drives the IDLE · Local/Remote scope
let _remotePhase = null;      // MPI-73: 'connecting' | 'disconnecting' | null — transient connect feedback
let _timerInterval = null;
let _completionToken = 0;
// Id of the gen the bar is currently tracking. A terminal (cancelled/idle)
// carrying a DIFFERENT id is a late settle from a Stopped gen and is ignored so
// it can't reset the bar while a promoted successor is running (MPI-203).
let _activeGenId = null;
const _listenUnsubs = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function _fmtDuration(sec) {
    const safeSec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function _setFill(pct) {
    if (!_fill) return;
    _fill.style.setProperty('--sb-progress', String(Math.min(100, Math.max(0, pct))));
}

function _getDisplayLabel(label = _currentLabel) {
    const base = `${label}${_stageText}`;
    const pending = Math.max(0, _queueDepth - 1);
    if (_state !== 'active' || pending === 0) return base;
    return `${base} (${pending} queued)`;
}

function _renderJobLabel() {
    if (!_jobLabel || _state !== 'active') return;
    _jobLabel.textContent = _getDisplayLabel();
}

function _beginActiveCycle() {
    _completionToken++;
    _fill?.classList.remove('shell-info__fill--flash', 'shell-info__fill--fade', 'shell-info__fill--indeterminate');
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

function _idleScopeLabel() {
    // MPI-73: a transient connect/disconnect overrides the steady Local/Remote
    // scope so the status bar reflects the in-progress transition.
    if (_remotePhase === 'connecting') return 'Connecting';
    if (_remotePhase === 'disconnecting') return 'Disconnecting';
    // MPI-64 A1: a sticky 'disconnected' phase = involuntary engine drop (OOM/WS
    // death); show it distinctly from a user Disconnect (plain 'Local').
    if (_remotePhase === 'disconnected') return 'Disconnected';
    return _remoteConnected ? 'Remote' : 'Local';
}

// Last-active gen wins the single status bar. Any DRIVING event (running,
// accepted, loading, sampling, progress, stage, indeterminate) latches the bar
// to its own gen; a terminal only clears the bar if it still owns it. With two
// concurrent lanes (local + remote, MPI-74 P6) this means whichever gen most
// recently emitted a driving event owns the bar, and when the owner ends, the
// other lane's next event re-latches it — no lane runs progress-blind (MPI-203).
// A null id (untagged legacy emit) is a no-op on the latch, not a reset.
function _latch(id) {
    if (id !== null && id !== undefined) _activeGenId = id;
}

// ── Store-derived latch reconcile (MPI-208 Phase 4) ─────────────────────────────
// The bar's ownership + idleness are DERIVED from the generation store, not left to
// the race between id-tagged tool:* terminals. The tool:* events still feed the
// visual detail (label, %, stage); the store answers two questions the event race
// got wrong:
//   (a) SURVIVOR RE-LATCH — when the bar's owner leaves `running` but another lane
//       still has a live job, re-latch to that survivor so a concurrent gen never
//       leaves the bar empty (the user-observed "empty bar while a gen runs" bug).
//   (b) SELF-HEAL TO IDLE — when the store has NO running job, the bar goes idle even
//       if a terminal tool:* event was dropped/mismatched (stuck-bar class of bugs).
// A store job carries `genId` (= generationService _regId = the id on every tool:*
// event), so the store snapshot correlates directly to `_activeGenId`.

// Pick the running job that should drive the bar: keep the current owner if it is
// still running; otherwise the most-recently-active survivor.
function _pickDisplayJob(running) {
    if (!running.length) return null;
    if (_activeGenId !== null) {
        const owner = running.find(j => j.genId === _activeGenId);
        if (owner) return owner;
    }
    // Most-recent driving = latest phase timestamp across the job's transitions.
    let best = null, bestT = -1;
    for (const j of running) {
        const ts = j.timestamps ? Math.max(...Object.values(j.timestamps)) : 0;
        if (ts >= bestT) { bestT = ts; best = j; }
    }
    return best;
}

// Reconcile the bar against store truth on every `generation-store:changed`.
function _reconcileFromStore(snapshot) {
    const running = snapshot?.running ?? generationStore.getSnapshot().running;
    // No live job anywhere → self-heal to idle, but ONLY if the bar still thinks it
    // owns a gen (`_activeGenId` set). A normal done/cancelled already routed through
    // tool:idle/tool:cancelled, which nulls `_activeGenId` and runs the completion
    // flash — self-heal must NOT stomp that animation. A still-set `_activeGenId` with
    // an empty store means the owner's terminal event never arrived (dropped/mismatched
    // WS terminal) → the stuck-bar case the self-heal exists for.
    if (!running.length) {
        if (_state === 'active' && _activeGenId !== null) {
            _activeGenId = null;
            StatusBar.progress.cancel(); // silent, no toast — a missed terminal, not a real completion
        }
        return;
    }
    const job = _pickDisplayJob(running);
    if (!job) return;
    // Survivor re-latch: the bar's owner is gone but another lane is live. Re-latch to
    // it and clear the prior job's stage suffix (fixes the stale "N/M" bleed — a
    // 4-stage upscale suffix must not survive onto a 2-stage successor). The tool:*
    // events from the survivor's own gen will repaint label/%/stage.
    //
    // The `job.genId !== null` guard is LOAD-BEARING, do not drop it: tool-panel
    // previews (MpiToolOptionsResize) call runCommand directly with
    // suppressLifecycleEvents and NO genId, so their store jobs carry genId:null and
    // emit no tool:* events. Excluding null-genId jobs keeps a silent preview from
    // flashing "Starting" in the bar — only real generationService gens (which carry
    // _regId as genId) ever drive it.
    //
    // MPI-234: also re-arm when the bar is IDLE but the store has a live job the bar
    // already tracks (`genId === _activeGenId`). A Stop-driven loop re-fire runs
    // synchronously inside the Stop flow: the bar can get killed (self-heal /
    // terminal) around the new gen's `tool:running`, then a driving event `_latch`es
    // the new genId while the bar is idle — after which the old owner-equality check
    // skipped re-arming forever (stuck "IDLE" for the whole re-fired run; its
    // tool:progress/stage no-op when idle). Store truth wins in BOTH directions:
    // active-with-nothing-running heals to idle above; idle-with-something-running
    // re-arms here.
    if (job.genId !== null && (job.genId !== _activeGenId || _state !== 'active')) {
        _activeGenId = job.genId;
        _stageText = '';
        if (_state !== 'active') StatusBar.progress.prepare('Starting');
        _renderJobLabel();
    }
}

function _setIdle() {
    _state = 'idle';
    // Idle is the single funnel for "no job running". A rapid Cue Stop→promote
    // sequence can bump _completionToken so a superseded job's complete()/cancel()
    // early-returns (state already stole by the newer cycle) without clearing its
    // interval, stranding a ticking timer that reads as a frozen mm:ss at idle
    // (MPI-111 timer symptom). Hard-stop here so reaching idle ALWAYS kills it.
    _stopTimer();
    _job.className = 'shell-info__job';
    _jobLabel.textContent = `IDLE · ${_idleScopeLabel()}`;
    _currentLabel = '';
    _stageText = '';
    _activeStartedAt = null;

    _jobPct.textContent  = '';
    _jobTime.textContent = '';
}

function _setActive(label) {
    _state = 'active';
    _job.classList.add('shell-info__job--active');
    _currentLabel = label;
    _renderJobLabel();
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

        _jobDot = qs('.shell-info__job-dot', _job);

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
            _beginActiveCycle();
            _stopTimer();
            _elapsedSec = 0;
            _stageText = '';
            _activeStartedAt = Date.now();
            _setFill(0);
            if (_jobPct) _jobPct.textContent = '';
            if (_jobTime) _jobTime.textContent = '';
            if (_state === 'active') {
                // Already active — just update label
                _currentLabel = label.toUpperCase();
                _renderJobLabel();
                return;
            }
            _setActive(label.toUpperCase());
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
         * Start the elapsed clock AND re-anchor the wall-clock basis (MPI-147).
         * Called at prompt_ack so the visible timer, the toast's totalElapsed, and
         * the card's generationMs all measure the same span (accepted → done),
         * excluding ComfyUI's cold-start boot. Idempotent — re-anchors only once.
         */
        startClock() {
            if (_state !== 'active') return;
            if (_timerInterval !== null) return; // already counting — don't re-anchor
            _activeStartedAt = Date.now();       // toast wall-clock basis
            _startTimer();                        // resets _elapsedSec → ticks from 0
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
         * Toggle the indeterminate pulse (MPI-147) for nodes with no progress
         * signal (e.g. ESRGAN upscale). Clears the % readout while active; restores
         * normal mode (and a 0 fill) when turned off.
         * @param {boolean} active
         */
        setIndeterminate(active) {
            if (_state !== 'active' || !_fill) return;
            if (active) {
                _fill.classList.add('shell-info__fill--indeterminate');
                if (_jobPct) _jobPct.textContent = '';
            } else {
                _fill.classList.remove('shell-info__fill--indeterminate');
            }
        },

        /**
         * Update job label text mid-job (e.g. phase change). Does not affect timer.
         * @param {string} label
         */
        updateLabel(label) {
            if (_state !== 'active') return;
            _currentLabel = label.toUpperCase();
            _renderJobLabel();
        },

        /**
         * Set the "Stage N/M" suffix shown after the job label (MPI-147). Pass
         * stage 0 (or no multi-stage workflow) to clear it. total 0 = unknown →
         * shows "· N" with no "/M".
         * @param {number} stage
         * @param {number} [total]
         */
        setStage(stage, total) {
            if (_state !== 'active') return;
            _stageText = stage > 0
                ? (total > 0 ? ` · ${stage}/${total}` : ` · ${stage}`)
                : '';
            _renderJobLabel();
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
            const token   = _completionToken;
            const totalElapsed = _activeStartedAt
                ? Math.max(elapsed, Math.round((Date.now() - _activeStartedAt) / 1000))
                : elapsed;
            _stopTimer();

            // Persist to global state for meta-card consumers and timing listeners.
            state.lastGeneration = { label, elapsed: totalElapsed };
            Events.emit('generation:timing', { elapsed: totalElapsed, label });

            _fill.classList.remove('shell-info__fill--indeterminate');  // exit pulse before the 100% flash (MPI-147)
            _setFill(100);
            if (_jobPct)  _jobPct.textContent  = '100%';  // keep pct text in sync with the 100% fill (MPI-147)
            if (_jobTime) _jobTime.textContent = _fmtTime(totalElapsed);
            _fill.classList.add('shell-info__fill--flash');

            // Fire the completion toast NOW, before the deferred fill/idle animation.
            // The toast reports a job that genuinely finished, so it must NOT be gated
            // by the supersession token: when a second queued job starts within the
            // 400ms defer window it bumps _completionToken, which previously swallowed
            // the first job's toast entirely (back-to-back queue → only one toast).
            if (!silent) {
                const wrapper = document.createElement('div');
                document.body.appendChild(wrapper);
                const t = MpiToast.mount(wrapper, {
                    message: `${toastMessage} in ${_fmtDuration(totalElapsed)}`,
                    variant: 'success',
                    duration: 3000,
                });
                t.on('close', () => { t.destroy(); wrapper.remove(); });
            }

            setTimeout(() => {
                if (token !== _completionToken) return;
                _fill.classList.remove('shell-info__fill--flash');
                _fill.classList.add('shell-info__fill--fade');

                setTimeout(() => {
                    if (token !== _completionToken) return;
                    _setFill(0);
                    _fill.classList.remove('shell-info__fill--fade');
                    _setIdle();
                }, 600);
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
            _activeStartedAt = null;

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
    notify(message, variant = 'info', duration = 6000) {
        const wrapper = document.createElement('div');
        document.body.appendChild(wrapper);
        const t = MpiToast.mount(wrapper, { message, variant, duration });
        t.on('close', () => { t.destroy(); wrapper.remove(); });
    },

    /**
     * Subscribe to tool lifecycle events. Called once by shell.js after init().
     */
    listen() {
        if (_listenUnsubs.length > 0) return;
        // tool:running — job dispatched. Spinner + label only; NO timer yet (ComfyUI
        // may still be booting — MPI-147: don't count cold-start in the clock).
        _listenUnsubs.push(Events.on('tool:running', ({ tool, id = null }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.prepare('Starting');
        }));
        // tool:accepted — ComfyUI accepted the prompt (prompt_ack). NOW start the
        // clock so it matches the card's generationMs + toast (all anchored here).
        _listenUnsubs.push(Events.on('tool:accepted', ({ tool, id = null }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.startClock();
        }));
        // tool:loading-model — VRAM load phase. Update label only (timer already running).
        _listenUnsubs.push(Events.on('tool:loading-model', ({ tool, id = null }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.updateLabel('Loading model');
        }));
        // tool:sampling-start — KSampler firing. Switch the label to the op name;
        // timer is already running from tool:running.
        _listenUnsubs.push(Events.on('tool:sampling-start', ({ tool, id = null, operation }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.updateLabel(getCommandProgressLabel(operation));
        }));
        _listenUnsubs.push(Events.on('tool:progress', ({ tool, id = null, value }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.update(value);
        }));
        // tool:stage — multi-stage workflow phase counter (MPI-147). Shows "· N/M".
        _listenUnsubs.push(Events.on('tool:stage', ({ tool, id = null, stage, total }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.setStage(stage, total);
        }));
        // tool:indeterminate — no-progress-signal node (ESRGAN upscale). Pulse.
        _listenUnsubs.push(Events.on('tool:indeterminate', ({ tool, id = null, active }) => {
            if (tool !== 'groupHistory') return;
            _latch(id);
            StatusBar.progress.setIndeterminate(active === true);
        }));
        _listenUnsubs.push(Events.on('tool:cancelled', ({ tool, id = null }) => {
            if (tool !== 'groupHistory') return;
            // Ignore a late terminal from a gen we are no longer tracking (a
            // Stopped predecessor settling after a successor took over). A null id
            // is an untagged explicit cancel (queue-mode block emit) — honor it.
            if (id !== null && _activeGenId !== null && id !== _activeGenId) return;
            _activeGenId = null;
            StatusBar.progress.cancel();
        }));
        _listenUnsubs.push(Events.on('tool:idle', ({ tool, id = null }) => {
            if (tool !== 'groupHistory') return;
            if (id !== null && _activeGenId !== null && id !== _activeGenId) return;
            _activeGenId = null;
            StatusBar.progress.complete('Generation finished');
        }));
        _listenUnsubs.push(Events.onState('generationQueueCount', (count) => {
            _queueDepth = Math.max(0, Number(count) || 0);
            _renderJobLabel();
        }));
        _listenUnsubs.push(Events.on('ui:success', ({ message }) => StatusBar.notify(message, 'success')));
        _listenUnsubs.push(Events.on('ui:warning', ({ message }) => StatusBar.notify(message, 'warning')));
        _listenUnsubs.push(Events.on('ui:info',    ({ message }) => StatusBar.notify(message, 'info')));
        // MPI-64 4.4: idle label scope tracks the remote engine connection.
        // MPI-73: `phase` ('connecting'|'disconnecting') overrides the steady
        // Local/Remote scope while a transition is in progress.
        _listenUnsubs.push(Events.on('remote:connection', ({ connected, phase = null }) => {
            _remoteConnected = !!connected;
            _remotePhase = phase || null;
            if (_state === 'idle') _setIdle();
        }));
        // MPI-208 Phase 4: the store is the authority for bar ownership + idleness.
        // Survivor re-latch (a live lane re-occupies a freed bar) + self-heal (no live
        // job → idle) both come from here, correcting whatever the tool:* terminal race
        // got wrong. The tool:* listeners above still paint the visual detail.
        _listenUnsubs.push(Events.on('generation-store:changed', (snapshot) => {
            _reconcileFromStore(snapshot);
        }));
    },
};
