import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiModelsModal — Models Page Overlay Compound
 *
 * Extends MpiOverlay with a header (icon, title, text) and footer slot.
 * Use for full-page overlay screens that present model management UI.
 *
 * Usage:
 *   const modal = MpiModelsModal.mount(document.createElement('div'), {
 *       icon: 'layers', title: 'Models', text: 'Manage your installed models.'
 *   });
 *   modal.el.show();
 *   modal.el.appendToContainer(childEl);
 *   modal.on('close', () => {});
 *
 * Props:
 * @param {string}   [icon='info']                     - MpiIcon registry key shown at top centre
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='xl']  - Icon size
 * @param {string}   [title='']                        - Large title text
 * @param {string}   [text='']                         - Descriptive text shown above the content slot
 * @param {string}   [footer='']                       - Small text shown below the content slot
 * @param {boolean}  [closable=true]                   - Show the X close button
 *
 * Instance methods:
 *   show()                — delegates to underlying MpiOverlay
 *   hide()                — delegates to underlying MpiOverlay
 *   appendToContainer(el) — delegates to underlying MpiOverlay
 *
 * Emits:
 * 'close' {} — X button clicked (forwarded from MpiOverlay)
 */
export const MpiModelsModal = ComponentFactory.create({
    name: 'MpiModelsModal',
    css: ['js/components/Compounds/MpiModelsModal/MpiModelsModal.css'],

    template: (props) => {
        const icon     = props.icon     || 'info';
        const iconSize = props.iconSize || 'xl';
        const title    = props.title    || '';
        const text     = props.text     || '';
        const footer   = props.footer   || '';

        const titleHtml  = title  ? `<h2 class="mpi-models-modal__title">${title}</h2>`  : '';
        const textHtml   = text   ? `<p class="mpi-models-modal__text">${text}</p>`     : '';
        const footerHtml = footer ? `<p class="mpi-models-modal__footer">${footer}</p>` : '';

        return `
            <div class="mpi-models-modal">
                <div class="mpi-models-modal__header">
                    <div class="mpi-models-modal__icon">${renderIcon(icon, iconSize)}</div>
                    ${titleHtml}
                    ${textHtml}
                </div>
                <div class="mpi-models-modal__slot"></div>
                ${footerHtml}
            </div>`;
    },

    setup: (el, props, emit) => {
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: props.closable !== false,
        });

        overlay.on('close', () => emit('close', {}));

        overlay.el.appendToContainer(el);

        el.show = () => overlay.el.show();
        el.hide = () => overlay.el.hide();

        el.appendToContainer = (childEl) => {
            const slot = el.querySelector('.mpi-models-modal__slot');
            if (slot && childEl) slot.appendChild(childEl);
        };
    }
});
