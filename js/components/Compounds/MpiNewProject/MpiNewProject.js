import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';
import { Overlays } from '../../../managers/overlayManager.js';
import { Events } from '../../../events.js';
import { chooseFolder } from '../../../managers/projectManager.js';

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
                <div class="mpi-new-project__hint">Leave blank to use the default projects/ folder inside the app directory.</div>
            </div>
            <div class="mpi-new-project__actions" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Portal nodes (created on show, destroyed on hide) ────────────────
        let _backdrop = null;
        let _wrapper  = null;

        // ── Name input ───────────────────────────────────────────────────────
        const nameInput = MpiInput.mount(document.createElement('div'), {
            type: 'text',
            label: 'Project Name',
            placeholder: 'My Project'
        });
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
                const input = locationInput.el.querySelector('input');
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

        // ── Create button ────────────────────────────────────────────────────
        const createBtn = MpiButton.mount(document.createElement('div'), {
            text: '+ Create Project',
            variant: 'primary',
            size: 'md'
        });
        createBtn.on('click', () => {
            const name     = nameInput.el.querySelector('input')?.value?.trim() || '';
            const location = locationInput.el.querySelector('input')?.value?.trim() || '';
            emit('create', { name, location: location || null });
            el.hide();
        });
        actionsSlot.appendChild(createBtn.el);

        // ── Internal: Build and inject the portal ────────────────────────────
        const _doShow = () => {
            // Reset fields each time the dialog is opened
            const nameField = nameInput.el.querySelector('input');
            const locField  = locationInput.el.querySelector('input');
            if (nameField) nameField.value = '';
            if (locField)  locField.value  = '';

            _backdrop = document.createElement('div');
            _backdrop.className = 'mpi-new-project-backdrop';
            _backdrop.addEventListener('click', () => el.hide());
            document.body.appendChild(_backdrop);

            _wrapper = document.createElement('div');
            _wrapper.className = 'mpi-new-project-wrapper';
            _wrapper.appendChild(el);
            document.body.appendChild(_wrapper);

            // Focus the name field for immediate typing
            setTimeout(() => nameField?.focus(), 50);
        };

        // ── Public: show ─────────────────────────────────────────────────────
        el.show = () => {
            Overlays.request({ show: _doShow, hide: el.hide, id: el });
        };

        // ── Public: hide ─────────────────────────────────────────────────────
        // NOTE: Does NOT emit 'cancel'. Only the explicit Cancel button does.
        el.hide = () => {
            _backdrop?.remove(); _backdrop = null;
            _wrapper?.remove();  _wrapper  = null;
            Overlays.release(el);
        };

        // ── Global: respond to ui:close-all-popups ───────────────────────────
        const _unsubClose = Events.on('ui:close-all-popups', () => {
            if (_backdrop) el.hide();
        });

        // ── Cleanup: unsubscribe when dialog root is permanently removed ──────
        const _observer = new MutationObserver(() => {
            if (!document.contains(el) && !_wrapper) {
                _unsubClose();
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }
});
