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
import { startGeneration } from '../../../services/generationService.js';
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

    template: () => `<div class="mpi-gallery-block"></div>`,

    setup: (el, props, emit) => {
        // ── Cleanup array ─────────────────────────────────────────────────────
        const _unsubs = [];

        let groups = state.currentProject?.itemGroups || [];

        // ── Rehydrate any in-flight gallery generations ───────────────────────
        const _myGenIds = new Set();
        const _runningGallery = activeGenerations.listFor('gallery', null).filter(e => e.status === 'running');
        const _placeholderGroups = _runningGallery.map(e => e.placeholderGroup).filter(Boolean);

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

            pb.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
                if (!activeModel) return;

                const batchCount = Math.max(1, Number(injectionParams.Batch_Size) || 1);
                const cardType   = activeModel.mediaType;

                const tempIds = Array.from({ length: batchCount }, () => crypto.randomUUID());
                const tempId  = tempIds[0];

                const mkPlaceholder = (id) => ({
                    id,
                    type: cardType,
                    name: 'Generating...',
                    history: [],
                    selectedIndex: 0,
                    width: injectionParams.Width || 1024,
                    height: injectionParams.Height || 1024,
                    isGenerating: true,
                });

                const placeholderGroup  = mkPlaceholder(tempId);
                const extraPlaceholders = tempIds.slice(1).map(mkPlaceholder);

                startGeneration(
                    { operation, model: activeModel, positive, negative, mediaItems, injectionParams },
                    { onCancel: () => {} },
                    { scope: 'gallery', tempId, placeholderGroup, extraTempIds: tempIds.slice(1), extraPlaceholders }
                );
            });

            pb.on('cancel', () => {
                const last = activeGenerations.listFor('gallery', null).at(-1);
                if (last) activeGenerations.cancel(last.id);
            });
        }

        function _mountPb(props) {
            _pb?.el?.destroy?.();
            _pb = MpiPromptBox.mount(gid('prompt-box-mount'), props);
            return _pb;
        }

        // ── Registry event subscriptions (gallery-scoped) ─────────────────────
        _unsubs.push(Events.on('generation:started', ({ id, scope, tempId: tid, placeholderGroup: pg, extraPlaceholders = [] }) => {
            if (scope !== 'gallery') return;
            _myGenIds.add(id);
            const currentGroups = state.currentProject?.itemGroups || [];
            const runningPlaceholders = activeGenerations.listFor('gallery', null)
                .filter(e => e.status === 'running' && e.id !== id)
                .flatMap(e => [e.placeholderGroup, ...(e.extraPlaceholders || [])])
                .filter(Boolean);
            const myPlaceholders = [pg, ...extraPlaceholders].filter(Boolean);
            if (myPlaceholders.length) grid.el.setGroups([...myPlaceholders, ...runningPlaceholders, ...currentGroups]);
        }));

        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myGenIds.has(id)) return;
            const entry = activeGenerations.get(id);
            if (!entry) return;
            const allTempIds = [entry.tempId, ...(entry.extraTempIds || [])].filter(Boolean);
            for (const t of allTempIds) grid.el.updatePreview(t, url);
        }));

        _unsubs.push(Events.on('generation:complete', ({ id, item, group, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            const currentGroups = state.currentProject?.itemGroups || [];
            const allTempIds = [tid, ...extraTempIds].filter(Boolean);
            for (const t of allTempIds) grid.el.removeCard(t);
            grid.el.setGroups(currentGroups);
        }));

        _unsubs.push(Events.on('generation:error', ({ id, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            const allTempIds = [tid, ...extraTempIds].filter(Boolean);
            for (const t of allTempIds) grid.el.removeCard(t);
            grid.el.setGroups(state.currentProject?.itemGroups || []);
        }));

        _unsubs.push(Events.on('generation:cancelled', ({ id, tempId: tid, extraTempIds = [] }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            const allTempIds = [tid, ...extraTempIds].filter(Boolean);
            for (const t of allTempIds) grid.el.removeCard(t);
            grid.el.setGroups(state.currentProject?.itemGroups || []);
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