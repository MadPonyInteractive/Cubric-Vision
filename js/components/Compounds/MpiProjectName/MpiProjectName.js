import { ComponentFactory } from '../../factory.js';
import { ce } from '/js/utils/dom.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';

/**
 * Ghost-mount an MpiButton and hand back its <button>, so a bare element is never
 * written into this bar (MPI-582). Same helper shape as MpiBaseFlow's.
 * @param {object} props
 * @returns {HTMLElement}
 */
function _mountButton(props) {
    return MpiButton.mount(ce('div'), props).el;
}

/**
 * MpiProjectName — Project title bar with 2-level breadcrumb + right-side stats.
 *
 * Layout:  ← PREVIOUS  PROJECT NAME  ›  GROUP NAME           ___  N ASSETS · X.X GB
 *
 * The back link names the previous workspace (e.g. 'PROJECTS' in gallery,
 * 'GALLERY' in group history) — caller controls via `setBackLabel`.
 *
 * The "Gallery" segment is a clickable link shown only when inside a group.
 * The group name segment is plain text — the current location.
 *
 * Stats slot (right-aligned, pink) shows asset count + size on disk. Caller
 * passes `statsLabel` ('ASSETS' / 'ENTRIES') to suit the surface.
 *
 * Props:
 * @param {string} [backLabel='']    - Previous workspace name (e.g. 'PROJECTS', 'GALLERY')
 * @param {string} [projectName='']  - Active project name shown above breadcrumb
 * @param {string} [galleryLabel=''] - e.g. 'Gallery' — shown as clickable link; empty = hidden
 * @param {string} [groupLabel='']   - e.g. 'My Group' — shown as current location; empty = hidden
 * @param {number} [statsCount=0]    - count value rendered before label
 * @param {number} [statsBytes=0]    - bytes-on-disk; rendered as KB/MB/GB
 * @param {string} [statsLabel='ASSETS'] - noun for the count (ASSETS, ENTRIES, etc.)
 *
 * Instance methods (on instance.el):
 *   setBackLabel(label)                — update back-link text (e.g. 'PROJECTS')
 *   setProjectName(name)               — update project name
 *   setGalleryLabel(label)             — pass '' to hide (we are at gallery root)
 *   setGroupLabel(label)               — pass '' to hide (we are not inside a group)
 *   setStats({ count, bytes, label })  — update stats; any field optional
 *
 * Emits:
 *   'up'      {} — up-arrow clicked (navigate up one level)
 *   'gallery' {} — gallery breadcrumb segment clicked
 */
