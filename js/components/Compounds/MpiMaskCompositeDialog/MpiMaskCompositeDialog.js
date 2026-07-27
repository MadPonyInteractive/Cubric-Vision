import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { qs } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiMaskCompositeDialog — pick a direction for a mask composite (Compound, MPI-362).
 *
 * Two entries, one mask, two ways to blend them. The direction is not guessable
 * from the mask alone, so each option ships its own sentence naming the two
 * entries rather than a shared blurb the user has to decode.
 *
 * Usage:
 *   const dlg = MpiMaskCompositeDialog.mount(document.createElement('div'), {
 *       maskName: 'detail_004', otherName: 'generate_002',
 *   });
 *   dlg.on('add', () => …); dlg.on('subtract', () => …); dlg.on('cancel', () => …);
 *   dlg.el.show();
 *
 * Props:
 * @param {string} [maskName='this entry']   - display name of the entry carrying the mask
 * @param {string} [otherName='the other entry'] - display name of the other selected entry
 *
 * Emits:
 * 'add'      {} — masked area comes from the OTHER entry
 * 'subtract' {} — masked area is taken OUT of the other entry (directions swapped)
 * 'cancel'   {} — Cancel clicked (NOT emitted on Escape/hide)
 */
export const MpiMaskCompositeDialog = ComponentFactory.create({
    name: 'MpiMaskCompositeDialog',
    css: ['js/components/Compounds/MpiMaskCompositeDialog/MpiMaskCompositeDialog.css'],

    template: () => `
        <div class="mpi-mask-composite" role="dialog" aria-modal="true">
            <div class="mpi-mask-composite__icon">${renderIcon('layers', 'xl')}</div>
            <div class="mpi-mask-composite__title">Mask composite</div>
            <div class="mpi-mask-composite__source" id="source-slot"></div>
            <div class="mpi-mask-composite__option">
                <div class="mpi-mask-composite__button" id="add-slot"></div>
                <p class="mpi-mask-composite__text" id="add-text"></p>
            </div>
            <div class="mpi-mask-composite__option">
                <div class="mpi-mask-composite__button" id="subtract-slot"></div>
                <p class="mpi-mask-composite__text" id="subtract-text"></p>
            </div>
            <div class="mpi-mask-composite__actions" id="cancel-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const modal = MpiModal.mount(document.createElement('div'), { width: 'min(520px, 92vw)' });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        const maskName  = props.maskName  || 'this entry';
        const otherName = props.otherName || 'the other entry';

        qs('#source-slot', el).textContent = `Using the mask painted on "${maskName}".`;
        qs('#add-text', el).textContent =
            `Fill the masked area with "${otherName}". Everything outside the mask stays "${maskName}".`;
        qs('#subtract-text', el).textContent =
            `The opposite: keep "${otherName}", and take only the masked area from "${maskName}".`;

        // hide() BEFORE emit: callers destroy the dialog inside these handlers,
        // and MpiModal.destroy() does not take the backdrop down — only hide()
        // does. Emitting first would strand the backdrop over the workspace.
        const _action = (slot, text, variant, event) => {
            const btn = MpiButton.mount(qs(slot, el), { text, variant, size: 'md' });
            btn.on('click', () => { el.hide(); emit(event, {}); });
        };

        _action('#add-slot',      'Add',      'primary',   'add');
        _action('#subtract-slot', 'Subtract', 'primary',   'subtract');
        _action('#cancel-slot',   'Cancel',   'secondary', 'cancel');

        // Escape closes the modal without emitting, so a destroy() that arrives
        // later must still tear the backdrop down and release the Overlays slot.
        el.destroy = () => {
            modal.el.hide();
            modal.el.destroy?.();
        };
    },
});
