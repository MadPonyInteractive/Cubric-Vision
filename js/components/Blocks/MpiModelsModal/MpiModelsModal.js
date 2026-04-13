import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiInstalledDisplay } from '../../Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../../Primitives/MpiIcon/MpiIcon.js';
import { renderIcon } from '../../../utils/icons.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import { MODELS } from '../../../data/modelRegistry.js';
import { reSyncInstalledModels } from '../../../data/modelRegistry.js';
import { DEPS } from '../../../data/modelConstants/dependencies.js';
import { downloadService } from '../../../services/downloadService.js';
import { qs, qsa, ce, on } from '../../../utils/dom.js';

/**
 * MpiModelsModal — Block: Zero-Installed State Overlay
 *
 * Self-contained overlay that displays all available models as
 * MpiInstalledDisplay cards with Install/Remove buttons. Refreshes in place.
 * Owns all model-list logic internally — no external appendToContainer.
 *
 * Props:
 * @param {string}   [icon='download']             - MpiIcon registry key
 * @param {string}   [title='Install Models']       - Modal title
 * @param {string}   [text]                         - Descriptive text below title
 * @param {string}   [footer]                       - Footer text
 * @param {boolean}  [closable=true]                - Show X close button
 *
 * Emits:
 * 'close' {} — X button clicked (overlay hide fires this)
 */
