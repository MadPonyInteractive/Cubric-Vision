/**
 * MpiGroupHistoryBlock — Block: group history workspace coordinator.
 *
 * Thin coordinator. Mounts MpiHistoryTools, viewer (canvas or video), MpiHistoryList,
 * a per-tool MpiToolOptions* compound into #right-top-slot via a flat mediator,
 * and mounts MpiPromptBox directly into #prompt-box-mount.
 *
 * @param {string} groupId - ID of the ItemGroup to display (from router params)
 */

import { ComponentFactory } from '../../factory.js';
import { MpiHistoryTools } from '../../Compounds/MpiHistoryTools/MpiHistoryTools.js';
import { MpiCanvasViewer } from '../../Organisms/MpiCanvasViewer/MpiCanvasViewer.js';
import { MpiVideoViewer } from '../../Organisms/MpiVideoViewer/MpiVideoViewer.js';
import { MpiHistoryList } from '../../Compounds/MpiHistoryList/MpiHistoryList.js';
import { MpiToolOptionsCrop } from '../../Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js';
import { MpiToolOptionsMask } from '../../Organisms/MpiToolOptionsMask/MpiToolOptionsMask.js';
import { MpiToolOptionsUpscale } from '../../Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js';
import { MpiToolOptionsInterpolate } from '../../Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.js';
import { MpiPromptBox } from '../../Organisms/MpiPromptBox/MpiPromptBox.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { navigate, PAGE_GALLERY } from '../../../router.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
import { startGeneration } from '../../../services/generationService.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs, gid } from '../../../utils/dom.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { extractFilenameFromPath, resolveMediaUrl } from '../../../utils/mediaActions.js';
import { resolveActiveModel } from '../../../utils/modelHelpers.js';
import { updateGroup, addGroup } from '../../../services/projectService.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    removeHistoryEntry,
    createImageItem,
    createItemGroup,
} from '../../../data/projectModel.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';

/**
 * Registry mapping MpiHistoryTools `activate { mode }` keys to the compound
 * that owns the options UI for that mode. `prompt` is handled specially by the
 * mediator (→ PromptBox). `mask` mounts MpiToolOptionsMask; no apply button.
 */
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    mask:         MpiToolOptionsMask,
    videoUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
};

