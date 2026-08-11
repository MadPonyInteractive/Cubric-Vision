import { ComponentFactory } from '../../factory.js';
import { qs, qsa } from '../../../utils/dom.js';
import { readingTimeMs } from '../../../utils/string.js';
import { Storage } from '../../../core/storage.js';

/**
 * MpiToast — Brief floating notifications.
 *
 * Props:
 * @param {string} message - Notification text
 * @param {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual style
 * @param {number} [duration=3000] - Lifespan in ms (set to 0 for persistent)
 * @param {boolean} [sound=true] - Play the notification chime (once per burst).
 *        Pass false for the immediate feedback of a user action (Connect, Install, Cue).
 */

// Max toasts shown at once. Everything else waits its turn inside the same
// stack container, hidden via the .mpi-toast--queued class. The DOM is the
// single source of truth — there are no parallel JS arrays to drift out of
// sync (a past bug: array bookkeeping desynced from the DOM and toasts
// surfaced at the top-left or over-drained past the cap).
const MAX_VISIBLE_TOASTS = 2;

// Shared fixed container. Toasts — both visible and queued — live in normal
// flow inside it (flex column-reverse) so each grows to its own height without
// overlapping its neighbours; see .mpi-toast-stack in MpiToast.css. Queued
// toasts are present but hidden (display:none) so they never paint in the wrong
// spot before getting a slot. Created lazily.
let _stackContainer = null;
function _getStackContainer() {
    if (_stackContainer && document.contains(_stackContainer)) return _stackContainer;
    _stackContainer = document.createElement('div');
    _stackContainer.className = 'mpi-toast-stack';
    // z-20000 fixed keeps it above the full-page Model Library overlay (MPI-215);
    // MpiOverlay's body-stash explicitly EXEMPTS this stack (see its _doShow) so a
    // toast fired while the overlay is open isn't detached + auto-dismissed.
    document.body.appendChild(_stackContainer);
    return _stackContainer;
}

// Notification chime. Plays ONCE when a toast lands in an empty stack (the
// start of a burst) and stays silent for every follow-up toast while the burst
// is live. When the stack fully drains the next toast is again a burst-start,
// so it plays again — no manual reset needed, the DOM count IS the reset.
// Completion toasts now COALESCE (one summary per queue-drain), so a long queue
// makes one toast = one chime, not a per-gen flood.
let _chime = null;
function _playToastSound() {
    if (!Storage.getToastSound()) return;
    if (!_chime) _chime = new Audio('assets/sounds/notify.wav');
    _chime.currentTime = 0;
    _chime.play().catch(() => {});   // autoplay/user-gesture rejects are harmless
}

// Total toasts currently in the stack — visible AND queued. Zero means the
// next toast starts a fresh burst.
function _totalCount() {
    if (!_stackContainer) return 0;
    return qsa(':scope > .mpi-toast', _stackContainer).length;
}

// Visible = mounted in the stack and not flagged as queued. Queried from the
// DOM every time so the count can never drift from reality.
function _visibleCount() {
    if (!_stackContainer) return 0;
    return qsa(':scope > .mpi-toast:not(.mpi-toast--queued)', _stackContainer).length;
}

function _startTimer(el, duration, dismiss) {
    if (duration <= 0) return;
    el._timerStarted = true;
    el._timerRunning = true;
    const progress = qs('.mpi-toast__progress', el);
    if (progress) {
        progress.style.transition = `width ${duration}ms linear`;
        requestAnimationFrame(() => {
            progress.style.width = '0%';
        });
    }
    el._dismissTimer = setTimeout(dismiss, duration);
}

// Promote a queued toast into a live slot. It's already in the right place in
// the DOM, so this only flips the class and kicks the open animation. The timer
// is NOT started here — _armOldest decides whose turn it is.
function _showToast(el) {
    el.classList.remove('mpi-toast--queued');

    // Trigger animation by forcing a reflow
    void el.offsetWidth;
    el.classList.add('mpi-toast--open');

    _armOldest();
}

// MPI-542 — only ONE toast counts down at a time.
//
// Reading is serial. With two toasts on screen and two independent timers, the
// second one's window burns while you are still on the first: seen live, the
// second toast was already half gone by the time the first had been read. Both
// stay visible (a second toast you cannot see yet is a toast you will miss), but
// the newer one's clock does not start until the older one is gone.
//
// Toasts are appended, so DOM order IS arrival order — the oldest is first. It is
// also the one the user started reading, so it counts down first. (The stack
// renders column-reverse, which flips the VISUAL order only; it does not touch
// the DOM.) A persistent toast (duration 0) never counts down, so it is skipped
// rather than allowed to hold the line forever.
function _armOldest() {
    if (!_stackContainer) return;
    const visible = qsa(':scope > .mpi-toast:not(.mpi-toast--queued)', _stackContainer);
    if (visible.some(t => t._timerRunning)) return;   // someone's turn is in progress
    for (const t of visible) {
        if (t._timerStarted || t._duration <= 0) continue;
        _startTimer(t, t._duration, t._dismissFn);
        return;
    }
}

