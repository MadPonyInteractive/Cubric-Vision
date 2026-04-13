import { ComponentFactory } from '../../factory.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { qs, ce } from '../../../utils/dom.js';

/**
 * MpiInstalledDisplay — Installed Item Info Compound
 *
 * Displays metadata and actions for an installed item (e.g., a downloaded model
 * or workflow). Mirrors the legacy model-manager card layout.
 *
 * Props:
 * @param {string} [title='']          - Title text displayed on the top-left
 * @param {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @param {string} [text='']           - Descriptive text body
 * @param {string} [image='']          - Preview PNG filename from modelConstants (e.g. 'Lustify7.png').
 *                                        Renders an <img> from 'comfy_workflows/display/{image}'.
 * @param {string} [icon='info']       - MpiIcon registry key for the info row icon
 * @param {string} [iconText='']       - Text shown alongside the icon in the info row
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='sm'] - Size of the info row icon
 * @param {'muted'|'accent'|'primary'|'danger'|'success'} [iconColor='danger']
 *   - Color modifier for the info row icon
 * @param {boolean} [installed=false]     - Whether this item is installed; controls badge label/variant
 * @param {string} [deleteLabel='Install']    - Label for the primary action button
 * @param {'idle'|'downloading'|'paused'|'partial'|'installing'|'complete'} [downloadState='idle']
 * @param {number} [progress=0]          - Download progress 0–1
 * @param {string} [speed='']            - Download speed string e.g. "12.3 MB/s"
 * @param {number} [downloadedBytes=0]   - Bytes downloaded so far
 * @param {number} [totalBytes=0]        - Total bytes to download
 * @param {boolean} [canUninstall=false] - Show Uninstall button when true and installed
 * @param {boolean} [hasPartialProgress=false] - Show progress bar for a partially-installed dep
 *   (e.g. some deps are on disk but missing others). Use with downloadState='idle' to show
 *   a progress bar while keeping the Install button.
 *
 * Emits:
 * 'delete'    {} — Action button clicked (Install when idle)
 * 'pause'     {} — Pause button clicked (during download)
 * 'resume'    {} — Resume button clicked (when paused)
 * 'cancel'    {} — Cancel button clicked
 * 'uninstall' {} — Uninstall button clicked (when installed and canUninstall)
 */
