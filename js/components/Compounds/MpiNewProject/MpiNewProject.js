import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { qs } from '../../../utils/dom.js';
import { chooseFolder } from '../../../services/projectService.js';

/**
 * MpiNewProject — New Project Creation Dialog (Compound)
 *
 * A modal dialog for creating a new project. Self-portals to `document.body`
 * with a blurred backdrop. Integrates with OverlayManager (queue + Escape) and
 * the global Events bus (`ui:close-all-popups`).
 *
 * Usage:
 *   const dialog = MpiNewProject.mount(document.createElement('div'));
 *   dialog.on('create', ({ name, location }) => createProject(name, location));
 *   dialog.on('cancel', () => {});
 *   dialog.el.show();
 *   dialog.el.hide();
 *
 * Emits:
 * 'create' { name: string, location: string } — "+ Create Project" clicked
 * 'cancel' {}                                  — Cancel button clicked (NOT emitted on Escape/hide)
 */
export const MpiNewProject = ComponentFactory.create({
    name: 'MpiNewProject',
    css: ['js/components/Compounds/MpiNewProject/MpiNewProject.css'],

    template: () => `
        <div class="mpi-new-project" role="dialog" aria-modal="true" aria-labelledby="mpi-new-project-title">
            <div class="mpi-new-project__content">
                <div class="mpi-new-project__title" id="mpi-new-project-title">New Project</div>
                <div class="mpi-new-project__field" id="name-slot"></div>
                <div class="mpi-new-project__field mpi-new-project__field--location">
                    <div id="location-slot"></div>
                    <div id="browse-slot"></div>
                </div>
                <div class="mpi-new-project__hint">Leave blank to use the default Documents/Cubric Vision/Projects folder.</div>
            </div>
            <div class="mpi-new-project__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Modal primitive — owns backdrop, portal, Overlays, Events ────────
        let _nameField = null;

        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(480px, 90vw)',
            onShow: () => setTimeout(() => _nameField?.focus(), 50),
        });
        modal.el.appendChild(el);
        el.show = () => {
            // Reset fields each time the dialog is opened
            if (_nameField) _nameField.value = '';
            const locField = qs('input', locationInput.el);
            if (locField) locField.value = '';
            modal.el.show();
        };
        el.hide = () => modal.el.hide();

        // ── Name input ───────────────────────────────────────────────────────
        const nameInput = MpiInput.mount(document.createElement('div'), {
            type: 'text',
            label: 'Project Name',
            placeholder: 'My Project'
        });
        _nameField = qs('input', nameInput.el);
        qs('#name-slot', el).appendChild(nameInput.el);

        // ── Location input ───────────────────────────────────────────────────
        const locationInput = MpiInput.mount(document.createElement('div'), {
            type: 'text',
            label: 'Project Location',
            placeholder: 'Optional folder path...'
        });
        qs('#location-slot', el).appendChild(locationInput.el);

        // ── Browse button ────────────────────────────────────────────────────
        const browseBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'folder',
            variant: 'outline',
            size: 'md',
            info: 'Browse for folder'
        });
        browseBtn.on('click', async () => {
            const path = await chooseFolder();
            if (path) {
                const input = qs('input', locationInput.el);
                if (input) {
                    input.value = path;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
        qs('#browse-slot', el).appendChild(browseBtn.el);

        // ── Cancel button ────────────────────────────────────────────────────
        const actionsSlot = qs('#actions-slot', el);

        const cancelBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Cancel',
            variant: 'secondary',
            size: 'md'
        });
        cancelBtn.on('click', () => {
            emit('cancel', {});
            el.hide();
        });
        actionsSlot.appendChild(cancelBtn.el);

        // ── Enter key to create (via MpiModal's confirm event) ─────────────
        modal.on('confirm', () => {
            const name     = qs('input', nameInput.el)?.value?.trim() || '';
            const location = qs('input', locationInput.el)?.value?.trim() || '';
            emit('create', { name, location: location || null });
            el.hide();
        });

        // ── Create button ────────────────────────────────────────────────────
        const createBtn = MpiButton.mount(document.createElement('div'), {
            text: '+ Create Project',
            variant: 'primary',
            size: 'md'
        });
        createBtn.on('click', () => {
            const name     = qs('input', nameInput.el)?.value?.trim() || '';
            const location = qs('input', locationInput.el)?.value?.trim() || '';
            emit('create', { name, location: location || null });
            el.hide();
        });
        actionsSlot.appendChild(createBtn.el);
    }
});
