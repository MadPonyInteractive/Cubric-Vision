import { ComponentFactory } from '../../factory.js';
import { Overlays } from '../../../managers/overlayManager.js';
import { Events } from '../../../events.js';

/**
 * MpiModal — Blocking Modal Shell (Primitive)
 *
 * Renders an empty centred box on screen, self-portals to `document.body`
 * with a blurred backdrop, integrates with OverlayManager (queue + Escape),
 * and responds to the `ui:close-all-popups` event.
 *
 * Compounds mount their content inside `el` as usual; MpiModal owns only the
 * backdrop / wrapper / overlay-queue lifecycle.
 *
 * Usage (inside a Compound's setup):
 *   const modal = MpiModal.mount(document.createElement('div'), {
 *       width: '480px',           // optional, default 'min(480px, 90vw)'
 *       backdropClose: true,      // optional, default true
 *       onShow: () => {},         // optional hook called when portal is built
 *   });
 *   container.appendChild(modal.el);
 *   el.show = () => modal.el.show();
 *   el.hide = () => modal.el.hide();
 *
 * Props:
 * @param {string}   [width='min(480px, 90vw)'] - CSS width for the centred wrapper.
 * @param {boolean}  [backdropClose=true]        - Whether clicking the backdrop calls hide().
 * @param {Function} [onShow]                    - Called once the portal DOM is appended.
 *
 * Instance methods (on instance.el):
 *   show() — portals backdrop + wrapper to document.body, registers with OverlayManager.
 *   hide() — removes portal nodes, releases OverlayManager. Does NOT emit 'cancel'.
 */
export const MpiModal = ComponentFactory.create({
    name: 'MpiModal',
    css: ['js/components/Primitives/MpiModal/MpiModal.css'],

    template: () => `<div class="mpi-modal"></div>`,

    setup: (el, props, _emit) => {
        let _backdrop = null;
        let _wrapper  = null;

        const _doShow = () => {
            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-modal-backdrop';
            if (props.backdropClose !== false) {
                _backdrop.addEventListener('click', () => el.hide());
            }
            document.body.appendChild(_backdrop);

            _wrapper = document.createElement('div');
            _wrapper.className = 'mpi-modal-wrapper';
            if (props.width) _wrapper.style.width = props.width;
            _wrapper.appendChild(el);
            document.body.appendChild(_wrapper);

            props.onShow?.();
        };

        el.show = () => {
            Overlays.request({ show: _doShow, hide: el.hide, id: el });
        };

        el.hide = () => {
            _backdrop?.remove(); _backdrop = null;
            _wrapper?.remove();  _wrapper  = null;
            Overlays.release(el);
        };

        const _unsubClose = Events.on('ui:close-all-popups', () => {
            if (_backdrop) el.hide();
        });

        const _observer = new MutationObserver(() => {
            if (!document.contains(el) && !_wrapper) {
                _unsubClose();
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }
});
