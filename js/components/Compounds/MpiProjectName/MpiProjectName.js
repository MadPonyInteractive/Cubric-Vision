import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { ce } from '/js/utils/dom.js';

/**
 * MpiProjectName — Compound: back-arrow + breadcrumb trail.
 *
 * Displays up to three breadcrumb segments:
 *   ← | MAIN GALLERY › IMAGE › GENERATOR
 *
 * Segment rules:
 *   root      — always clickable, hidden when user is already there (no workspace set)
 *   workspace — clickable, hidden when same as root or not set
 *   tool      — plain text (current page), hidden when not set
 *
 * Props:
 * @param {string} [projectName='']    - Active project name (tooltip on root segment)
 * @param {string} [rootLabel='']      - Root label, e.g. 'Main Gallery'
 * @param {string} [workspaceLabel=''] - Workspace label, e.g. 'Image'
 * @param {string} [toolLabel='']      - Tool label, e.g. 'Generator'. Empty = hidden.
 *
 * Instance methods (on instance.el):
 *   setProjectName(name)      — update project name (tooltip)
 *   setRootLabel(label)       — update root segment (pass '' to hide)
 *   setWorkspaceLabel(label)  — update workspace segment (pass '' to hide)
 *   setToolLabel(label)       — update tool segment (pass '' to hide)
 *
 * Emits:
 *   'back'      {} — back arrow clicked
 *   'root'      {} — root breadcrumb segment clicked
 *   'workspace' {} — workspace breadcrumb segment clicked
 */
export const MpiProjectName = ComponentFactory.create({
    name: 'MpiProjectName',
    css: ['js/components/Compounds/MpiProjectName/MpiProjectName.css'],

    template: () => `<div class="mpi-project-name"></div>`,

    setup: (el, props, emit) => {

        // ── Back button ─────────────────────────────────────────────────────────

        const backWrap = ce('div', { className: 'mpi-project-name__back' });
        const backBtn = MpiButton.mount(backWrap, {
            icon: 'back',
            size: 'sm',
            variant: 'ghost',
            info: 'Go back',
        });
        backBtn.on('click', () => emit('back', {}));

        // ── Text block (project name + breadcrumb stacked) ─────────────────────

        const textBlock = ce('div', { className: 'mpi-project-name__text' });

        const projectNameEl = ce('span', {
            className: 'mpi-project-name__project',
            textContent: props.projectName || '',
        });

        // ── Breadcrumb ──────────────────────────────────────────────────────────

        const breadcrumb = ce('div', { className: 'mpi-project-name__breadcrumb' });

        // Root segment — clickable (e.g. "MAIN GALLERY")
        const rootEl = ce('button', {
            className: 'mpi-project-name__segment mpi-project-name__segment--link',
            type: 'button',
            textContent: (props.rootLabel || '').toUpperCase(),
            title: props.projectName || '',
        });
        rootEl.addEventListener('click', () => emit('root', {}));

        const sep1El = ce('span', {
            className: 'mpi-project-name__separator',
            textContent: '›',
            'aria-hidden': 'true',
        });

        // Workspace segment — clickable (e.g. "IMAGE")
        const workspaceEl = ce('button', {
            className: 'mpi-project-name__segment mpi-project-name__segment--link',
            type: 'button',
            textContent: (props.workspaceLabel || '').toUpperCase(),
        });
        workspaceEl.addEventListener('click', () => emit('workspace', {}));

        const sep2El = ce('span', {
            className: 'mpi-project-name__separator',
            textContent: '›',
            'aria-hidden': 'true',
        });

        // Tool segment — plain text, current page (e.g. "GENERATOR")
        const toolEl = ce('span', {
            className: 'mpi-project-name__segment mpi-project-name__segment--current',
            textContent: (props.toolLabel || '').toUpperCase(),
        });

        breadcrumb.append(rootEl, sep1El, workspaceEl, sep2El, toolEl);
        textBlock.append(projectNameEl, breadcrumb);
        el.append(backWrap, textBlock);

        // ── Visibility ──────────────────────────────────────────────────────────

        function _update() {
            const hasRoot      = rootEl.textContent.trim().length > 0;
            const hasWorkspace = workspaceEl.textContent.trim().length > 0;
            const hasTool      = toolEl.textContent.trim().length > 0;

            _toggle(rootEl,      !hasRoot);
            _toggle(sep1El,      !(hasRoot && hasWorkspace));
            _toggle(workspaceEl, !hasWorkspace);
            _toggle(sep2El,      !(hasWorkspace && hasTool));
            _toggle(toolEl,      !hasTool);
        }

        function _toggle(el, hidden) {
            el.classList.toggle('mpi-project-name--hidden', hidden);
        }

        _update();

        // ── Public API ──────────────────────────────────────────────────────────

        /** @param {string} name */
        el.setProjectName = (name) => {
            projectNameEl.textContent = name;
            rootEl.title = name;
        };

        /** @param {string} label */
        el.setRootLabel = (label) => {
            rootEl.textContent = label.toUpperCase();
            _update();
        };

        /** @param {string} label */
        el.setWorkspaceLabel = (label) => {
            workspaceEl.textContent = label.toUpperCase();
            _update();
        };

        /** @param {string} label */
        el.setToolLabel = (label) => {
            toolEl.textContent = label.toUpperCase();
            _update();
        };

        // Legacy compat
        /** @deprecated use setWorkspaceLabel */
        el.setPageName = (name) => el.setWorkspaceLabel(name);

        // ── Cleanup ─────────────────────────────────────────────────────────────

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
