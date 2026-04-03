import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs, ce } from '../../../utils/dom.js';

/**
 * MpiOkCancel — Dialog Action Compound
 *
 * A reusable dialog action panel with a title, text area, optional input field,
 * and confirmation/cancellation buttons. Used in overlay dialogs and confirmation
 * flows.
 *
 * Props:
 * @param {string} [title=''] - Large title text at the top
 * @param {string} [text=''] - Descriptive text content
 * @param {string} [inputPlaceholder] - Optional input field placeholder (if present, shows input)
 * @param {string} [inputValue=''] - Initial value for the optional input field
 * @param {boolean} [showCancel=true] - Whether to display the Cancel button
 * @param {string} [okLabel='OK'] - Custom label for the OK button
 * @param {string} [cancelLabel='Cancel'] - Custom label for the Cancel button
 *
 * Emits:
 * 'ok'     { inputValue?: string } — OK button clicked (includes input value if present)
 * 'cancel' {}                      — Cancel button clicked
 * 'input'  { value: string }        — Optional input field changed
 */
export const MpiOkCancel = ComponentFactory.create({
    name: 'MpiOkCancel',
    css: ['js/components/Compounds/MpiOkCancel/MpiOkCancel.css'],

    template: () => `
        <div class="mpi-ok-cancel">
            <div class="mpi-ok-cancel__content">
                <div class="mpi-ok-cancel__title" id="title-slot"></div>
                <div class="mpi-ok-cancel__text" id="text-slot"></div>
                <div class="mpi-ok-cancel__input" id="input-slot"></div>
            </div>
            <div class="mpi-ok-cancel__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // Title
        const titleSlot = qs('#title-slot', el);
        if (props.title) {
            titleSlot.textContent = props.title;
        }

        // Text area
        const textSlot = qs('#text-slot', el);
        if (props.text) {
            textSlot.textContent = props.text;
        }

        // Optional Input Field
        let inputComponent = null;
        const inputSlot = qs('#input-slot', el);
        if (props.inputPlaceholder) {
            inputComponent = MpiInput.mount(document.createElement('div'), {
                type: 'text',
                placeholder: props.inputPlaceholder,
                value: props.inputValue || ''
            });

            inputComponent.on('input', ({ value }) => {
                emit('input', { value });
            });

            inputSlot.appendChild(inputComponent.el);
        } else {
            // Hide the input slot if no input is needed
            inputSlot.style.display = 'none';
        }

        // Action Buttons
        const actionsSlot = qs('#actions-slot', el);

        // Cancel Button (if enabled)
        if (props.showCancel !== false) {
            const cancelBtn = MpiButton.mount(document.createElement('div'), {
                text: props.cancelLabel || 'Cancel',
                variant: 'secondary',
                size: 'md'
            });
            cancelBtn.on('click', () => {
                emit('cancel', {});
            });
            actionsSlot.appendChild(cancelBtn.el);
        }

        // OK Button
        const okBtn = MpiButton.mount(document.createElement('div'), {
            text: props.okLabel || 'OK',
            variant: 'primary',
            size: 'md'
        });
        okBtn.on('click', () => {
            const inputValue = inputComponent ? inputComponent.el.querySelector('input')?.value : undefined;
            emit('ok', { inputValue });
        });
        actionsSlot.appendChild(okBtn.el);
    }
});