export const MpiGroupHistoryBlock = ComponentFactory.create({
    name: 'MpiGroupHistoryBlock',
    css: ['js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.css'],

    template: () => `
        <div class="mpi-group-history-block">
            <div class="mpi-group-history-block__left"   id="left-slot"></div>
            <div class="mpi-group-history-block__centre" id="centre-slot"></div>
            <div class="mpi-group-history-block__right">
                <div class="mpi-group-history-block__right-top"    id="right-top-slot"></div>
                <div class="mpi-group-history-block__right-bottom" id="right-bottom-slot"></div>
            </div>
            <div class="mpi-group-history-block__bottom"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const _unsubs = [];

        // ── Resolve group ─────────────────────────────────────────────────────

        let _group = state.currentProject?.itemGroups?.find(g => g.id === props.groupId);

        if (!_group) {
            el.innerHTML = `<p class="mpi-group-history-block__error">Group not found. <span class="mpi-group-history-block__back-slot"></span></p>`;
            const backSlot = qs('.mpi-group-history-block__back-slot', el);
            if (backSlot) {
                const backBtn = MpiButton.mount(backSlot, { text: 'Back to gallery', variant: 'secondary', size: 'sm' });
                backBtn.on('click', () => navigate(PAGE_GALLERY));
            }
            return;
        }

        const isVideo = _group.type === 'video';
        const modeKind = isVideo ? 'video' : 'image';

        // ── Model / operation context ─────────────────────────────────────────

        const { model: activeModelInit, modelId: activeModelIdInit, installedModels } =
            resolveActiveModel(isVideo ? 'video' : 'image');
        let activeModelId = activeModelIdInit;
        let activeModel   = activeModelInit;
        if (activeModelId) state.s_selectedModelId = activeModelId;

        const _baseCtx = isVideo
            ? { imageCount: 0, videoCount: 1 }
            : { imageCount: 1, videoCount: 0 };

        let _canvasHasMask = false;

        /**
         * Return available operations for the active model, mapped to PromptBox
         * dropdown shape. `_hasPromptOps` gates PromptBox + prompt tool button.
         */
        function _opOptions(ctx = _baseCtx) {
            if (!activeModel) return [];
            const maskCtx = { ..._baseCtx, hasMask: _canvasHasMask };
            return getAvailableCommands(activeModel.mediaType, activeModel, { ...maskCtx, ...ctx })
                .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
        }

        /** PromptBox only mounts if the active model exposes at least one op it serves. */
        function _hasPromptOps() {
            return !!activeModel && _opOptions().some(o => !o.disabled);
        }

        const _firstAvailable = _opOptions().find(o => !o.disabled);
        let activeOperation = _hasPromptOps()
            ? (_firstAvailable?.value ?? 'upscale')
            : (isVideo ? 't2v' : 'generate');
        let _currentIdx = _group.selectedIndex ?? 0;
        let _currentSelectionIndices = [];

        // ── Persist / toast helpers ──────────────────────────────────────────

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

        // ── Mount sub-components ──────────────────────────────────────────────

        const historyTools = MpiHistoryTools.mount(qs('#left-slot', el), { mode: modeKind });

        const centreSlot = qs('#centre-slot', el);
        const viewer = isVideo
            ? MpiVideoViewer.mount(centreSlot, { fps: 24, controls: true })
            : MpiCanvasViewer.mount(centreSlot, {
                initialImageUrl: resolveMediaUrl(_group.history[_currentIdx]?.filePath),
                initialIdx:      _currentIdx,
            });

        const historyList = MpiHistoryList.mount(qs('#right-bottom-slot', el), {
            history: _group.history,
            selectedIndex: _currentIdx,
            isVideo,
        });

        // ── Load initial entry (inlined per-kind) ─────────────────────────────

        if (isVideo) {
            const ci = _group.history[_currentIdx];
            if (ci?.filePath) {
                viewer.el.loadVideo(resolveMediaUrl(ci.filePath), {
                    fps:        ci.fps || _group.fps || 24,
                    duration:   ci.duration,
                    frameCount: ci.frameCount,
                    hasAudio:   ci.hasAudio,
                });
            }
        } else {
            viewer.el.loadEntry(_group.history[_currentIdx], _currentIdx);
        }

        // ── Mediator: mountOptions(mode) ──────────────────────────────────────

        let _options = null; // currently-mounted MpiToolOptions* instance

        /**
         * Flat reducer. Called on every historyTools `activate { mode }` emit.
         * Destroys the previously-mounted options compound (which exits viewer
         * mode via its own el.destroy), then mounts the new one (which enters
         * viewer mode in its setup). `prompt` is special — no compound; toggles
         * PromptBox visibility via the `--prompt-active` CSS class.
         */
        async function mountOptions(mode) {
            _options?.destroy?.();
            _options = null;

            const slot = qs('#right-top-slot', el);
            if (slot) slot.innerHTML = '';

            el.classList.toggle('mpi-group-history-block--prompt-active', mode === 'prompt');

            if (mode === 'prompt') {
                if (!isVideo) await viewer.el.swapToPreview?.();
                if (_hasPromptOps()) _pb?.el?.show();
                return;
            }

            // Leaving prompt mode — await canvas remount before mounting tool compound
            if (!isVideo) await viewer.el.swapToCanvas?.();

            _pb?.el?.hide();
            if (!mode) return;

            const Compound = TOOL_OPTIONS_REGISTRY[mode];
            if (!Compound || !slot) return;

            _options = Compound.mount(slot, { viewer, kind: modeKind });

            // Options compounds emit 'apply'; mediator routes to _handleApply.
            _options.on?.('apply', (payload) => _handleApply(mode, payload));
        }

        /**
         * Route an `apply { ...payload }` event from a MpiToolOptions* compound
         * to the correct generation / crop path.
         */
        function _handleApply(mode, payload = {}) {
            if (mode === 'crop') {
                if (payload.kind === 'image')            return viewer.el.runCrop?.();
                if (payload.kind === 'video-snapshot')   return _handleCropSnapshot();
                if (payload.kind === 'video-save')       return _handleCropSaveVideo();
                return;
            }
            // Mask compounds have no apply button — they only create a mask.
            // PromptBox runs the operation; this branch should never fire.
            if (mode === 'mask') return;
            if (mode === 'videoUpscale') {
                const injectionParams = { Upscale_Factor: payload.factor ?? 2 };
                if (payload.model) injectionParams.Upscale_Model = payload.model;
                return _runVideoTool('videoUpscale', injectionParams);
            }
            if (mode === 'interpolate') {
                return _runVideoTool('interpolate', { Interp_Multiplier: payload.multiplier ?? 2 });
            }
        }

        historyTools.on('activate', ({ mode }) => {
            if (_currentSelectionIndices.length > 0) historyList.el.exitSelectMode();
            mountOptions(mode);
        });

        // ── Active-generation registry / spinner ──────────────────────────────

        const _myGenIds = new Set();
        const _setGenerating = (flag) => { viewer.el.setGenerating?.(flag); };

        for (const entry of activeGenerations.listFor('groupHistory', _group.id)) {
            if (entry.status !== 'running') continue;
            _myGenIds.add(entry.id);
            _setGenerating(true);
            if (entry.latestPreviewUrl) {
                _setGenerating(false);
                _applyPreview(entry.latestPreviewUrl);
            }
        }

        /** Inline replacement for strategy.onGenerationPreview / onRehydratePreview. */
        function _applyPreview(url) {
            if (isVideo) {
                viewer.el.loadVideo?.(url, { fps: _group.fps || 24 })?.catch?.(() => {});
            } else {
                viewer.el.isComparisonMode = false;
                if (url?.startsWith('blob:')) viewer.el.setMaskHidden?.(true);
                viewer.el.loadEntry?.({ filePath: url }, _currentIdx)?.catch?.(() => {});
            }
        }

        _unsubs.push(Events.on('generation:started', ({ id, scope, groupId }) => {
            if (scope === 'groupHistory' && groupId === _group.id) {
                _myGenIds.add(id);
                _setGenerating(true);
            }
        }));

        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myGenIds.has(id)) return;
            _setGenerating(false);
            _applyPreview(url);
        }));

        _unsubs.push(Events.on('generation:complete', ({ id, item, group }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            _setGenerating(false);
            _canvasHasMask = false;
            _refreshOpOptions();
            _group = group;
            _currentIdx = _group.selectedIndex;
            historyList.el.appendEntry(item);
            if (isVideo) {
                viewer.el.exitCropMode?.();
                viewer.el.loadVideo?.(resolveMediaUrl(item.filePath), {
                    fps:        item.fps || _group.fps || 24,
                    duration:   item.duration,
                    frameCount: item.frameCount,
                    hasAudio:   item.hasAudio,
                });
            } else {
                viewer.el.exitMode?.();
                viewer.el.loadEntry?.(item, _currentIdx);
                viewer.el.setMaskHidden?.(false);
            }
        }));

        _unsubs.push(Events.on('generation:error',     ({ id }) => { if (_myGenIds.delete(id)) _setGenerating(false); }));
        _unsubs.push(Events.on('generation:cancelled', ({ id }) => { if (_myGenIds.delete(id)) _setGenerating(false); }));

        // ── OS-file drop overlay ───────────────────────────────────────────────

        const _dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
            onDrop: async ({ file, mediaType }) => {
                const project = state.currentProject;
                if (!project?.folderPath || !project?.id) {
                    clientLogger.warn('MpiGroupHistoryBlock', 'No current project on drop');
                    return;
                }
                const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
                if (uploaded) _pb?.el?.injectMedia?.({ url: uploaded.filePath, mediaType });
            },
        });
        el.appendChild(_dropOverlay.el);

        let _histDragCounter = 0;
        const _isFileDrag = (e) =>
            e.dataTransfer?.types?.includes('Files') &&
            !e.dataTransfer.types.includes('application/mpi-media');

        const _onHistDragEnter = (e) => {
            if (!_isFileDrag(e) || !state.currentProject) return;
            _histDragCounter++;
            _dropOverlay.el.show();
        };
        const _onHistDragLeave = (e) => {
            if (!_isFileDrag(e)) return;
            if (_histDragCounter > 0 && --_histDragCounter === 0) _dropOverlay.el.hide();
        };
        const _onHistDrop = () => { _histDragCounter = 0; _dropOverlay.el.hide(); };
        const _onHistDragOver = (e) => { if (_isFileDrag(e)) e.preventDefault(); };

        window.addEventListener('dragenter', _onHistDragEnter);
        window.addEventListener('dragleave', _onHistDragLeave);
        window.addEventListener('dragover',  _onHistDragOver);
        window.addEventListener('drop',      _onHistDrop);

        // ── PromptBox ─────────────────────────────────────────────────────────

        const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));
        let _pb = null;

        /** Sync PromptBox operation list + preserve current choice when available. */
        function _refreshOpOptions() {
            const opts = _opOptions();
            _pb?.el?.updateContext({
                ..._baseCtx,
                hasMask: _canvasHasMask,
                filterNoInputOps: true,
            });
            const currentStillOk = opts.find(o => o.value === activeOperation && !o.disabled);
            if (!currentStillOk) {
                const fallback = opts.find(o => !o.disabled);
                if (fallback) {
                    activeOperation = fallback.value;
                    _pb?.el?.setOperation(activeOperation);
                }
            }
        }

        /** Gate prompt tool button disabled state based on _hasPromptOps(). */
        function _syncPromptToolDisabled() {
            const has = _hasPromptOps();
            historyTools.el.setDisabled?.({
                prompt: {
                    disabled: !has,
                    reason: has ? '' : 'No prompt-driven ops available for this model',
                },
            });
            return has;
        }

        function _mountPromptBoxIfNeeded() {
            if (_pb?.el || !_hasPromptOps() || !activeModel) return false;

            _pb?.el?.destroy?.();
            _pb = MpiPromptBox.mount(gid('prompt-box-mount'), {
                model: activeModel,
                modelList: installedModels,
                operation: activeOperation,
                includeNegative: true,
            });
            _pb?.el?.hide();

            _pb?.el?.updateContext({
                ..._baseCtx,
                hasMask: false,
                filterNoInputOps: true,
            });

            _unsubs.push(_pb.on('settings', () => _settingsOverlay.el.open({ modelId: activeModel.id })));
            _unsubs.push(_pb.on('model-change', ({ model }) => {
                state.s_selectedModelId = model.id;
                activeModelId = model.id;
                activeModel = model;
                _pb?.el?.setModel(model);
                _refreshOpOptions();
                _syncPromptToolDisabled();
            }));
            _unsubs.push(_pb.on('operation-change', ({ operation }) => { activeOperation = operation; }));
            _unsubs.push(_pb.on('run', ({ operation, positive, negative, mediaItems, injectionParams }) => {
                const maskDataUrl = viewer.el.hasMask?.()
                    ? viewer.el.getCurrentMaskDataURL?.()
                    : null;
                _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl, injectionParams });
            }));
            _unsubs.push(_pb.on('cancel', () => {
                _activeExec?.cancel();
                _activeExec = null;
                Events.emit('tool:cancelled', { tool: 'groupHistory' });
            }));
            return true;
        }

        // ── Initial mode resolution ───────────────────────────────────────────

        _syncPromptToolDisabled();
        _mountPromptBoxIfNeeded();

        // Initial tool: prompt if available, else crop.
        if (_hasPromptOps()) historyTools.el.setMode('prompt');
        else                 historyTools.el.setMode('crop');

        // ── Generation runners ───────────────────────────────────────────────

        let _activeExec = null;

        function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
            if (!activeModel) return;

            _setGenerating(true);

            const currentItem = _group.history[_currentIdx];
            const hasDroppedImage = mediaItems.some(m => m.mediaType === 'image');
            const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
                ? [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
                : mediaItems;

            _activeExec = startGeneration(
                { operation, model: activeModel, positive, negative, mediaItems: resolvedMedia, maskDataUrl, injectionParams },
                { onCancel: () => { _activeExec = null; } },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
        }

        function _runVideoTool(operation, injectionParams = {}) {
            const currentItem = _group.history[_currentIdx];
            if (!currentItem?.filePath) { _showToast('No source video', 'error'); return; }
            const mediaItems = [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'video', source: 'history' }];
            const videoModel = { id: null, mediaType: 'video' };
            _setGenerating(true);
            _activeExec = startGeneration(
                { operation, model: videoModel, positive: '', negative: '', mediaItems, injectionParams },
                { onCancel: () => { _activeExec = null; }, onError: () => { _setGenerating(false); } },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
        }

        // ── Video snapshot / crop helpers ────────────────────────────────────

        async function _handleCropSnapshot() {
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            try {
                const { blob } = await viewer.el.captureSnapshot();
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
            const rect = viewer.el.getCropRect?.();
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

                viewer.el.loadVideo(resolveMediaUrl(data.item.filePath), {
                    fps:        data.item.fps || _group.fps || 24,
                    duration:   data.item.duration,
                    frameCount: data.item.frameCount,
                    hasAudio:   data.item.hasAudio,
                });
                viewer.el.exitCropMode?.();
                // Switch back to crop options to reset config for the new source.
                historyTools.el.setMode('crop');
                _showToast('Cropped video saved', 'success');
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'video crop failed', err);
                _showToast('Video crop failed: ' + err.message, 'error');
            }
        }

        // ── History list wiring ──────────────────────────────────────────────

        historyList.on('entry-selected', ({ idx, item }) => {
            if (isVideo) {
                viewer.el.loadVideo?.(resolveMediaUrl(item.filePath), {
                    fps:        item.fps || _group.fps || 24,
                    duration:   item.duration,
                    frameCount: item.frameCount,
                    hasAudio:   item.hasAudio,
                });
            } else {
                viewer.el.loadEntry?.(item, idx);
                viewer.el.setMaskHidden?.(false);
            }
            _currentIdx = idx;
            _group = promoteHistoryEntry(_group, idx);
            _persistGroup();
        });

        historyList.on('selection-changed', ({ indices }) => {
            _currentSelectionIndices = indices;
            if (indices.length === 0) {
                if (_hasPromptOps()) _pb?.el?.show();
                return;
            }
            // Any selection: ensure viewer is not in a tool mode.
            if (!isVideo) viewer.el.exitMode?.();
            _pb?.el?.hide();
        });

        historyList.on('selection-exited', () => {
            if (!isVideo) viewer.el.clearCompare?.();
            if (_hasPromptOps()) _pb?.el?.show();
        });

        historyList.on('compare-requested', ({ indices }) => {
            if (indices.length !== 2 || isVideo) return;
            const [idxA, idxB] = indices;
            viewer.el.loadCompare?.(_group.history[idxA], _group.history[idxB]);
            viewer.el.setMaskHidden?.(false);
        });

        historyList.on('delete-selected', ({ indices }) => {
            if (!indices.length) return;
            historyList.el.exitSelectMode();
            const sorted = [...indices].sort((a, b) => b - a);

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

            for (const idx of sorted) _group = removeHistoryEntry(_group, idx);
            _currentIdx = _group.selectedIndex;
            _persistGroup();
            historyList.el.removeEntries(indices);

            // Load the new current entry (if any).
            const cur = _group.history[_currentIdx];
            if (cur) {
                if (isVideo) viewer.el.loadVideo?.(resolveMediaUrl(cur.filePath), { fps: cur.fps || _group.fps || 24 });
                else         viewer.el.loadEntry?.(cur, _currentIdx);
            }
        });

        // ── Canvas-viewer-only events (image groups) ─────────────────────────

        if (!isVideo) {
            viewer.on('crop-applied', ({ item }) => {
                _group = appendToHistory(_group, item);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(item);
                viewer.el.loadEntry?.(item, _currentIdx);
                viewer.el.setMaskHidden?.(false);
            });

            viewer.on('entry-loaded', ({ idx, hasMask }) => {
                _currentIdx = idx;
                _canvasHasMask = hasMask;
                _pb?.el?.updateContext({
                    ..._baseCtx,
                    hasMask: _canvasHasMask,
                    filterNoInputOps: true,
                });
            });

            viewer.on('mask-ready', () => { _canvasHasMask = true;  _refreshOpOptions(); });
            viewer.on('mask-clear', () => { _canvasHasMask = false; _refreshOpOptions(); });
        }

        // ── Radial → operation sync ───────────────────────────────────────────

        _unsubs.push(Events.on('workspace:set-operation', ({ operation }) => {
            if (!_pb?.el) return;
            const opts = _opOptions();
            const match = opts.find(o => o.value === operation && !o.disabled);
            if (match) {
                activeOperation = operation;
                _pb.el.setOperation(activeOperation);
            }
        }));

        // ── State model change + installed-models reactivity ─────────────────

        _unsubs.push(Events.onState('s_selectedModelId', (value) => {
            if (!value || value === activeModelId) return;
            const newModel = installedModels.find(m => m.id === value);
            if (newModel && newModel !== activeModel) {
                activeModelId = value;
                activeModel = newModel;
                _pb?.el?.setModel(newModel);
                _refreshOpOptions();
                const nowHas = _syncPromptToolDisabled();
                if (nowHas) {
                    _mountPromptBoxIfNeeded();
                    if (historyTools.el.getActiveMode() === 'prompt') _pb?.el?.show();
                } else {
                    _pb?.el?.hide();
                }
            }
        }));

        _unsubs.push(Events.on('project:changed', () => {
            _refreshOpOptions();
            _syncPromptToolDisabled();
        }));

        // ── Zero-installed state — delegated to shell-owned models modal ──────
        // Shell mounts a single MpiModelsModal at app boot. Mounting another here
        // causes duplicate `download:uninstalled` listeners and double toasts.
        const _hasInstalledImageModels = () => getModelsByType('image').some(m => m.installed === true);
        const _onZeroInstalled = () => {
            if (!_hasInstalledImageModels()) Events.emit('models:open', { auto: true });
            _pb?.el?.setModelList?.(getModelsByType(modeKind).filter(m => m.installed !== false));
        };

        _unsubs.push(Events.onState('s_installedModelIds', _onZeroInstalled));

        if (!_hasInstalledImageModels()) Events.emit('models:open', { auto: true });

        // ── Cleanup ───────────────────────────────────────────────────────────

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            window.removeEventListener('dragenter', _onHistDragEnter);
            window.removeEventListener('dragleave', _onHistDragLeave);
            window.removeEventListener('dragover',  _onHistDragOver);
            window.removeEventListener('drop',      _onHistDrop);
            _dropOverlay.el.destroy?.();
            _dropOverlay.el.remove();
            _options?.destroy?.();
            _options = null;
            viewer.destroy?.();
            viewer.el.destroy?.();
            historyList.destroy?.();
            historyTools.destroy?.();
            _settingsOverlay.destroy?.();
            _pb?.el?.destroy?.();
            _pb = null;
        };
    },
});
