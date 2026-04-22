/**
 * MpiGroupHistoryBlock — Block: group history workspace coordinator.
 *
 * Thin coordinator. Mounts MpiHistoryTools, MpiCanvasViewer, MpiHistoryList,
 * and configures the shell-level PromptBox via PromptBoxService.
 *
 * @param {string} groupId - ID of the ItemGroup to display (from router params)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiHistoryTools } from '../../Compounds/MpiHistoryTools/MpiHistoryTools.js';
import { MpiCanvasViewer } from '../../Compounds/MpiCanvasViewer/MpiCanvasViewer.js';
import { MpiVideoViewer } from '../../Compounds/MpiVideoViewer/MpiVideoViewer.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiHistoryList } from '../../Compounds/MpiHistoryList/MpiHistoryList.js';
import { PromptBoxService } from '../../../shell/promptBoxService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { navigate, PAGE_GALLERY } from '../../../router.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands, getToolCommands } from '../../../data/commandRegistry.js';
import { startGeneration } from '../../../services/generationService.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
import { resolveActiveModel } from '../../../utils/modelHelpers.js';
import { updateGroup, persistGroups } from '../../../services/projectService.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    removeHistoryEntry,
} from '../../../data/projectModel.js';
import { MpiModelsModal } from '../MpiModelsModal/MpiModelsModal.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';

export const MpiGroupHistoryBlock = ComponentFactory.create({
    name: 'MpiGroupHistoryBlock',
    css: ['js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.css'],

    template: () => `
        <div class="mpi-group-history-block">
            <div class="mpi-group-history-block__left"   id="left-slot"></div>
            <div class="mpi-group-history-block__centre" id="centre-slot"></div>
            <div class="mpi-group-history-block__right"  id="right-slot"></div>
            <div class="mpi-group-history-block__bottom"  id="bottom-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Cleanup array ─────────────────────────────────────────────────────
        const _unsubs = [];

        // ── Resolve group ─────────────────────────────────────────────────────

        let _group = state.currentProject?.itemGroups?.find(g => g.id === props.groupId);

        if (!_group) {
            el.innerHTML = `<p class="mpi-group-history-block__error">Group not found. <button class="mpi-group-history-block__back">Back to gallery</button></p>`;
            el.querySelector('.mpi-group-history-block__back')
                ?.addEventListener('click', () => navigate(PAGE_GALLERY));
            return;
        }

        // ── Context helpers ──────────────────────────────────────────────────

        const isVideo = _group.type === 'video';
        const { model: activeModelInit, modelId: activeModelIdInit, installedModels } = resolveActiveModel(isVideo ? 'video' : 'image');
        let activeModelId = activeModelIdInit;
        let activeModel = activeModelInit;
        if (activeModelId) state.s_selectedModelId = activeModelId;

        // groupHistory always has an input image/video available
        const _baseCtx = isVideo
            ? { imageCount: 0, videoCount: 1 }
            : { imageCount: 1, videoCount: 0 };

        function _opOptions(ctx = _baseCtx) {
            if (!activeModel) return [];
            const maskCtx = { ..._baseCtx, hasMask: _canvasHasMask };
            return getAvailableCommands(activeModel.mediaType, activeModel, { ...maskCtx, ...ctx })
                .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
        }

        function _refreshOpOptions() {
            const opts = _opOptions();
            // Sync full context
            PromptBoxService.component?.updateContext({
                ..._baseCtx,
                hasMask: _canvasHasMask,
                filterNoInputOps: true,
            });
            const currentStillOk = opts.find(o => o.value === activeOperation && !o.disabled);
            if (!currentStillOk) {
                const fallback = opts.find(o => !o.disabled);
                if (fallback) {
                    activeOperation = fallback.value;
                }
                PromptBoxService.component?.setOperation(activeOperation);
            }
        }

        let _canvasHasMask = false;

        // Default to first available operation (not t2i — groupHistory always has an input)
        const _firstAvailable = _opOptions().find(o => !o.disabled);
        let activeOperation = isVideo ? 't2v' : (_firstAvailable?.value ?? 'upscale');
        let _currentIdx = _group.selectedIndex ?? 0;
        let _currentSelectionIndices = [];

        // ── Persist helper ───────────────────────────────────────────────────

        function _persistGroup() {
            if (!state.currentProject) return;
            updateGroup(_group);
            Events.emit('media:updated', { projectId: state.currentProject.id });
        }

        // ── Bottom bar state coordinator ──────────────────────────────────────

        function _setBottomBar(barState) {
            if (barState === 'promptbox') {
                PromptBoxService.show();
                selectionBar.el.style.display = 'none';
            } else if (barState === 'selection') {
                PromptBoxService.hide();
                selectionBar.el.style.display = '';
            } else if (barState === 'canvas-tool') {
                PromptBoxService.hide();
                selectionBar.el.style.display = 'none';
            }
        }

        // ── Mount sub-components ──────────────────────────────────────────────

        const bottomSlot = el.querySelector('#bottom-slot');

        const _universalToolIcons = {
            autoMaskImg: { icon: 'enhance', info: 'Auto Mask' },
            interpolate: { icon: 'film', info: 'Interpolate' },
            videoUpscale: { icon: 'rocket', info: 'Video Upscale' },
        };

        const _universalTools = getToolCommands('image')
            .filter(c => ['autoMaskImg', 'interpolate', 'videoUpscale'].includes(c.key))
            .map(({ key, label }) => ({
                mode: key,
                icon: _universalToolIcons[key]?.icon ?? 'settings',
                info: _universalToolIcons[key]?.info ?? label,
            }));

        // Build tools array based on group type
        const _toolsForGroup = isVideo
            ? [{ mode: 'crop', icon: 'crop', info: 'Crop' }]
            : [
                { mode: 'crop', icon: 'crop', info: 'Crop' },
                { mode: 'mask', icon: 'edit', info: 'Draw Mask' },
                ..._universalTools,
            ];

        const historyTools = MpiHistoryTools.mount(el.querySelector('#left-slot'), {
            tools: _toolsForGroup,
        });

        const selectionBar = MpiSelectionBar.mount(bottomSlot, { count: 0 });

        // Hide selection bar for video groups (selection/compare is image-only)
        if (isVideo) {
            selectionBar.el.style.display = 'none';
        }

        // Mount viewer based on group type (video or canvas/image)
        let viewer = null;
        if (isVideo) {
            viewer = MpiVideoViewer.mount(el.querySelector('#centre-slot'), {
                fps: 24,
                controls: true,
            });
        } else {
            viewer = MpiCanvasViewer.mount(el.querySelector('#centre-slot'), {
                initialImageUrl: resolveMediaUrl(_group.history[_currentIdx]?.filePath),
                initialIdx: _currentIdx,
                barContainer: bottomSlot,
            });
        }

        // Alias for backwards compatibility and generic handling
        const canvasViewer = viewer;

        const historyList = MpiHistoryList.mount(el.querySelector('#right-slot'), {
            history: _group.history,
            selectedIndex: _currentIdx,
        });

        // Load initial entry
        if (isVideo) {
            const currentItem = _group.history[_currentIdx];
            if (currentItem?.filePath) {
                const videoMeta = {
                    fps: currentItem.fps || _group.fps || 24,
                    duration: currentItem.duration,
                    frameCount: currentItem.frameCount,
                    hasAudio: currentItem.hasAudio,
                };
                canvasViewer.el.loadVideo(resolveMediaUrl(currentItem.filePath), videoMeta);
            }
        } else {
            canvasViewer.el.loadEntry(_group.history[_currentIdx], _currentIdx);
        }

        // ── Active generation registry ─────────────────────────────────────────
        // Track which registry entry IDs belong to this group instance.
        const _myGenIds = new Set();

        // Rehydrate from any in-flight generation for this group.
        for (const entry of activeGenerations.listFor('groupHistory', _group.id)) {
            if (entry.status !== 'running') continue;
            _myGenIds.add(entry.id);
            canvasViewer.el.setGenerating(true);
            if (entry.latestPreviewUrl) {
                canvasViewer.el.setGenerating(false);
                if (isVideo) {
                    // For video, don't try isComparisonMode or setMaskHidden
                    const videoMeta = {
                        fps: _group.fps || 24,
                    };
                    canvasViewer.el.loadVideo(entry.latestPreviewUrl, videoMeta).catch(() => {});
                } else {
                    canvasViewer.el.isComparisonMode = false;
                    if (entry.latestPreviewUrl.startsWith('blob:')) canvasViewer.el.setMaskHidden(true);
                    canvasViewer.el.loadEntry({ filePath: entry.latestPreviewUrl }, _currentIdx).catch(() => {});
                }
            }
        }

        _unsubs.push(Events.on('generation:started', ({ id, scope, groupId }) => {
            if (scope === 'groupHistory' && groupId === _group.id) {
                _myGenIds.add(id);
                canvasViewer.el.setGenerating(true);
            }
        }));

        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myGenIds.has(id)) return;
            canvasViewer.el.setGenerating(false);
            if (isVideo) {
                // For video, just load the preview URL
                const videoMeta = { fps: _group.fps || 24 };
                canvasViewer.el.loadVideo(url, videoMeta).catch(() => {});
            } else {
                canvasViewer.el.isComparisonMode = false;
                if (url?.startsWith('blob:')) canvasViewer.el.setMaskHidden(true);
                canvasViewer.el.loadEntry({ filePath: url }, _currentIdx).catch(() => {});
            }
        }));

        _unsubs.push(Events.on('generation:complete', ({ id, item, group }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            canvasViewer.el.setGenerating(false);
            if (isVideo) {
                canvasViewer.el.exitCropMode?.();
            } else {
                canvasViewer.el.exitMode?.();
            }
            _canvasHasMask = false;
            _refreshOpOptions();
            _group = group;
            _currentIdx = _group.selectedIndex;
            historyList.el.appendEntry(item);
            if (isVideo) {
                const videoMeta = {
                    fps: item.fps || _group.fps || 24,
                    duration: item.duration,
                    frameCount: item.frameCount,
                    hasAudio: item.hasAudio,
                };
                canvasViewer.el.loadVideo(resolveMediaUrl(item.filePath), videoMeta);
            } else {
                canvasViewer.el.loadEntry(item, _currentIdx);
                canvasViewer.el.setMaskHidden(false);
            }
        }));

        _unsubs.push(Events.on('generation:error', ({ id }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            canvasViewer.el.setGenerating(false);
        }));

        _unsubs.push(Events.on('generation:cancelled', ({ id }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            canvasViewer.el.setGenerating(false);
        }));

        // ── OS-file drop overlay ───────────────────────────────────────────────
        const _dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
            onDrop: async ({ file, mediaType }) => {
                const project = state.currentProject;
                if (!project?.folderPath || !project?.id) {
                    clientLogger.warn('MpiGroupHistoryBlock', 'No current project on drop');
                    return;
                }
                const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
                if (uploaded) {
                    PromptBoxService.injectMedia({ url: uploaded.filePath, mediaType });
                }
            },
        });
        el.appendChild(_dropOverlay.el);

        let _histDragCounter = 0;
        const _isFileDrag = (e) =>
            e.dataTransfer?.types?.includes('Files') &&
            !e.dataTransfer.types.includes('application/mpi-media');

        const _onHistDragEnter = (e) => {
            if (!_isFileDrag(e)) return;
            if (!state.currentProject) return;
            _histDragCounter++;
            _dropOverlay.el.show();
        };
        const _onHistDragLeave = (e) => {
            if (!_isFileDrag(e)) return;
            if (_histDragCounter > 0 && --_histDragCounter === 0) _dropOverlay.el.hide();
        };
        const _onHistDrop = () => {
            _histDragCounter = 0;
            _dropOverlay.el.hide();
        };
        const _onHistDragOver = (e) => { if (_isFileDrag(e)) e.preventDefault(); };

        window.addEventListener('dragenter', _onHistDragEnter);
        window.addEventListener('dragleave', _onHistDragLeave);
        window.addEventListener('dragover',  _onHistDragOver);
        window.addEventListener('drop',      _onHistDrop);

        // ── PromptBox via PromptBoxService ────────────────────────────────────

        const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));

        if (activeModel) {
            const promptBox = PromptBoxService.mount({
                model: activeModel,
                modelList: installedModels,
                operation: activeOperation,
                includeNegative: true,
            });

            if (promptBox) {
                // Set initial context
                PromptBoxService.component?.updateContext({
                    ..._baseCtx,
                    hasMask: false,
                    filterNoInputOps: true,
                });

                _unsubs.push(promptBox.on('settings', () => {
                    _settingsOverlay.el.open({ modelId: activeModel.id });
                }));

                _unsubs.push(promptBox.on('model-change', ({ model }) => {
                    state.s_selectedModelId = model.id;
                    activeModelId = model.id;
                    activeModel = model;
                    PromptBoxService.component?.setModel(model);
                    _refreshOpOptions();
                }));

                _unsubs.push(promptBox.on('operation-change', ({ operation }) => {
                    activeOperation = operation;
                }));

                _unsubs.push(promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams }) => {
                    const maskDataUrl = canvasViewer.el.hasMask()
                        ? canvasViewer.el.getCurrentMaskDataURL()
                        : null;
                    _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl, injectionParams });
                }));

                _unsubs.push(promptBox.on('cancel', () => {
                    _activeExec?.cancel();
                    _activeExec = null;
                    Events.emit('tool:cancelled', { tool: 'groupHistory' });
                }));

                // Initialize bottom bar to show prompt box
                _setBottomBar('promptbox');
            }
        }

        // ── Generation ───────────────────────────────────────────────────────

        let _activeExec = null;

        function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
            if (!activeModel) return;

            canvasViewer.el.setGenerating(true);

            // Always inject current selected history entry as input
            const currentItem = _group.history[_currentIdx];
            const hasDroppedImage = mediaItems.some(m => m.mediaType === 'image');
            const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
                ? [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
                : mediaItems;

            _activeExec = startGeneration(
                { operation, model: activeModel, positive, negative, mediaItems: resolvedMedia, maskDataUrl, injectionParams },
                {
                    onCancel: () => { _activeExec = null; },
                },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
        }

        // ── Wire sub-component events ─────────────────────────────────────────

        historyTools.on('activate', ({ mode }) => {
            // Exit selection mode when a tool is activated
            if (_currentSelectionIndices.length > 0) {
                historyList.el.exitSelectMode();
            }
            if (isVideo) {
                // For video, only crop mode is supported for now
                if (mode === 'crop') {
                    canvasViewer.el.enterCropMode();
                }
            } else {
                canvasViewer.el.enterMode(mode);
            }
        });
        historyTools.on('deactivate', ({ mode }) => {
            if (isVideo) {
                // For video, exit crop mode
                if (mode === 'crop') {
                    canvasViewer.el.exitCropMode();
                }
            } else {
                canvasViewer.el.exitMode();
            }
        });

        historyList.on('entry-selected', ({ idx, item }) => {
            if (isVideo) {
                const videoMeta = {
                    fps: item.fps || _group.fps || 24,
                    duration: item.duration,
                    frameCount: item.frameCount,
                    hasAudio: item.hasAudio,
                };
                canvasViewer.el.loadVideo(resolveMediaUrl(item.filePath), videoMeta);
            } else {
                canvasViewer.el.loadEntry(item, idx);
                canvasViewer.el.setMaskHidden(false);
            }
            _currentIdx = idx;
            _group = promoteHistoryEntry(_group, idx);
            _persistGroup();
        });

        historyList.on('selection-changed', ({ indices }) => {
            _currentSelectionIndices = indices;
            canvasViewer.el.exitMode();
            selectionBar.el.setCount(indices.length);
            _setBottomBar('selection');
        });

        historyList.on('selection-exited', () => {
            canvasViewer.el.clearCompare();
            _setBottomBar('promptbox');
        });

        selectionBar.on('compare', () => {
            if (_currentSelectionIndices.length !== 2) return;
            const [idxA, idxB] = _currentSelectionIndices;
            canvasViewer.el.loadCompare(_group.history[idxA], _group.history[idxB]);
            canvasViewer.el.setMaskHidden(false);
        });

        selectionBar.on('download', () => {
            const project = state.currentProject;
            if (!project) return;
            const items = _currentSelectionIndices.map(idx => _group.history[idx]).filter(Boolean);
            downloadMediaFiles(project, items);
        });

        selectionBar.on('cancel', () => {
            historyList.el.exitSelectMode();
            canvasViewer.el.clearCompare();
            _setBottomBar('promptbox');
        });

        selectionBar.on('delete', () => {
            if (!_currentSelectionIndices.length) return;
            historyList.el.exitSelectMode();
            const sorted = [..._currentSelectionIndices].sort((a, b) => b - a);

            // Delete media files and .meta/ sidecars for each selected item
            const project = state.currentProject;
            if (project?.folderPath) {
                for (const idx of sorted) {
                    const item = _group.history[idx];
                    if (!item) continue;
                    const filename = extractFilenameFromPath(item.filePath);
                    if (filename) {
                        fetch(
                            `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`,
                            { method: 'DELETE' }
                        ).catch(err => clientLogger.warn('MpiGroupHistoryBlock', 'delete media failed:', err));
                    }
                }
            }

            for (const idx of sorted) {
                _group = removeHistoryEntry(_group, idx);
            }
            _currentIdx = _group.selectedIndex;
            _persistGroup();
            historyList.el.removeEntries(_currentSelectionIndices);
            if (_group.history[_currentIdx]) {
                canvasViewer.el.loadEntry(_group.history[_currentIdx], _currentIdx);
            }
        });

        // Only set up mode-changed for canvas viewer (video viewer doesn't emit this)
        if (!isVideo) {
            canvasViewer.on('mode-changed', ({ mode }) => {
                // Map canonical 'automask' back to 'autoMaskImg' for historyTools
                const toolMode = mode === 'automask' ? 'autoMaskImg' : mode;
                historyTools.el.syncMode(toolMode);

                // Don't change bottom bar state if in comparison mode — comparison
                // is an overlay that shouldn't affect selection bar visibility
                if (canvasViewer.el.canvas?.isComparisonMode) return;

                if (mode === 'none') {
                    _setBottomBar('promptbox');
                } else {
                    _setBottomBar('canvas-tool');
                }
            });
        }

        // Only set up crop-applied for canvas viewer
        if (!isVideo) {
            canvasViewer.on('crop-applied', ({ item }) => {
                _group = appendToHistory(_group, item);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(item);
                canvasViewer.el.loadEntry(item, _currentIdx);
                canvasViewer.el.setMaskHidden(false);
            });
        }

        // Only set up entry-loaded for canvas viewer (video viewer doesn't emit this)
        if (!isVideo) {
            canvasViewer.on('entry-loaded', ({ idx, hasMask }) => {
                _currentIdx = idx;
                _canvasHasMask = hasMask;
                PromptBoxService.component?.updateContext({
                    ..._baseCtx,
                    hasMask: _canvasHasMask,
                    filterNoInputOps: true,
                });
            });
        }

        // Only set up mask events for canvas viewer
        if (!isVideo) {
            canvasViewer.on('mask-ready', ({ hasMask }) => {
                _canvasHasMask = true;
                _refreshOpOptions();
            });

            canvasViewer.on('mask-clear', () => {
                _canvasHasMask = false;
                _refreshOpOptions();
            });
        }

        // ── Radial → operation sync ───────────────────────────────────────────

        _unsubs.push(Events.on('workspace:set-operation', ({ operation }) => {
            if (!PromptBoxService.component) return;
            const opts = _opOptions();
            const match = opts.find(o => o.value === operation && !o.disabled);
            if (match) {
                activeOperation = operation;
                PromptBoxService.component?.setOperation(activeOperation);
            }
        }));

        // ── State model change subscription ────────────────────────────────────

        const _onStateModelChange = (value) => {
            if (!value || value === activeModelId) return;
            const newModel = installedModels.find(m => m.id === value);
            if (newModel && newModel !== activeModel) {
                activeModelId = value;
                activeModel = newModel;
                PromptBoxService.component?.setModel(newModel);
                _refreshOpOptions();
            }
        };
        _unsubs.push(Events.onState('s_selectedModelId', _onStateModelChange));

        // ── Zero-installed state modal ────────────────────────────────────────

        const _modelsModal = MpiModelsModal.mount(document.createElement('div'), {
            icon: 'download',
            title: 'Model Manager',
            text: 'Select a model pack to install. Required files will be fetched automatically.',
            footer: 'Models are stored locally and never shared.',
            closable: true,
        });
        _modelsModal.el.hide();

        const _hasInstalledImageModels = () => getModelsByType('image').some(m => m.installed === true);

        const _onZeroInstalled = () => {
            if (!_hasInstalledImageModels()) _modelsModal.el.show();
        };
        _unsubs.push(Events.onState('s_installedModelIds', _onZeroInstalled));
        _unsubs.push(Events.on('models:all-installed', () => _modelsModal.el.hide()));

        if (!_hasInstalledImageModels()) _modelsModal.el.show();

        // ── Cleanup ───────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            window.removeEventListener('dragenter', _onHistDragEnter);
            window.removeEventListener('dragleave', _onHistDragLeave);
            window.removeEventListener('dragover',  _onHistDragOver);
            window.removeEventListener('drop',      _onHistDrop);
            _dropOverlay.el.destroy?.();
            _dropOverlay.el.remove();
            canvasViewer.destroy?.();
            canvasViewer.el.destroy?.();
            historyList.destroy?.();
            historyTools.destroy?.();
            selectionBar.destroy?.();
            _modelsModal.destroy?.();
            _settingsOverlay.destroy?.();
        };
    },
});
