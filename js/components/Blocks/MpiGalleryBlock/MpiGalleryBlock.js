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
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiCompareOverlay } from '../../Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { PromptBoxService } from '../../../shell/promptBoxService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { ce } from '../../../utils/dom.js';
import { navigate, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../../../router.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
import { refreshRadial } from '../../../shell/navigation.js';
import { runCommand } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { clientLogger } from '../../../services/clientLogger.js';
import {
    createImageItem,
    createVideoItem,
    createItemGroup,
    appendToHistory,
    addGroupToProject,
    getSelectedItem,
    removeGroupFromProject,
    updateGroupInProject,
} from '../../../data/projectModel.js';

export const MpiGalleryBlock = ComponentFactory.create({
    name: 'MpiGalleryBlock',
    css: ['js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.css'],

    template: () => `<div class="mpi-gallery-block"></div>`,

    setup: (el, props, emit) => {
        const groups = state.currentProject?.itemGroups || [];
        const grid   = MpiGalleryGrid.mount(el, { groups });

        // ── Selection bar (mounted in grid's footer slot) ────────────────────────
        const selectionSlot = grid.el.querySelector('.mpi-gallery-grid__selectionbar-slot');
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
        function _persistGroups() {
            if (!state.currentProject) return;

            // Serialize history as UUID strings only (per Plan B: history in project.json contains only IDs)
            // In-memory state.currentProject keeps full objects for components; this function serializes for persistence
            const toSave = {
                ...state.currentProject,
                itemGroups: state.currentProject.itemGroups.map(g => ({
                    id: g.id,
                    type: g.type,
                    name: g.name,
                    createdAt: g.createdAt,
                    selectedIndex: g.selectedIndex,
                    open: g.open,
                    favourite: g.favourite,
                    history: g.history.map(item => (typeof item === 'string' ? item : item.id)),
                })),
            };

            fetch('/update-project', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    folderPath: state.currentProject.folderPath,
                    updates:    { itemGroups: toSave.itemGroups },
                }),
            }).catch(err => clientLogger.warn('MpiGalleryBlock', 'update-project failed:', err));
        }

        // ── GC ──────────────────────────────────────────────────────────────────
        grid.on('gc-group', ({ group }) => {
            if (!state.currentProject) return;
            state.currentProject = updateGroupInProject(state.currentProject, group);
            _persistGroups();
        });
        grid.on('gc-remove', ({ groupId }) => {
            if (!state.currentProject) return;
            state.currentProject = removeGroupFromProject(state.currentProject, groupId);
            _persistGroups();
        });
        grid.on('favourite', ({ group }) => {
            if (!state.currentProject) return;
            state.currentProject = updateGroupInProject(state.currentProject, group);
            _persistGroups();
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
            const project = state.currentProject;
            if (!project) return;
            for (const group of selected) {
                const item = getSelectedItem(group);
                if (!item?.filePath) continue;
                let filename = null;
                try {
                    const match = item.filePath.match(/[?&]path=([^&]+)/);
                    if (match) {
                        const absPath = decodeURIComponent(match[1]);
                        filename = absPath.replace(/\\/g, '/').split('/').pop();
                    }
                } catch (_) { continue; }
                if (!filename) continue;
                const url = `/project-media/${project.id}/download/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
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
                grid.el.removeCard(g.id);
            } else {
                const pruned = removeHistoryEntry(g, missingIdx);
                const idx = state.currentProject?.itemGroups?.findIndex(x => x.id === g.id) || -1;
                if (idx !== -1) state.currentProject.itemGroups[idx] = pruned;
            }
        });

        // Generating card state
        let _generatingCardId = null;

        // ── Download ────────────────────────────────────────────────────────────
        grid.on('download', ({ groups: g }) => {
            const project = state.currentProject;
            if (!project) return;
            for (const group of g) {
                const item = getSelectedItem(group);
                if (!item?.filePath) continue;
                let filename = null;
                try {
                    const match = item.filePath.match(/[?&]path=([^&]+)/);
                    if (match) {
                        const absPath = decodeURIComponent(match[1]);
                        filename = absPath.replace(/\\/g, '/').split('/').pop();
                    }
                } catch (_) { continue; }
                if (!filename) continue;
                const url = `/project-media/${project.id}/download/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`;
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
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
                    let filename = null;
                    if (fp.includes('project-file')) {
                        try {
                            const match = fp.match(/[?&]path=([^&]+)/);
                            if (match) {
                                const absPath = decodeURIComponent(match[1]);
                                filename = absPath.replace(/\\/g, '/').split('/').pop();
                            }
                        } catch (_) { /* skip */ }
                    }
                    if (!filename) continue;
                    fetch(`/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`, {
                        method: 'DELETE',
                    }).catch(err => clientLogger.warn('MpiGalleryBlock', 'delete file failed:', err));
                }
            }

            let updated = project;
            for (const group of g) updated = removeGroupFromProject(updated, group.id);
            state.currentProject = updated;
            _persistGroups();
            for (const group of g) grid.el.removeCard(group.id);
        });

        grid.on('delete', ({ groups: g }) => {
            _pendingDeleteGroups = g;
            _deleteDialog.el.show();
        });

        // ── PromptBox setup via PromptBoxService ────────────────────────────────
        const installedImageModels = getModelsByType('image').filter(m => m.installed !== false);

        let activeModelId = state.s_selectedModelId
            ? (installedImageModels.find(m => m.id === state.s_selectedModelId)?.id ?? installedImageModels[0]?.id ?? null)
            : (installedImageModels[0]?.id ?? null);

        let activeModel = activeModelId
            ? (installedImageModels.find(m => m.id === activeModelId) || installedImageModels[0] || null)
            : (installedImageModels[0] || null);

        if (activeModelId) state.s_selectedModelId = activeModelId;

        let activeOperation = 't2i';
        let imageCount      = 0;
        let videoCount      = 0;
        let _activeExec     = null;

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
            // Ensure PromptBox is visible when block is created
            PromptBoxService.show();

            promptBox.on('model-change', ({ model }) => {
                state.s_selectedModelId = model.id;
                activeModelId   = model.id;
                activeModel     = model;
                activeOperation = model.supportedOps[0];
            });

            promptBox.on('operation-change', ({ operation }) => {
                activeOperation = operation;
            });

            promptBox.on('settings', () => {
                _settingsOverlay.el.open({ modelId: activeModel.id });
            });

            promptBox.on('media-change', ({ imageCount: ic, videoCount: vc }) => {
                imageCount = ic;
                videoCount = vc;
                PromptBoxService.component?.updateContext({ imageCount, videoCount, hasMask: false });
                refreshRadial({ imageCount, videoCount });
            });

            // ── media:imported listener (declared outer-scope so both observers can clean it up)
            let _unsubMediaImported = null;

            // When media is dropped into the prompt box it is immediately uploaded
            // to the project folder and a history card is created — no need to wait
            // for the generate button.
            _unsubMediaImported = Events.on('media:imported', ({ url, filename, mediaType }) => {
                if (!state.currentProject) return;

                const isVideo = mediaType === 'video';
                // Derive display name from filename or use a default
                const displayName = filename
                    ? filename.replace(/\.[^.]+$/, '')
                    : (isVideo ? 'Imported Video' : 'Imported Image');

                const item = isVideo
                    ? createVideoItem({ filePath: url, uploaded: true, operation: 'imported' })
                    : createImageItem({ filePath: url, uploaded: true, operation: 'imported' });

                const group = createItemGroup(mediaType, { name: displayName });
                const finalGroup = appendToHistory(group, item);

                const currentGroups = state.currentProject?.itemGroups || [];
                state.currentProject = addGroupToProject(state.currentProject, finalGroup);
                _persistGroups();

                // Prepend the new group to the visible grid and re-render.
                // Note: currentGroups is captured BEFORE addGroupToProject so it does
                // NOT contain finalGroup — only [old..., old] which is correct.
                grid.el.setGroups([finalGroup, ...currentGroups]);
            });

            // Clean up the Events subscription when this block leaves the DOM.
            // NOTE: MutationObserver on document.body does NOT fire for
            // _toolContainer.innerHTML = '' because _toolContainer is not a direct
            // child of document.body (grandchild). Using state:changed as the
            // reliable cleanup trigger instead.
            const _unsubPageChange = Events.on('state:changed', ({ key, value }) => {
                if (key === 'currentPage' && value !== PAGE_GALLERY) {
                    _unsubMediaImported?.();
                    _unsubPageChange();
                }
            });

            promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
                if (!activeModel) return;

                const tempId   = crypto.randomUUID();
                const cardType = activeModel.mediaType;

                // Capture current groups BEFORE creating placeholder
                const currentGroups = state.currentProject?.itemGroups || [];

                // Create placeholder group with isGenerating flag
                // Use actual generation dimensions from ComfyUI injection
                // Grid scales these proportionally based on _cardWidth (slider)
                const placeholderGroup = {
                    id: tempId,
                    type: cardType,
                    name: 'Generating...',
                    history: [],
                    selectedIndex: 0,
                    width: injectionParams.Width || 1024,
                    height: injectionParams.Height || 1024,
                    isGenerating: true,  // ← FLAG for grid to detect
                };

                // Tell grid: display this group + all current groups
                grid.el.setGroups([placeholderGroup, ...currentGroups]);

                // Track generating card state
                _generatingCardId = tempId;
                StatusBar.progress.start('Generating...');

                // ... rest of generation logic (unchanged)
                _activeExec = runCommand({
                    operation,
                    modelId:  activeModel.id,
                    positive,
                    negative,
                    mediaItems,
                    injectionParams,
                });
                const exec = _activeExec;

                exec.onPreview = (url) => grid.el.updatePreview(tempId, url);
                exec.onProgress = (value) => StatusBar.progress.update(value);

                exec.onComplete = async (urls) => {
                    _activeExec = null;
                    PromptBoxService.component?.setGenerating(false);

                    if (!urls.length) {
                        StatusBar.progress.cancel();
                        grid.el.setGroups(currentGroups);  // Remove placeholder
                        return;
                    }

                    let filePath    = urls[0];
                    let displayName = operation;

                    if (state.currentProject?.folderPath) {
                        try {
                            const itemId = crypto.randomUUID();
                            const res = await fetch('/project/save-generation', {
                                method:  'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body:    JSON.stringify({
                                    folderPath:   state.currentProject.folderPath,
                                    comfyViewUrl: urls[0],
                                    itemId,
                                    operation,
                                    meta: {
                                        prompt:         positive,
                                        negativePrompt: negative,
                                        modelId:        activeModel.id,
                                    },
                                    pixelDimensions: { w: 0, h: 0 },
                                }),
                            });
                            if (!res.ok) throw new Error(`save-generation returned ${res.status}`);
                            const data = await res.json();
                            if (data.success) {
                                filePath    = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                                displayName = data.filename.replace(/\.[^.]+$/, '');
                            }
                        } catch (err) {
                            clientLogger.warn('MpiGalleryBlock', 'save-generation failed, using comfy URL:', err);
                        }
                    }

                    const cardName = displayName.length > 28
                        ? displayName.slice(0, 27) + '…'
                        : displayName;

                    const item = createImageItem({
                        filePath,
                        modelId:        activeModel.id,
                        operation,
                        prompt:         positive,
                        negativePrompt: negative,
                    });

                    let group = createItemGroup(cardType, { name: cardName });
                    group = appendToHistory(group, item);

                    if (state.currentProject) {
                        state.currentProject = addGroupToProject(state.currentProject, group);
                        _persistGroups();
                    }

                    StatusBar.progress.complete('Image generated!');
                    grid.el.setGroups([group, ...currentGroups]);  // Replace placeholder with final
                };

                exec.onError = (err) => {
                    _activeExec = null;
                    clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
                    PromptBoxService.component?.setGenerating(false);
                    StatusBar.progress.cancel();
                    grid.el.setGroups(currentGroups);  // Remove placeholder
                };
            });

            promptBox.on('cancel', () => {
                _activeExec?.cancel();
                _activeExec = null;
                StatusBar.progress.cancel();
            });
        }

        // ── Selection mode: show/hide shell PromptBox ───────────────────────────
        grid.on('selection-start', () => PromptBoxService.hide());
        grid.on('selection-end',   () => PromptBoxService.show());

        // ── Radial → operation sync ─────────────────────────────────────────────
        const _unsubSetOp = Events.on('workspace:set-operation', ({ operation }) => {
            activeOperation = operation;
            PromptBoxService.component?.setOperation(activeOperation);
        });

        // ── Zero-installed check — emit models:open (shell handles the modal) ───
        if (installedImageModels.length === 0) Events.emit('models:open');

        const _unsubZeroInstalled = Events.on('state:changed', ({ key }) => {
            if (key !== 's_installedModelIds') return;
            const hasImageModels = getModelsByType('image').some(m => m.installed === true);
            if (!hasImageModels) Events.emit('models:open');
        });

        // ── Post-install PromptBox remount ─────────────────────────────────────
        // If models are installed while the modal is open, promptBox will be null.
        // When the modal closes (models:closed), check if PromptBox needs to be mounted.
        const _unsubModelsClosed = Events.on('models:closed', () => {
            const currentModels = getModelsByType('image').filter(m => m.installed !== false);
            // Remount PromptBox if no component is mounted but models are available
            if (!PromptBoxService.component && currentModels.length > 0) {
                const newModel = currentModels[0];
                const newPromptBox = PromptBoxService.mount({
                    model: newModel,
                    modelList: currentModels,
                    operation: activeOperation,
                    includeNegative: true,
                });

                if (newPromptBox) {
                    // Wire the essential event listeners that were skipped during initial setup
                    newPromptBox.on('model-change', ({ model }) => {
                        state.s_selectedModelId = model.id;
                        activeModelId = model.id;
                        activeModel = model;
                        activeOperation = model.supportedOps[0];
                    });

                    newPromptBox.on('operation-change', ({ operation }) => {
                        activeOperation = operation;
                    });

                    newPromptBox.on('settings', () => {
                        _settingsOverlay.el.open({ modelId: activeModel.id });
                    });

                    newPromptBox.on('media-change', ({ imageCount: ic, videoCount: vc }) => {
                        imageCount = ic;
                        videoCount = vc;
                        PromptBoxService.component?.updateContext({ imageCount, videoCount, hasMask: false });
                        refreshRadial({ imageCount, videoCount });
                    });

                    // Wire the run handler — this is critical for generation to work
                    newPromptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
                        if (!activeModel) return;

                        const tempId   = crypto.randomUUID();
                        const cardType = activeModel.mediaType;
                        const currentGroups = state.currentProject?.itemGroups || [];

                        const placeholderGroup = {
                            id: tempId,
                            type: cardType,
                            name: 'Generating...',
                            history: [],
                            selectedIndex: 0,
                            width: injectionParams.Width || 1024,
                            height: injectionParams.Height || 1024,
                            isGenerating: true,
                        };

                        grid.el.setGroups([placeholderGroup, ...currentGroups]);
                        _generatingCardId = tempId;
                        StatusBar.progress.start('Generating...');

                        _activeExec = runCommand({
                            operation,
                            modelId:  activeModel.id,
                            positive,
                            negative,
                            mediaItems,
                            injectionParams,
                        });
                        const exec = _activeExec;

                        exec.onPreview = (url) => grid.el.updatePreview(tempId, url);
                        exec.onProgress = (value) => StatusBar.progress.update(value);

                        exec.onComplete = async (urls) => {
                            _activeExec = null;
                            PromptBoxService.component?.setGenerating(false);

                            if (!urls.length) {
                                StatusBar.progress.cancel();
                                grid.el.setGroups(currentGroups);
                                return;
                            }

                            let filePath    = urls[0];
                            let displayName = operation;

                            if (state.currentProject?.folderPath) {
                                try {
                                    const res = await fetch('/project/save-generation', {
                                        method:  'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body:    JSON.stringify({
                                            folderPath:   state.currentProject.folderPath,
                                            comfyViewUrl: urls[0],
                                            itemId: crypto.randomUUID(),
                                            operation,
                                            meta: {
                                                prompt:         positive,
                                                negativePrompt: negative,
                                                modelId:        activeModel.id,
                                            },
                                            pixelDimensions: { w: 0, h: 0 },
                                        }),
                                    });
                                    if (!res.ok) throw new Error(`save-generation returned ${res.status}`);
                                    const data = await res.json();
                                    if (data.success) {
                                        filePath    = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                                        displayName = data.filename.replace(/\.[^.]+$/, '');
                                    }
                                } catch (err) {
                                    clientLogger.warn('MpiGalleryBlock', 'save-generation failed, using comfy URL:', err);
                                }
                            }

                            const cardName = displayName.length > 28
                                ? displayName.slice(0, 27) + '…'
                                : displayName;

                            const item = createImageItem({
                                filePath,
                                modelId:        activeModel.id,
                                operation,
                                prompt:         positive,
                                negativePrompt: negative,
                            });

                            let group = createItemGroup(cardType, { name: cardName });
                            group = appendToHistory(group, item);

                            if (state.currentProject) {
                                state.currentProject = addGroupToProject(state.currentProject, group);
                                _persistGroups();
                            }

                            StatusBar.progress.complete('Image generated!');
                            grid.el.setGroups([group, ...currentGroups]);
                        };

                        exec.onError = (err) => {
                            _activeExec = null;
                            clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
                            PromptBoxService.component?.setGenerating(false);
                            StatusBar.progress.cancel();
                            grid.el.setGroups(currentGroups);
                        };
                    });

                    newPromptBox.on('cancel', () => {
                        _activeExec?.cancel();
                        _activeExec = null;
                        StatusBar.progress.cancel();
                    });
                }

                PromptBoxService.show();
            }
        });

        // ── Cleanup when block leaves the gallery workspace ────────────────────
        // Using state:changed instead of MutationObserver because the observer
        // does not fire for _toolContainer.innerHTML = '' (grandchild mutation).
        const _unsubPageChange2 = Events.on('state:changed', ({ key, value }) => {
            if (key === 'currentPage' && value !== PAGE_GALLERY) {
                _unsubSetOp?.();
                _unsubZeroInstalled?.();
                _unsubModelsClosed?.();
                _unsubPageChange2();
            }
        });
    },
});