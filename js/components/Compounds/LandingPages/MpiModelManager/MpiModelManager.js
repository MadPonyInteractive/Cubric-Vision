import { ComponentFactory } from '../../../factory.js';
import { MpiInstalledDisplay } from '../../MpiInstalledDisplay/MpiInstalledDisplay.js';
import { MpiOkCancel } from '../../MpiOkCancel/MpiOkCancel.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../../events.js';
import { state } from '../../../../state.js';
import { MODELS, reSyncInstalledModels, getModelDepStatus } from '../../../../data/modelRegistry.js';
import { DEPS } from '../../../../data/modelConstants/dependencies.js';
import { downloadService } from '../../../../services/downloadService.js';
import { qs, qsa, ce, on } from '../../../../utils/dom.js';
import { formatBytes } from '../../../../utils/formatBytes.js';

/**
 * MpiModelManager — Model-manager content for the MpiSlideOver panel.
 *
 * Renders installed + available models as MpiInstalledDisplay cards and owns
 * all model-list logic: refresh, install, pause/resume/cancel, uninstall
 * confirmation, partial-progress, and download:* event subscriptions. Patches
 * single cards in-place on download:progress.
 *
 * No overlay chrome — drops into the MpiSlideOver body. MpiSlideOver calls
 * el.onOpen() each time the panel opens so installed state is re-synced.
 *
 * Usage (via slide-over event):
 *   Events.emit('slide-over:open', { title: 'Models', component: MpiModelManager });
 */
