import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiAddToProject — "Add selected cards to a project" overlay (Compound)
 *
 * A blocking modal with a title, a project dropdown, and OK/Cancel buttons.
 * Self-portals to `document.body` via MpiModal. The `projects` prop is the list
 * of pickable targets ({ id, name }); the `onConfirm` prop persists the copy.
 * While it runs the OK button shows a disabled state; the modal closes on
 * success and stays open (re-enabled) on failure so the user can retry.
 *
 * Usage:
 *   const dlg = MpiAddToProject.mount(document.createElement('div'), {
 *       projects: [{ id, name }, ...],
 *       onConfirm: async (projectId) => { await copy(projectId); },
 *   });
 *   dlg.el.show();
 *
 * Props:
 * @param {Array<{id:string,name:string}>} [projects=[]] - Selectable targets
 * @param {Function} [onConfirm] - async (projectId:string) => void. Errors keep the modal open.
 *
 * Emits:
 * 'confirm' { projectId } — after onConfirm resolves
 * 'cancel'  {}            — Cancel clicked (NOT on Escape/hide)
 */
export const MpiAddToProject = ComponentFactory.create({
    name: 'MpiAddToProject',
    css: ['js/components/Compounds/MpiAddToProject/MpiAddToProject.css'],

    template: () => `
        <div class="mpi-add-to-project" role="dialog" aria-modal="true">
            <div class="mpi-add-to-project__title" id="title-slot">Add to project</div>
            <div class="mpi-add-to-project__field" id="field-slot"></div>
            <div class="mpi-add-to-project__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(440px, 92vw)',
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        const projects = props.projects || [];
        let selectedId = projects[0]?.id ?? '';

        const dropdown = MpiDropdown.mount(document.createElement('div'), {
            options: projects.map(p => ({ label: p.name, value: p.id })),
            value: selectedId,
            placeholder: 'Select a project…',
        });
        dropdown.on('change', ({ value }) => { selectedId = value; });
        qs('#field-slot', el).appendChild(dropdown.el);

        const actionsSlot = qs('#actions-slot', el);

        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel', variant: 'secondary', size: 'md',
        });
        cancelBtn.on('click', () => { emit('cancel', {}); el.hide(); });
        actionsSlot.appendChild(cancelBtn.el);

        const okBtn = MpiButton.mount(document.createElement('div'), {
            text: 'OK', variant: 'primary', size: 'md',
        });
        okBtn.on('click', async () => {
            if (!selectedId) return;
            if (props.onConfirm) {
                okBtn.el.setDisabled(true);
                cancelBtn.el.setDisabled(true);
                try {
                    await props.onConfirm(selectedId);
                } catch (err) {
                    okBtn.el.setDisabled(false);
                    cancelBtn.el.setDisabled(false);
                    window.MpiAlert?.('Could not add to project: ' + (err?.message || err));
                    return;
                }
            }
            emit('confirm', { projectId: selectedId });
            el.hide();
        });
        actionsSlot.appendChild(okBtn.el);
    },
});
