import { ComponentFactory } from '../../factory.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiToast — Brief floating notifications.
 *
 * Props:
 * @param {string} message - Notification text
 * @param {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual style
 * @param {number} [duration=3000] - Lifespan in ms (set to 0 for persistent)
 */

// Module-level stack — tracks visible toasts (max 3) and a pending queue
const MAX_VISIBLE_TOASTS = 2;
const _toastStack = [];   // { el, hidden }
const _toastQueue = [];    // { el } — waiting for a slot

function _reassignStackPositions() {
    _toastStack.forEach((item, i) => {
        item.el.style.setProperty('--toast-stack-index', i);
    });
}

function _startTimer(el, duration, dismiss) {
    if (duration <= 0) return;
    const progress = qs('.mpi-toast__progress', el);
    if (progress) {
        progress.style.transition = `width ${duration}ms linear`;
        requestAnimationFrame(() => {
            progress.style.width = '0%';
        });
    }
    el._dismissTimer = setTimeout(dismiss, duration);
}

function _showToast(item) {
    item.hidden = false;
    item.el.style.removeProperty('visibility');
    item.el.style.removeProperty('opacity');
    item.el.style.setProperty('--toast-stack-index', _toastStack.length - 1);

    // Trigger animation by forcing a reflow
    void item.el.offsetWidth;
    item.el.classList.add('mpi-toast--open');

    // Start timer and progress bar only when actually shown
    _startTimer(item.el, item._duration, item._dismissFn);
}

function _drainQueue() {
    if (_toastQueue.length === 0) return;
    if (_toastStack.length >= MAX_VISIBLE_TOASTS) return;
    const next = _toastQueue.shift();
    next.hidden = false;
    _toastStack.push(next);
    _reassignStackPositions();
    _showToast(next);
}

function _removeFromStack(el) {
    const idx = _toastStack.findIndex(item => item.el === el);
    if (idx !== -1) _toastStack.splice(idx, 1);
    _reassignStackPositions();
    _drainQueue();
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
            <img class="mpi-toast__mascot" src="assets/mascot/${mascot}.png" alt="" aria-hidden="true">
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
        const progress = qs('.mpi-toast__progress', el);
        const duration = props.duration !== undefined ? props.duration : 3000;

        let item;

        const dismiss = () => {
            clearTimeout(el._dismissTimer);
            el.classList.remove('mpi-toast--open');
            el.classList.add('mpi-toast--closing');
            el.addEventListener('transitionend', () => {
                _removeFromStack(el);
                observer.disconnect();
                emit('close');
            }, { once: true });
        };

        if (_toastStack.length < MAX_VISIBLE_TOASTS) {
            // Assign a visible slot
            const stackIndex = _toastStack.length;
            item = { el, hidden: false };
            _toastStack.push(item);
            el.style.setProperty('--toast-stack-index', stackIndex);
        } else {
            // Queue — mount hidden, will show when a slot frees up
            item = { el, hidden: true, _duration: duration, _dismissFn: dismiss };
            _toastQueue.push(item);
            el.style.setProperty('--toast-stack-index', -1);
            el.style.setProperty('visibility', 'hidden');
            el.style.setProperty('opacity', '0');
        }

        // Reindex when a toast is removed from DOM
        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                _removeFromStack(el);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Start timer only when actually shown (not when queued)
        if (!item.hidden) {
            el.classList.add('mpi-toast--open');
            _startTimer(el, duration, dismiss);
        }
    }
});