export const MpiInstalledDisplay = ComponentFactory.create({
    name: 'MpiInstalledDisplay',
    css: ['js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css'],

    template: () => `
        <div class="mpi-installed-display">
            <div class="mpi-installed-display__header">
                <span class="mpi-installed-display__title" id="idtitle-slot"></span>
                <span class="mpi-installed-display__meta" id="idmeta-slot"></span>
            </div>
            <div class="mpi-installed-display__text" id="idtext-slot"></div>
            <div class="mpi-installed-display__image" id="idimage-slot"></div>
            <div class="mpi-installed-display__info-row" id="idinfo-slot"></div>
            <div class="mpi-installed-display__badge-row" id="idbadge-slot"></div>
            <div class="mpi-installed-display__actions" id="idactions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        function _formatBytes(bytes) {
            if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
            if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
            return `${bytes}B`;
        }

        // Title
        const titleSlot = qs('#idtitle-slot', el);
        if (props.title) titleSlot.textContent = props.title;

        // Meta (top-right)
        const metaSlot = qs('#idmeta-slot', el);
        if (props.meta) metaSlot.textContent = props.meta;

        // Text body
        const textSlot = qs('#idtext-slot', el);
        if (props.text) textSlot.textContent = props.text;

        // Image preview
        const imageSlot = qs('#idimage-slot', el);
        if (props.image) {
            const img = ce('img', {
                src: `comfy_workflows/display/${props.image}`,
                className: 'mpi-installed-display__image-img',
            });
            imageSlot.appendChild(img);
        } else {
            imageSlot.style.display = 'none';
        }

        // Icon + text row
        const infoSlot = qs('#idinfo-slot', el);
        if (props.icon || props.iconText) {
            const iconWrap = ce('div', { className: 'mpi-installed-display__info-inner' });

            if (props.icon) {
                const iconInst = MpiIcon.mount(ce('div'), {
                    name: props.icon,
                    size: props.iconSize || 'sm',
                    color: props.iconColor || 'danger'
                });
                iconWrap.appendChild(iconInst.el);
            }

            if (props.iconText) {
                const iconTextEl = ce('span', {
                    className: 'mpi-installed-display__icon-text',
                    textContent: props.iconText,
                });
                iconWrap.appendChild(iconTextEl);
            }

            infoSlot.appendChild(iconWrap);
        } else {
            infoSlot.style.display = 'none';
        }

        // ── Download state handling ──────────────────────────────────────────────

        const isDownloading = ['downloading', 'paused', 'partial'].includes(props.downloadState);
        const isInstalling = props.downloadState === 'installing';
        const isComplete = props.downloadState === 'complete' || props.installed;
        const showProgress = isDownloading || props.hasPartialProgress;

        // Badge row — conditional based on installed prop and download state
        const badgeSlot = qs('#idbadge-slot', el);
        badgeSlot.innerHTML = '';
        if (isComplete) {
            const badge = MpiBadge.mount(ce('div'), { label: 'INSTALLED', variant: 'success' });
            badgeSlot.appendChild(badge.el);
        } else if (props.hasPartialProgress && !props.installed) {
            const badge = MpiBadge.mount(ce('div'), { label: 'PARTIALLY INSTALLED', variant: 'warning' });
            badgeSlot.appendChild(badge.el);
        } else if (!showProgress && !isInstalling) {
            const badge = MpiBadge.mount(ce('div'), { label: 'NOT INSTALLED', variant: 'danger' });
            badgeSlot.appendChild(badge.el);
        }

        // Actions row — driven by downloadState (NOT hasPartialProgress — that only affects the progress bar)
        const actionsSlot = qs('#idactions-slot', el);
        actionsSlot.innerHTML = '';

        // Progress bar — shown for active downloads OR partial progress (hasPartialProgress)
        if (showProgress) {
            const progressSlot = ce('div', { className: 'mpi-installed-display__progress-slot' });

            const barWrap = ce('div', { style: 'padding: 4px 0;' });
            MpiProgressBar.mount(barWrap, {
                value: Math.round((props.progress || 0) * 100),
                min: 0,
                max: 100,
                variant: props.downloadState === 'paused' ? 'secondary' : 'primary',
                interactive: false,
            });
            progressSlot.appendChild(barWrap);

            const label = ce('div', { className: 'mpi-installed-display__progress-label' });
            if (props.downloadState === 'paused') {
                label.textContent = `Paused${props.speed ? ' — ' + props.speed : ''}`;
            } else if (props.hasPartialProgress) {
                const downloadedText = props.totalBytes ? `${_formatBytes(props.downloadedBytes)} / ${_formatBytes(props.totalBytes)}` : '';
                label.textContent = downloadedText || 'Partially installed';
            } else {
                const downloadedText = props.totalBytes ? `${_formatBytes(props.downloadedBytes)} / ${_formatBytes(props.totalBytes)}` : '';
                const speedText = props.speed || '';
                label.textContent = downloadedText ? (speedText ? `${downloadedText} — ${speedText}` : downloadedText) : speedText;
            }
            progressSlot.appendChild(label);

            actionsSlot.appendChild(progressSlot);
        }

        if (isInstalling) {
            const label = ce('div', { className: 'mpi-installed-display__installing-label' });
            label.textContent = 'Installing';
            actionsSlot.appendChild(label);
        }

        if (props.downloadState === 'downloading') {
            const pauseBtn = MpiButton.mount(ce('div'), { text: 'Pause', variant: 'secondary', size: 'md' });
            pauseBtn.on('click', () => emit('pause', {}));
            actionsSlot.appendChild(pauseBtn.el);
            const cancelBtn = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'ghost', size: 'md' });
            cancelBtn.on('click', () => emit('cancel', {}));
            actionsSlot.appendChild(cancelBtn.el);
        } else if (props.downloadState === 'paused' || props.downloadState === 'partial') {
            const resumeBtn = MpiButton.mount(ce('div'), { text: 'Resume', variant: 'primary', size: 'md' });
            resumeBtn.on('click', () => emit('resume', {}));
            actionsSlot.appendChild(resumeBtn.el);
            const cancelBtn = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'ghost', size: 'md' });
            cancelBtn.on('click', () => emit('cancel', {}));
            actionsSlot.appendChild(cancelBtn.el);
        } else if (!isComplete) {
            // Spacer + action button (Install)
            const spacer = ce('div', { className: 'mpi-installed-display__spacer' });
            actionsSlot.appendChild(spacer);
            const actionBtn = MpiButton.mount(ce('div'), {
                text: props.deleteLabel || 'Install',
                variant: 'secondary',
                size: 'md',
            });
            actionBtn.on('click', () => emit('delete', {}));
            actionsSlot.appendChild(actionBtn.el);
        } else if (props.installed && props.canUninstall) {
            // Uninstall button — shown for fully installed models
            const spacer = ce('div', { className: 'mpi-installed-display__spacer' });
            actionsSlot.appendChild(spacer);
            const uninstallBtn = MpiButton.mount(ce('div'), {
                text: 'Uninstall',
                variant: 'ghost',
                size: 'md',
            });
            uninstallBtn.on('click', () => emit('uninstall', {}));
            actionsSlot.appendChild(uninstallBtn.el);
        }
    }
});
