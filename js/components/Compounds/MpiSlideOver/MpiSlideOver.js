import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { on } from '../../../utils/dom.js';

/**
 * MpiSlideOver — Right-edge slide-over panel (Stage Phase 8).
 *
 * Owns chrome: header (title + close), scrollable body, optional footer.
 * Content is provided via props.component — a ComponentFactory blueprint whose
 * setup() is called with the body element as container.
 *
 * Only one slide-over is open at a time. Opening a second closes the first.
 *
 * Usage:
 *   Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings });
 *
 * Props:
 *   title     {string}  — UPPERCASE label shown in header
 *   component {Object}  — ComponentFactory blueprint (MpiSettings / MpiHelp / MpiAbout)
 *
 * Instance methods (on instance.el):
 *   open()  — slide in
 *   close() — slide out + cleanup
 *
 * Emits:
 *   'close' {} — panel closed (by button, outside click, or event)
 */
export const MpiSlideOver = ComponentFactory.create({
    name: 'MpiSlideOver',
    css: ['js/components/Compounds/MpiSlideOver/MpiSlideOver.css'],

    template: () => `
        <div class="mpi-slide-over" aria-expanded="false" role="dialog" aria-modal="true">
            <div class="mpi-slide-over__header">
                <span class="mpi-slide-over__title"></span>
                <button class="mpi-slide-over__close" aria-label="Close" type="button">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                        <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
                    </svg>
                </button>
            </div>
            <div class="mpi-slide-over__body"></div>
            <div class="mpi-slide-over__footer"></div>
        </div>`,

    setup: (el, props, emit) => {
        const titleEl = el.querySelector('.mpi-slide-over__title');
        const closeBtn = el.querySelector('.mpi-slide-over__close');
        const bodyEl = el.querySelector('.mpi-slide-over__body');

        titleEl.textContent = props.title || '';

        // Mount the content component into the body slot
        let _contentInstance = null;
        if (props.component) {
            _contentInstance = props.component.mount(bodyEl);
            // If component exposes onOpen (e.g. MpiSettings field init), call it
            _contentInstance.el.onOpen?.();
        }

        const _unsubs = [];

        let _closed = false;

        const _doClose = () => {
            if (_closed) return;
            _closed = true;
            _unsubs.forEach(fn => fn());
            document.removeEventListener('click', _onDocClick);
            el.setAttribute('aria-expanded', 'false');
            const onEnd = () => {
                el.removeEventListener('transitionend', onEnd);
                if (el.parentNode) el.parentNode.removeChild(el);
            };
            el.addEventListener('transitionend', onEnd);
            emit('close', {});
        };

        el.open = () => {
            document.body.appendChild(el);
            // Force reflow so transition fires
            void el.offsetWidth;
            el.setAttribute('aria-expanded', 'true');
        };

        el.close = _doClose;

        // Close button
        _unsubs.push(on(closeBtn, 'click', _doClose));

        // ui:close-all-popups → close
        _unsubs.push(Events.on('ui:close-all-popups', _doClose));

        // Outside click — deferred so triggering click doesn't immediately close
        const _onDocClick = (e) => {
            if (!el.contains(e.target)) _doClose();
        };
        setTimeout(() => document.addEventListener('click', _onDocClick), 0);
    },
});


// ── Module-level singleton management ────────────────────────────────────────
// Listen for slide-over:open events and manage one active instance.

let _active = null;

// Module-level singleton; lifetime = app lifetime. Unsubscribe captured but never called.
const _slideOverOpenUnsub = Events.on('slide-over:open', ({ title, component }) => {
    if (_active) {
        _active.el.close();
        _active = null;
    }
    _active = MpiSlideOver.mount(document.createElement('div'), { title, component });
    _active.el.open();
    _active.on('close', () => { _active = null; });
});
