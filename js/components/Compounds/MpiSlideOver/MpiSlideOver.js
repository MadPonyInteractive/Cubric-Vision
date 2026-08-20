import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { on, qs } from '../../../utils/dom.js';
import { mountButton } from '../../Primitives/MpiButton/MpiButton.js';

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
 *   component {Object}  — ComponentFactory blueprint (MpiSettings / MpiHotkeys / MpiAbout)
 *
 * Instance methods (on instance.el):
 *   open()  — slide in
 *   close() — slide out + cleanup
 *
 * Emits:
 *   'close' {} — panel closed (by button, Escape, or a dismiss event)
 */
export const MpiSlideOver = ComponentFactory.create({
    name: 'MpiSlideOver',
    css: ['js/components/Compounds/MpiSlideOver/MpiSlideOver.css'],

    template: () => `
        <div class="mpi-slide-over" aria-expanded="false" role="dialog" aria-modal="true">
            <div class="mpi-slide-over__header">
                <span class="mpi-slide-over__title"></span>
            </div>
            <div class="mpi-slide-over__body"></div>
            <div class="mpi-slide-over__footer"></div>
        </div>`,

    setup: (el, props, emit) => {
        const titleEl = qs('.mpi-slide-over__title', el);
        const bodyEl = qs('.mpi-slide-over__body', el);

        // Appended rather than mounted in place: the header already holds the title
        // span, and mount() would replace it (MPI-588).
        const closeBtn = mountButton({
            icon: 'close',
            size: 'sm',
            variant: 'ghost',
            extraClasses: 'mpi-slide-over__close',
        });
        closeBtn.setAttribute('aria-label', 'Close');
        qs('.mpi-slide-over__header', el).appendChild(closeBtn);

        titleEl.textContent = props.title || '';
        if (props.extraClasses) {
            el.classList.add(...String(props.extraClasses).split(/\s+/).filter(Boolean));
        }

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
            // MPI-177: tear down the content component. Without this, content
            // el.destroy() never ran — every Settings open leaked its 5s RunPod
            // status-poll interval and Events subscriptions for the app lifetime.
            _contentInstance?.destroy?.();
            _contentInstance = null;
            el.setAttribute('aria-expanded', 'false');
            let _removed = false;
            const onEnd = () => {
                if (_removed) return;
                _removed = true;
                el.removeEventListener('transitionend', onEnd);
                if (el.parentNode) el.parentNode.removeChild(el);
            };
            el.addEventListener('transitionend', onEnd);
            // Throttled/background windows can skip the CSS transition entirely
            // (no transitionend → panel node never leaves the DOM). Backstop just
            // past --t-base (280ms) so close always completes.
            setTimeout(onEnd, 400);
            emit('close', {});
        };

        el.open = () => {
            document.body.appendChild(el);
            // Force reflow so transition fires
            void el.offsetWidth;
            el.setAttribute('aria-expanded', 'true');
        };

        el.close = _doClose;
        _contentInstance?.on?.('close-request', _doClose);

        // Close button
        _unsubs.push(on(closeBtn, 'click', _doClose));

        // ui:close-all-popups → close, EXCEPT when fired by an overlay/modal opening.
        // A child pop-up (MpiOkCancel / showError / etc.) opening on top of the panel
        // must not take the panel down with it (MPI-79). Escape and Overlays.reset()
        // fire this bare → the panel still closes on those.
        _unsubs.push(Events.on('ui:close-all-popups', (payload) => {
            if (payload?.reason === 'overlay-open') return;
            _doClose();
        }));
    },
});


// ── Module-level singleton management ────────────────────────────────────────
// Listen for slide-over:open events and manage one active instance.

let _active = null;
let _activePanelId = null;

function _normalisePanelId({ panelId, title, component } = {}) {
    return panelId || component?.name || title || '';
}

function _openSlideOver({ title, component, extraClasses, panelId } = {}) {
    if (_active) {
        _active.el.close();
        _active = null;
        _activePanelId = null;
    }
    _activePanelId = _normalisePanelId({ panelId, title, component });
    _active = MpiSlideOver.mount(document.createElement('div'), { title, component, extraClasses });
    _active.el.open();
    const instance = _active;
    _active.on('close', () => {
        if (_active === instance) {
            _active = null;
            _activePanelId = null;
        }
    });
}

// Module-level singleton; lifetime = app lifetime. Unsubscribe captured but never called.
const _slideOverOpenUnsub = Events.on('slide-over:open', ({ title, component, extraClasses, panelId }) => {
    _openSlideOver({ title, component, extraClasses, panelId });
});

// Module-level singleton; lifetime = app lifetime. Unsubscribe captured but never called.
const _slideOverToggleUnsub = Events.on('slide-over:toggle', ({ title, component, extraClasses, panelId }) => {
    const nextPanelId = _normalisePanelId({ panelId, title, component });
    if (_active && _activePanelId === nextPanelId) {
        _active.el.close();
        return;
    }
    _openSlideOver({ title, component, extraClasses, panelId });
});