// Reveal the next queued toast if a slot is free.
// Toasts are appended, so the oldest queued sits FIRST in the DOM — promote that
// one, or a burst is drained newest-first and the queue reads backwards. (The
// index used to be `queued.length - 1`, on a comment claiming column-reverse put
// the oldest last; column-reverse is a rendering direction and reorders nothing.)
function _drainQueue() {
    if (_visibleCount() >= MAX_VISIBLE_TOASTS) return;
    if (!_stackContainer) return;
    const queued = qsa(':scope > .mpi-toast--queued', _stackContainer);
    const next = queued[0];
    if (next) _showToast(next);
}

export const MpiToast = ComponentFactory.create({
    name: 'MpiToast',
    css: ['js/components/Primitives/MpiToast/MpiToast.css'],

    template: (props) => {
        const variant = props.variant || 'info';
        const message = props.message || '';

        const mascotByVariant = {
            info: 'idle',
            success: 'happy',
            warning: 'greet',
            danger: 'idle'
        };
        const labelByVariant = {
            info: 'Info',
            success: 'Done',
            warning: 'Heads up',
            danger: 'Failed'
        };
        const mascot = mascotByVariant[variant] || mascotByVariant.info;
        const label = labelByVariant[variant] || labelByVariant.info;

        return `<div class="mpi-toast mpi-toast--${variant}">
            <img class="mpi-toast__mascot" src="assets/mascot/${mascot}.png" alt="" aria-hidden="true" onerror="this.style.display='none'">
            <div class="mpi-toast__content">
                <div class="mpi-toast__meta">
                    <span class="mpi-toast__dot"></span>
                    <span class="mpi-toast__label">${label}</span>
                </div>
                <p class="mpi-toast__msg">${message}</p>
            </div>
            <div class="mpi-toast__progress"></div>
        </div>`;
    },

    setup: (el, props, emit) => {
        // MPI-542 — the default is READING TIME, not a flat 3s. A 140-character
        // disk-full message vanished before its first line landed. An explicit
        // `duration` still wins (and 0 still means persistent).
        const duration = props.duration !== undefined ? props.duration : readingTimeMs(props.message);

        // Stash params so _showToast can start the timer when a queued toast is
        // promoted later.
        el._duration = duration;

        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;   // single clean exit — guards double-fire
            dismissed = true;
            clearTimeout(el._dismissTimer);
            // Release the countdown BEFORE the close animation, not after it: the
            // toast above has been readable this whole time and should start its
            // window now, not ~200ms later. _armOldest skips this one — it is
            // already _timerStarted. (MPI-542)
            el._timerRunning = false;
            _armOldest();
            el.classList.remove('mpi-toast--open');
            el.classList.add('mpi-toast--closing');
            el.addEventListener('transitionend', () => {
                observer.disconnect();
                // We reparent el into the shared stack container during setup, so
                // the caller's `close` handler (which removes its own wrapper)
                // can't take el out of the DOM — remove it here. This also drops
                // it from _visibleCount before we drain.
                el.remove();
                emit('close');
                // Slot freed — promote the next queued toast.
                _drainQueue();
            }, { once: true });
        };
        el._dismissFn = dismiss;

        const container = _getStackContainer();
        // Burst-start chime: toasts ring by DEFAULT (props.sound !== false). The
        // immediate feedback of a user action (Connect, Install, Cue) opts OUT
        // with sound:false so a click never rings. Ring once at the start of a
        // burst: fire before this toast joins the stack, only when the stack was
        // empty. Follow-up toasts in the same burst stay silent regardless.
        if (props.sound !== false && _totalCount() === 0) _playToastSound();
        const isVisible = _visibleCount() < MAX_VISIBLE_TOASTS;

        // Mount into the shared stack either way — queued toasts are hidden via
        // the class, never parked in the document body where they'd paint at the
        // top-left corner.
        if (!isVisible) el.classList.add('mpi-toast--queued');
        container.appendChild(el);

        // Safety net only: if this toast is yanked from the DOM without a clean
        // dismiss (e.g. the stack container is torn down on navigation), free its
        // slot so the queue can still drain. Not a primary drain path.
        const observer = new MutationObserver(() => {
            if (document.contains(el)) return;
            // Confirm the detach is PERMANENT, not a transient reparent. A full-page
            // overlay opening (MpiOverlay stash) or an install-driven awaitReSync
            // churns document.body and can momentarily pop the stack out of the DOM;
            // firing on the first such mutation instant-dismissed a just-mounted toast
            // (seen live: a disk-full warning over the Model Library flashed straight
            // to --closing). Re-check on the next frame; only drain if it's still gone.
            requestAnimationFrame(() => {
                if (document.contains(el) || dismissed) return;
                observer.disconnect();
                dismissed = true;
                clearTimeout(el._dismissTimer);
                el._timerRunning = false;   // MPI-542 — never leave the turn held by a gone toast
                _drainQueue();
                _armOldest();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Start timer/animation only when actually shown (not when queued).
        if (isVisible) _showToast(el);
    }
});