export const MpiModelsModal = ComponentFactory.create({
    name: 'MpiModelsModal',
    css: ['js/components/Blocks/MpiModelsModal/MpiModelsModal.css'],

    template: (props) => {
        const icon = props.icon || 'download';
        const iconSize = props.iconSize || 'xl';
        const title = props.title || 'Install Models';
        const text = props.text || '';
        const footer = props.footer || '';

        const titleHtml = title ? `<h2 class="mpi-models-modal__title">${title}</h2>` : '';
        const textHtml = text ? `<p class="mpi-models-modal__text">${text}</p>` : '';
        const footerHtml = footer ? `<p class="mpi-models-modal__footer">${footer}</p>` : '';

        return `
            <div class="mpi-models-modal">
                <div class="mpi-models-modal__header">
                    <div class="mpi-models-modal__icon">${renderIcon(icon, iconSize)}</div>
                    ${titleHtml}
                    ${textHtml}
                </div>
                <div class="mpi-models-modal__refresh-btn" id="refresh-btn-slot"></div>
                <div class="mpi-models-modal__separator"></div>
                <div class="mpi-models-modal__slot" id="body-slot"></div>
                ${footerHtml}
            </div>`;
    },

    setup: (el, props, emit) => {
        // ── Base overlay ─────────────────────────────────────────────────────
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: props.closable !== false,
        });
        overlay.on('close', () => emit('close', {}));
        overlay.on('close', () => Events.emit('models:closed', {}));

        // Mount el (the template root) INTO the overlay
        overlay.el.appendToContainer(el);

        el.show = () => { if (_isShowing) return; _isShowing = true; overlay.el.show(); _isShowing = false; };
        el.hide = () => { if (_isHiding) return; _isHiding = true; overlay.el.hide(); _isHiding = false; };
        let _isShowing = false;
        let _isHiding = false;

        // ── DOM refs ──────────────────────────────────────────────────────────
        const bodySlot = qs('#body-slot', el);
        const refreshSlot = qs('.mpi-models-modal__refresh-btn', el);

        const _unsubs = [];

        // ── Refresh button ───────────────────────────────────────────────────
        const refreshBtn = MpiButton.mount(refreshSlot, {
            icon: 'refresh',
            variant: 'ghost',
            size: 'md',
            info: 'Refresh model state from disk',
        });

        _unsubs.push(on(refreshBtn.el, 'click', () => {
            awaitReSync();
        }));

        // ── Install a model (non-blocking via downloadService) ───────────────
        async function _installModel(model) {
            const dependencies = model.dependencies
                .map(depId => DEPS[depId])
                .filter(Boolean);
            if (!dependencies.length) return;
            await downloadService.start(model.id, dependencies);
            renderList();
        }

        // ── Re-sync wrapper ────────────────────────────────────────────────
        async function awaitReSync() {
            refreshBtn.el.setAttribute('loading', 'true');
            await reSyncInstalledModels();
            renderList();
            refreshBtn.el.removeAttribute('loading');
        }

        // ── Compute size + VRAM stats from deps ─────────────────────────────
        function _computeModelStats(model) {
            if (!model.dependencies || model.dependencies.length === 0) {
                return { sizeText: '', vramText: '' };
            }

            let totalBytes = 0;
            let maxVram = 0;

            for (const depId of model.dependencies) {
                const dep = DEPS[depId];
                if (!dep) continue;
                totalBytes += _parseSizeToBytes(dep.size);
                const vramNum = parseInt(dep.vram) || 0;
                if (vramNum > maxVram) maxVram = vramNum;
            }

            return {
                sizeText: totalBytes > 0 ? _formatBytes(totalBytes) : '',
                vramText: maxVram > 0 ? `${maxVram}GB VRAM` : '',
            };
        }

        function _parseSizeToBytes(sizeStr) {
            if (!sizeStr) return 0;
            const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
            if (!match) return 0;
            return parseFloat(match[1]) * { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[match[2].toUpperCase()] || 0;
        }

        function _formatBytes(bytes) {
            if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
            if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}MB`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
            return `${bytes}B`;
        }

        // ── Uninstall stub ──────────────────────────────────────────────────
        async function _uninstallModel(model) {
            Events.emit('ui:error', {
                title: 'Not implemented',
                message: 'Model uninstallation is not yet available.',
            });
        }

        // ── Render card list ───────────────────────────────────────────────
        function renderList() {
            qsa('.mpi-models-modal__card', bodySlot).forEach(c => c.remove());
            qsa('.mpi-models-modal__section-header', bodySlot).forEach(h => h.remove());
            qsa('.mpi-models-modal__empty', bodySlot).forEach(e => e.remove());

            const installed = MODELS.filter(m => m.installed === true);
            const uninstalled = MODELS.filter(m => m.installed !== true);

            // Installed section
            if (installed.length > 0) {
                const header = ce('div', { className: 'mpi-models-modal__section-header' },
                    [document.createTextNode('Installed Models')]);
                bodySlot.appendChild(header);

                installed.forEach(model => {
                    const stats = _computeModelStats(model);
                    const cardWrap = ce('div', { className: 'mpi-models-modal__card' });
                    bodySlot.appendChild(cardWrap);

                    const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);
                    const downloadState = downloadJob ? downloadJob.status : 'idle';
                    const progress = downloadJob ? downloadJob.progress : 0;
                    const speed = downloadJob ? downloadJob.speed : '';
                    const downloadedBytes = downloadJob ? downloadJob.downloadedBytes : 0;
                    const totalBytes = downloadJob ? downloadJob.totalBytes : 0;

                    const card = MpiInstalledDisplay.mount(cardWrap, {
                        title: model.name,
                        meta: stats.sizeText,
                        text: model.description || '',
                        image: model.image || '',
                        icon: 'info',
                        iconText: stats.vramText,
                        installed: true,
                        deleteLabel: 'Uninstall',
                        downloadState,
                        progress,
                        speed,
                        downloadedBytes,
                        totalBytes,
                    });

                    if (downloadState !== 'idle') {
                        card.on('pause', () => downloadService.pause(model.id));
                        card.on('resume', () => downloadService.resume(model.id));
                        card.on('cancel', () => downloadService.cancel(model.id));
                    } else {
                        card.on('delete', () => {
                            Events.emit('ui:error', {
                                title: 'Not implemented',
                                message: 'Model uninstallation is not yet available.',
                            });
                        });
                    }
                });
            }

            // Available section
            if (uninstalled.length === 0 && installed.length > 0) {
                const emptyEl = ce('div', { className: 'mpi-models-modal__empty' },
                    [ce('span', { textContent: 'No models available to install' })]);
                bodySlot.appendChild(emptyEl);
                return;
            }

            if (uninstalled.length === 0 && installed.length === 0) {
                const emptyEl = ce('div', { className: 'mpi-models-modal__empty' },
                    [ce('span', { textContent: 'No models available' })]);
                bodySlot.appendChild(emptyEl);
                return;
            }

            uninstalled.forEach(model => {
                const stats = _computeModelStats(model);
                const cardWrap = ce('div', { className: 'mpi-models-modal__card' });
                bodySlot.appendChild(cardWrap);

                const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);
                const downloadState = downloadJob ? downloadJob.status : 'idle';
                const progress = downloadJob ? downloadJob.progress : 0;
                const speed = downloadJob ? downloadJob.speed : '';
                const downloadedBytes = downloadJob ? downloadJob.downloadedBytes : 0;
                const totalBytes = downloadJob ? downloadJob.totalBytes : 0;

                const card = MpiInstalledDisplay.mount(cardWrap, {
                    title: model.name,
                    meta: stats.sizeText,
                    text: model.description || '',
                    image: model.image || '',
                    icon: 'warning',
                    iconText: stats.vramText,
                    installed: false,
                    deleteLabel: 'Install',
                    downloadState,
                    progress,
                    speed,
                    downloadedBytes,
                    totalBytes,
                });

                if (downloadState !== 'idle') {
                    card.on('pause', () => downloadService.pause(model.id));
                    card.on('resume', () => downloadService.resume(model.id));
                    card.on('cancel', () => downloadService.cancel(model.id));
                } else {
                    card.on('delete', async () => { await _installModel(model); });
                }
            });
        }

        // ── Subscribe to state changes ───────────────────────────────────
        _unsubs.push(Events.on('state:changed', ({ key, value }) => {
            if (key === 's_installedModelIds' || key === 'downloadJobs') renderList();
        }));

        // ── Download event subscriptions ─────────────────────────────────
        _unsubs.push(Events.on('download:complete', async ({ modelId }) => {
            awaitReSync();
            renderList();
        }));

        _unsubs.push(Events.on('download:failed', ({ modelId, error }) => {
            Events.emit('ui:error', {
                title: 'Download failed',
                message: error || 'Download failed. Please try again.',
            });
            renderList();
        }));

        _unsubs.push(Events.on('download:cancelled', ({ modelId }) => {
            renderList();
        }));

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
        };
    },
});