export const MpiProjectName = ComponentFactory.create({
    name: 'MpiProjectName',
    css: ['js/components/Compounds/MpiProjectName/MpiProjectName.css'],

    template: () => `<div class="mpi-project-name"></div>`,

    setup: (el, props, emit) => {

        // ── Back link (← PREVIOUS_WORKSPACE) ────────────────────────────────────

        const backBtn = _mountButton({
            variant: 'ghost',
            extraClasses: 'mpi-project-name__back',
            info: 'Go up',
        });
        backBtn.title = 'Go up';
        const backArrow = ce('span', { className: 'mpi-project-name__back-arrow', textContent: '←', 'aria-hidden': 'true' });
        const backLabelEl = ce('span', {
            className: 'mpi-project-name__back-label',
            textContent: (props.backLabel || '').toUpperCase(),
        });
        backBtn.replaceChildren(backArrow, backLabelEl);
        backBtn.addEventListener('click', () => emit('up', {}));

        // ── Text block ──────────────────────────────────────────────────────────

        const textBlock = ce('div', { className: 'mpi-project-name__text' });

        const projectNameEl = ce('span', {
            className: 'mpi-project-name__project',
            textContent: props.projectName || '',
        });

        // ── Breadcrumb ──────────────────────────────────────────────────────────

        const breadcrumb = ce('div', { className: 'mpi-project-name__breadcrumb' });

        // Gallery segment — clickable link, hidden when at gallery root
        // `text` is deliberately never empty at mount: MpiButton only renders its
        // `.mpi-btn__text` span when `props.text` is truthy, and `setLabel` writes into
        // that span — mount it blank and every later setGalleryLabel would land nowhere.
        const galleryEl = _mountButton({
            text: (props.galleryLabel || '').toUpperCase() || ' ',
            variant: 'ghost',
            extraClasses: 'mpi-project-name__segment mpi-project-name__segment--link',
        });
        galleryEl.addEventListener('click', () => emit('gallery', {}));

        const sepEl = ce('span', {
            className: 'mpi-project-name__separator',
            textContent: '›',
            'aria-hidden': 'true',
        });

        // Group segment — plain text (current location), hidden when at gallery root
        const groupEl = ce('span', {
            className: 'mpi-project-name__segment mpi-project-name__segment--current',
            textContent: (props.groupLabel || '').toUpperCase(),
        });

        breadcrumb.append(galleryEl, sepEl, groupEl);
        textBlock.append(projectNameEl, breadcrumb);

        // ── Flows (centre) ──────────────────────────────────────────────────────
        // MPI-589, Fabio's placement: "between the asset count in the gallery and the
        // project name, right at the centre top of the gallery". Absolutely centred on
        // the bar rather than flex-centred, so a long project name cannot shove it off
        // the middle. Emits — the shell decides what opening Flows means.
        const flowsBtn = _mountButton({
            icon: 'layers', label: 'Flows', size: 'sm', variant: 'ghost',
            extraClasses: 'mpi-project-name__flows',
            info: 'Open the Flow Library',
        });
        flowsBtn.addEventListener('click', () => emit('flows', {}));

        // ── Stats (right-aligned: rule + count + label · size) ─────────────────
        const statsEl = ce('div', { className: 'mpi-project-name__stats' });
        const statsRule  = ce('span', { className: 'mpi-project-name__stats-rule', 'aria-hidden': 'true' });
        const statsCount = ce('span', { className: 'mpi-project-name__stats-count' });
        const statsLabel = ce('span', { className: 'mpi-project-name__stats-label' });
        const statsSep   = ce('span', { className: 'mpi-project-name__stats-sep', textContent: '·', 'aria-hidden': 'true' });
        const statsSize  = ce('span', { className: 'mpi-project-name__stats-size' });
        statsEl.append(statsRule, statsCount, statsLabel, statsSep, statsSize);

        let _statsCount = Number(props.statsCount) || 0;
        let _statsBytes = Number(props.statsBytes) || 0;
        let _statsLabel = (props.statsLabel || 'ASSETS').toUpperCase();

        function _formatBytes(b) {
            if (!b || b < 1) return '0 KB';
            const KB = 1024, MB = KB * 1024, GB = MB * 1024;
            if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
            if (b >= MB) return `${(b / MB).toFixed(1)} MB`;
            return `${Math.max(1, Math.round(b / KB))} KB`;
        }

        function _renderStats() {
            statsCount.textContent = String(_statsCount);
            statsLabel.textContent = ` ${_statsLabel}`;
            statsSize.textContent  = _formatBytes(_statsBytes);
        }
        _renderStats();

        el.append(backBtn, textBlock, flowsBtn, statsEl);

        // ── Visibility ──────────────────────────────────────────────────────────

        function _update() {
            const hasGallery = galleryEl.textContent.trim().length > 0;
            const hasGroup   = groupEl.textContent.trim().length > 0;

            _toggle(galleryEl, !hasGallery);
            _toggle(sepEl,     !(hasGallery && hasGroup));
            _toggle(groupEl,   !hasGroup);
        }

        function _toggle(node, hidden) {
            node.classList.toggle('mpi-project-name--hidden', hidden);
        }

        _update();

        // ── Public API ──────────────────────────────────────────────────────────

        /** @param {string} name */
        el.setProjectName = (name) => {
            projectNameEl.textContent = name;
        };

        /** @param {string} label — pass '' to hide (we are at gallery root) */
        el.setGalleryLabel = (label) => {
            galleryEl.setLabel(label.toUpperCase() || ' ');
            _update();
        };

        /** @param {string} label — pass '' to hide (not inside a group) */
        el.setGroupLabel = (label) => {
            groupEl.textContent = label.toUpperCase();
            _update();
        };

        /** @param {string} label — name of previous workspace (e.g. 'PROJECTS', 'GALLERY') */
        el.setBackLabel = (label) => {
            backLabelEl.textContent = String(label || '').toUpperCase();
        };

        /** @param {{ count?: number, bytes?: number, label?: string }} stats */
        el.setStats = (stats = {}) => {
            if (typeof stats.count === 'number')  _statsCount = stats.count;
            if (typeof stats.bytes === 'number')  _statsBytes = stats.bytes;
            if (stats.label) _statsLabel = String(stats.label).toUpperCase();
            _renderStats();
        };

        // ── Cleanup ─────────────────────────────────────────────────────────────

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
