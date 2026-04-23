/**
 * MpiGalleryBlock — Block: project gallery workspace.
 *
 * Replaces gallery.js. Displays all ItemGroups as cards in an adaptive grid.
 * Drives the shell-level PromptBox via PromptBoxService — does NOT mount
 * MpiPromptBox itself. Running a generation creates a new ItemGroup.
 *
 * Props: (none — reads from state.currentProject)
 *
 * Does NOT emit (communicates via Events and PromptBoxService).
 */

import { ComponentFactory } from '../../factory.js';
import { MpiGalleryGrid } from '../../Compounds/MpiGalleryGrid/MpiGalleryGrid.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiCompareOverlay } from '../../Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { PromptBoxService } from '../../../shell/promptBoxService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { ce, qs } from '../../../utils/dom.js';
import { navigate, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../../../router.js';
import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
import { resolveActiveModel } from '../../../utils/modelHelpers.js';
import { truncateCardName } from '../../../utils/displayHelpers.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
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
                PromptBoxService.injectMedia({ url: uploaded.filePath, mediaType });
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

        // ── Selection bar (mounted in grid's footer slot) ────────────────────────
        const selectionSlot = qs('.mpi-gallery-grid__selectionbar-slot', grid.el);
        const selectionBar = MpiSelectionBar.mount(selectionSlot, { count: 0 });

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

        // ── Selection mode ──────────────────────────────────────────────────────

        const _selectedIds = new Set();
        let _selectionMode = false;

        grid.on('select', ({ group: g, selected }) => {
            if (selected) {
                _selectedIds.add(g.id);
                if (!_selectionMode) {
                    _selectionMode = true;
                    grid.el.setSelectionMode(true);
                    selectionSlot.style.display = '';
                    PromptBoxService.hide();
                }
            } else {
                _selectedIds.delete(g.id);
                if (_selectedIds.size === 0) {
                    _selectionMode = false;
                    grid.el.setSelectionMode(false);
                    selectionSlot.style.display = 'none';
                    PromptBoxService.show();
                }
            }
            selectionBar.el.setCount(_selectedIds.size);
        });

        // Selection bar event handlers
        selectionBar.on('cancel', () => {
            _selectedIds.clear();
            _selectionMode = false;
            grid.el.setSelectionMode(false);
            selectionSlot.style.display = 'none';
            PromptBoxService.show();
            grid.el.setGroups(state.currentProject?.itemGroups || []);
        });

        selectionBar.on('compare', () => {
            const selected = Array.from(_selectedIds)
                .map(id => state.currentProject?.itemGroups?.find(g => g.id === id))
                .filter(Boolean);
            if (selected.length === 2) {
                const itemA = getSelectedItem(selected[0]);
                const itemB = getSelectedItem(selected[1]);
                if (itemA && itemB) _compareOverlay.el.open(itemA, itemB);
            }
        });

        selectionBar.on('download', () => {
            const selected = Array.from(_selectedIds)
                .map(id => state.currentProject?.itemGroups?.find(g => g.id === id))
                .filter(Boolean);
            const items = selected.flatMap(g => {
                const sel = getSelectedItem(g);
                return sel ? [sel] : [];
            });
            downloadMediaFiles(state.currentProject, items);
        });

        selectionBar.on('delete', () => {
            const selected = Array.from(_selectedIds)
                .map(id => state.currentProject?.itemGroups?.find(g => g.id === id))
                .filter(Boolean);
            _pendingDeleteGroups = selected;
            _deleteDialog.el.show();
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
            for (const group of g) {
                _selectedIds.delete(group.id);
                grid.el.removeCard(group.id);
            }

            if (_selectedIds.size === 0) {
                _selectionMode = false;
                grid.el.setSelectionMode(false);
                selectionSlot.style.display = 'none';
                PromptBoxService.show();
            }
        });

        grid.on('delete', ({ groups: g }) => {
            _pendingDeleteGroups = g;
            _deleteDialog.el.show();
        });

        // ── PromptBox setup via PromptBoxService ────────────────────────────────
        const { model: activeModelInit, modelId: activeModelIdInit, installedModels: installedImageModels } = resolveActiveModel('image');
        let activeModelId = activeModelIdInit;
        let activeModel = activeModelInit;
        if (activeModelId) state.s_selectedModelId = activeModelId;

        let activeOperation = 't2i';
        let imageCount      = 0;
        let videoCount      = 0;

        function _wirePromptBox(pb) {
            if (!pb) return;

            pb.on('model-change', ({ model }) => {
                state.s_selectedModelId = model.id;
                activeModelId   = model.id;
                activeModel     = model;
                activeOperation = model.supportedOps[0];
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
                PromptBoxService.component?.updateContext({ imageCount, videoCount, hasMask: false });
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

        // (Re)mount the shell-level PromptBox with this workspace's config
        const promptBox = installedImageModels.length > 0
            ? PromptBoxService.mount({
                model:           activeModel,
                modelList:       installedImageModels,
                operation:       activeOperation,
                includeNegative: true,
            })
            : null;

        if (promptBox) {
            PromptBoxService.show();
            _wirePromptBox(promptBox);
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


        // ── Selection mode: show/hide shell PromptBox ───────────────────────────
        grid.on('selection-start', () => PromptBoxService.hide());
        grid.on('selection-end',   () => PromptBoxService.show());

        // ── Radial → operation sync ─────────────────────────────────────────────
        _unsubs.push(Events.on('workspace:set-operation', ({ operation }) => {
            activeOperation = operation;
            PromptBoxService.component?.setOperation(activeOperation);
        }));

        // ── Zero-installed check — emit models:open (shell handles the modal) ───
        if (installedImageModels.length === 0) Events.emit('models:open');

        _unsubs.push(Events.onState('s_installedModelIds', () => {
            const hasImageModels = getModelsByType('image').some(m => m.installed === true);
            if (!hasImageModels) {
                Events.emit('models:open');
            } else {
                Events.emit('models:all-installed');
            }
        }));

        // ── Post-install PromptBox remount ─────────────────────────────────────
        // If models are installed while the modal is open, promptBox will be null.
        // When the modal closes (models:closed), check if PromptBox needs to be mounted.
        _unsubs.push(Events.on('models:closed', () => {
            const currentModels = getModelsByType('image').filter(m => m.installed !== false);
            // Remount PromptBox if no component is mounted but models are available
            if (!PromptBoxService.component && currentModels.length > 0) {
                const newModel = currentModels.find(m => m.id === state.s_selectedModelId) || currentModels[0];
                activeModel = newModel;
                activeModelId = newModel.id;
                state.s_selectedModelId = newModel.id;
                const newPromptBox = PromptBoxService.mount({
                    model: newModel,
                    modelList: currentModels,
                    operation: activeOperation,
                    includeNegative: true,
                });

                _wirePromptBox(newPromptBox);
                PromptBoxService.show();
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
            selectionBar.destroy?.();
            _compareOverlay.destroy?.();
            _deleteDialog.destroy?.();
            _settingsOverlay.destroy?.();
        };
    },
});