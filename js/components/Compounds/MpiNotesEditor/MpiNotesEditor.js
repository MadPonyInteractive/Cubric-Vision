import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiNotesEditor — Notes editing overlay (Compound)
 *
 * A blocking modal with a title, an auto-growing textarea, and Save/Cancel
 * buttons. Self-portals to `document.body` via MpiModal (backdrop, Overlays
 * queue, Escape, `ui:close-all-popups`).
 *
 * The `onSave` prop is an async function that persists the notes. While it runs
 * the Save button shows a loading state and the modal stays open; it closes on
 * success and stays open (button re-enabled) on failure so the user can retry.
 *
 * Usage:
 *   const editor = MpiNotesEditor.mount(document.createElement('div'), {
 *       title: 'Project notes',
 *       value: existingNotes,
 *       onSave: async (notes) => { await persist(notes); },
 *   });
 *   editor.el.show();
 *
 * Props:
 * @param {string}   [title='Notes']        - Dialog title
 * @param {string}   [value='']             - Initial notes text
 * @param {string}   [placeholder='Write your notes here…'] - Textarea placeholder
 * @param {Function} [onSave]               - async (notes:string) => void. Errors keep the modal open.
 *
 * Emits:
 * 'save'   { value: string } — Save succeeded (after onSave resolves)
 * 'cancel' {}                — Cancel button clicked (NOT emitted on Escape/hide)
 */
export const MpiNotesEditor = ComponentFactory.create({
    name: 'MpiNotesEditor',
    css: ['js/components/Compounds/MpiNotesEditor/MpiNotesEditor.css'],

    template: () => `
        <div class="mpi-notes-editor" role="dialog" aria-modal="true">
            <div class="mpi-notes-editor__title" id="title-slot"></div>
            <div class="mpi-notes-editor__field" id="field-slot"></div>
            <div class="mpi-notes-editor__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(560px, 92vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        // ── Title ────────────────────────────────────────────────────────────
        qs('#title-slot', el).textContent = props.title || 'Notes';

        // ── Textarea ───────────────────────────────────────────────────────
        const input = MpiInput.mount(document.createElement('div'), {
            type: 'textarea',
            placeholder: props.placeholder || 'Write your notes here…',
            value: props.value || '',
            autoHeight: true,
        });
        qs('#field-slot', el).appendChild(input.el);

        const _readValue = () => qs('.mpi-input__field', input.el)?.value ?? '';

        // ── Actions ────────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel',
            variant: 'secondary',
            size: 'md',
        });
        cancelBtn.on('click', () => {
            emit('cancel', {});
            el.hide();
        });
        actionsSlot.appendChild(cancelBtn.el);

        const saveBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Save',
            variant: 'primary',
            size: 'md',
        });

        const _doSave = async () => {
            const value = _readValue();
            if (props.onSave) {
                saveBtn.el.setDisabled(true);
                cancelBtn.el.setDisabled(true);
                try {
                    await props.onSave(value);
                } catch (err) {
                    // Keep the modal open so the user can retry.
                    saveBtn.el.setDisabled(false);
                    cancelBtn.el.setDisabled(false);
                    window.MpiAlert?.('Could not save notes: ' + (err?.message || err));
                    return;
                }
            }
            emit('save', { value });
            el.hide();
        };

        saveBtn.on('click', _doSave);
        actionsSlot.appendChild(saveBtn.el);

        // Enter-to-confirm from MpiModal would clash with newlines in a textarea,
        // so we deliberately do NOT bind modal 'confirm' here.
    },
});
