/**
 * MpiGroupHistoryBlock — Block: group history workspace coordinator.
 *
 * Thin coordinator. Mounts MpiHistoryTools, viewer (canvas or video), MpiHistoryList,
 * and configures the shell-level PromptBox via PromptBoxService.
 *
 * @param {string} groupId - ID of the ItemGroup to display (from router params)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiHistoryTools } from '../../Compounds/MpiHistoryTools/MpiHistoryTools.js';
import { MpiCanvasViewer } from '../../Organisms/MpiCanvasViewer/MpiCanvasViewer.js';
import { MpiVideoViewer } from '../../Organisms/MpiVideoViewer/MpiVideoViewer.js';
import { MpiSelectionBar } from '../../Compounds/MpiSelectionBar/MpiSelectionBar.js';
import { MpiHistoryList } from '../../Compounds/MpiHistoryList/MpiHistoryList.js';
import { MpiToolActionBar } from '../../Compounds/MpiToolActionBar/MpiToolActionBar.js';
import { MpiRatioSelector } from '../../Compounds/MpiRatioSelector/MpiRatioSelector.js';
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
import { updateGroup, persistGroups, addGroup } from '../../../services/projectService.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    removeHistoryEntry,
    createImageItem,
    createItemGroup,
} from '../../../data/projectModel.js';
import { MpiModelsModal } from '../MpiModelsModal/MpiModelsModal.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';
import { SOCIAL_RATIOS } from '../../../utils/ratios.js';
import { imageStrategy } from './strategies/imageStrategy.js';
import { videoStrategy } from './strategies/videoStrategy.js';

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

        // ── Strategy pick ─────────────────────────────────────────────────────

        const _universalToolIcons = {
            autoMaskImg: { icon: 'enhance', info: 'Auto Mask' },
            interpolate: { icon: 'film',    info: 'Interpolate' },
            videoUpscale: { icon: 'rocket', info: 'Video Upscale' },
        };

        const strategy = (_group.type === 'video')
            ? videoStrategy({ group: _group, tools: { _universalToolIcons, getToolCommands } })
            : imageStrategy({ group: _group, tools: { _universalToolIcons, getToolCommands } });

        // ── Context helpers ──────────────────────────────────────────────────

        const { model: activeModelInit, modelId: activeModelIdInit, installedModels } = resolveActiveModel(
            strategy.supportsPromptBox() ? 'image' : 'video'
        );
        let activeModelId = activeModelIdInit;
        let activeModel = activeModelInit;
        if (activeModelId) state.s_selectedModelId = activeModelId;

        const _baseCtx = strategy.supportsPromptBox()
            ? { imageCount: 1, videoCount: 0 }
            : { imageCount: 0, videoCount: 1 };

        function _opOptions(ctx = _baseCtx) {
            if (!activeModel) return [];
            const maskCtx = { ..._baseCtx, hasMask: _canvasHasMask };
            return getAvailableCommands(activeModel.mediaType, activeModel, { ...maskCtx, ...ctx })
                .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
        }

        function _refreshOpOptions() {
            const opts = _opOptions();
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

        const _firstAvailable = _opOptions().find(o => !o.disabled);
        let activeOperation = strategy.supportsPromptBox()
            ? (_firstAvailable?.value ?? 'upscale')
            : 't2v';
        let _currentIdx = _group.selectedIndex ?? 0;
        let _currentSelectionIndices = [];

        // ── Persist helper ───────────────────────────────────────────────────

        function _persistGroup() {
            if (!state.currentProject) return;
            updateGroup(_group);
            Events.emit('media:updated', { projectId: state.currentProject.id });
        }

        function _showToast(message, variant = 'info') {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;';
            document.body.appendChild(wrapper);
            const toast = MpiToast.mount(wrapper, { message, variant, duration: 3000 });
            toast.on('close', () => wrapper.remove());
        }

        // ── Channel bus + bottom-bar reducer ──────────────────────────────────

        const bar = Events.channel('groupHistory');

        const selectionBar = MpiSelectionBar.mount(el.querySelector('#bottom-slot'), { count: 0 });

        // Video action bars — only mounted for video strategy
        let _cropBar = null;
        let _ratioSel = null;
        let _upscaleBar = null;
        let _interpolateBar = null;

        if (!strategy.supportsPromptBox()) {
            // Mount video tool bars into bottom-slot
            const bottomSlot = el.querySelector('#bottom-slot');

            _ratioSel = MpiRatioSelector.mount(document.createElement('div'), {
                modelType: 'social',
                value: SOCIAL_RATIOS[0].label,
            });

            const cropBarSlot = document.createElement('div');
            cropBarSlot.className = 'mpi-group-history-block__bar-slot';
            bottomSlot.appendChild(cropBarSlot);
            _cropBar = MpiToolActionBar.mount(cropBarSlot, {
                leftSlot: _ratioSel,
                actions: [
                    { key: 'snapshot', icon: 'camera', label: 'Save Snapshot',      variant: 'ghost',   info: 'Save current frame as image' },
                    { key: 'cancel',   icon: 'close',  label: 'Cancel',             variant: 'ghost',   info: 'Cancel crop' },
                    { key: 'apply',    icon: 'check',  label: 'Save Cropped Video',  variant: 'primary', info: 'Encode cropped region to new video' },
                ],
            });

            const upscaleBarSlot = document.createElement('div');
            upscaleBarSlot.className = 'mpi-group-history-block__bar-slot';
            bottomSlot.appendChild(upscaleBarSlot);
            _upscaleBar = MpiToolActionBar.mount(upscaleBarSlot, {
                actions: [
                    { key: 'cancel', icon: 'close',  label: 'Cancel',  variant: 'ghost',   info: 'Cancel upscale' },
                    { key: 'run',    icon: 'rocket',  label: 'Upscale', variant: 'primary', info: 'Run video upscale' },
                ],
            });

            const interpolateBarSlot = document.createElement('div');
            interpolateBarSlot.className = 'mpi-group-history-block__bar-slot';
            bottomSlot.appendChild(interpolateBarSlot);
            _interpolateBar = MpiToolActionBar.mount(interpolateBarSlot, {
                actions: [
                    { key: 'cancel', icon: 'close', label: 'Cancel',      variant: 'ghost',   info: 'Cancel interpolate' },
                    { key: 'run',    icon: 'film',  label: 'Interpolate',  variant: 'primary', info: 'Run frame interpolation' },
                ],
            });
        }

        function _hideAllVideoBars() {
            if (_cropBar) _cropBar.el.hide();
            if (_upscaleBar) _upscaleBar.el.hide();
            if (_interpolateBar) _interpolateBar.el.hide();
        }

        // Channel reducer: all bottom-bar state driven by channel events
        _unsubs.push(bar.on('tool:activated', ({ mode }) => {
            PromptBoxService.hide();
            selectionBar.el.style.display = 'none';
            _hideAllVideoBars();
            if (mode === 'crop' && _cropBar)         _cropBar.el.show();
            else if (mode === 'videoUpscale' && _upscaleBar)  _upscaleBar.el.show();
            else if (mode === 'interpolate' && _interpolateBar) _interpolateBar.el.show();
        }));

        _unsubs.push(bar.on('tool:deactivated', () => {
            _hideAllVideoBars();
            if (strategy.supportsPromptBox()) {
                PromptBoxService.show();
                selectionBar.el.style.display = 'none';
            } else {
                PromptBoxService.hide();
                selectionBar.el.style.display = 'none';
            }
        }));

        _unsubs.push(bar.on('selection:enter', () => {
            PromptBoxService.hide();
            selectionBar.el.style.display = '';
            _hideAllVideoBars();
        }));

        _unsubs.push(bar.on('selection:exit', () => {
            _hideAllVideoBars();
            if (strategy.supportsPromptBox()) {
                PromptBoxService.show();
            } else {
                PromptBoxService.hide();
            }
            selectionBar.el.style.display = 'none';
        }));

        _unsubs.push(bar.on('generation:running', () => {
            _hideAllVideoBars();
        }));

        // ── Mount sub-components ──────────────────────────────────────────────

        const historyTools = MpiHistoryTools.mount(el.querySelector('#left-slot'), {
            tools: strategy.toolsFor(),
        });

        if (!strategy.supportsSelection()) {
            selectionBar.el.style.display = 'none';
        }

        const viewer = strategy.mountViewer(el.querySelector('#centre-slot'), {
            resolveMediaUrl,
            MpiCanvasViewer,
            MpiVideoViewer,
            currentItem: _group.history[_currentIdx],
            currentIdx: _currentIdx,
        });

        // Alias for backwards compatibility
        const canvasViewer = viewer;

        const historyList = MpiHistoryList.mount(el.querySelector('#right-slot'), {
            history: _group.history,
            selectedIndex: _currentIdx,
        });

        // ── Wire video bar events to viewer ───────────────────────────────────

        if (_cropBar) {
            _ratioSel?.on('change', ({ ratio }) => {
                viewer.el.setCropRatio?.(ratio);
            });

            _cropBar.on('action', ({ key }) => {
                if (key === 'snapshot') _handleCropSnapshot();
                if (key === 'apply')    _handleCropSaveVideo();
                if (key === 'cancel') {
                    viewer.el.exitCropMode();
                    bar.emit('tool:deactivated', { mode: 'crop' });
                    historyTools.el.syncMode('none');
                }
            });
        }

        if (_upscaleBar) {
            _upscaleBar.on('action', ({ key }) => {
                if (key === 'run') {
                    viewer.el.exitUpscaleMode();
                    bar.emit('tool:deactivated', { mode: 'videoUpscale' });
                    historyTools.el.syncMode('none');
                    _runVideoTool('videoUpscale');
                }
                if (key === 'cancel') {
                    viewer.el.exitUpscaleMode();
                    bar.emit('tool:deactivated', { mode: 'videoUpscale' });
                    historyTools.el.syncMode('none');
                }
            });
        }

        if (_interpolateBar) {
            _interpolateBar.on('action', ({ key }) => {
                if (key === 'run') {
                    viewer.el.exitInterpolateMode();
                    bar.emit('tool:deactivated', { mode: 'interpolate' });
                    historyTools.el.syncMode('none');
                    _runVideoTool('interpolate');
                }
                if (key === 'cancel') {
                    viewer.el.exitInterpolateMode();
                    bar.emit('tool:deactivated', { mode: 'interpolate' });
                    historyTools.el.syncMode('none');
                }
            });
        }

        // ── Load initial entry ────────────────────────────────────────────────

        strategy.loadInitial(viewer, _group, _currentIdx, { resolveMediaUrl });

        // ── Active generation registry ─────────────────────────────────────────

        const _myGenIds = new Set();

        for (const entry of activeGenerations.listFor('groupHistory', _group.id)) {
            if (entry.status !== 'running') continue;
            _myGenIds.add(entry.id);
            canvasViewer.el.setGenerating(true);
            if (entry.latestPreviewUrl) {
                canvasViewer.el.setGenerating(false);
                strategy.onRehydratePreview(viewer, entry, _currentIdx, { group: _group });
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
            strategy.onGenerationPreview(viewer, { url, currentIdx: _currentIdx, group: _group });
        }));

        _unsubs.push(Events.on('generation:complete', ({ id, item, group }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            canvasViewer.el.setGenerating(false);
            _canvasHasMask = false;
            _refreshOpOptions();
            _group = group;
            _currentIdx = _group.selectedIndex;
            historyList.el.appendEntry(item);
            strategy.onGenerationComplete(viewer, item, _currentIdx, { resolveMediaUrl, group: _group });
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

        if (strategy.supportsPromptBox()) {
            if (activeModel) {
                const promptBox = PromptBoxService.mount({
                    model: activeModel,
                    modelList: installedModels,
                    operation: activeOperation,
                    includeNegative: true,
                });

                if (promptBox) {
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

                    // Show promptbox initially for image groups
                    PromptBoxService.show();
                    selectionBar.el.style.display = 'none';
                }
            }
        } else {
            PromptBoxService.hide();
            selectionBar.el.style.display = 'none';
        }

        // ── Generation ───────────────────────────────────────────────────────

        let _activeExec = null;

        function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
            if (!activeModel) return;

            canvasViewer.el.setGenerating(true);

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

        function _runVideoTool(operation) {
            const currentItem = _group.history[_currentIdx];
            if (!currentItem?.filePath) { _showToast('No source video', 'error'); return; }
            const mediaItems = [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'video', source: 'history' }];
            const videoModel = { id: null, mediaType: 'video' };
            canvasViewer.el.setGenerating(true);
            _activeExec = startGeneration(
                { operation, model: videoModel, positive: '', negative: '', mediaItems },
                { onCancel: () => { _activeExec = null; }, onError: () => { canvasViewer.el.setGenerating(false); } },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
        }

        // ── Video snapshot / crop helpers ────────────────────────────────────

        async function _handleCropSnapshot() {
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            try {
                const { blob } = await canvasViewer.el.captureSnapshot();
                if (!blob) return;
                const file = new File([blob], `snapshot_001.png`, { type: 'image/png' });
                const uploaded = await uploadMediaFile(file, 'image', project.folderPath, project.id, { filenamePrefix: 'snapshot', operation: 'snapshot' });
                if (!uploaded) { _showToast('Snapshot save failed', 'error'); return; }

                const displayName = uploaded.filename.replace(/\.[^.]+$/, '');
                const item = createImageItem({
                    id: uploaded.itemId,
                    filePath: uploaded.filePath,
                    uploaded: true,
                    operation: 'snapshot',
                });
                const group = createItemGroup('image', { name: displayName });
                const finalGroup = appendToHistory(group, item);
                await addGroup(finalGroup);

                Events.emit('media:imported', {
                    url: uploaded.filePath,
                    filename: uploaded.filename,
                    itemId: uploaded.itemId,
                    mediaType: 'image',
                });
                _showToast('Snapshot saved to gallery', 'success');
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'snapshot save failed', err);
                _showToast('Snapshot save failed', 'error');
            }
        }

        async function _handleCropSaveVideo() {
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            const rect = canvasViewer.el.getCropRect();
            if (!rect) { _showToast('No crop selected', 'warning'); return; }
            const currentItem = _group.history[_currentIdx];
            const sourcePath = currentItem?.filePath;
            if (!sourcePath) { _showToast('No source video', 'error'); return; }

            _showToast('Cropping video…', 'info');
            try {
                const res = await fetch('/api/video/crop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderPath: project.folderPath,
                        sourcePath,
                        cropRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
                        groupId: _group.id,
                        itemId:  currentItem?.id,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

                _group = appendToHistory(_group, data.item);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(data.item);

                const videoMeta = {
                    fps: data.item.fps || _group.fps || 24,
                    duration: data.item.duration,
                    frameCount: data.item.frameCount,
                    hasAudio: data.item.hasAudio,
                };
                canvasViewer.el.loadVideo(resolveMediaUrl(data.item.filePath), videoMeta);
                canvasViewer.el.exitCropMode();
                bar.emit('tool:deactivated', { mode: 'crop' });
                historyTools.el.syncMode('none');
                _showToast('Cropped video saved', 'success');
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'video crop failed', err);
                _showToast('Video crop failed: ' + err.message, 'error');
            }
        }

        // ── Wire sub-component events ─────────────────────────────────────────

        historyTools.on('activate', ({ mode }) => {
            if (_currentSelectionIndices.length > 0) {
                historyList.el.exitSelectMode();
            }
            strategy.onToolActivate(viewer, mode, { bar });
        });

        historyTools.on('deactivate', ({ mode }) => {
            strategy.onToolDeactivate(viewer, mode, { bar });
        });

        historyList.on('entry-selected', ({ idx, item }) => {
            strategy.loadEntry(viewer, item, idx, { resolveMediaUrl });
            _currentIdx = idx;
            _group = promoteHistoryEntry(_group, idx);
            _persistGroup();
        });

        historyList.on('selection-changed', ({ indices }) => {
            _currentSelectionIndices = indices;
            if (indices.length === 0) {
                bar.emit('selection:exit', {});
                return;
            }
            strategy.onSelectionChanged(viewer, historyTools);
            selectionBar.el.setCount(indices.length);
            bar.emit('selection:enter', {});
        });

        historyList.on('selection-exited', () => {
            strategy.onSelectionExited(viewer);
            bar.emit('selection:exit', {});
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
            strategy.onSelectionExited(viewer);
            bar.emit('selection:exit', {});
        });

        selectionBar.on('delete', () => {
            if (!_currentSelectionIndices.length) return;
            historyList.el.exitSelectMode();
            const sorted = [..._currentSelectionIndices].sort((a, b) => b - a);

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
            strategy.onSelectionDelete(viewer, _group, _currentIdx);
        });

        // Canvas-viewer-only events (image strategy)
        if (strategy.supportsPromptBox()) {
            canvasViewer.on('mode-changed', ({ mode }) => {
                const toolMode = mode === 'automask' ? 'autoMaskImg' : mode;
                historyTools.el.syncMode(toolMode);

                if (canvasViewer.el.canvas?.isComparisonMode) return;

                if (mode === 'none') {
                    bar.emit('tool:deactivated', { mode });
                } else {
                    bar.emit('tool:activated', { mode });
                }
            });

            canvasViewer.on('crop-applied', ({ item }) => {
                _group = appendToHistory(_group, item);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(item);
                canvasViewer.el.loadEntry(item, _currentIdx);
                canvasViewer.el.setMaskHidden(false);
            });

            canvasViewer.on('entry-loaded', ({ idx, hasMask }) => {
                _currentIdx = idx;
                _canvasHasMask = hasMask;
                PromptBoxService.component?.updateContext({
                    ..._baseCtx,
                    hasMask: _canvasHasMask,
                    filterNoInputOps: true,
                });
            });

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
            _cropBar?.destroy?.();
            _ratioSel?.destroy?.();
            _upscaleBar?.destroy?.();
            _interpolateBar?.destroy?.();
            _modelsModal.destroy?.();
            _settingsOverlay.destroy?.();
        };
    },
});
