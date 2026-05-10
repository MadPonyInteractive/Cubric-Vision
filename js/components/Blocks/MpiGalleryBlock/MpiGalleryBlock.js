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
import { MpiPromptBox } from '../../Organisms/MpiPromptBox/MpiPromptBox.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { ce, qs, gid } from '../../../utils/dom.js';
import { navigate, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../../../router.js';
import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
import { resolveActiveModel } from '../../../utils/modelHelpers.js';
import { truncateCardName } from '../../../utils/displayHelpers.js';
import { MODELS, getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
import { refreshRadial } from '../../../shell/navigation.js';
import { startGeneration, enqueueGeneration, clearPendingQueue, refreshQueueDepth, removeCueJob } from '../../../services/generationService.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { addGroup, updateGroup, removeGroup, persistGroups } from '../../../services/projectService.js';
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

        for (const entry of _runningGallery) {
            _myGenIds.add(entry.id);
        }

        // ── OS-file drop overlay ───────────────────────────────────────────────
        const dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
            onDrop: async ({ file, mediaType }) => {
                const project = state.currentProject;
                if (!project?.folderPath || !project?.id) {
                    clientLogger.warn('MpiGalleryBlock', 'No current project on drop');
                    return;
                }
                const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
                if (!uploaded) return;
                Events.emit('media:imported', {
                    url: uploaded.filePath,
                    filename: uploaded.filename,
                    itemId: uploaded.itemId,
                    thumbPath: uploaded.thumbPath,
                    mediaType,
                });
                _pb?.el?.injectMedia?.({ url: uploaded.filePath, mediaType });
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
        grid.on('reuse', ({ positive, negative }) => {
            Events.emit('workspace:inject-prompts', { positive, negative });
        });

        // ── Preview-stage Continue / Discard ────────────────────────────────────
        const _previewDiscardDialog = MpiOkCancel.mount(document.createElement('div'), {
            title:       'Discard preview',
            text:        'Discard this preview? The preview clip and its sidecar will be permanently deleted.',
            okLabel:     'Discard',
            cancelLabel: 'Cancel',
        });
        let _pendingDiscard = null;

        _previewDiscardDialog.on('ok', async () => {
            const project = state.currentProject;
            const target = _pendingDiscard;
            _pendingDiscard = null;
            if (!project || !target) return;

            const { group: g, item } = target;
            const fp = item?.filePath;
            if (fp) {
                const filename = extractFilenameFromPath(fp);
                if (filename) {
                    fetch(`/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`, {
                        method: 'DELETE',
                    }).catch(err => clientLogger.warn('MpiGalleryBlock', 'preview discard: delete file failed:', err));
                    fetch(`/project-media/${project.id}/${encodeURIComponent(`${item.id}.json`)}?folderPath=${encodeURIComponent(project.folderPath)}`, {
                        method: 'DELETE',
                    }).catch(err => clientLogger.warn('MpiGalleryBlock', 'preview discard: delete sidecar failed:', err));
                }
            }
            removeGroup(g.id);
            grid.el.removeCard(g.id);
            Events.emit('gallery:item-removed', { groupId: g.id, itemId: item?.id });
        });

        grid.on('preview:discard', ({ group: g, item }) => {
            _pendingDiscard = { group: g, item };
            _previewDiscardDialog.el.show();
        });

        // Track Continue runs. `_queuedContinueGroupIds` = waiting in Cue queue;
        // `_continuingGroupIds` = currently running. Both maps `groupId → itemId`
        // so cue-queue removal can target the exact replaceItemId job.
        // Grid mirrors via markContinuing / markQueuedContinue (debounced render
        // re-applies state from internal Sets).
        const _continuingGroupIds = new Set();
        const _queuedContinueGroupIds = new Map(); // groupId → itemId

        const _refreshPbGenerating = () => {
            const busy = _continuingGroupIds.size > 0 || _queuedContinueGroupIds.size > 0;
            _pb?.el?.setGenerating?.(busy);
        };

        grid.on('preview:continue', ({ group: g, item }) => {
            if (!item?.frozenParams) {
                clientLogger.warn('MpiGalleryBlock', 'preview:continue without frozenParams', item);
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

            // Already queued or running for this group — ignore re-clicks.
            if (_continuingGroupIds.has(g.id) || _queuedContinueGroupIds.has(g.id)) return;

            // Sync PB to the preview's model + op so the user sees Cue progress
            // for the multi-stage workflow that originally produced the preview.
            // Skip the switch when already aligned to avoid clobbering state.
            const modelMismatch = activeModelId !== model.id;
            const opMismatch    = activeOperation !== item.operation;
            if (modelMismatch || opMismatch) {
                if (modelMismatch) {
                    activeModel   = model;
                    activeModelId = model.id;
                    state.s_selectedModelId = model.id;
                    _pb?.el?.setModel?.(model);
                }
                if (item.operation) {
                    activeOperation = item.operation;
                    _pb?.el?.setOperation?.(item.operation);
                }
                const name = model.label || model.name || model.id;
                StatusBar.notify(`Switched to "${name}" — continuing preview.`, 'info');
            }
            // Force Queue mode so the user sees the Cue x{n} cluster while
            // multiple Continues stack up.
            if (state.generationMode !== 'queue') state.generationMode = 'queue';

            const frozen = item.frozenParams || {};
            const dims = frozen.dims || {};
            const injectionParams = {};
            if (dims.w) injectionParams.Width  = dims.w;
            if (dims.h) injectionParams.Height = dims.h;
            if (frozen.frames != null) injectionParams.Frames = frozen.frames;
            if (frozen.seed != null) injectionParams.Seed = frozen.seed;

            const config = {
                operation:     item.operation,
                model,
                positive:      frozen.prompt   || '',
                negative:      frozen.negative || '',
                mediaItems:    Array.isArray(frozen.mediaItems) ? frozen.mediaItems : [],
                injectionParams,
                previewOnly:   false,
                replaceItemId: item.id,
            };

            // Mark queued. If nothing is currently running, enqueueGeneration
            // will dispatch immediately and `generation:started` flips us to
            // continuing. Otherwise the card stays in "Queued..." state.
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
                // onCancel fires for both: cleared-while-pending (clearCueQueue/
                // removeCueJob) AND user-cancelled-mid-run. In the queued case
                // _continuingGroupIds is empty, so _clearContinuing is a no-op
                // and _clearQueued does the work.
                onCancel: () => { _clearQueued(); _clearContinuing(); },
                onError:  () => { _clearQueued(); _clearContinuing(); },
                onComplete: () => { /* cleared when gallery:item-updated fires */ },
            };
            enqueueGeneration(config, callbacks, { scope: 'gallery', _continueGroupId: g.id });
        });

        // When a Continue job actually starts dispatching, flip its card from
        // "Queued..." → "Generating final...".
        _unsubs.push(Events.on('generation:started', ({ scope, replaceItemId }) => {
            if (scope !== 'gallery' || !replaceItemId) return;
            for (const [groupId, itemId] of _queuedContinueGroupIds) {
                if (itemId === replaceItemId) {
                    _queuedContinueGroupIds.delete(groupId);
                    grid.el.markQueuedContinue(groupId, false);
                    _continuingGroupIds.add(groupId);
                    grid.el.markContinuing(groupId, true);
                    _refreshPbGenerating();
                    break;
                }
            }
        }));

        // Pop button on a queued card → remove its job from the cue queue.
        // removeCueJob fires the job's onCancel which clears the marker.
        grid.on('preview:pop-continue', ({ group: g, item }) => {
            if (!_queuedContinueGroupIds.has(g.id)) return;
            removeCueJob(job => job.config?.replaceItemId === item.id);
        });

        _unsubs.push(Events.on('gallery:item-updated', ({ groupId, group: updatedGroup }) => {
            if (!updatedGroup) return;
            grid.el.refreshGroup(updatedGroup);
            if (_continuingGroupIds.has(groupId)) {
                _continuingGroupIds.delete(groupId);
                grid.el.markContinuing(groupId, false);
                _refreshPbGenerating();
            }
        }));

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

        _deleteDialog.on('ok', async () => {
            const project = state.currentProject;
            if (!project || !_pendingDeleteGroups.length) return;
            const g = _pendingDeleteGroups;
            _pendingDeleteGroups = [];

            for (const group of g) {
                for (const item of group.history) {
                    const fp = item.filePath;
                    if (!fp) continue;
                    const filename = extractFilenameFromPath(fp);
                    if (!filename) continue;
                    // Delete media file (including itemId for sidecar cleanup in backend)
                    fetch(`/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`, {
                        method: 'DELETE',
                    }).catch(err => clientLogger.warn('MpiGalleryBlock', 'delete file failed:', err));
                    // Explicitly delete sidecar as backup
                    const sidecar = `${item.id}.json`;
                    fetch(`/project-media/${project.id}/${encodeURIComponent(sidecar)}?folderPath=${encodeURIComponent(project.folderPath)}`, {
                        method: 'DELETE',
                    }).catch(err => clientLogger.warn('MpiGalleryBlock', 'delete sidecar failed:', err));
                }
            }

            for (const group of g) removeGroup(group.id);
            for (const group of g) grid.el.removeCard(group.id);
            Events.emit('media:deleted', { count: g.length });
        });

        grid.on('delete', ({ groups: g }) => {
            _pendingDeleteGroups = g;
            _deleteDialog.el.show();
        });

        // ── PromptBox setup ─────────────────────────────────────────────────────
        // Gallery is a mediaType-agnostic entry point — show ALL installed models
        // in the dropdown (image + video). Initial active model still prefers
        // image so default operation `t2i` is valid; user can switch via dropdown.
        const { model: activeModelInit, modelId: activeModelIdInit } = resolveActiveModel('image');
        let installedAllModels = MODELS.filter(m => m.installed !== false);
        let activeModelId = activeModelIdInit;
        let activeModel = activeModelInit;
        if (activeModelId) state.s_selectedModelId = activeModelId;

        let activeOperation = 't2i';
        let imageCount      = 0;
        let videoCount      = 0;

        let _pb = null;

        function _wirePromptBox(pb) {
            if (!pb) return;

            pb.on('model-change', ({ model }) => {
                state.s_selectedModelId = model.id;
                activeModelId   = model.id;
                activeModel     = model;
                activeOperation = model.supportedOps[0];
                _pb?.el?.setOperation(activeOperation);
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
                refreshRadial({ imageCount, videoCount });
            });

            const _galleryGenerationOptions = (injectionParams = {}, cardType = activeModel?.mediaType || 'image', mediaItems = []) => {
                const batchCount = Math.max(1, Number(injectionParams.Batch_Size) || 1);
                const tempIds = Array.from({ length: batchCount }, () => crypto.randomUUID());
                const tempId = tempIds[0];
                const startFrame = (mediaItems || []).find(item => item?.mediaType === 'image' && item?.role === 'startFrame')
                    || (mediaItems || []).find(item => item?.mediaType === 'image');
                const startFrameUrl = startFrame?.url ? resolveMediaUrl(startFrame.url) : '';

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
                    width: injectionParams.Width || 1024,
                    height: injectionParams.Height || 1024,
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
                if (state.generationMode === 'queue') {
                    enqueueGeneration(next.config, callbacks, next.opts);
                } else {
                    startGeneration(next.config, callbacks, next.opts);
                }
            });

            pb.on('cancel', ({ mode } = {}) => {
                const active = activeGenerations.listFor('gallery', null).filter(e => e.status === 'running');
                const target = mode === 'queue' ? active[0] : active.at(-1);
                if (target) activeGenerations.cancel(target.id);
                const currentGroups = state.currentProject?.itemGroups || [];
                grid.el.setGroups(currentGroups);
                const noRunning = !activeGenerations.list().some(e => e.status === 'running');
                const queueIdle = (state.generationQueueCount || 0) === 0;
                // Continue jobs ride the Cue queue regardless of PB mode. If
                // any are queued/running we must NOT flip PB to idle, even
                // when current mode !== 'queue'.
                const continueBusy = _continuingGroupIds.size > 0 || _queuedContinueGroupIds.size > 0;
                if (noRunning && (mode !== 'queue' || queueIdle) && !continueBusy) {
                    if (mode !== 'queue') state.generationQueueCount = 0;
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
            const currentGroups = state.currentProject?.itemGroups || [];
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
            const currentGroups = state.currentProject?.itemGroups || [];
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
        }

        // ── media:imported listener — registered unconditionally.
        // Must not be gated by promptBox presence; PromptBox may be remounted
        // later (post-install) and drops need to create cards regardless.
        _unsubs.push(Events.on('media:imported', ({ url, filename, itemId, thumbPath, mediaType }) => {
            if (!state.currentProject) return;

            const isVideo = mediaType === 'video';
            const displayName = filename
                ? filename.replace(/\.[^.]+$/, '')
                : (isVideo ? 'Imported Video' : 'Imported Image');

            const id = itemId || filename.replace(/\.[^.]+$/, '');
            const item = isVideo
                ? createVideoItem({ id, filePath: url, thumbPath, uploaded: true, operation: 'imported' })
                : createImageItem({ id, filePath: url, uploaded: true, operation: 'imported' });

            const group = createItemGroup(mediaType, { name: displayName });
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

        // ── Zero-installed check — emit models:open (shell handles the modal) ───
        if (installedAllModels.length === 0) Events.emit('models:open', { auto: true });

        _unsubs.push(Events.onState('s_installedModelIds', () => {
            installedAllModels = MODELS.filter(m => m.installed !== false);
            if (installedAllModels.length === 0) Events.emit('models:open', { auto: true });
            _pb?.el?.setModelList?.(installedAllModels);
        }));
        // Note: `models:all-installed` is emitted by `modelRegistry.syncModelInstalled()`
        // — the canonical source of truth for installed-model state. Listeners (shell,
        // MpiGroupHistoryBlock) hide their modal on that event. Do NOT emit it here.

        // ── Post-install PromptBox remount ─────────────────────────────────────
        // If models are installed while the modal is open, promptBox will be null.
        // When the modal closes (models:closed), check if PromptBox needs to be mounted.
        _unsubs.push(Events.on('models:closed', () => {
            const currentModels = MODELS.filter(m => m.installed !== false);
            installedAllModels = currentModels;
            if (!_pb?.el && currentModels.length > 0) {
                const newModel = currentModels.find(m => m.id === state.s_selectedModelId) || currentModels[0];
                activeModel = newModel;
                activeModelId = newModel.id;
                state.s_selectedModelId = newModel.id;
                activeOperation = newModel.supportedOps?.[0] ?? activeOperation;
                _pb = _mountPb({
                    model: newModel,
                    modelList: currentModels,
                    operation: activeOperation,
                    includeNegative: true,
                });
                _wirePromptBox(_pb);
                _pb?.el?.show();
            } else if (_pb?.el) {
                _pb.el.setModelList?.(currentModels);
            }
        }));

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
