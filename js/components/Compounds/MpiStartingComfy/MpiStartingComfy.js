import { ComponentFactory } from '../../factory.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiStartingComfy — Engine Startup Indicator (Compound)
 *
 * Portals directly to document.body, bypassing the Overlays queue.
 * This is intentional: the ComfyUI engine startup is a system-level event
 * that must be visible regardless of whatever overlay is currently active
 * (e.g. the projects page overlay showing at app boot).
 *
 * API:
 *   inst.el.show()           — portals backdrop + wrapper, starts spinner
 *   inst.el.hide()           — removes portal, clears spinner
 *   inst.el.setError(msg)    — switches spinner to error text (stays visible)
 */
export const MpiStartingComfy = ComponentFactory.create({
    name: 'MpiStartingComfy',
    css: ['js/components/Compounds/MpiStartingComfy/MpiStartingComfy.css'],
    template: (props) => `
        <div class="mpi-starting-comfy">
            <div class="mpi-starting-comfy__media">
                <img src="/media/assets/comfy_robot_engine.png" alt="Starting Engine" class="mpi-starting-comfy__img" />
            </div>
            <div class="mpi-starting-comfy__content">
                <h2 class="mpi-starting-comfy__title gradient-text">${props.title || 'Starting ComfyUI Engine...'}</h2>
                <p class="mpi-starting-comfy__text text-muted">${props.text || 'This may take a few moments...'}</p>
                <div class="mpi-starting-comfy__status" data-ref="status"></div>
            </div>
        </div>
    `,
    setup: (el, props, emit) => {
        // Direct portal — bypasses Overlays queue so startup indicator always shows.
        let _backdrop  = null;
        let _wrapper   = null;
        let spinnerInst = null;

        const statusSlot = qs('[data-ref="status"]', el);

        el.setLoading = (isLoading) => {
            statusSlot.innerHTML = '';
            if (spinnerInst) { spinnerInst.destroy(); spinnerInst = null; }
            if (isLoading) {
                spinnerInst = MpiSpinner.mount(statusSlot, { size: 'lg', variant: 'primary' });
            }
        };

        el.setError = (errMsg) => {
            el.setLoading(false);
            statusSlot.innerHTML = `<p class="mpi-starting-comfy__error">${errMsg}</p>`;
        };

        el.show = () => {
            if (_backdrop) return; // already visible — idempotent
            el.setLoading(true);

            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-modal-backdrop';
            document.body.appendChild(_backdrop);

            _wrapper = document.createElement('div');
            _wrapper.className = 'mpi-modal-wrapper';
            _wrapper.style.width = 'min(440px, 90vw)';
            _wrapper.appendChild(el);
            document.body.appendChild(_wrapper);
        };

        el.hide = () => {
            _backdrop?.remove(); _backdrop = null;
            _wrapper?.remove();  _wrapper  = null;
        };

        el.destroy = () => {
            if (spinnerInst) spinnerInst.destroy();
            el.hide();
        };
    }
});
