import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiSpinner } from '../../Primitives/MpiSpinner/MpiSpinner.js';
import { qs } from '../../../utils/dom.js';

export const MpiStartingComfy = ComponentFactory.create({
    name: 'MpiStartingComfy',
    css: ['js/components/Compounds/MpiStartingComfy/MpiStartingComfy.css'],
    template: (props) => `
        <div class="mpi-starting-comfy">
            <div class="mpi-starting-comfy__media">
                <img src="/media/assets/comfy_robot_engine.png" alt="Starting Engine" class="mpi-starting-comfy__img mpi-starting-comfy__img--pulse" />
            </div>
            <div class="mpi-starting-comfy__content">
                <h2 class="mpi-starting-comfy__title gradient-text">${props.title || 'Starting ComfyUI Engine...'}</h2>
                <p class="mpi-starting-comfy__text text-muted">${props.text || 'This may take a few moments...'}</p>
                
                <div class="mpi-starting-comfy__status" data-ref="status">
                    <!-- Spinner and Error text goes here -->
                </div>
            </div>
        </div>
    `,
    setup: (el, props, emit) => {
        // Compose with MpiModal for blocking UI pattern
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(440px, 90vw)',
            backdropClose: false // Don't allow closing by clicking background while starting
        });

        // Put our content inside the modal
        modal.el.appendChild(el);

        const statusSlot = qs('[data-ref="status"]', el);
        let spinnerInst = null;

        // Expose public methods
        el.show = () => {
            el.setLoading(true);
            modal.el.show();
        };

        el.hide = () => {
            modal.el.hide();
        };

        el.setError = (errMsg) => {
            el.setLoading(false);
            statusSlot.innerHTML = `<p class="mpi-starting-comfy__error">${errMsg}</p>`;
        };

        el.setLoading = (isLoading) => {
            statusSlot.innerHTML = '';
            if (spinnerInst) {
                spinnerInst.destroy();
                spinnerInst = null;
            }
            if (isLoading) {
                spinnerInst = MpiSpinner.mount(statusSlot, { size: 'lg', variant: 'primary' });
            }
        };

        // Init layout
        el.setLoading(true);

        // Cleanup
        el.destroy = () => {
            if (spinnerInst) spinnerInst.destroy();
            modal.destroy();
        };
    }
});