export const MpiModelManager = ComponentFactory.create({
    name: 'MpiModelManager',
    css: ['js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.css'],

    template: () => `
        <div class="mpi-model-manager">
            <div class="mpi-model-manager__toolbar">
                <p class="mpi-model-manager__text">Select a model pack to install. Required files will be fetched automatically.</p>
                <div class="mpi-model-manager__refresh-btn" id="refresh-btn-slot"></div>
            </div>
            <div class="mpi-model-manager__separator"></div>
            <div class="mpi-model-manager__slot" id="body-slot"></div>
        </div>`,

    setup: (el) => {
        const bodySlot = qs('#body-slot', el);
        const refreshSlot = qs('.mpi-model-manager__refresh-btn', el);

        const _unsubs = [];

        // Per-modelId card instance tracking so downloadProgress events can update a
        // single card in-place instead of re-rendering the whole list (see
        // .claude/rules/downloads.md rule 4 — subscribe to download:* via Events, do
        // not poll state.downloadJobs).
        //   Map<modelId, { wrapper: HTMLElement, display: MpiInstalledDisplayInstance }>
        const _cardInstances = new Map();

        // Track callbacks for pause/resume/cancel so we can remove stale listeners
        // when setDownloadState('downloading') rebuilds buttons (Bug 3 fix).
        //   Map<modelId, { pause: Function, resume: Function, cancel: Function }>
        const _cardHandlers = new Map();

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

        // ── Uninstall confirm dialog (shared across all cards) ────────────
        let _pendingUninstall = null; // { modelId, deps, name }
        const _uninstallDialog = MpiOkCancel.mount(document.createElement('div'), {
            title:       'Uninstall model',
            text:        'Delete this model?\n• Files shared with other installed models will be kept.',
            okLabel:     'Uninstall',
            cancelLabel: 'Cancel',
            checkbox:    { label: 'Also delete model files from disk', checked: true },
        });
        _uninstallDialog.on('ok', async ({ checkboxChecked }) => {
            const pending = _pendingUninstall;
            _pendingUninstall = null;
            if (!pending) return;
            await downloadService.uninstall(pending.modelId, pending.deps, checkboxChecked);
            await reSyncInstalledModels();
        });
        _uninstallDialog.on('cancel', () => { _pendingUninstall = null; });

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
                sizeText: totalBytes > 0 ? formatBytes(totalBytes) : '',
                vramText: maxVram > 0 ? `${maxVram}GB VRAM` : '',
            };
        }

        function _parseSizeToBytes(sizeStr) {
            if (!sizeStr) return 0;
            const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
            if (!match) return 0;
            return parseFloat(match[1]) * { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[match[2].toUpperCase()] || 0;
        }

        // Destroy all existing card instances and clear tracking Map. Called before
        // each full renderList() to avoid leaking child subscriptions.
        function _destroyAllCards() {
            for (const { display } of _cardInstances.values()) {
                display?.el?.destroy?.();
            }
            _cardInstances.clear();
        }

        // ── Render card list ───────────────────────────────────────────────
        function renderList() {
            _destroyAllCards();
            qsa('.mpi-model-manager__card', bodySlot).forEach(c => c.remove());
            qsa('.mpi-model-manager__section-header', bodySlot).forEach(h => h.remove());
            qsa('.mpi-model-manager__empty', bodySlot).forEach(e => e.remove());

            const installed = MODELS.filter(m => m.installed === true);
            const uninstalled = MODELS.filter(m => m.installed !== true);

            // Installed section
            if (installed.length > 0) {
                const header = ce('div', { className: 'mpi-model-manager__section-header' },
                    [document.createTextNode('Installed Models')]);
                bodySlot.appendChild(header);

                installed.forEach(model => {
                    const stats = _computeModelStats(model);
                    const cardWrap = ce('div', { className: 'mpi-model-manager__card' });
                    bodySlot.appendChild(cardWrap);

                    const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);
                    const downloadState = downloadJob ? downloadJob.status : 'idle';
                    const progress = downloadJob ? downloadJob.progress : 0;
                    const speed = downloadJob ? downloadJob.speed : '';
                    const downloadedBytes = downloadJob ? downloadJob.downloadedBytes : 0;
                    const totalBytes = downloadJob ? downloadJob.totalBytes : 0;

                    // Partial progress for installed model with missing deps (no active download)
                    let partialProgress = 0;
                    let partialDownloadedBytes = 0;
                    let partialTotalBytes = 0;
                    let hasPartialProgress = false;
                    if (downloadState === 'idle') {
                        const depStatus = getModelDepStatus(model.id);
                        if (depStatus) {
                            const deps = model.dependencies.map(id => DEPS[id]).filter(Boolean);
                            let installedDeps = 0;
                            for (const dep of deps) {
                                const depState = depStatus.get(dep.id);
                                const depInstalled = depState === true || depState?.installed === true;
                                if (depInstalled) {
                                    partialDownloadedBytes += _parseSizeToBytes(dep.size);
                                    installedDeps += 1;
                                } else if (depState?.partialBytes) {
                                    partialDownloadedBytes += depState.partialBytes;
                                }
                                partialTotalBytes += _parseSizeToBytes(dep.size);
                            }
                            // MPI-95 — a model is partial when ANY dep is missing, not only
                            // when bytes are short. A missing SMALL dep (e.g. the 144KB
                            // ComfyUI-PainterI2Vadvanced per-model node) leaves
                            // downloaded/total at ~0.99999 of 36.5GB, which rounded to a
                            // FULL bar while the badge said PARTIALLY INSTALLED — a
                            // contradiction the user hit. Drive "partial" off dep COUNT,
                            // and clamp the bar below 100% so a missing component is always
                            // visible regardless of its byte size.
                            const allDepsInstalled = installedDeps === deps.length;
                            if (partialTotalBytes > 0 && !allDepsInstalled) {
                                hasPartialProgress = true;
                                partialProgress = Math.min(
                                    partialTotalBytes > 0 ? partialDownloadedBytes / partialTotalBytes : 0,
                                    0.99,
                                );
                            }
                        }
                    }

                    const deps = model.dependencies.map(id => DEPS[id]).filter(Boolean);
                    // For installed model with partial: show progress bar + Resume/Cancel
                    // For fully installed model (no active download, no partial): Uninstall button
                    const displayDownloadState = hasPartialProgress ? 'partial' : downloadState;
                    const displayProgress = hasPartialProgress ? partialProgress : progress;
                    const displayDownloadedBytes = hasPartialProgress ? partialDownloadedBytes : downloadedBytes;
                    const displayTotalBytes = hasPartialProgress ? partialTotalBytes : totalBytes;

                    const card = MpiInstalledDisplay.mount(cardWrap, {
                        title: model.name,
                        meta: stats.sizeText,
                        text: model.description || '',
                        image: model.image || '',
                        video: model.video || '',
                        mediaRatio: model.mediaRatio || '',
                        icon: 'info',
                        iconText: stats.vramText,
                        installed: true,
                        canUninstall: true,
                        downloadState: displayDownloadState,
                        progress: displayProgress,
                        hasPartialProgress,
                        speed,
                        downloadedBytes: displayDownloadedBytes,
                        totalBytes: displayTotalBytes,
                        indeterminate: downloadJob ? !!downloadJob.indeterminate : false,
                        phase: downloadJob ? (downloadJob.phase || 'preparing') : 'preparing',
                    });

                    // Wire pause/resume/cancel only while a download is genuinely
                    // ACTIVE. A lingering 'complete' job (download:complete sets the
                    // status but never clears the job from state.downloadJobs) is
                    // terminal — the model is installed — so it must take the
                    // uninstall branch. Without this, an install-then-uninstall left
                    // the INSTALLED card with pause/cancel handlers and NO uninstall
                    // handler, so the Uninstall click emitted but nothing called
                    // _uninstallDialog.el.show() (the dialog never opened). (MPI-99)
                    const isActiveDownload = downloadState === 'downloading'
                        || downloadState === 'paused'
                        || downloadState === 'installing';
                    if (isActiveDownload) {
                        const pauseCb = () => downloadService.pause(model.id);
                        const resumeCb = () => downloadService.resume(model.id);
                        const cancelCb = () => downloadService.cancel(model.id);
                        card.on('pause', pauseCb);
                        card.on('resume', resumeCb);
                        card.on('cancel', cancelCb);
                        _cardHandlers.set(model.id, { pause: pauseCb, resume: resumeCb, cancel: cancelCb });
                    } else {
                        card.on('uninstall', () => {
                            _pendingUninstall = { modelId: model.id, deps, name: model.name };
                            _uninstallDialog.el.show();
                        });
                    }

                    _cardInstances.set(model.id, { wrapper: cardWrap, display: card });
                });
            }

            // Available section
            if (uninstalled.length === 0 && installed.length > 0) {
                const emptyEl = ce('div', { className: 'mpi-model-manager__empty' },
                    [ce('span', { textContent: 'No models available to install' })]);
                bodySlot.appendChild(emptyEl);
                return;
            }

            if (uninstalled.length === 0 && installed.length === 0) {
                const emptyEl = ce('div', { className: 'mpi-model-manager__empty' },
                    [ce('span', { textContent: 'No models available' })]);
                bodySlot.appendChild(emptyEl);
                return;
            }

            uninstalled.forEach(model => {
                const stats = _computeModelStats(model);
                const cardWrap = ce('div', { className: 'mpi-model-manager__card' });
                bodySlot.appendChild(cardWrap);

                const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);
                const downloadState = downloadJob ? downloadJob.status : 'idle';
                const progress = downloadJob ? downloadJob.progress : 0;
                const speed = downloadJob ? downloadJob.speed : '';
                const downloadedBytes = downloadJob ? downloadJob.downloadedBytes : 0;
                const totalBytes = downloadJob ? downloadJob.totalBytes : 0;

                // Partial progress for uninstalled model with some deps already on disk
                let partialProgress = 0;
                let partialDownloadedBytes = 0;
                let partialTotalBytes = 0;
                let hasPartialProgress = false;
                if (downloadState === 'idle') {
                    const depStatus = getModelDepStatus(model.id);
                    if (depStatus) {
                        const deps = model.dependencies.map(id => DEPS[id]).filter(Boolean);
                        let installedDeps = 0;
                        for (const dep of deps) {
                            const depState = depStatus.get(dep.id);
                            const depInstalled = depState === true || depState?.installed === true;
                            if (depInstalled) {
                                partialDownloadedBytes += _parseSizeToBytes(dep.size);
                                installedDeps += 1;
                            } else if (depState?.partialBytes) {
                                partialDownloadedBytes += depState.partialBytes;
                            }
                            partialTotalBytes += _parseSizeToBytes(dep.size);
                        }
                        // MPI-95 — partial is driven by dep COUNT, not bytes alone, and the
                        // bar is clamped below 100% so a missing SMALL dep (e.g. the 144KB
                        // ComfyUI-PainterI2Vadvanced node) can't render a FULL bar while the
                        // badge reads PARTIALLY INSTALLED. See the matching block above.
                        const allDepsInstalled = installedDeps === deps.length;
                        if (partialTotalBytes > 0 && !allDepsInstalled) {
                            hasPartialProgress = true;
                            partialProgress = Math.min(
                                partialTotalBytes > 0 ? partialDownloadedBytes / partialTotalBytes : 0,
                                0.99,
                            );
                        }
                    }
                }

                // Keep downloadState='idle' so Install button shows (not Resume/Cancel)
                const displayProgress = hasPartialProgress ? partialProgress : progress;
                const displayDownloadedBytes = hasPartialProgress ? partialDownloadedBytes : downloadedBytes;
                const displayTotalBytes = hasPartialProgress ? partialTotalBytes : totalBytes;

                const card = MpiInstalledDisplay.mount(cardWrap, {
                    title: model.name,
                    meta: stats.sizeText,
                    text: model.description || '',
                    image: model.image || '',
                    video: model.video || '',
                    mediaRatio: model.mediaRatio || '',
                    icon: 'warning',
                    iconText: stats.vramText,
                    installed: false,
                    deleteLabel: 'Install',
                    downloadState,
                    progress: displayProgress,
                    hasPartialProgress,
                    speed,
                    downloadedBytes: displayDownloadedBytes,
                    totalBytes: displayTotalBytes,
                    indeterminate: downloadJob ? !!downloadJob.indeterminate : false,
                    phase: downloadJob ? (downloadJob.phase || 'preparing') : 'preparing',
                });

                if (downloadState !== 'idle') {
                    const pauseCb = () => downloadService.pause(model.id);
                    const resumeCb = () => downloadService.resume(model.id);
                    const cancelCb = () => downloadService.cancel(model.id);
                    card.on('pause', pauseCb);
                    card.on('resume', resumeCb);
                    card.on('cancel', cancelCb);
                    _cardHandlers.set(model.id, { pause: pauseCb, resume: resumeCb, cancel: cancelCb });
                } else {
                    card.on('delete', async () => { await _installModel(model); });
                }

                _cardInstances.set(model.id, { wrapper: cardWrap, display: card });
            });
        }

        // ── State subscriptions ──────────────────────────────────────────────
        // Only re-render the full list when install status changes. Progress updates
        // flow through the download:progress event below and patch single cards.
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 's_installedModelIds') renderList();
        }));

        // ── Download event subscriptions ─────────────────────────────────────
        // download:progress patches a single card in place — no full re-render.
        _unsubs.push(Events.on('download:progress', ({ modelId, progress, speed, downloadedBytes, totalBytes, indeterminate, phase }) => {
            const card = _cardInstances.get(modelId);
            if (!card) return;
            card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes, indeterminate, phase });
        }));

        _unsubs.push(Events.on('download:started', ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (!card) return;
            // setDownloadState('downloading') rebuilds buttons that emit pause/cancel.
            // Destroy the existing card and remove it so the re-render creates fresh listeners.
            // This avoids the broken card.display.listeners reference from Bug 3 fix attempt.
            if (card.display && card.display.el && typeof card.display.el.destroy === 'function') {
                try { card.display.el.destroy(); } catch (_) { /* ignore */ }
            }
            _cardInstances.delete(modelId);
            _cardHandlers.delete(modelId);
            // Re-render the card in its place so it shows downloading state with working buttons
            const cardWrap = card.wrapper;
            cardWrap.innerHTML = '';
            const downloadJob = state.downloadJobs.find(j => j.modelId === modelId);
            const progress = downloadJob ? downloadJob.progress : 0;
            const speed = downloadJob ? downloadJob.speed : '';
            const downloadedBytes = downloadJob ? downloadJob.downloadedBytes : 0;
            const totalBytes = downloadJob ? downloadJob.totalBytes : 0;
            const indeterminate = downloadJob ? !!downloadJob.indeterminate : false;
            const phase = downloadJob ? (downloadJob.phase || 'preparing') : 'preparing';

            const model = MODELS.find(m => m.id === modelId);
            if (model) {
                const stats = _computeModelStats(model);
                const newCard = MpiInstalledDisplay.mount(cardWrap, {
                    title: model.name,
                    meta: stats.sizeText,
                    text: model.description || '',
                    image: model.image || '',
                    video: model.video || '',
                    mediaRatio: model.mediaRatio || '',
                    icon: 'info',
                    iconText: stats.vramText,
                    installed: model.installed === true,
                    canUninstall: model.installed === true,
                    downloadState: 'downloading',
                    progress,
                    speed,
                    downloadedBytes,
                    totalBytes,
                    indeterminate,
                    phase,
                });
                const pauseCb = () => downloadService.pause(modelId);
                const resumeCb = () => downloadService.resume(modelId);
                const cancelCb = () => downloadService.cancel(modelId);
                newCard.on('pause', pauseCb);
                newCard.on('resume', resumeCb);
                newCard.on('cancel', cancelCb);
                _cardHandlers.set(modelId, { pause: pauseCb, resume: resumeCb, cancel: cancelCb });
                _cardInstances.set(modelId, { wrapper: cardWrap, display: newCard });
            }
        }));

        _unsubs.push(Events.on('download:paused', ({ modelId, progress, speed, downloadedBytes, totalBytes }) => {
            const card = _cardInstances.get(modelId);
            if (card) {
                card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes });
                card.display.el.setDownloadState('paused');
            }
        }));

        _unsubs.push(Events.on('download:resumed', ({ modelId, progress, speed, downloadedBytes, totalBytes }) => {
            const card = _cardInstances.get(modelId);
            if (card) {
                card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes });
                card.display.el.setDownloadState('downloading');
            }
        }));

        _unsubs.push(Events.on('download:installing', ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('installing');
        }));

        _unsubs.push(Events.on('download:cancelled', ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('cancelled');
            // Rebuild card so its handlers wire to `delete` (Install) again — the
            // pause/resume/cancel handlers attached during downloading are dead now.
            awaitReSync();
        }));

        _unsubs.push(Events.on('download:complete', async ({ modelId }) => {
            // Immediately show 'complete' state before async re-sync (Bug 4 fix)
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('complete');
            // awaitReSync() calls renderList() after the sync resolves — a second
            // synchronous renderList() here would render stale MODELS[].installed
            // data (race condition seen in pre-refactor code).
            awaitReSync();
        }));

        _unsubs.push(Events.on('download:uninstalled', ({ modelId, removed = [], keptUniversal = [], keptShared = [], keptModelFiles = [], keptPipInstalls = [] }) => {
            const modelName = MODELS.find(m => m.id === modelId)?.name || modelId;
            const keptTotal = keptUniversal.length + keptShared.length + keptModelFiles.length + keptPipInstalls.length;
            if (removed.length > 0 && keptTotal === 0) {
                Events.emit('ui:success', { title: 'Uninstalled', message: `${modelName} uninstalled.` });
            } else if (removed.length > 0) {
                Events.emit('ui:info', { title: 'Uninstalled', message: `${modelName} uninstalled (some shared files kept).` });
            } else if (keptModelFiles.length > 0) {
                // Nothing removed because the user kept files on disk: the model's
                // own weight stays for a fast re-install, and its other deps are
                // engine-required (universal) or shared with another model. This is
                // the EXPECTED outcome of "uninstall without deleting files", NOT a
                // failure — so the model legitimately stays installed.
                Events.emit('ui:info', { title: 'Files kept', message: `${modelName} — model files kept on disk; still installed.` });
            } else {
                // Nothing removed and nothing the user chose to keep → every dep is
                // engine-required (universal) or shared with another installed model,
                // so there is nothing this model can remove on its own. Honest:
                // it can't be uninstalled while those dependencies are still needed.
                Events.emit('ui:info', { title: 'Nothing to remove', message: `${modelName} — all files are shared with other models or required by the engine.` });
            }
        }));

        _unsubs.push(Events.on('download:failed', () => {
            awaitReSync();
        }));

        // ── Open hook — MpiSlideOver calls this each time the panel opens ──────
        // Re-sync installed state from disk so the list reflects external changes.
        el.onOpen = () => { awaitReSync(); };

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _destroyAllCards();
            _uninstallDialog?.el?.destroy?.();
        };
    },
});
