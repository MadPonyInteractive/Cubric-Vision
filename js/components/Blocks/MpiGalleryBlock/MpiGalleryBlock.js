/**
 * MpiGalleryBlock — Block: project gallery workspace.
 *
 * Replaces gallery.js. Displays all ItemGroups as cards in an adaptive grid.
 * Mounts MpiPromptBox directly into #prompt-box-mount. Running a generation
 * creates a new ItemGroup.
 *
 * Props: (none — reads from state.currentProject)
 *
 * Does NOT emit (communicates via Events bus).
 */

import { ComponentFactory } from '../../factory.js';
import { MpiGalleryGrid } from '../../Compounds/MpiGalleryGrid/MpiGalleryGrid.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { MpiCompareOverlay } from '../../Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiQueuePanel } from '../../Compounds/MpiQueuePanel/MpiQueuePanel.js';
import { MpiReusePromptDialog } from '../../Compounds/MpiReusePromptDialog/MpiReusePromptDialog.js';
import { MpiPromptBox } from '../../Organisms/MpiPromptBox/MpiPromptBox.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { ce, qs, gid } from '../../../utils/dom.js';
import { navigate, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../../../router.js';
import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
import { resolveActiveModel, setSelectedModelId, getSelectedModelId } from '../../../utils/modelHelpers.js';
import { truncateCardName } from '../../../utils/displayHelpers.js';
import { MODELS, getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
import { refreshRadial } from '../../../shell/navigation.js';
import { startGeneration, enqueueGeneration, clearPendingQueue, refreshQueueDepth, removeCueJob, peekCueQueue } from '../../../services/generationService.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { addGroup, updateGroup, removeGroup, persistGroups, validatePreviewAssets, applyPromptReuseSettings } from '../../../services/projectService.js';
import { trackConcatJob } from '../../../services/concatProgress.js';
import { buildPromptReuseSettings, resolvePromptReuseMediaItems } from '../../../utils/promptReuse.js';
import {
    createImageItem,
    createVideoItem,
    createItemGroup,
    appendToHistory,
    getSelectedItem,
    removeHistoryEntry,
} from '../../../data/projectModel.js';

export const MpiGalleryBlock = ComponentFactory.create({
    name: 'MpiGalleryBlock',
    css: ['js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.css'],

    template: () => `
        <div class="mpi-gallery-block">
            <div class="mpi-gallery-block__header">
                <div class="mpi-gallery-block__crumb"></div>
                <div class="mpi-gallery-block__filters"></div>
                <div class="mpi-gallery-block__sort"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Cleanup array ─────────────────────────────────────────────────────
        const _unsubs = [];

        // ── Header crumb ──────────────────────────────────────────────────────
        const crumbEl = qs('.mpi-gallery-block__crumb', el);
        if (crumbEl) crumbEl.textContent = state.currentProject?.name || '';

        let groups = state.currentProject?.itemGroups || [];

        const _queuePanelPayload = {
            title: 'Cue',
            component: MpiQueuePanel,
            extraClasses: 'mpi-slide-over--queue',
            panelId: 'generation-queue',
        };
        const _toggleQueuePanel = () => {
            Events.emit('slide-over:toggle', _queuePanelPayload);
        };
        const _openQueuePanel = () => {
            Events.emit('slide-over:open', _queuePanelPayload);
        };
        _unsubs.push(Hotkeys.bind('gallery.queue.toggle', _toggleQueuePanel));
        _unsubs.push(Events.on('generation-queue:open', _openQueuePanel));

        // ── Rehydrate any in-flight gallery generations ───────────────────────
        const _myGenIds = new Set();
        const _runningGallery = activeGenerations.listFor('gallery', null).filter(e => e.status === 'running');
        // Only the first-running entry gets a visible placeholder. Queued
        // siblings are tracked in activeGenerations but stay invisible until
        // their turn comes up.
        const _placeholderGroups = _runningGallery.length
            ? [
                _runningGallery[0].placeholderGroup,
                ...(_runningGallery[0].extraPlaceholders || []),
              ].filter(Boolean)
            : [];

        const grid   = MpiGalleryGrid.mount(el, { groups: [..._placeholderGroups, ...groups] });
        const _deletingGroupIds = new Set();
        const _visibleProjectGroups = () =>
            (state.currentProject?.itemGroups || []).filter(group => !_deletingGroupIds.has(group.id));

        for (const entry of _runningGallery) {
            _myGenIds.add(entry.id);
        }

        // ── OS-file drop overlay ───────────────────────────────────────────────
        const dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
            onDrop: async ({ files }) => {
                const project = state.currentProject;
                if (!project?.folderPath || !project?.id) {
                    clientLogger.warn('MpiGalleryBlock', 'No current project on drop');
                    return;
                }
                // Tag each file with whether it should also be injected into the
                // PromptBox, based on remaining slots for its mediaType under
                // the current operation. Files beyond capacity still get
                // imported as gallery cards but are not pushed into the slots.
                const remaining = {
                    image: _pb?.el?.remainingCapacity?.('image') ?? 0,
                    video: _pb?.el?.remainingCapacity?.('video') ?? 0,
                    audio: _pb?.el?.remainingCapacity?.('audio') ?? 0,
                };
                const plan = files.map(({ file, mediaType }) => {
                    const inject = remaining[mediaType] > 0;
                    if (inject) remaining[mediaType]--;
                    return { file, mediaType, inject };
                });

                // Sequential — server queues per-project.json writes; parallel
                // would still serialise but order would be non-deterministic.
                for (const { file, mediaType, inject } of plan) {
                    const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
                    if (!uploaded) continue;
                    Events.emit('media:imported', {
                        url: uploaded.filePath,
                        filename: uploaded.filename,
                        itemId: uploaded.itemId,
                        thumbPath: uploaded.thumbPath,
                        pixelDimensions: uploaded.pixelDimensions,
                        mediaType,
                    });
                    if (inject) {
                        _pb?.el?.injectMedia?.({ url: uploaded.filePath, mediaType });
                    }
                }
            },
        });
        el.appendChild(dropOverlay.el);

        let _dragCounter = 0;
        const _isFileDrag = (e) =>
            e.dataTransfer?.types?.includes('Files') &&
            !e.dataTransfer.types.includes('application/mpi-media');

        const _onDragEnter = (e) => {
            if (!_isFileDrag(e)) return;
            if (!state.currentProject) return;
            _dragCounter++;
            dropOverlay.el.show();
        };
        const _onDragLeave = (e) => {
            if (!_isFileDrag(e)) return;
            if (_dragCounter > 0 && --_dragCounter === 0) dropOverlay.el.hide();
        };
        const _onDrop = () => {
            _dragCounter = 0;
            dropOverlay.el.hide();
        };
        const _onDragOver = (e) => { if (_isFileDrag(e)) e.preventDefault(); };

        window.addEventListener('dragenter', _onDragEnter);
        window.addEventListener('dragleave', _onDragLeave);
        window.addEventListener('dragover',  _onDragOver);
        window.addEventListener('drop',      _onDrop);

        // ── Navigate to group history ───────────────────────────────────────────
        grid.on('open-group', ({ group }) => navigate(PAGE_GROUP_HISTORY, { groupId: group.id }));

        // ── Compare ─────────────────────────────────────────────────────────────
        const _compareOverlay = MpiCompareOverlay.mount(document.createElement('div'));
        grid.on('compare', ({ groups: g }) => {
            const itemA = getSelectedItem(g[0]);
            const itemB = getSelectedItem(g[1]);
            if (!itemA || !itemB) return;
            _compareOverlay.el.open(itemA, itemB);
        });

        // ── Combine ─────────────────────────────────────────────────────────────
        // Gallery context-menu Combine on multi-selected video groups. groups[]
        // arrives in chronological click order (preserved by grid Set iteration).
        // Maps to each group's selected history item id, then concatenates.
        grid.on('combine', async ({ groups: g }) => {
            const project = state.currentProject;
            if (!project?.folderPath) return;
            if (!Array.isArray(g) || g.length < 2) return;
            if (!g.every(grp => grp?.type === 'video')) return;
            const itemIds = g
                .map(grp => getSelectedItem(grp)?.id)
                .filter(Boolean);
            if (itemIds.length < 2) return;
            const jobId = `combine-${Date.now()}`;
            try {
                const concatPromise = trackConcatJob({
                    jobId,
                    label: `Combining ${itemIds.length} videos`,
                });
                const resp = await fetch('/combine-videos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId, folderPath: project.folderPath, itemIds }),
                });
                const data = await resp.json();
                if (!resp.ok || !data?.success || !data?.item) {
                    throw new Error(data?.error || 'combine-videos failed');
                }
                try { await concatPromise; } catch (_) {}
                const ext = data.item;
                const newItem = createVideoItem({
                    id:              ext.id,
                    filePath:        ext.filePath,
                    operation:       ext.operation || 'combine',
                    displayName:     truncateCardName(ext.displayName || 'combine'),
                    modelId:         null,
                    pixelDimensions: ext.pixelDimensions || { w: 0, h: 0 },
                    thumbPath:       ext.thumbPath ?? null,
                    fps:             ext.fps ?? 0,
                    duration:        ext.duration ?? 0,
                    frameCount:      ext.frameCount ?? 0,
                    hasAudio:        ext.hasAudio ?? false,
                    videoMeta:       ext.videoMeta ?? null,
                });
                const newGroup = createItemGroup('video', {
                    name: newItem.displayName,
                    width: newItem.pixelDimensions?.w || 0,
                    height: newItem.pixelDimensions?.h || 0,
                });
                const populated = appendToHistory(newGroup, newItem);
                const currentGroups = state.currentProject?.itemGroups || [];
                await addGroup(populated);
                // Mirror the add-to-gallery pattern at line ~1003: render the
                // new group at the head of the grid immediately so the user
                // sees the combined entry without leaving + re-entering the
                // gallery. Keyed reuse in MpiGalleryGrid preserves DOM/state
                // for existing cards, so this is safe.
                grid.el.setGroups([populated, ...currentGroups]);
            } catch (err) {
                clientLogger.error('MpiGalleryBlock', 'combine failed', err);
                const _short = String(err.message || 'unknown').split('\n')[0].slice(0, 160);
                Events.emit('ui:error', { title: 'Combine failed', message: _short });
            }
        });

        // ── Persist helper ──────────────────────────────────────────────────────
        // (removed — now in ProjectService)

        // ── GC ──────────────────────────────────────────────────────────────────
        grid.on('gc-group', ({ group }) => {
            updateGroup(group);
        });
        grid.on('gc-remove', ({ groupId }) => {
            removeGroup(groupId);
        });
        grid.on('favourite', ({ group }) => {
            updateGroup(group);
        });

        // ── Reuse prompt ────────────────────────────────────────────────────────
        grid.on('reuse', (payload) => {
            _handlePromptReuse(payload);
        });

        // Preview-stage cards are deleted through the normal multi-select
        // Delete flow (shift-select + Delete or context menu). The backend
        // DELETE /project-media/:id/:filename?itemId=... route reads the
        // sidecar before unlinking and, when stage === 'preview', also drops
        // the saved stage-1 latent under .latents/<itemId>.latent plus any
        // .preview-assets/<itemId>/ snapshot folder. No dedicated Discard
        // button is needed on preview cards.

        // PromptBox reference. Hoisted because _refreshPbGenerating closes over
        // it and runs during setup (rehydrate path) before _pb is mounted.
        let _pb = null;

        // Finish path (preview → final replace): _queuedContinueGroupIds /
        // _continuingGroupIds drive the "Queued…" / "Generating final…" overlays
        // and force the card into a busy state.
        const _continuingGroupIds = new Set();
        const _queuedContinueGroupIds = new Map(); // groupId → itemId

        // Branching Continue path (preview stays, stage-2 lands as new card):
        // per-group pending+running count → drives the small `xN` badge.
        // Multiple clicks bump the count; no whole-card overlay.
        const _stage2BranchCounts = new Map(); // groupId → number

        // Derived from cue queue (pending stage2 branches) + activeGenerations
        // (running stage2 branches). Recomputed on enqueue + lifecycle events
        // so block-instance state is always rebuildable from module-scoped
        // sources after workspace nav.
        const _recomputeStage2Counts = () => {
            const next = new Map();
            for (const job of peekCueQueue()) {
                if (job.opts?.scope !== 'gallery') continue;
                if (job.config?.replaceItemId) continue; // Finish/Queued, not branching
                const srcGid = job.opts?.sourceGroupId;
                if (srcGid) next.set(srcGid, (next.get(srcGid) || 0) + 1);
            }
            for (const entry of activeGenerations.listFor('gallery', null)) {
                if (entry.status !== 'running') continue;
                if (entry.replaceItemId) continue;
                const srcGid = entry.sourceGroupId;
                if (srcGid) next.set(srcGid, (next.get(srcGid) || 0) + 1);
            }
            const touched = new Set([..._stage2BranchCounts.keys(), ...next.keys()]);
            _stage2BranchCounts.clear();
            for (const [gid, n] of next) _stage2BranchCounts.set(gid, n);
            for (const gid of touched) {
                grid.el.setStage2Count(gid, _stage2BranchCounts.get(gid) || 0);
            }
            _refreshPbGenerating();
        };

        const _refreshPbGenerating = () => {
            let stage2Total = 0;
            _stage2BranchCounts.forEach(v => { stage2Total += v; });
            const galleryRunning = activeGenerations.listFor('gallery', null)
                .some(e => e.status === 'running');
            const busy = _continuingGroupIds.size > 0
                || _queuedContinueGroupIds.size > 0
                || stage2Total > 0
                || galleryRunning;
            _pb?.el?.setGenerating?.(busy);
        };

        // ── Preview support-asset validation ─────────────────────────────────
        // Per-group cached validation result, used to gate Continue/Finish and
        // drive the card warning badge (Cold fallback / Missing assets).
        // groupId → { canFastPath, canColdFallback, blocked, missing, latent, snapshots }
        const _previewValidation = new Map();

        const _applyValidationToCard = (groupId, report) => {
            if (!report) {
                grid.el.setPreviewAssetsWarning?.(groupId, null);
                return;
            }
            if (report.canFastPath) {
                grid.el.setPreviewAssetsWarning?.(groupId, null);
            } else if (report.canColdFallback) {
                grid.el.setPreviewAssetsWarning?.(groupId, { mode: 'fallback', missing: report.missing });
            } else if (report.blocked) {
                grid.el.setPreviewAssetsWarning?.(groupId, { mode: 'blocked', missing: report.missing });
            } else {
                grid.el.setPreviewAssetsWarning?.(groupId, null);
            }
        };

        const _validatePreviewForGroup = async (group) => {
            const item = group?.history?.[group.selectedIndex];
            if (!item || item.stage !== 'preview') {
                _previewValidation.delete(group.id);
                grid.el.setPreviewAssetsWarning?.(group.id, null);
                return null;
            }
            try {
                const report = await validatePreviewAssets(item.id);
                if (!report || report.success === false) return null;
                _previewValidation.set(group.id, report);
                _applyValidationToCard(group.id, report);
                return report;
            } catch (err) {
                clientLogger.warn('MpiGalleryBlock', 'validatePreviewAssets failed', err);
                return null;
            }
        };

        const _validateAllPreviews = () => {
            const groups = state.currentProject?.itemGroups || [];
            for (const g of groups) {
                const item = g.history?.[g.selectedIndex];
                if (item?.stage === 'preview') {
                    _validatePreviewForGroup(g).catch(() => {});
                }
            }
        };

        grid.on('preview:continue', async ({ group: g, item }) => {
            if (!item?.frozenParams) {
                clientLogger.warn('MpiGalleryBlock', 'preview:continue without frozenParams', item);
                return;
            }
            // Loop-armed jobs auto-refire from live PB state and would loop the
            // Continue indefinitely. Block until user disarms loop.
            if (state.loopArmed) {
                StatusBar.notify('Disarm Loop before continuing a preview.', 'warning');
                return;
            }
            const model = MODELS.find(m => m.id === item.modelId);
            if (!model) {
                StatusBar.notify(`Model "${item.modelId}" that created this preview is unknown — cannot continue.`, 'warning');
                return;
            }
            if (model.installed === false) {
                const name = model.label || model.name || model.id;
                StatusBar.notify(`Model "${name}" that created this preview is not installed — install it to continue.`, 'warning');
                return;
            }

            // Re-validate at click time (TOCTOU: render-time badge may be
            // stale if the user moved/deleted the latent in another window).
            const report = await _validatePreviewForGroup(g);
            if (!report) {
                StatusBar.notify('Preview validation failed — cannot continue.', 'warning');
                return;
            }
            if (report.blocked) {
                StatusBar.notify('Preview support assets missing — cannot continue. Delete the preview and rerun.', 'warning');
                return;
            }

            // Block Continue (branching) while Finish is in flight on this card.
            // Finish replaces the preview; queuing branch jobs against a
            // disappearing preview would leak.
            if (_continuingGroupIds.has(g.id) || _queuedContinueGroupIds.has(g.id)) {
                StatusBar.notify('Finish is in progress for this preview.', 'warning');
                return;
            }

            const latentInfo = item.previewAssets?.latent;
            const isColdFallback = !report.canFastPath && report.canColdFallback;

            // Sync PB to the preview's model + op so the user sees Cue progress
            // for the multi-stage workflow that originally produced the preview.
            // Skip the switch when already aligned to avoid clobbering state.
            const modelMismatch = activeModelId !== model.id;
            const opMismatch    = activeOperation !== item.operation;
            if (modelMismatch || opMismatch) {
                if (modelMismatch) {
                    activeModel   = model;
                    activeModelId = model.id;
                    setSelectedModelId(model.mediaType, model.id);
                    _pb?.el?.setModel?.(model);
                    refreshRadial({ imageCount, videoCount, modelId: model.id });
                }
                if (item.operation) {
                    activeOperation = item.operation;
                    _pb?.el?.setOperation?.(item.operation);
                }
                const name = model.label || model.name || model.id;
                StatusBar.notify(`Switched to "${name}" — continuing preview.`, 'info');
            }

            const frozen = item.frozenParams || {};
            const dims = frozen.dims || {};
            // Full frozen injection map (every PromptBox control snapshotted at
            // preview time). W/H/Seed overlaid explicitly since they live on
            // frozenParams top-level, not inside the injection map.
            const injectionParams = { ...(frozen.injectionParams || {}) };
            if (dims.w) injectionParams.Width  = dims.w;
            if (dims.h) injectionParams.Height = dims.h;
            if (frozen.seed != null) injectionParams.Seed = frozen.seed;

            // Build a placeholder + dispatcher for the stage-2 branch job.
            // Used either directly (fast path) or as a follow-up after the
            // stage-1 rerun completes (cold fallback).
            const _bumpAndDispatchStage2 = (latentName, latentFilePath) => {
                const _tempId = crypto.randomUUID();
                const _previewThumbUrl = item.thumbPath
                    ? resolveMediaUrl(item.thumbPath)
                    : (item.filePath ? resolveMediaUrl(item.filePath) : '');
                const _placeholderGroup = {
                    id: _tempId,
                    type: model.mediaType || 'video',
                    name: 'Generating...',
                    history: _previewThumbUrl ? [{
                        id: `${_tempId}-input-preview`,
                        type: 'image',
                        filePath: _previewThumbUrl,
                        name: 'Generating...',
                        displayName: 'Generating...',
                        operation: item.operation,
                        inputPreview: true,
                        pixelDimensions: { w: 0, h: 0 },
                    }] : [],
                    selectedIndex: 0,
                    width:  injectionParams.Width  || item.pixelDimensions?.w || 1024,
                    height: injectionParams.Height || item.pixelDimensions?.h || 1024,
                    isGenerating: true,
                };

                const stage2Config = {
                    operation:        item.operation,
                    model,
                    positive:         frozen.prompt   || '',
                    negative:         frozen.negative || '',
                    mediaItems:       Array.isArray(frozen.mediaItems) ? frozen.mediaItems : [],
                    injectionParams,
                    previewOnly:      false,
                    // Branching Continue: NO replaceItemId. Final lands as a new
                    // gallery card; preview card stays for further branches.
                    isStage2:              true,
                    loadLatentName:        latentName,
                    previewLatentFilePath: latentFilePath,
                };
                enqueueGeneration(stage2Config, {}, {
                    scope: 'gallery',
                    tempId: _tempId,
                    placeholderGroup: _placeholderGroup,
                    sourceGroupId: g.id,
                });
                _recomputeStage2Counts();
            };

            if (!isColdFallback) {
                // Fast path: latent is on disk, jump straight to stage-2.
                _bumpAndDispatchStage2(latentInfo.engineInputName, latentInfo.filePath);
                return;
            }

            // Cold fallback: rerun stage-1 from frozenParams + snapshots to
            // rebuild the project latent in place (replaceItemId = preview id),
            // then auto-enqueue the stage-2 branch when stage-1 completes.
            StatusBar.notify('Preview latent missing — running stage 1 from saved snapshots, then stage 2.', 'info');

            const stage1Config = {
                operation:        item.operation,
                model,
                positive:         frozen.prompt   || '',
                negative:         frozen.negative || '',
                mediaItems:       Array.isArray(frozen.mediaItems) ? frozen.mediaItems : [],
                injectionParams,
                previewOnly:      true,
                // Rebuild the preview latent under the preview's own itemId.
                replaceItemId:    item.id,
            };

            // We need the resulting latent metadata to fire stage-2. Subscribe
            // once to gallery:item-updated for this group, then unsubscribe.
            let _chainSettled = false;
            const _settle = () => { _chainSettled = true; };
            const _chainUnsub = Events.on('gallery:item-updated', ({ groupId, group: updatedGroup }) => {
                if (groupId !== g.id || _chainSettled) return;
                const refreshedItem = updatedGroup?.history?.find(h => h.id === item.id);
                const newLatent = refreshedItem?.previewAssets?.latent;
                if (!newLatent || newLatent.status !== 'available' || !newLatent.engineInputName || !newLatent.filePath) {
                    StatusBar.notify('Stage 1 rerun finished but latent was not produced.', 'warning');
                    _settle();
                    _chainUnsub();
                    return;
                }
                _settle();
                _chainUnsub();
                _bumpAndDispatchStage2(newLatent.engineInputName, newLatent.filePath);
            });

            enqueueGeneration(stage1Config, {
                onCancel: () => { if (!_chainSettled) { _settle(); _chainUnsub(); } },
                onError:  () => { if (!_chainSettled) { _settle(); _chainUnsub(); } },
                onComplete: () => { /* gallery:item-updated drives the chain */ },
            }, { scope: 'gallery' });
        });

        // ── Preview Finish (preview → final replace) ────────────────────────────
        grid.on('preview:finish', async ({ group: g, item }) => {
            if (!item?.frozenParams) {
                clientLogger.warn('MpiGalleryBlock', 'preview:finish without frozenParams', item);
                return;
            }
            if (state.loopArmed) {
                StatusBar.notify('Disarm Loop before finishing a preview.', 'warning');
                return;
            }
            const model = MODELS.find(m => m.id === item.modelId);
            if (!model) {
                StatusBar.notify(`Model "${item.modelId}" that created this preview is unknown — cannot finish.`, 'warning');
                return;
            }
            if (model.installed === false) {
                const name = model.label || model.name || model.id;
                StatusBar.notify(`Model "${name}" that created this preview is not installed — install it to finish.`, 'warning');
                return;
            }

            // Click-time re-validation (catches assets that vanished since
            // the badge was last computed).
            const report = await _validatePreviewForGroup(g);
            if (!report) {
                StatusBar.notify('Preview validation failed — cannot finish.', 'warning');
                return;
            }
            if (report.blocked) {
                StatusBar.notify('Preview support assets missing — cannot finish. Delete the preview and rerun.', 'warning');
                return;
            }

            if (_continuingGroupIds.has(g.id) || _queuedContinueGroupIds.has(g.id)) return;
            if ((_stage2BranchCounts.get(g.id) || 0) > 0) {
                StatusBar.notify('Wait for pending stage-2 jobs to finish before replacing this preview.', 'warning');
                return;
            }

            const latentInfo = item.previewAssets?.latent;
            const isColdFallback = !report.canFastPath && report.canColdFallback;

            const modelMismatch = activeModelId !== model.id;
            const opMismatch    = activeOperation !== item.operation;
            if (modelMismatch || opMismatch) {
                if (modelMismatch) {
                    activeModel   = model;
                    activeModelId = model.id;
                    setSelectedModelId(model.mediaType, model.id);
                    _pb?.el?.setModel?.(model);
                    refreshRadial({ imageCount, videoCount, modelId: model.id });
                }
                if (item.operation) {
                    activeOperation = item.operation;
                    _pb?.el?.setOperation?.(item.operation);
                }
                const name = model.label || model.name || model.id;
                StatusBar.notify(`Switched to "${name}" — finishing preview.`, 'info');
            }

            const frozen = item.frozenParams || {};
            const dims = frozen.dims || {};
            const injectionParams = { ...(frozen.injectionParams || {}) };
            if (dims.w) injectionParams.Width  = dims.w;
            if (dims.h) injectionParams.Height = dims.h;
            if (frozen.seed != null) injectionParams.Seed = frozen.seed;

            // Finish config differs by path:
            // - Fast path: run stage-2 file (isStage2) against existing latent.
            // - Cold fallback: run the full _ms workflow with previewOnly=false
            //   (no preview gating, no isStage2 swap, no LoadLatent override) —
            //   stage-1+stage-2 fused. Both replace the preview via replaceItemId.
            const config = isColdFallback ? {
                operation:        item.operation,
                model,
                positive:         frozen.prompt   || '',
                negative:         frozen.negative || '',
                mediaItems:       Array.isArray(frozen.mediaItems) ? frozen.mediaItems : [],
                injectionParams,
                previewOnly:      false,
                replaceItemId:    item.id,
            } : {
                operation:        item.operation,
                model,
                positive:         frozen.prompt   || '',
                negative:         frozen.negative || '',
                mediaItems:       Array.isArray(frozen.mediaItems) ? frozen.mediaItems : [],
                injectionParams,
                previewOnly:      false,
                isStage2:              true,
                loadLatentName:        latentInfo.engineInputName,
                previewLatentFilePath: latentInfo.filePath,
                replaceItemId:    item.id,
            };

            if (isColdFallback) {
                StatusBar.notify('Preview latent missing — running full workflow to finish.', 'info');
            }

            _queuedContinueGroupIds.set(g.id, item.id);
            grid.el.markQueuedContinue(g.id, true);
            _refreshPbGenerating();

            const _clearContinuing = () => {
                _continuingGroupIds.delete(g.id);
                grid.el.markContinuing(g.id, false);
                _refreshPbGenerating();
            };
            const _clearQueued = () => {
                if (_queuedContinueGroupIds.has(g.id)) {
                    _queuedContinueGroupIds.delete(g.id);
                    grid.el.markQueuedContinue(g.id, false);
                }
                _refreshPbGenerating();
            };

            const callbacks = {
                onCancel:   () => { _clearQueued(); _clearContinuing(); },
                onError:    () => { _clearQueued(); _clearContinuing(); },
                onComplete: () => { /* cleared via gallery:item-updated below */ },
            };
            enqueueGeneration(config, callbacks, { scope: 'gallery' });
        });

        // Finish path: queued→running overlay swap. Branching Continue uses
        // the xN badge instead and never enters these overlays.
        _unsubs.push(Events.on('generation:started', ({ scope, replaceItemId }) => {
            if (scope !== 'gallery' || !replaceItemId) return;
            const groupId = _findGroupIdByItemId(replaceItemId);
            if (!groupId) return;
            _queuedContinueGroupIds.delete(groupId);
            grid.el.markQueuedContinue(groupId, false);
            _continuingGroupIds.add(groupId);
            grid.el.markContinuing(groupId, true);
            _refreshPbGenerating();
        }));

        // Pop button on a queued Finish card → remove its job from the cue queue.
        grid.on('preview:pop-continue', ({ group: g, item }) => {
            if (!_queuedContinueGroupIds.has(g.id)) return;
            removeCueJob(job => job.config?.replaceItemId === item.id);
        });

        _unsubs.push(Events.on('gallery:item-updated', ({ groupId, group: updatedGroup }) => {
            if (!updatedGroup) return;
            if (_deletingGroupIds.has(groupId)) return;
            grid.el.refreshGroup(updatedGroup);
            if (_continuingGroupIds.has(groupId)) {
                _continuingGroupIds.delete(groupId);
                grid.el.markContinuing(groupId, false);
                _refreshPbGenerating();
            }
            // A preview item may have been replaced (Finish) or its support
            // assets refreshed via cold fallback. Re-validate this group only.
            _validatePreviewForGroup(updatedGroup).catch(() => {});
        }));

        // Initial validation kick covering whatever preview cards already sit
        // in the gallery when this block mounts. Fire-and-forget; results
        // arrive via _validatePreviewForGroup → setPreviewAssetsWarning.
        _validateAllPreviews();

        // Rehydrate/reconcile "Queued…" + "Generating final…" overlays from
        // the module-scoped cue queue and active-generations registry. Block
        // instance Maps are reset on workspace nav; sources of truth survive.
        const _findGroupIdByItemId = (itemId) => {
            const groups = state.currentProject?.itemGroups || [];
            for (const grp of groups) {
                if (grp.history?.some(it => it.id === itemId)) return grp.id;
            }
            return null;
        };

        const _syncPreviewQueueState = () => {
            const nextQueued = new Map();
            for (const job of peekCueQueue()) {
                if (job.opts?.scope !== 'gallery') continue;
                const itemId = job.config?.replaceItemId;
                if (!itemId) continue;
                const gid = _findGroupIdByItemId(itemId);
                if (gid) nextQueued.set(gid, itemId);
            }

            const queuedTouched = new Set([..._queuedContinueGroupIds.keys(), ...nextQueued.keys()]);
            _queuedContinueGroupIds.clear();
            for (const [gid, itemId] of nextQueued) _queuedContinueGroupIds.set(gid, itemId);
            for (const gid of queuedTouched) {
                grid.el.markQueuedContinue(gid, _queuedContinueGroupIds.has(gid));
            }

            const nextContinuing = new Set();
            for (const entry of activeGenerations.listFor('gallery', null)) {
                if (entry.status !== 'running') continue;
                const itemId = entry.replaceItemId;
                if (!itemId) continue;
                const gid = _findGroupIdByItemId(itemId);
                if (gid) nextContinuing.add(gid);
            }

            const continuingTouched = new Set([..._continuingGroupIds, ...nextContinuing]);
            _continuingGroupIds.clear();
            for (const gid of nextContinuing) _continuingGroupIds.add(gid);
            for (const gid of continuingTouched) {
                grid.el.markContinuing(gid, _continuingGroupIds.has(gid));
            }

            _recomputeStage2Counts();
            _refreshPbGenerating();
        };

        _syncPreviewQueueState();

        // Preview queue state is derived; resync on queue and generation
        // lifecycle so cancel/complete/error updates cards immediately even
        // when the action came from the queue panel instead of the card itself.
        _unsubs.push(Events.on('generation:complete',  () => _syncPreviewQueueState()));
        _unsubs.push(Events.on('generation:cancelled', () => _syncPreviewQueueState()));
        _unsubs.push(Events.on('generation:error',     () => _syncPreviewQueueState()));
        _unsubs.push(Events.on('generation:started',   () => _syncPreviewQueueState()));
        _unsubs.push(Events.on('generation-queue:changed', () => _syncPreviewQueueState()));

        // ── Media missing (garbage collection) ───────────────────────────────────
        grid.on('media-missing', ({ group: g, itemId }) => {
            const missingIdx = g.history.findIndex(item => item.id === itemId);
            if (missingIdx === -1) return;

            if (g.history.length <= 1) {
                removeGroup(g.id);
                grid.el.removeCard(g.id);
            } else {
                const pruned = removeHistoryEntry(g, missingIdx);
                updateGroup(pruned);
            }
        });


        // ── Download ────────────────────────────────────────────────────────────
        grid.on('download', ({ groups: g }) => {
            const items = g.flatMap(group => {
                const sel = getSelectedItem(group);
                return sel ? [sel] : [];
            });
            downloadMediaFiles(state.currentProject, items);
        });

        // ── Delete ──────────────────────────────────────────────────────────────
        const _deleteDialog = MpiOkCancel.mount(document.createElement('div'), {
            title:       'Delete',
            text:        'Permanently delete the selected cards and their media files?',
            okLabel:     'Delete',
            cancelLabel: 'Cancel',
        });
        let _pendingDeleteGroups = [];

        async function _runGalleryDelete(g) {
            const project = state.currentProject;
            if (!project || !g?.length) return;
            for (const group of g) {
                if (group?.id) _deletingGroupIds.add(group.id);
            }
            grid.el.setGroups([..._placeholdersForFirst(), ..._visibleProjectGroups()]);

            const deletedGroups = [];
            for (const group of g) {
                let groupDeleted = true;
                for (const item of group.history) {
                    const fp = item.filePath;
                    if (!fp) continue;
                    const filename = extractFilenameFromPath(fp);
                    if (!filename) continue;
                    try {
                        const res = await fetch(
                            `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`,
                            { method: 'DELETE' }
                        );
                        if (!res.ok) {
                            groupDeleted = false;
                            clientLogger.warn('MpiGalleryBlock', 'delete file returned non-ok status', {
                                status: res.status,
                                itemId: item.id,
                                filename,
                            });
                        }
                    } catch (err) {
                        groupDeleted = false;
                        clientLogger.warn('MpiGalleryBlock', 'delete file failed:', err);
                    }
                }
                if (groupDeleted) deletedGroups.push(group);
                else if (group?.id) _deletingGroupIds.delete(group.id);
            }

            for (const group of deletedGroups) {
                grid.el.removeCard(group.id);
                await removeGroup(group.id);
                _deletingGroupIds.delete(group.id);
            }
            grid.el.setGroups([..._placeholdersForFirst(), ..._visibleProjectGroups()]);
            if (deletedGroups.length) Events.emit('media:deleted', { count: deletedGroups.length });
        }

        _deleteDialog.on('ok', async () => {
            const g = _pendingDeleteGroups;
            _pendingDeleteGroups = [];
            await _runGalleryDelete(g);
        });

        grid.on('delete', ({ groups: g, source }) => {
            if (source === 'context') {
                _runGalleryDelete(g);
                return;
            }
            _pendingDeleteGroups = g;
            _deleteDialog.el.show();
        });

        // ── PromptBox setup ─────────────────────────────────────────────────────
        // Gallery is a mediaType-agnostic entry point — show ALL installed models
        // in the dropdown (image + video). Initial active model follows the user's
        // last-touched mediaType so a video pick survives navigation/restart.
        const _lastType = state.s_lastSelectedMediaType === 'video' ? 'video' : 'image';
        const { model: activeModelInit, modelId: activeModelIdInit } = resolveActiveModel(_lastType);
        let installedAllModels = MODELS.filter(m => m.installed !== false);
        let activeModelId = activeModelIdInit;
        let activeModel = activeModelInit;
        // No mount-time write-back: resolver already returned a valid id for
        // 'image'. Persisting it would clobber a sibling-type selection
        // (e.g. video model picked earlier) on every Gallery mount.

        // Default op tracks active model's mediaType. t2i for image, t2v for video.
        // PromptBox will re-pick a valid op for context on its own; this just
        // keeps Block-side bookkeeping consistent with the initial model.
        let activeOperation = activeModel?.mediaType === 'video' ? 't2v' : 't2i';
        if (activeModel && !activeModel.supportedOps?.includes(activeOperation)) {
            activeOperation = activeModel.supportedOps?.[0] ?? activeOperation;
        }
        let imageCount      = 0;
        let videoCount      = 0;

        function _reuseIncludes(value = {}) {
            return {
                prompt: value.prompt === true,
                settings: value.settings === true,
                model: value.model === true,
                images: value.images === true,
            };
        }

        function _resolveReusePayload(bundle = {}, source = 'original') {
            const original = bundle.original || null;
            const current = bundle.current || null;
            if (source === 'current') return current;
            return original || current;
        }

        function _handlePromptReuse(bundle = {}) {
            const options = state.promptReuseOptions || {};
            if (options.ask === true) {
                const dialog = MpiReusePromptDialog.mount(document.createElement('div'), {
                    includes: options,
                    source: state.promptReuseSource,
                    showSource: true,
                });
                dialog.on('apply', async ({ includes, source }) => {
                    const payload = _resolveReusePayload(bundle, source);
                    if (payload) await _applyPromptReuse(payload, _reuseIncludes(includes));
                    dialog.destroy?.();
                });
                dialog.on('cancel', () => dialog.destroy?.());
                dialog.el.show?.();
                return;
            }

            const payload = _resolveReusePayload(bundle, state.promptReuseSource);
            if (payload) _applyPromptReuse(payload, _reuseIncludes(options));
        }

        async function _applyPromptReuse(payload = {}, includes = { prompt: true, settings: true, model: true, images: true }) {
            if (!_pb?.el) return;
            const use = _reuseIncludes(includes);
            if (!use.prompt && !use.settings && !use.model && !use.images) return;

            let targetModel = activeModel;
            if (use.model && payload.modelId) {
                targetModel = installedAllModels.find(m => m.id === payload.modelId) || null;
            }
            if (!targetModel) {
                const label = payload.modelId || 'Unknown model';
                StatusBar.notify(`Model "${label}" is not installed — cannot reuse full prompt.`, 'warning');
                use.model = false;
                use.settings = false;
                targetModel = activeModel;
                if (!targetModel && use.prompt) _pb.el.injectPrompts?.({ positive: payload.positive || '', negative: payload.negative || '' });
                if (!targetModel) return;
            }

            if (use.model) {
                activeModel = targetModel;
                activeModelId = targetModel.id;
                setSelectedModelId(targetModel.mediaType, targetModel.id);
                Events.emit('settings:model:select', { modelId: targetModel.id });
                _pb.el.setModel?.(targetModel);
            }

            if (use.prompt) {
                _pb.el.injectPrompts?.({ positive: payload.positive || '', negative: payload.negative || '' });
            }
            if (use.images) {
                _pb.el.clearMedia?.();
                const mediaItems = await resolvePromptReuseMediaItems(payload, state.currentProject);
                for (const item of mediaItems) {
                    _pb.el.injectMedia?.({ url: item.url || item.filePath, mediaType: item.mediaType || item.type, role: item.role });
                }
            }

            if (use.settings) {
                const targetOperation = payload.operation && targetModel.supportedOps?.includes(payload.operation)
                    ? payload.operation
                    : activeOperation;
                const settings = buildPromptReuseSettings(payload, targetModel);
                applyPromptReuseSettings({
                    modelId: targetModel.id,
                    mediaType: targetModel.mediaType,
                    operation: targetOperation,
                    ...settings,
                });
                activeOperation = targetOperation;
                _pb.el.setOperation?.(targetOperation);
            }
            imageCount = Number(_pb.el.imageCount) || 0;
            videoCount = Number(_pb.el.videoCount) || 0;
            _pb.el.updateContext?.({ imageCount, videoCount, hasMask: false });
            refreshRadial({ imageCount, videoCount, modelId: activeModelId });
        }

        // Seed radial with current model so its items render correctly before
        // any PromptBox media-/model-change events fire.
        refreshRadial({ imageCount, videoCount, modelId: activeModelId });

        function _wirePromptBox(pb) {
            if (!pb) return;

            pb.on('model-change', ({ model }) => {
                setSelectedModelId(model.mediaType, model.id);
                activeModelId   = model.id;
                activeModel     = model;
                // PromptBox.setModel already picked the right op for current
                // media context and emitted operation-change. The operation-change
                // listener below syncs activeOperation — no force-reset here.
                if (!model.supportedOps?.includes(activeOperation)) {
                    activeOperation = model.supportedOps?.[0] ?? activeOperation;
                    _pb?.el?.setOperation(activeOperation);
                }
                refreshRadial({ imageCount, videoCount, modelId: model.id });
            });

            pb.on('operation-change', ({ operation }) => {
                activeOperation = operation;
            });

            pb.on('settings', () => {
                _settingsOverlay.el.open({ modelId: activeModel.id });
            });

            pb.on('media-change', ({ imageCount: ic, videoCount: vc }) => {
                imageCount = ic;
                videoCount = vc;
                _pb?.el?.updateContext({ imageCount, videoCount, hasMask: false });
                refreshRadial({ imageCount, videoCount, modelId: activeModelId });
            });

            const _galleryGenerationOptions = (injectionParams = {}, cardType = activeModel?.mediaType || 'image', mediaItems = []) => {
                const batchCount = Math.max(1, Number(injectionParams.Batch_Size) || 1);
                const tempIds = Array.from({ length: batchCount }, () => crypto.randomUUID());
                const tempId = tempIds[0];
                const startFrame = (mediaItems || []).find(item => item?.mediaType === 'image' && item?.role === 'startFrame')
                    || (mediaItems || []).find(item => item?.mediaType === 'image');
                const startFrameUrl = startFrame?.url ? resolveMediaUrl(startFrame.url) : '';

                // Placeholder ratio rules:
                //   - Ratio-control ops (t2i, i2i, t2v, i2v): use injected Width/Height.
                //   - Grid-mode upscale (Auto_Grid=true): keep square (1024) since
                //     tile previews arrive mixed shapes and a stable square box
                //     is the best fit until completion overwrites dims.
                //   - No-ratio-control ops without grid (upscale/detail/change/
                //     remove/edit): leave 0/0 so the card adopts input thumb aspect
                //     via _cacheLoadedAspectRatio.
                const gridActive = injectionParams.Auto_Grid === true;
                const placeholderW = injectionParams.Width  || (gridActive ? 1024 : 0);
                const placeholderH = injectionParams.Height || (gridActive ? 1024 : 0);

                const mkPlaceholder = (id) => ({
                    id,
                    type: cardType,
                    name: 'Generating...',
                    history: startFrameUrl ? [{
                        id: `${id}-input-preview`,
                        type: 'image',
                        filePath: startFrameUrl,
                        name: 'Generating...',
                        displayName: 'Generating...',
                        operation: activeOperation,
                        inputPreview: true,
                        pixelDimensions: { w: 0, h: 0 },
                    }] : [],
                    selectedIndex: 0,
                    width:  placeholderW,
                    height: placeholderH,
                    isGenerating: true,
                });

                return {
                    scope: 'gallery',
                    tempId,
                    placeholderGroup: mkPlaceholder(tempId),
                    extraTempIds: tempIds.slice(1),
                    extraPlaceholders: tempIds.slice(1).map(mkPlaceholder),
                };
            };

            const _galleryGenerationFromPayload = ({ operation, positive, negative, mediaItems, injectionParams = {}, previewOnly = false }) => {
                if (!activeModel) return;
                const config = { operation, model: activeModel, positive, negative, mediaItems, injectionParams, previewOnly };
                return {
                    config,
                    opts: _galleryGenerationOptions(injectionParams, activeModel.mediaType, mediaItems),
                };
            };

            pb.on('run', (payload) => {
                const next = _galleryGenerationFromPayload(payload);
                if (!next) return;
                const callbacks = {
                    onCancel: () => {},
                    getNextGeneration: () => _galleryGenerationFromPayload(_pb?.el?.getRunPayload?.() || payload),
                };
                enqueueGeneration(next.config, callbacks, next.opts);
            });

            pb.on('cancel', () => {
                const active = activeGenerations.listFor('gallery', null).filter(e => e.status === 'running');
                const target = active[0];
                if (target) activeGenerations.cancel(target.id);
                const currentGroups = _visibleProjectGroups();
                grid.el.setGroups(currentGroups);
                const noRunning = !activeGenerations.list().some(e => e.status === 'running');
                const queueIdle = (state.generationQueueCount || 0) === 0;
                const continueBusy = _continuingGroupIds.size > 0 || _queuedContinueGroupIds.size > 0;
                if (noRunning && queueIdle && !continueBusy && !state.loopArmed) {
                    Events.emit('promptbox:generation-end');
                }
                refreshQueueDepth();
            });

            pb.on('queue-clear', () => {
                clearPendingQueue();
            });
        }

        function _mountPb(props) {
            _pb?.el?.destroy?.();
            _pb = MpiPromptBox.mount(gid('prompt-box-mount'), props);
            return _pb;
        }

        // ── Registry event subscriptions (gallery-scoped) ─────────────────────

        // In Queue mode, multiple generations can be in flight via ComfyUI's
        // native FIFO. We only render placeholders for the FIRST running entry
        // (the one ComfyUI is actively processing); later ones stay invisible
        // until they bubble up to "first" position.
        const _firstRunningEntry = () => {
            return activeGenerations.listFor('gallery', null).find(e => e.status === 'running') || null;
        };
        const _placeholdersForFirst = () => {
            const first = _firstRunningEntry();
            if (!first) return [];
            return [first.placeholderGroup, ...(first.extraPlaceholders || [])].filter(Boolean);
        };

        _unsubs.push(Events.on('generation:started', ({ id, scope }) => {
            if (scope !== 'gallery') return;
            _myGenIds.add(id);
            const currentGroups = _visibleProjectGroups();
            grid.el.setGroups([..._placeholdersForFirst(), ...currentGroups]);
        }));

        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myGenIds.has(id)) return;
            // Only paint preview for the first-running entry (the one whose
            // placeholder is actually mounted).
            const first = _firstRunningEntry();
            if (!first || first.id !== id) return;
            const allTempIds = [first.tempId, ...(first.extraTempIds || [])].filter(Boolean);
            for (const t of allTempIds) grid.el.updatePreview(t, url);
        }));

        // After a job ends, rebuild the grid: remove its placeholders if they
        // were mounted (only the first-running's are), and re-mount the new
        // first-running's placeholders if any remain in the queue.
        const _rebuildAfterEnd = (id, tid, extraTempIds = []) => {
            _myGenIds.delete(id);
            const allTempIds = [tid, ...extraTempIds].filter(Boolean);
            for (const t of allTempIds) grid.el.removeCard(t);
            const currentGroups = _visibleProjectGroups();
            grid.el.setGroups([..._placeholdersForFirst(), ...currentGroups]);
        };

        _unsubs.push(Events.on('generation:complete', ({ id, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _rebuildAfterEnd(id, tid, extraTempIds);
        }));

        _unsubs.push(Events.on('generation:error', ({ id, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _rebuildAfterEnd(id, tid, extraTempIds);
        }));

        _unsubs.push(Events.on('generation:cancelled', ({ id, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _rebuildAfterEnd(id, tid, extraTempIds);
        }));

        // Model settings overlay
        const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));

        if (installedAllModels.length > 0) {
            _pb = _mountPb({
                model:           activeModel,
                modelList:       installedAllModels,
                operation:       activeOperation,
                includeNegative: true,
            });
            _pb?.el?.show();
            _wirePromptBox(_pb);
            // Restore Stop/Clear enabled state when remounting into a
            // workspace that still has gallery-scoped jobs in flight (e.g.
            // returning from history mid-video) or block-owned busy state
            // (continue / queued-continue / stage2 branches).
            _refreshPbGenerating();
        }

        // ── media:imported listener — registered unconditionally.
        // Must not be gated by promptBox presence; PromptBox may be remounted
        // later (post-install) and drops need to create cards regardless.
        _unsubs.push(Events.on('media:imported', ({ url, filename, itemId, thumbPath, mediaType, pixelDimensions }) => {
            if (!state.currentProject) return;

            const isVideo = mediaType === 'video';
            const dims = pixelDimensions?.w > 0 && pixelDimensions?.h > 0
                ? pixelDimensions
                : null;
            const displayName = filename
                ? filename.replace(/\.[^.]+$/, '')
                : (isVideo ? 'Imported Video' : 'Imported Image');

            const id = itemId || filename.replace(/\.[^.]+$/, '');
            const item = isVideo
                ? createVideoItem({
                    id,
                    filePath: url,
                    thumbPath,
                    uploaded: true,
                    operation: 'imported',
                    pixelDimensions: dims || { w: 0, h: 0 },
                })
                : createImageItem({
                    id,
                    filePath: url,
                    uploaded: true,
                    operation: 'imported',
                    pixelDimensions: dims || { w: 0, h: 0 },
                });

            const group = createItemGroup(mediaType, {
                name: displayName,
                ...(dims ? { width: dims.w, height: dims.h } : {}),
            });
            const finalGroup = appendToHistory(group, item);

            const currentGroups = state.currentProject?.itemGroups || [];
            addGroup(finalGroup);

            grid.el.setGroups([finalGroup, ...currentGroups]);
        }));


        // ── Selection mode: show/hide PromptBox ────────────────────────────────
        grid.on('selection-start', () => _pb?.el?.hide());
        grid.on('selection-end',   () => _pb?.el?.show());

        // ── Radial → operation sync ─────────────────────────────────────────────
        _unsubs.push(Events.on('workspace:set-operation', ({ operation }) => {
            activeOperation = operation;
            _pb?.el?.setOperation(activeOperation);
        }));

        // ── Zero-installed check ───────────────────────────────────────────────
        // Decision 1: empty/new project (groups.length === 0) + zero models → auto-open slide-over.
        // Decision 2: project has existing media (groups.length > 0) + zero models → read-only,
        //   no PromptBox mount, no auto-open. User can browse media without interruption.
        // `groups` is resolved synchronously from state.currentProject?.itemGroups at mount time
        // and is the reliable signal for "project has media" without waiting for loadAssets.
        const _projectHasMedia = groups.length > 0;
        if (installedAllModels.length === 0 && !_projectHasMedia) Events.emit('models:open');

        // ── Install-state watcher — replaces both the old `s_installedModelIds` watcher
        // and the deleted `models:closed` listener. `models:closed` no longer fires;
        // PromptBox mount is triggered by install-state change instead (option A).
        _unsubs.push(Events.onState('s_installedModelIds', () => {
            installedAllModels = MODELS.filter(m => m.installed !== false);
            if (installedAllModels.length === 0) {
                // Zero models: if project is empty/new → re-open slide-over; otherwise read-only.
                if (!_projectHasMedia) Events.emit('models:open');
                _pb?.el?.setModelList?.(installedAllModels);
                return;
            }
            // At least one model is now installed. If PromptBox is not yet mounted, mount it.
            if (!_pb?.el) {
                // Prefer last-touched mediaType's selection, then the other type,
                // then first available. Mirrors mount-time logic above.
                const lastType = state.s_lastSelectedMediaType === 'video' ? 'video' : 'image';
                const otherType = lastType === 'video' ? 'image' : 'video';
                const persistedPrimary   = getSelectedModelId(lastType);
                const persistedSecondary = getSelectedModelId(otherType);
                const newModel =
                    installedAllModels.find(m => m.id === persistedPrimary)
                    || installedAllModels.find(m => m.id === persistedSecondary)
                    || installedAllModels[0];
                activeModel = newModel;
                activeModelId = newModel.id;
                setSelectedModelId(newModel.mediaType, newModel.id);
                activeOperation = newModel.supportedOps?.[0] ?? activeOperation;
                _pb = _mountPb({
                    model: newModel,
                    modelList: installedAllModels,
                    operation: activeOperation,
                    includeNegative: true,
                });
                _wirePromptBox(_pb);
                _pb?.el?.show();
                refreshRadial({ imageCount, videoCount, modelId: newModel.id });
            } else {
                _pb.el.setModelList?.(installedAllModels);
            }
        }));
        // Note: install-state is reconciled by `modelRegistry.syncModelInstalled()`,
        // which emits `models:checked` (→ s_installedModelIds). React to that state,
        // never re-run the sync from here.

        // ── Cleanup on destroy ────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            window.removeEventListener('dragenter', _onDragEnter);
            window.removeEventListener('dragleave', _onDragLeave);
            window.removeEventListener('dragover',  _onDragOver);
            window.removeEventListener('drop',      _onDrop);
            dropOverlay.el.remove();
            dropOverlay.destroy?.();
            grid.destroy?.();
            _compareOverlay.destroy?.();
            _deleteDialog.destroy?.();
            _settingsOverlay.destroy?.();
            _pb?.el?.destroy?.();
            _pb = null;
        };
    },
});
