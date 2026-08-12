import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs } from '../../../utils/dom.js';
import { renderMarkdownInto, wireMarkdownLinks } from '../../../utils/markdown.js';

/**
 * MpiNotesEditor — Notes editing overlay (Compound)
 *
 * A blocking modal with a title, a pencil/eye mode toggle, a scrolling textarea
 * (pencil) or rendered markdown (eye), and Save/Cancel buttons. Self-portals to
 * `document.body` via MpiModal (backdrop, Overlays queue, Escape,
 * `ui:close-all-popups`).
 *
 * Notes are markdown — `project.md` for a project, free text for a gallery card —
 * so the eye renders them through `js/utils/markdown.js`. The preview reads the
 * LIVE textarea, not the initial prop, so unsaved edits show up in it.
 *
 * It opens in whichever mode is useful: preview when there is something to read,
 * edit when the notes are empty.
 *
 * The textarea deliberately does NOT use `MpiInput`'s `autoHeight`. That mode
 * pairs `overflow: hidden` with an inline `height = scrollHeight`, which this
 * dialog's `max-height` then truncates — long notes became unreachable with no
 * scrollbar (MPI-545). A plain scrolling textarea is the fix.
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
 * @param {string}   [value='']             - Initial notes text (markdown)
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
            <div class="mpi-notes-editor__header">
                <div class="mpi-notes-editor__title" id="title-slot"></div>
                <div class="mpi-notes-editor__mode" id="mode-slot"></div>
            </div>
            <div class="mpi-notes-editor__field" id="field-slot">
                <div class="mpi-notes-editor__preview mpi-md" id="preview-slot" hidden></div>
            </div>
            <div class="mpi-notes-editor__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _unsubs = [];

        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        // Wide enough for a real document — notes hold tables and long prose,
        // and a table is what a 560px dialog squeezed hardest.
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(880px, 92vw)',
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
        });
        qs('#field-slot', el).appendChild(input.el);

        const _readValue = () => qs('.mpi-input__field', input.el)?.value ?? '';

        // ── Mode toggle: pencil edits the source, eye renders it ────────────
        const preview = qs('#preview-slot', el);
        _unsubs.push(wireMarkdownLinks(preview));

        const _setMode = (mode) => {
            const isPreview = mode === 'preview';
            if (isPreview) renderMarkdownInto(preview, _readValue().trim() || '*No notes yet.*');
            preview.hidden = !isPreview;
            input.el.hidden = isPreview;
        };

        const modeGroup = MpiRadioGroup.mount(document.createElement('div'), {
            options: [
                { label: 'Edit',    value: 'edit',    icon: 'edit', info: 'Edit the markdown source' },
                { label: 'Preview', value: 'preview', icon: 'eye',  info: 'Preview the rendered markdown' },
            ],
            value: (props.value || '').trim() ? 'preview' : 'edit',
            name: 'notes-mode',
            iconOnly: true,
            size: 'sm',
        });
        modeGroup.on('select', ({ value }) => _setMode(value));
        qs('#mode-slot', el).appendChild(modeGroup.el);
        _setMode((props.value || '').trim() ? 'preview' : 'edit');

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

        el.destroy = () => {
            _unsubs.forEach((fn) => fn());
            _unsubs.length = 0;
        };
    },
});
