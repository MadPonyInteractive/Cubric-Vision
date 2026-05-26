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
import { MpiVideoControlBar } from '../../Compounds/MpiVideoControlBar/MpiVideoControlBar.js';
import { MpiHistoryList } from '../../Compounds/MpiHistoryList/MpiHistoryList.js';
import { MpiToolOptionsCrop } from '../../Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js';
import { MpiToolOptionsMask } from '../../Organisms/MpiToolOptionsMask/MpiToolOptionsMask.js';
import { MpiToolOptionsUpscale } from '../../Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js';
import { MpiToolOptionsInterpolate } from '../../Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.js';
import { MpiToolOptionsResize } from '../../Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js';
import { MpiToolOptionsPrompt } from '../../Organisms/MpiToolOptionsPrompt/MpiToolOptionsPrompt.js';
import { MpiPromptBox } from '../../Organisms/MpiPromptBox/MpiPromptBox.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { navigate, PAGE_GALLERY } from '../../../router.js';
import { refreshGroupHistoryRadial, clearGroupHistoryRadial } from '../../../shell/navigation.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands, getCommandMediaInputs } from '../../../data/commandRegistry.js';
import { enqueueGeneration, clearPendingQueue, refreshQueueDepth } from '../../../services/generationService.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { qs, gid } from '../../../utils/dom.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { extractFilenameFromPath, resolveMediaUrl, downloadMediaFiles } from '../../../utils/mediaActions.js';
import { resolveActiveModel, setSelectedModelId } from '../../../utils/modelHelpers.js';
import { updateGroup, addGroup, removeGroup, applyPromptReuseSettings } from '../../../services/projectService.js';
import { buildPromptReuseSettings, resolvePromptReuseMediaItems } from '../../../utils/promptReuse.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    removeHistoryEntry,
    createImageItem,
    createVideoItem,
    createItemGroup,
} from '../../../data/projectModel.js';
import { truncateCardName } from '../../../utils/displayHelpers.js';
import { trackConcatJob } from '../../../services/concatProgress.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiMediaDropOverlay } from '../../Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js';
import { uploadMediaFile } from '../../../services/mediaUploadService.js';
import { MpiToast } from '../../Primitives/MpiToast/MpiToast.js';
import { MpiCompareOverlay } from '../../Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiContextMenu } from '../../Compounds/MpiContextMenu/MpiContextMenu.js';
import { MpiOkCancel } from '../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiReusePromptDialog } from '../../Compounds/MpiReusePromptDialog/MpiReusePromptDialog.js';

/**
 * Registry mapping MpiHistoryTools `activate { mode }` keys to the compound
 * that owns the options UI for that mode. `prompt` is handled specially by the
 * mediator (→ PromptBox). `mask` mounts MpiToolOptionsMask; no apply button.
 */
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    mask:         MpiToolOptionsMask,
    videoUpscale: MpiToolOptionsUpscale,
    imageUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
    resize:       MpiToolOptionsResize,
    resizeVideo:  MpiToolOptionsResize,
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
            <div class="mpi-group-history-block__controls" id="controls-slot"></div>
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
        // No mount-time write-back: resolver returns a valid id for the
        // group's mediaType. Persisting here would clobber the sibling-type
        // slot (e.g. entering image history would wipe a video selection).

        // Live media context — counts reflect (a) the implicit "current item"
        // (1 image in image groups, 1 video in video groups) PLUS (b) any
        // chips the user has staged in PromptBox via inject (e.g. start/end
        // frame). `_refreshOpOptions` recomputes from PromptBox state so
        // I2V ops unlock the moment a frame chip lands.
        const _baseCtx = isVideo
            ? { imageCount: 0, videoCount: 1 }
            : { imageCount: 1, videoCount: 0 };
        function _syncBaseCtxFromPromptBox() {
            const img = Number(_pb?.el?.imageCount) || 0;
            const vid = Number(_pb?.el?.videoCount) || 0;
            _baseCtx.imageCount = isVideo ? img : Math.max(1, img);
            _baseCtx.videoCount = isVideo ? Math.max(1, vid) : vid;
        }

        let _canvasHasMask = false;

        /**
         * Return available operations for the active model, mapped to PromptBox
         * dropdown shape. `_hasPromptOps` gates PromptBox + prompt tool button.
         */
        function _opOptions(ctx = _baseCtx) {
            if (!activeModel) return [];
            // Live mask check beats stale _canvasHasMask cache. mask-ready fires
            // on stroke end; radial pick mid-draw saw stale false.
            // Wrapped in try/catch for TDZ — _opOptions is called before
            // `viewer` is initialized (during initial activeOperation resolve).
            let liveMask = _canvasHasMask;
            try {
                if (typeof viewer?.el?.hasMask === 'function') {
                    liveMask = !!viewer.el.hasMask();
                }
            } catch (_) { /* viewer not yet initialized — fall back to cache */ }
            const maskCtx = { ..._baseCtx, hasMask: liveMask };
            return getAvailableCommands(activeModel.mediaType, activeModel, { ...maskCtx, ...ctx })
                .filter(cmd => (cmd.requiresImages ?? 0) > 0 || (cmd.requiresVideo ?? 0) > 0)
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
        }

        /** PromptBox only mounts if the active model exposes at least one op it serves. */
        function _hasPromptOps() {
            return !!activeModel && _opOptions().some(o => !o.disabled);
        }

        /**
         * Active model exposes frame-driven ops (i2v* / v2v*) that accept external
         * media drops. PromptBox must be visible even with no chips staged so the
         * user can drop a start/end-frame image (or input video) from outside.
         */
        function _modelHasFrameOps() {
            const ops = activeModel?.supportedOps;
            if (!Array.isArray(ops)) return false;
            return ops.some(op => op.startsWith('i2v') || op.startsWith('v2v'));
        }

        /** Unified PromptBox-visible gate used across mount/show paths. */
        function _shouldShowPromptBox() {
            return _hasPromptOps() || _modelHasFrameOps();
        }

        const _firstAvailable = _opOptions().find(o => !o.disabled);
        const _firstFrameOp = activeModel?.supportedOps?.find(op => op.startsWith('i2v') || op.startsWith('v2v'));
        let activeOperation = _hasPromptOps()
            ? (_firstAvailable?.value ?? 'upscale')
            : (_firstFrameOp || (isVideo ? 't2v' : 'generate'));
        let _preferredOperation = activeOperation;
        let _isProgrammaticOperationSync = false;
        let _currentIdx = _group.selectedIndex ?? 0;
        let _currentSelectionIndices = [];
        let _compareOverlay = null;

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

        function _downloadMaskDataURL(dataUrl, item) {
            if (!dataUrl) return;
            const base = String(item?.displayName || item?.operation || item?.id || 'mask')
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
                .replace(/\s+/g, '_')
                .slice(0, 80) || 'mask';
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${base}_mask.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }

        // ── Mount sub-components ──────────────────────────────────────────────

        const historyTools = MpiHistoryTools.mount(qs('#left-slot', el), { mode: modeKind });

        const centreSlot = qs('#centre-slot', el);
        const viewer = isVideo
            ? MpiVideoViewer.mount(centreSlot, { fps: 24 })
            : MpiCanvasViewer.mount(centreSlot, {
                initialImageUrl: resolveMediaUrl(_group.history[_currentIdx]?.filePath),
                initialIdx:      _currentIdx,
                initialItem:     _group.history[_currentIdx] || null,
                groupId:         _group.id,
            });

        // ── Video control bar — full-block-width row below the viewer ─────
        let videoControlBar = null;
        const RESIZE_QUEUE_DISABLED_REASON = 'Resize is disabled while Cue has running or queued jobs';

        function _syncQueueBlockedTools() {
            const cueBusy = (state.generationQueueCount || 0) > 0;
            historyTools.el.setDisabled?.({
                resize: {
                    disabled: cueBusy,
                    reason: cueBusy ? RESIZE_QUEUE_DISABLED_REASON : '',
                },
                resizeVideo: {
                    disabled: cueBusy,
                    reason: cueBusy ? RESIZE_QUEUE_DISABLED_REASON : '',
                },
            });

            const activeTool = historyTools.el.getActiveMode?.();
            if (cueBusy && (activeTool === 'resize' || activeTool === 'resizeVideo')) {
                historyTools.el.setMode('crop');
            }
        }

        _unsubs.push(Events.onState('generationQueueCount', _syncQueueBlockedTools));
        _syncQueueBlockedTools();

        if (isVideo) {
            const controlsSlot = qs('#controls-slot', el);
            videoControlBar = MpiVideoControlBar.mount(controlsSlot, { fps: 24, showTrim: true });
            viewer.el.attachControlBar(videoControlBar);
            _unsubs.push(() => {
                try { viewer.el.detachControlBar?.(); } catch (_) { /* noop */ }
                try { videoControlBar?.destroy?.(); } catch (_) { /* noop */ }
                videoControlBar = null;
            });
        }

        const _mascotEl = document.createElement('img');
        _mascotEl.className = 'mascot-peek';
        _mascotEl.id = 'mascot-peek';
        _mascotEl.src = 'assets/mascot/idle.png';
        _mascotEl.alt = '';
        centreSlot.appendChild(_mascotEl);

        const historyList = MpiHistoryList.mount(qs('#right-bottom-slot', el), {
            history: _group.history,
            selectedIndex: _currentIdx,
            isVideo,
            hasMaskForIndex: async (idx) => {
                if (isVideo) return false;
                const item = _group.history[idx];
                return !!(await viewer.el.hasMaskForEntry?.(item));
            },
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
                    trim:       ci.trim,
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
                // Force-mount PromptBox whenever the active model supports
                // frame-driven ops (i2v*/v2v*) so the user can drop a
                // start/end-frame (or input video) from outside — even before
                // any chip is staged. Otherwise fall back to the gated path.
                const hasFrameOps = _modelHasFrameOps();
                if (hasFrameOps) {
                    if (!_pb?.el) _mountPromptBoxIfNeeded({ force: true });
                } else if (!_pb?.el) {
                    _mountPromptBoxIfNeeded();
                }
                if (_pb?.el && _shouldShowPromptBox()) _pb.el.show();
                // Mount frame-slot toolbar organism into #right-top-slot for
                // video-history when the active model supports any i2v op.
                if (isVideo && _pb?.el && hasFrameOps) {
                    _options = MpiToolOptionsPrompt.mount(slot, {
                        promptBox: _pb,
                        project: state.currentProject,
                    });
                }
                return;
            }

            // Leaving prompt mode — await canvas remount before mounting tool compound
            if (!isVideo) await viewer.el.swapToCanvas?.();

            _pb?.el?.hide();
            if (!mode) return;

            const Compound = TOOL_OPTIONS_REGISTRY[mode];
            if (!Compound || !slot) return;

            _options = Compound.mount(slot, { viewer, kind: modeKind, currentItem: _group.history[_currentIdx] || null });

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
            if (mode === 'videoUpscale' || mode === 'imageUpscale') {
                const injectionParams = {
                    Upscale_Factor: payload.factor ?? 2,
                    Upscale_Using_Model: !!payload.model,
                };
                if (payload.model) injectionParams.Upscale_Model = payload.model;
                if (mode === 'imageUpscale') return _runImageTool('imageUpscale', injectionParams);
                return _runVideoTool('videoUpscale', injectionParams);
            }
            if (mode === 'interpolate') {
                return _runVideoTool('interpolate', { Interp_Multiplier: payload.multiplier ?? 2 });
            }
            if (mode === 'resize' || mode === 'resizeVideo') {
                return _handleResizeApply(mode, payload || {});
            }
        }

        const TOOL_LABELS = {
            prompt: 'Prompt', crop: 'Crop', mask: 'Mask',
            videoUpscale: 'Upscale', imageUpscale: 'Upscale',
            interpolate: 'Interpolate',
            resize: 'Resize', resizeVideo: 'Resize',
        };

        // Video viewer top-right chip strip: [op] · [mm:ss] · [Nfps].
        let _videoChipMode = '';
        const _fmtClipTime = (sec) => {
            if (!Number.isFinite(+sec) || sec <= 0) return '';
            const s = Math.max(0, +sec);
            const m = Math.floor(s / 60);
            const r = Math.floor(s % 60);
            return `${m}:${String(r).padStart(2, '0')}`;
        };
        const _renderVideoChips = () => {
            if (!isVideo) return;
            const item = _group.history[_currentIdx] || {};
            const range = viewer.el.getRange?.();
            const fullDur = +item.duration || 0;
            const clipDur = (range && Number.isFinite(+range.in) && Number.isFinite(+range.out))
                ? Math.max(0, range.out - range.in)
                : fullDur;
            const fps = +item.fps || +_group.fps || 0;
            const items = [];
            if (_videoChipMode) items.push({ text: (TOOL_LABELS[_videoChipMode] || _videoChipMode).toUpperCase(), accent: true });
            const t = _fmtClipTime(clipDur);
            if (t) items.push({ text: t });
            if (fps) items.push({ text: `${Math.round(fps)}fps` });
            viewer.el.setTopRight?.(items);
        };

        historyTools.on('activate', ({ mode }) => {
            if (_currentSelectionIndices.length > 0) historyList.el.exitSelectMode();
            mountOptions(mode);
            if (!isVideo) viewer.el.setActiveToolLabel?.(TOOL_LABELS[mode] ?? mode);
            else { _videoChipMode = mode || ''; _renderVideoChips(); }
        });

        // Set initial overlay label (no active tool yet)
        if (!isVideo) viewer.el.setActiveToolLabel?.('');
        else _renderVideoChips();

        // ── Active-generation registry / spinner ──────────────────────────────

        const _myGenIds = new Set();
        let _mascotLingerTimer = null;

        const _mascotShow = (src) => {
            clearTimeout(_mascotLingerTimer);
            _mascotEl.src = src;
            _mascotEl.classList.add('mascot-peek--visible');
        };
        const _mascotHide = (delay = 0) => {
            clearTimeout(_mascotLingerTimer);
            if (delay > 0) {
                _mascotLingerTimer = setTimeout(() => _mascotEl.classList.remove('mascot-peek--visible'), delay);
            } else {
                _mascotEl.classList.remove('mascot-peek--visible');
            }
        };

        const _setGenerating = (flag) => {
            viewer.el.setGenerating?.(flag);
            if (flag) _mascotShow('assets/mascot/idle.png');
            // hide handled per-event below
        };

        // Tool-only transforms (resize) — busy state without the mascot. Mascot
        // is reserved for model-driven generations dispatched via PromptBox.
        const _setBusy = (flag) => {
            viewer.el.setGenerating?.(flag);
        };

        for (const entry of activeGenerations.listFor('groupHistory', _group.id)) {
            if (entry.status !== 'running') continue;
            _myGenIds.add(entry.id);
            const _isResize = entry.operation === 'resize' || entry.operation === 'resizeVideo';
            if (_isResize) _setBusy(true);
            else _setGenerating(true);
            if (entry.latestPreviewUrl) {
                if (_isResize) _setBusy(false);
                else _setGenerating(false);
                _applyPreview(entry.latestPreviewUrl);
            }
        }

        /** Inline replacement for strategy.onGenerationPreview / onRehydratePreview. */
        function _applyPreview(url) {
            if (isVideo) {
                // Video workspace: latents are PNG/JPG frames, useless to play
                // in a video element. Skip painting them so the viewer stays
                // free for the user to queue more ops while generation runs.
                return;
            }
            viewer.el.isComparisonMode = false;
            if (url?.startsWith('blob:')) viewer.el.setMaskHidden?.(true);
            viewer.el.loadEntry?.({ filePath: url }, _currentIdx)?.catch?.(() => {});
        }

        function _restoreCurrentEntryAfterCancel() {
            if (isVideo) return;
            const item = _group?.history?.[_currentIdx];
            if (!item?.filePath) return;
            const load = viewer.el.loadEntry?.(item, _currentIdx);
            if (load?.then) {
                load.then(() => viewer.el.setMaskHidden?.(false))
                    .catch(err => clientLogger.warn('MpiGroupHistoryBlock', 'cancel restore failed', err));
            } else {
                viewer.el.setMaskHidden?.(false);
            }
        }

        _unsubs.push(Events.on('generation:started', ({ id, scope, groupId, operation }) => {
            if (scope !== 'groupHistory' || groupId !== _group.id) return;
            _myGenIds.add(id);
            // Tool-only transforms (resize) skip the mascot — model ops only.
            if (operation === 'resize' || operation === 'resizeVideo') {
                _setBusy(true);
            } else {
                _setGenerating(true);
            }
        }));

        _unsubs.push(Events.on('generation:preview', ({ id, url }) => {
            if (!_myGenIds.has(id)) return;
            // Video workspace: preview latents are static frames, not playable.
            // Leave viewer in its current state so user can queue more ops.
            if (isVideo) return;
            viewer.el.setGenerating?.(false);
            // keep mascot visible — generation still running (latents incoming)
            _applyPreview(url);
        }));

        _unsubs.push(Events.on('generation:complete', ({ id, item, group }) => {
            if (!_myGenIds.has(id)) return;
            _myGenIds.delete(id);
            viewer.el.setGenerating?.(false);
            // Tool-only transforms (resize) skip the mascot — model ops only.
            if (item?.operation !== 'resize' && item?.operation !== 'resizeVideo') {
                _mascotShow('assets/mascot/happy.png');
                _mascotHide(2000);
            }
            _canvasHasMask = false;
            _refreshOpOptions();
            const _wasReplace = _group.history?.some(entry => entry.id === item.id);
            _group = group;
            _currentIdx = _group.selectedIndex;
            if (_wasReplace) {
                historyList.el.replaceEntry?.(item);
            } else {
                historyList.el.appendEntry(item);
            }
            Events.emit('history:stats-dirty', { group: _group });
            if (isVideo) {
                viewer.el.exitCropMode?.();
                viewer.el.loadVideo?.(resolveMediaUrl(item.filePath), {
                    fps:        item.fps || _group.fps || 24,
                    duration:   item.duration,
                    frameCount: item.frameCount,
                    hasAudio:   item.hasAudio,
                    trim:       item.trim,
                });
            } else {
                viewer.el.exitMode?.();
                viewer.el.loadEntry?.(item, _currentIdx);
                viewer.el.setMaskHidden?.(false);
            }
            // Resize tool stays mounted across Apply — re-target the active
            // item so its thumbnail re-extracts and the inline preview
            // refreshes on the new entry.
            if (item?.operation === 'resize' || item?.operation === 'resizeVideo') {
                _options?.el?.setCurrentItem?.(item);
            }
        }));

        _unsubs.push(Events.on('generation:error',     ({ id }) => {
            if (_myGenIds.delete(id)) {
                viewer.el.setGenerating?.(false);
                _mascotHide(0);
                _restoreCurrentEntryAfterCancel();
            }
        }));
        _unsubs.push(Events.on('generation:cancelled', ({ id }) => {
            if (_myGenIds.delete(id)) {
                viewer.el.setGenerating?.(false);
                _mascotHide(0);
                _restoreCurrentEntryAfterCancel();
            }
        }));

        // ── OS-file drop overlay ───────────────────────────────────────────────

        const _dropOverlay = MpiMediaDropOverlay.mount(document.createElement('div'), {
            onDrop: async ({ files }) => {
                const project = state.currentProject;
                if (!project?.folderPath || !project?.id) {
                    clientLogger.warn('MpiGroupHistoryBlock', 'No current project on drop');
                    return;
                }
                for (const { file, mediaType } of files) {
                    const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id);
                    if (uploaded) _pb?.el?.injectMedia?.({ url: uploaded.filePath, mediaType });
                }
            },
        });
        el.appendChild(_dropOverlay.el);

        let _histDragCounter = 0;
        const _isFileDrag = (e) =>
            e.dataTransfer?.types?.includes('Files') &&
            !e.dataTransfer.types.includes('application/mpi-media');
        const _isVideoPromptToolActive = () =>
            isVideo && historyTools?.el?.getActiveMode?.() === 'prompt';

        const _onHistDragEnter = (e) => {
            if (_isVideoPromptToolActive()) return;
            if (!_isFileDrag(e) || !state.currentProject) return;
            _histDragCounter++;
            _dropOverlay.el.show();
        };
        const _onHistDragLeave = (e) => {
            if (_isVideoPromptToolActive()) return;
            if (!_isFileDrag(e)) return;
            if (_histDragCounter > 0 && --_histDragCounter === 0) _dropOverlay.el.hide();
        };
        const _onHistDrop = () => {
            _histDragCounter = 0;
            _dropOverlay.el.hide();
        };
        const _onHistDragOver = (e) => {
            if (_isVideoPromptToolActive()) return;
            if (_isFileDrag(e)) e.preventDefault();
        };

        window.addEventListener('dragenter', _onHistDragEnter);
        window.addEventListener('dragleave', _onHistDragLeave);
        window.addEventListener('dragover',  _onHistDragOver);
        window.addEventListener('drop',      _onHistDrop);

        // ── PromptBox ─────────────────────────────────────────────────────────

        const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));
        let _pb = null;

        function _setPromptOperation(operation, { remember = false } = {}) {
            activeOperation = operation;
            if (remember) _preferredOperation = operation;
            if (!_pb?.el) return;
            _isProgrammaticOperationSync = true;
            try {
                _pb.el.setOperation(activeOperation);
            } finally {
                _isProgrammaticOperationSync = false;
            }
        }

        /** Sync PromptBox operation list + preserve current choice when available. */
        function _refreshOpOptions() {
            const opts = _opOptions();
            _pb?.el?.updateContext({
                ..._baseCtx,
                hasMask: _canvasHasMask,
                filterNoInputOps: true,
                historyMode: true,
            });
            const preferredAvailable = opts.find(o => o.value === _preferredOperation && !o.disabled);
            if (preferredAvailable && _preferredOperation !== activeOperation) {
                _setPromptOperation(_preferredOperation);
                refreshGroupHistoryRadial(opts);
                return;
            }
            const currentStillOk = opts.find(o => o.value === activeOperation && !o.disabled);
            if (!currentStillOk) {
                const fallback = opts.find(o => !o.disabled);
                if (fallback) {
                    _setPromptOperation(fallback.value);
                }
            }
            // Single source of truth: ship the same op list to the radial that
            // PromptBox uses. _opOptions() pixel-scans the live mask via
            // viewer.el.hasMask() (preview-mode aware), so radial reflects
            // current capability instantly — no per-stroke event needed.
            refreshGroupHistoryRadial(opts);
        }

        /** Gate prompt tool button disabled state. Frame-ops models stay enabled
         *  even without staged media so the user can drop a frame to unlock. */
        function _syncPromptToolDisabled() {
            const has = _shouldShowPromptBox();
            historyTools.el.setDisabled?.({
                prompt: {
                    disabled: !has,
                    reason: has ? '' : 'No prompt-driven ops available for this model',
                },
            });
            return has;
        }

        function _mountPromptBoxIfNeeded({ force = false } = {}) {
            if (_pb?.el) return true;
            if (!activeModel) return false;
            // Normal path requires an op the current media context unlocks.
            // `force: true` bypasses that gate — used when an external action
            // (e.g. frame-grab from context menu) is about to inject media
            // that will unblock an op.
            if (!force && !_shouldShowPromptBox()) return false;

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
                historyMode: true,
            });

            _unsubs.push(_pb.on('settings', () => _settingsOverlay.el.open({ modelId: activeModel.id })));
            _unsubs.push(_pb.on('model-change', ({ model }) => {
                // markAsLast: false — History is a typed workspace (image or video
                // group). Its selection is bound to the group's mediaType, not a
                // user choice of "default mode," so it must not influence the
                // marker Gallery uses to restore the active slot.
                setSelectedModelId(model.mediaType, model.id, { markAsLast: false });
                activeModelId = model.id;
                activeModel = model;
                // PromptBox.setModel already updated internal state + picked op
                // for current media context. Just refresh Block-side UI.
                _refreshOpOptions();
                _syncPromptToolDisabled();
            }));
            _unsubs.push(_pb.on('operation-change', ({ operation }) => {
                activeOperation = operation;
                if (!_isProgrammaticOperationSync) _preferredOperation = operation;
            }));
            _unsubs.push(_pb.on('media-change', () => {
                // PromptBox media count drives op availability in history
                // workspace (frame-grab inject must unlock i2v immediately).
                _syncBaseCtxFromPromptBox();
                _refreshOpOptions();
                _syncPromptToolDisabled();
            }));
            _unsubs.push(_pb.on('run', ({ operation, positive, negative, mediaItems, injectionParams, previewOnly }) => {
                const maskDataUrl = viewer.el.hasMask?.()
                    ? viewer.el.getCurrentMaskDataURL?.()
                    : null;
                // History workspace forces single-stage execution. `historyMode: true`
                // is plumbed into the executor payload so `Preview_Only` is forced
                // to false on `_ms` ops regardless of any stale previewStage toggle.
                _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl, injectionParams, previewOnly, historyMode: true });
            }));
            _unsubs.push(_pb.on('cancel', ({ mode } = {}) => {
                const active = activeGenerations.listFor('groupHistory', _group.id).filter(e => e.status === 'running');
                const target = mode === 'queue' ? active[0] : active.at(-1);
                if (target) activeGenerations.cancel(target.id);
                else _activeExec?.cancel();
                if (mode !== 'queue') _activeExec = null;
                const noRunning = !activeGenerations.list().some(e => e.status === 'running');
                const queueIdle = (state.generationQueueCount || 0) === 0;
                if (noRunning && (mode !== 'queue' || queueIdle)) {
                    if (mode !== 'queue') state.generationQueueCount = 0;
                    Events.emit('promptbox:generation-end');
                }
                refreshQueueDepth();
                Events.emit('tool:cancelled', { tool: 'groupHistory' });
            }));
            _unsubs.push(_pb.on('queue-clear', () => {
                clearPendingQueue();
            }));
            return true;
        }

        function _reuseIncludes(value = {}) {
            return {
                prompt: value.prompt === true,
                settings: value.settings === true,
                model: value.model === true,
                images: value.images === true,
            };
        }

        function _handlePromptReuse(payload = {}) {
            const options = state.promptReuseOptions || {};
            if (options.ask === true) {
                const dialog = MpiReusePromptDialog.mount(document.createElement('div'), {
                    includes: options,
                    showSource: false,
                });
                dialog.on('apply', async ({ includes }) => {
                    await _applyPromptReuse(payload, _reuseIncludes(includes));
                    dialog.destroy?.();
                });
                dialog.on('cancel', () => dialog.destroy?.());
                dialog.el.show?.();
                return;
            }
            _applyPromptReuse(payload, _reuseIncludes(options));
        }

        async function _applyPromptReuse(payload = {}, includes = { prompt: true, settings: true, model: true, images: true }) {
            const use = _reuseIncludes(includes);
            if (!use.prompt && !use.settings && !use.model && !use.images) return;

            let targetModel = activeModel;
            if (use.model && payload.modelId) {
                targetModel = installedModels.find(m => m.id === payload.modelId) || null;
            }
            if (!targetModel) {
                const label = payload.modelId || 'Unknown model';
                _showToast(`Model "${label}" is not installed for this workspace`, 'warning');
                use.model = false;
                use.settings = false;
                targetModel = activeModel;
                if (!targetModel && use.prompt) _pb?.el?.injectPrompts?.({ positive: payload.positive || '', negative: payload.negative || '' });
                if (!targetModel) return;
            }
            if (use.model && targetModel.mediaType !== modeKind) {
                _showToast('That prompt uses a different media type', 'warning');
                return;
            }

            if (use.model) {
                activeModel = targetModel;
                activeModelId = targetModel.id;
                setSelectedModelId(targetModel.mediaType, targetModel.id, { markAsLast: false });
                _syncPromptToolDisabled();
            }
            _mountPromptBoxIfNeeded({ force: true });
            if (!_pb?.el) return;

            if (use.model) _pb.el.setModel?.(targetModel);
            if (use.prompt) {
                _pb.el.injectPrompts?.({ positive: payload.positive || '', negative: payload.negative || '' });
            }
            if (use.images) {
                _pb.el.clearMedia?.();
                const mediaItems = await resolvePromptReuseMediaItems(payload, state.currentProject);
                if (!mediaItems.length && String(payload.operation || '').startsWith('i2v')) {
                    _showToast('No saved frame images were found for this older I2V entry.', 'warning');
                }
                for (const item of mediaItems) {
                    _pb.el.injectMedia?.({ url: item.url || item.filePath, mediaType: item.mediaType || item.type, role: item.role });
                }
            }
            _syncBaseCtxFromPromptBox();

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
                _setPromptOperation(targetOperation, { remember: true });
            }
            _refreshOpOptions();
            historyTools.el.setMode?.('prompt');
        }

        // ── Initial mode resolution ───────────────────────────────────────────

        _syncPromptToolDisabled();
        _mountPromptBoxIfNeeded();

        // Initial tool: prompt if available (including frame-drop unlock), else crop.
        if (_shouldShowPromptBox()) historyTools.el.setMode('prompt');
        else                        historyTools.el.setMode('crop');

        // ── Generation runners ───────────────────────────────────────────────

        let _activeExec = null;

        function _activeVideoTrim(currentItem) {
            if (!isVideo) return null;
            const range = viewer.el.getRange?.() || currentItem?.trim || null;
            const rangeIn = Number(range?.in);
            const rangeOut = Number(range?.out);
            if (!Number.isFinite(rangeIn) || !Number.isFinite(rangeOut) || rangeOut <= rangeIn) return null;
            const duration = Number(currentItem?.duration) || Number(_group.duration) || 0;
            if (duration > 0 && rangeIn <= 1e-3 && Math.abs(rangeOut - duration) <= 1e-3) return null;
            return { in: rangeIn, out: rangeOut };
        }

        function _generationFromPromptPayload({ operation, positive, negative, mediaItems = [], maskDataUrl, injectionParams = {}, previewOnly = false, historyMode = false, extend = false, sourceItemId = null }) {
            if (!activeModel) return;

            const currentItem = _group.history[_currentIdx];
            const currentMediaType = isVideo ? 'video' : 'image';
            const mediaSlots = getCommandMediaInputs(operation);
            const wantsStartFrame = mediaSlots.some(slot => slot.key === 'startFrame');
            const wantsCurrentType = mediaSlots.some(slot => slot.mediaType === currentMediaType && slot.required !== false);
            const hasCurrentTypeMedia = mediaItems.some(m => m.mediaType === currentMediaType);
            let resolvedMedia = mediaItems;

            if (currentItem?.filePath) {
                const currentMedia = {
                    url: resolveMediaUrl(currentItem.filePath),
                    mediaType: currentMediaType,
                    source: 'history',
                };
                if (!isVideo && wantsStartFrame) {
                    resolvedMedia = [{ ...currentMedia, role: 'startFrame' }, ...mediaItems];
                } else if (wantsCurrentType && !hasCurrentTypeMedia) {
                    resolvedMedia = [currentMedia, ...mediaItems];
                } else if (!mediaSlots.length && !hasCurrentTypeMedia) {
                    resolvedMedia = [currentMedia, ...mediaItems];
                }
            }
            const resolvedMask = maskDataUrl !== undefined
                ? maskDataUrl
                : (viewer.el.hasMask?.() ? viewer.el.getCurrentMaskDataURL?.() : null);

            return {
                config: { operation, model: activeModel, positive, negative, mediaItems: resolvedMedia, maskDataUrl: resolvedMask, injectionParams, previewOnly, historyMode, extend, sourceItemId },
                opts: { existingGroup: _group, scope: 'groupHistory', groupId: _group.id },
            };
        }

        function _runGenerate(payload) {
            const next = _generationFromPromptPayload(payload);
            if (!next) return;

            _setGenerating(true);
            const callbacks = {
                onCancel: () => { _activeExec = null; },
                getNextGeneration: () => _generationFromPromptPayload(_pb?.el?.getRunPayload?.() || payload),
            };
            enqueueGeneration(next.config, callbacks, next.opts);
            _activeExec = null; // Cue dispatcher manages exec lifecycle
        }

        function _runVideoTool(operation, injectionParams = {}) {
            const currentItem = _group.history[_currentIdx];
            if (!currentItem?.filePath) { _showToast('No source video', 'error'); return; }
            const trim = _activeVideoTrim(currentItem);
            const mediaItems = [{
                id: currentItem.id,
                url: resolveMediaUrl(currentItem.filePath),
                mediaType: 'video',
                source: 'history',
                ...(trim ? { trim } : {}),
            }];
            const videoModel = { id: null, mediaType: 'video' };
            _setGenerating(true);
            enqueueGeneration(
                { operation, model: videoModel, positive: '', negative: '', mediaItems, injectionParams },
                {
                    onCancel: () => {
                        _activeExec = null;
                        _setGenerating(false);
                    },
                    onError: () => {
                        _activeExec = null;
                        _setGenerating(false);
                    },
                    onComplete: () => {
                        _activeExec = null;
                    },
                },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
            _activeExec = null; // Cue dispatcher manages exec lifecycle.
        }

        function _runImageTool(operation, injectionParams = {}) {
            const currentItem = _group.history[_currentIdx];
            if (!currentItem?.filePath) { _showToast('No source image', 'error'); return; }
            const mediaItems = [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'image', source: 'history' }];
            const imageModel = { id: null, mediaType: 'image' };
            _setGenerating(true);
            enqueueGeneration(
                { operation, model: imageModel, positive: '', negative: '', mediaItems, injectionParams },
                {
                    onCancel: () => {
                        _activeExec = null;
                        _setGenerating(false);
                    },
                    onError: () => {
                        _activeExec = null;
                        _setGenerating(false);
                    },
                    onComplete: () => {
                        _activeExec = null;
                    },
                },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
            _activeExec = null; // Cue dispatcher manages exec lifecycle.
        }

        // ── Video snapshot / crop helpers ────────────────────────────────────

        function _handleResizeApply(mode, payload = {}) {
            const resizeParams = payload?.params || payload || {};
            const currentItem = _group.history[_currentIdx];
            const wantVideo = mode === 'resizeVideo';
            const mediaType = wantVideo ? 'video' : 'image';
            if (!currentItem?.filePath) {
                _showToast(wantVideo ? 'No source video' : 'No source image', 'error');
                return;
            }

            const trim = wantVideo ? _activeVideoTrim(currentItem) : null;
            const mediaItems = [{
                id:        currentItem.id,
                url:       resolveMediaUrl(currentItem.filePath),
                mediaType,
                source:    'history',
                ...(trim ? { trim } : {}),
            }];
            const opModel = { id: null, mediaType };

            _setBusy(true);
            enqueueGeneration(
                {
                    operation: wantVideo ? 'resizeVideo' : 'resize',
                    model: opModel,
                    positive: '',
                    negative: '',
                    mediaItems,
                    injectionParams: resizeParams,
                },
                {
                    onCancel: () => {
                        _activeExec = null;
                        _setBusy(false);
                    },
                    onError: () => {
                        _activeExec = null;
                        _setBusy(false);
                        _showToast('Resize failed', 'error');
                    },
                    onComplete: () => {
                        _activeExec = null;
                    },
                },
                { existingGroup: _group, scope: 'groupHistory', groupId: _group.id }
            );
            _activeExec = null; // Cue dispatcher manages exec lifecycle.
        }

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
                    pixelDimensions: uploaded.pixelDimensions,
                });
                const group = createItemGroup('image', { name: displayName });
                const finalGroup = appendToHistory(group, item);
                await addGroup(finalGroup);

                Events.emit('media:imported', {
                    url: uploaded.filePath,
                    filename: uploaded.filename,
                    itemId: uploaded.itemId,
                    pixelDimensions: uploaded.pixelDimensions,
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
                const cropBody = {
                    folderPath: project.folderPath,
                    sourcePath,
                    cropRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
                    groupId: _group.id,
                    itemId:  currentItem?.id,
                };
                const trim = currentItem?.trim;
                if (trim && Number.isFinite(+trim.in) && Number.isFinite(+trim.out) && +trim.out > +trim.in) {
                    cropBody.trimIn  = +trim.in;
                    cropBody.trimOut = +trim.out;
                }
                const res = await fetch('/api/video/crop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cropBody),
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
                    trim:       data.item.trim,
                });
                _showToast('Cropped video saved', 'success');
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'video crop failed', err);
                _showToast('Video crop failed: ' + err.message, 'error');
            }
        }

        async function _handleReverseVideo() {
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            const currentItem = _group.history[_currentIdx];
            const sourcePath = currentItem?.filePath;
            if (!sourcePath) { _showToast('No source video', 'error'); return; }

            _showToast('Reversing video…', 'info');
            try {
                const body = {
                    folderPath: project.folderPath,
                    sourcePath,
                    groupId: _group.id,
                    itemId:  currentItem?.id,
                };
                const trim = currentItem?.trim;
                if (trim && Number.isFinite(+trim.in) && Number.isFinite(+trim.out) && +trim.out > +trim.in) {
                    body.trimIn  = +trim.in;
                    body.trimOut = +trim.out;
                }
                const res = await fetch('/api/video/reverse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
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
                    trim:       data.item.trim,
                });
                _showToast('Reversed video saved', 'success');
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'video reverse failed', err);
                _showToast('Video reverse failed: ' + err.message, 'error');
            }
        }

        // ── History list wiring ──────────────────────────────────────────────

        historyList.on('entry-selected', async ({ idx, item }) => {
            if (isVideo) {
                viewer.el.loadVideo?.(resolveMediaUrl(item.filePath), {
                    fps:        item.fps || _group.fps || 24,
                    duration:   item.duration,
                    frameCount: item.frameCount,
                    hasAudio:   item.hasAudio,
                    trim:       item.trim,
                });
            } else {
                // Viewer's loadEntry restores active tool mode internally.
                await viewer.el.loadEntry?.(item, idx);
                viewer.el.setMaskHidden?.(false);
            }
            _currentIdx = idx;
            _group = promoteHistoryEntry(_group, idx);
            _persistGroup();
            _options?.el?.setCurrentItem?.(item);
        });

        historyList.on('reuse', (payload) => {
            _handlePromptReuse(payload);
        });

        historyList.on('selection-changed', ({ indices }) => {
            _currentSelectionIndices = indices;
            if (!isVideo) viewer.el.setCompareEnabled?.(indices.length === 2);
            if (indices.length === 0) {
                if (_shouldShowPromptBox()) _pb?.el?.show();
                return;
            }
            // Any selection: ensure viewer is not in a tool mode.
            if (!isVideo) viewer.el.exitMode?.();
            _pb?.el?.hide();
        });

        const _onHistorySelectionExited = () => {
            _currentSelectionIndices = [];
            if (!isVideo) {
                viewer.el.clearCompare?.();
                viewer.el.setCompareEnabled?.(false);
            }
            if (_shouldShowPromptBox()) _pb?.el?.show();
        };

        _unsubs.push(Hotkeys.bind('history.return.gallery', (event) => {
            const escapeCtx = event?.mpiEscapeContext || {};
            if (
                event?.mpiEscapeOverlayClosed ||
                escapeCtx.activeDismissableUi ||
                escapeCtx.focusModeActive ||
                escapeCtx.textEntryFocused ||
                escapeCtx.promptBoxFocused
            ) {
                return;
            }

            if (_currentSelectionIndices.length > 0) {
                historyList.el.exitSelectMode();
                _onHistorySelectionExited();
                return;
            }

            navigate(PAGE_GALLERY);
        }));

        if (!isVideo) {
            viewer.on('compare-clicked', async () => {
                const indices = _currentSelectionIndices;
                if (indices.length !== 2) return;
                const [idxA, idxB] = indices;
                if (historyTools.el.getActiveMode?.() === 'prompt') {
                    await viewer.el.swapToCanvas?.();
                }
                await viewer.el.loadCompare?.(_group.history[idxA], _group.history[idxB]);
                viewer.el.setMaskHidden?.(false);
            });
        }

        historyList.on('selection-exited', _onHistorySelectionExited);

        historyList.on('compare-requested', async ({ indices }) => {
            if (indices.length !== 2) return;
            const [idxA, idxB] = indices;
            if (isVideo) {
                // Video viewer has no inline compare surface — use full-screen overlay
                // (parallel to MpiGalleryBlock). Lazy-mount on first use.
                if (!_compareOverlay) {
                    _compareOverlay = MpiCompareOverlay.mount(document.createElement('div'));
                }
                _compareOverlay.el.open(_group.history[idxA], _group.history[idxB]);
                return;
            }
            // Compare needs MpiCanvas alive. If in prompt mode (preview swapped),
            // remount canvas first so loadCompare doesn't hit a destroyed canvas.
            if (historyTools.el.getActiveMode?.() === 'prompt') {
                await viewer.el.swapToCanvas?.();
            }
            await viewer.el.loadCompare?.(_group.history[idxA], _group.history[idxB]);
            viewer.el.setMaskHidden?.(false);
        });

        historyList.on('combine-requested', async ({ indices }) => {
            if (!isVideo || !Array.isArray(indices) || indices.length < 2) return;
            const project = state.currentProject;
            if (!project?.folderPath) { _showToast('No project context', 'error'); return; }
            historyList.el.exitSelectMode();
            // History list emits chronological indices (per Phase 1.1) — map
            // to source itemIds in click order, not numerical order.
            const itemIds = indices
                .map(i => _group.history[i]?.id)
                .filter(Boolean);
            if (itemIds.length < 2) { _showToast('Need ≥2 video items', 'error'); return; }
            await _runCombine(itemIds);
        });

        historyList.on('add-to-gallery', async ({ index }) => {
            if (typeof index !== 'number') return;
            const item = _group.history[index];
            if (!item?.filePath) { _showToast('No source media', 'error'); return; }
            historyList.el.exitSelectMode();
            await _addItemToGallery(item, isVideo ? 'video' : 'image');
        });

        historyList.on('download-selected', ({ indices }) => {
            const items = indices
                .map(i => _group.history[i])
                .filter(item => item?.filePath);
            downloadMediaFiles(state.currentProject, items);
            historyList.el.exitSelectMode();
        });

        historyList.on('download-mask', async ({ index }) => {
            if (isVideo || typeof index !== 'number') return;
            const item = _group.history[index];
            if (!item) return;
            const maskDataUrl = await viewer.el.getMaskDataURLForEntry?.(item);
            if (!maskDataUrl) {
                _showToast('No mask for this entry', 'warning');
                return;
            }
            _downloadMaskDataURL(maskDataUrl, item);
            historyList.el.exitSelectMode();
        });

        async function _runCombine(itemIds) {
            const project = state.currentProject;
            if (!project?.folderPath) return;
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
                try { await concatPromise; } catch (_) { /* HTTP already succeeded */ }

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
                // History workspace: append to current group (video group only).
                _group = appendToHistory(_group, newItem);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(newItem);
                viewer.el.loadVideo?.(resolveMediaUrl(newItem.filePath), { fps: newItem.fps || _group.fps || 24, trim: newItem.trim });
                _showToast('Videos combined');
            } catch (err) {
                clientLogger.error('MpiGroupHistoryBlock', 'combine failed', err);
                const _short = String(err.message || 'unknown').split('\n')[0].slice(0, 160);
                _showToast(`Combine failed: ${_short}`, 'error');
            }
        }

        async function _addItemToGallery(item, mediaType) {
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            try {
                // Resolve source path → File via fetch → re-upload via the
                // shared upload helper (writes a new sidecar with a new id).
                const url = resolveMediaUrl(item.filePath);
                const fetchResp = await fetch(url);
                if (!fetchResp.ok) throw new Error(`fetch source failed: ${fetchResp.status}`);
                const blob = await fetchResp.blob();
                const filename = extractFilenameFromPath(item.filePath) || `media.${mediaType === 'video' ? 'mp4' : 'png'}`;
                const file = new File([blob], filename, { type: blob.type });
                const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id, {
                    filenamePrefix: 'gallery',
                    operation: 'add-to-gallery',
                });
                if (!uploaded) throw new Error('upload returned null');
                // Build a fresh gallery group from the uploaded item.
                const displayName = truncateCardName((uploaded.filename || filename).replace(/\.[^.]+$/, ''));
                const newItem = mediaType === 'video'
                    ? createVideoItem({
                        id:              uploaded.itemId || crypto.randomUUID(),
                        filePath:        uploaded.filePath,
                        operation:       'add-to-gallery',
                        displayName,
                        pixelDimensions: uploaded.pixelDimensions || item.pixelDimensions || { w: 0, h: 0 },
                        thumbPath:       uploaded.thumbPath ?? null,
                        fps:             item.fps ?? 0,
                        duration:        item.duration ?? 0,
                        frameCount:      item.frameCount ?? 0,
                        hasAudio:        item.hasAudio ?? false,
                    })
                    : createImageItem({
                        id:              uploaded.itemId || crypto.randomUUID(),
                        filePath:        uploaded.filePath,
                        operation:       'add-to-gallery',
                        displayName,
                        pixelDimensions: uploaded.pixelDimensions || item.pixelDimensions || { w: 0, h: 0 },
                    });
                const newGroup = createItemGroup(mediaType, {
                    name: newItem.displayName,
                    width: newItem.pixelDimensions?.w || 0,
                    height: newItem.pixelDimensions?.h || 0,
                });
                const populated = appendToHistory(newGroup, newItem);
                await addGroup(populated);
                _showToast('Added to gallery');
            } catch (err) {
                clientLogger.error('MpiGroupHistoryBlock', 'add-to-gallery failed', err);
                _showToast(`Add to gallery failed: ${err.message}`, 'error');
            }
        }

        async function _performHistoryDelete(indices) {
            if (!indices.length) return;
            historyList.el.exitSelectMode();
            const sorted = [...indices].sort((a, b) => b - a);

            const project = state.currentProject;
            let deletedIndices = sorted;
            if (project?.folderPath) {
                deletedIndices = [];
                for (const idx of sorted) {
                    const item = _group.history[idx];
                    if (!item) continue;
                    const filename = extractFilenameFromPath(item.filePath);
                    if (filename) {
                        try {
                            const res = await fetch(
                                `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}&itemId=${encodeURIComponent(item.id)}`,
                                { method: 'DELETE' }
                            );
                            if (!res.ok) {
                                clientLogger.warn('MpiGroupHistoryBlock', 'delete media returned non-ok status', {
                                    status: res.status,
                                    itemId: item.id,
                                    filename,
                                });
                                continue;
                            }
                            deletedIndices.push(idx);
                        } catch (err) {
                            clientLogger.warn('MpiGroupHistoryBlock', 'delete media failed:', err);
                        }
                    }
                }
            }
            if (!deletedIndices.length) return;

            // If user is deleting every remaining entry, drop the whole group
            // and return to gallery. `removeHistoryEntry` refuses to leave a
            // group empty, so this case must short-circuit.
            const willEmptyGroup = deletedIndices.length >= _group.history.length;
            if (willEmptyGroup) {
                Events.emit('media:deleted', { count: deletedIndices.length });
                await removeGroup(_group.id);
                navigate(PAGE_GALLERY);
                return;
            }

            for (const idx of deletedIndices) _group = removeHistoryEntry(_group, idx);

            _currentIdx = _group.selectedIndex ?? 0;
            _persistGroup();
            historyList.el.removeEntries(deletedIndices, _currentIdx);
            _currentSelectionIndices = [];

            // Load new active entry.
            const cur = _group.history[_currentIdx];
            if (cur) {
                if (isVideo) viewer.el.loadVideo?.(resolveMediaUrl(cur.filePath), { fps: cur.fps || _group.fps || 24, trim: cur.trim });
                else         viewer.el.loadEntry?.(cur, _currentIdx);
            }

            if (!isVideo) {
                viewer.el.clearCompare?.();
                viewer.el.setCompareEnabled?.(false);
            }
            if (historyTools.el.getActiveMode?.() === 'prompt' && _shouldShowPromptBox()) {
                _pb?.el?.show();
            }

            Events.emit('media:deleted', { count: deletedIndices.length });
            Events.emit('history:stats-dirty', { group: _group });
        }

        const _historyDeleteDialog = MpiOkCancel.mount(document.createElement('div'), {
            title:       'Delete',
            text:        'Permanently delete the selected entries and their media files?',
            okLabel:     'Delete',
            cancelLabel: 'Cancel',
        });
        let _pendingDeleteIndices = [];

        _historyDeleteDialog.on('ok', async () => {
            const indices = _pendingDeleteIndices;
            _pendingDeleteIndices = [];
            await _performHistoryDelete(indices);
        });

        _historyDeleteDialog.on('cancel', () => { _pendingDeleteIndices = []; });

        historyList.on('delete-selected', ({ indices, source }) => {
            if (!indices.length) return;
            if (indices.includes(0)) {
                // Deleting the original entry cascades to the whole card.
                // Single warning pop-up regardless of source — user must
                // confirm before the entire group is removed.
                const cascadeDialog = MpiOkCancel.mount(document.createElement('div'), {
                    title:       'Delete entire card?',
                    text:        'The first entry is the original — deleting it removes the card and every entry inside it. This cannot be undone.',
                    okLabel:     'Delete card',
                    cancelLabel: 'Cancel',
                });
                cascadeDialog.on('ok', async () => {
                    const all = _group.history.map((_, i) => i);
                    cascadeDialog.destroy?.();
                    await _performHistoryDelete(all);
                });
                cascadeDialog.on('cancel', () => cascadeDialog.destroy?.());
                cascadeDialog.el.show();
                return;
            }
            if (source === 'context') {
                _performHistoryDelete(indices);
                return;
            }
            _pendingDeleteIndices = [...indices];
            _historyDeleteDialog.el.show();
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
                    historyMode: true,
                });
                _refreshOpOptions();
            });

            viewer.on('mask-ready', () => {
                _canvasHasMask = true;
                _refreshOpOptions();
                _syncPromptToolDisabled();
                _mountPromptBoxIfNeeded();
            });
            viewer.on('mask-clear', () => {
                _canvasHasMask = false;
                _refreshOpOptions();
                _syncPromptToolDisabled();
                _mountPromptBoxIfNeeded();
            });
        }

        // ── Video-viewer-only events: trim persistence ─────────────────────────

        if (isVideo) {
            let _trimTimer = null;
            const _flushTrim = (rangeIn, rangeOut) => {
                const project = state.currentProject;
                const item = _group.history[_currentIdx];
                if (!project?.id || !project?.folderPath || !item?.id) return;
                const isFull = !(rangeOut > rangeIn) || (rangeIn <= 1e-3 && Math.abs(rangeOut - (item.duration || 0)) <= 1e-3);
                const updates = isFull ? { trim: null } : { trim: { in: +rangeIn, out: +rangeOut } };
                // Mirror in-memory item (sidecar parity per feedback memory).
                if (isFull) delete item.trim; else item.trim = updates.trim;
                fetch(`/project-media/${project.id}/update-meta?folderPath=${encodeURIComponent(project.folderPath)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId: item.id, updates })
                }).catch((err) => clientLogger.warn('MpiGroupHistoryBlock', 'trim persist failed', err));
            };

            videoControlBar?.on('range-change', ({ in: i, out: o }) => {
                _renderVideoChips();
                if (_trimTimer) clearTimeout(_trimTimer);
                _trimTimer = setTimeout(() => { _trimTimer = null; _flushTrim(i, o); }, 250);
            });
            viewer.on('loadedmetadata', () => _renderVideoChips());

            _unsubs.push(() => { if (_trimTimer) { clearTimeout(_trimTimer); _trimTimer = null; } });
        }

        // ── Radial → operation sync ───────────────────────────────────────────

        _unsubs.push(Events.on('workspace:set-operation', ({ operation }) => {
            // Lazy-mount PromptBox if model became available mid-session.
            if (!_pb?.el) _mountPromptBoxIfNeeded();
            if (!_pb?.el) return;
            const opts = _opOptions();
            const match = opts.find(o => o.value === operation && !o.disabled);
            if (!match) return;
            _setPromptOperation(operation, { remember: true });
            if (historyTools.el.getActiveMode?.() !== 'prompt') {
                historyTools.el.setMode('prompt');
            } else {
                // Already in prompt mode — setMode no-ops, so explicitly show
                // PromptBox in case it was hidden by mask-state churn.
                _pb.el.show();
            }
        }));

        // ── State model change + installed-models reactivity ─────────────────

        _unsubs.push(Events.onState('s_selectedModelIdByType', (value) => {
            // Only react when the slot for THIS workspace's mediaType changes.
            // Foreign-type writes (e.g. video selection while viewing an image
            // group) must not coerce the active model here.
            const next = value?.[modeKind];
            if (!next || next === activeModelId) return;
            const newModel = installedModels.find(m => m.id === next);
            if (newModel && newModel !== activeModel) {
                activeModelId = next;
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

        // ── Zero-installed state ───────────────────────────────────────────────
        // History workspace always has existing media (it is only ever opened by
        // clicking a group card in Gallery). Per product decisions 2 & 3: when
        // zero models are installed while viewing history, keep the workspace
        // read-only — do NOT auto-open the Models slide-over and do NOT mount
        // PromptBox. The user can still browse their media uninterrupted.
        // PromptBox mounts via the s_installedModelIds watcher (option A) when
        // models become available, not via the removed `models:closed` event.
        _unsubs.push(Events.onState('s_installedModelIds', () => {
            const currentModels = getModelsByType(modeKind).filter(m => m.installed !== false);
            // If activeModel was null (zero-installed on entry) and models have now
            // become available, re-resolve so PromptBox can mount. Without this,
            // activeModel stays null for the lifetime of the block even after install.
            if (!activeModel && currentModels.length > 0) {
                const { model: resolvedModel, modelId: resolvedModelId } =
                    resolveActiveModel(modeKind);
                if (resolvedModel) {
                    activeModel   = resolvedModel;
                    activeModelId = resolvedModelId;
                    _refreshOpOptions();
                    const nowHas = _syncPromptToolDisabled();
                    if (nowHas) _mountPromptBoxIfNeeded();
                }
            }
            _pb?.el?.setModelList?.(currentModels);
        }));

        // Seed radial with current op set on mount.
        refreshGroupHistoryRadial(_opOptions());

        // Pre-render hook from radial: refresh op list synchronously before
        // items render. _opOptions() pixel-scans the live mask (preview-mode
        // aware) so paint strokes made while still in mask mode — no mode-exit
        // event yet — are reflected immediately.
        _unsubs.push(Events.on('radial:will-open', () => {
            refreshGroupHistoryRadial(_opOptions());
        }));

        // Clear on teardown so a stale set doesn't flash if Tab is held during
        // navigation back to gallery.
        _unsubs.push(() => clearGroupHistoryRadial());

        // ── Video-viewer context menu (Set as start/end frame) ──────────────
        // Wired only in video groups. Right-click on the video element emits
        // `video-viewer:context-menu`; we build a menu with two frame-grab
        // entries. Items disabled when no installed video model supports I2V.

        /** @returns {boolean} */
        function _anyInstalledModelHasI2V() {
            return getModelsByType('video')
                .filter(m => m.installed !== false)
                .some(m => Array.isArray(m.supportedOps) && m.supportedOps.some(op => op.startsWith('i2v')));
        }

        /** @returns {Object|null} */
        function _findFirstI2VCapableModel() {
            return getModelsByType('video')
                .filter(m => m.installed !== false)
                .find(m => Array.isArray(m.supportedOps) && m.supportedOps.some(op => op.startsWith('i2v')))
                || null;
        }

        async function _setFrameFromVideo(role) {
            if (!isVideo) return;
            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) return;
            try {
                // Range-aware: prefer outPoint when active trim covers a
                // subset; otherwise fall through to live playhead.
                const cur = _group?.history?.[_currentIdx];
                const trim = cur?.trim;
                const snapOpts = (trim && Number.isFinite(+trim.out)) ? { time: +trim.out } : {};
                const snap = await viewer.el.captureSnapshot?.(snapOpts);
                if (!snap?.blob) { _showToast('Capture failed', 'error'); return; }
                const file = new File([snap.blob], `frame_${role}.png`, { type: 'image/png' });
                const uploaded = await uploadMediaFile(file, 'image', project.folderPath, project.id, {
                    filenamePrefix: `frame-${role}`,
                    operation: 'frame-capture',
                });
                if (!uploaded) { _showToast('Frame save failed', 'error'); return; }

                // Auto-switch model if the current video model lacks any I2V op.
                const current = activeModel;
                const hasI2V = Array.isArray(current?.supportedOps)
                    && current.supportedOps.some(op => op.startsWith('i2v'));
                if (!hasI2V) {
                    const fallback = _findFirstI2VCapableModel();
                    if (fallback) {
                        setSelectedModelId('video', fallback.id, { markAsLast: false });
                        _showToast(`Switched to ${fallback.label || fallback.id} for I2V`, 'info');
                    }
                }

                // Pick a sensible op for the frame-grab flow: any installed
                // op starting with `i2v` (matches i2v, i2v_ms, future variants).
                // PromptBox.setOperation will re-eval as soon as the chip lands,
                // but seeding with an I2V op avoids a mount-then-flip flicker.
                if (Array.isArray(activeModel?.supportedOps)) {
                    const i2vOp = activeModel.supportedOps.find(op => op.startsWith('i2v'));
                    if (i2vOp) activeOperation = i2vOp;
                }

                // Force-mount PromptBox even if no op is currently available —
                // injecting the frame will unblock i2v ops immediately after.
                _mountPromptBoxIfNeeded({ force: true });
                if (_pb?.el) {
                    _pb.el.setOperation?.(activeOperation);
                }

                // Ensure PromptBox visible in prompt mode before injecting.
                if (historyTools.el.getActiveMode?.() !== 'prompt') {
                    historyTools.el.setMode('prompt');
                }
                _pb?.el?.show?.();

                const injected = _pb?.el?.injectMedia?.({
                    url: uploaded.filePath,
                    mediaType: 'image',
                    role,
                });
                if (injected === false) {
                    _showToast('Active op cannot accept this frame', 'warning');
                    return;
                }

                // Refresh op options + prompt-tool enabled state now that the
                // media context changed.
                _syncBaseCtxFromPromptBox();
                _refreshOpOptions();
                _syncPromptToolDisabled();
                clientLogger.info('MpiGroupHistoryBlock', `Captured frame as ${role}`, {
                    file: uploaded.filename,
                });
            } catch (err) {
                clientLogger.warn('MpiGroupHistoryBlock', 'frame capture failed', err);
                _showToast('Frame capture failed', 'error');
            }
        }

        if (isVideo) {
            // Toolbar (MpiToolOptionsPrompt) Create new / Extend.
            // Toolbar emits semantic events on the global bus; this block is
            // the only listener (single video-history mount at a time, since
            // mountOptions('prompt') guards mount on isVideo + I2V model).
            _unsubs.push(Events.on('prompt-box-tools:create-new', () => {
                if (!_pb?.el) return;
                const payload = _pb.el.getRunPayload?.();
                if (!payload) return;
                _runGenerate({ ...payload, historyMode: true });
            }));
            _unsubs.push(Events.on('prompt-box-tools:extend', () => {
                if (!_pb?.el) return;
                const payload = _pb.el.getRunPayload?.();
                if (!payload) return;
                const currentItem = _group.history[_currentIdx];
                if (!currentItem?.id) {
                    _showToast('No source video to extend', 'error');
                    return;
                }
                const trim = currentItem.trim;
                const extendCfg = {
                    ...payload,
                    historyMode: true,
                    extend: true,
                    sourceItemId: currentItem.id,
                };
                if (trim && Number.isFinite(+trim.in) && Number.isFinite(+trim.out) && +trim.out > +trim.in) {
                    extendCfg.trimIn  = +trim.in;
                    extendCfg.trimOut = +trim.out;
                }
                _runGenerate(extendCfg);
            }));

            _unsubs.push(Events.on('video-viewer:context-menu', ({ x, y }) => {
                const disabled = !_anyInstalledModelHasI2V();
                const reason = disabled ? 'No installed video model supports I2V' : '';
                MpiContextMenu.show({
                    x, y,
                    items: [
                        { key: 'set-start', icon: 'frameBack',    label: 'Set as start frame', disabled, info: reason },
                        { key: 'set-end',   icon: 'frameForward', label: 'Set as end frame',   disabled, info: reason },
                        { key: 'reverse',   icon: 'reverse',      label: 'Reverse video' },
                    ],
                    onSelect: (key) => {
                        if (key === 'set-start') _setFrameFromVideo('startFrame');
                        else if (key === 'set-end') _setFrameFromVideo('endFrame');
                        else if (key === 'reverse') _handleReverseVideo();
                    },
                });
            }));
        }

        // ── Cleanup ───────────────────────────────────────────────────────────

        el.destroy = async () => {
            clearTimeout(_mascotLingerTimer);
            _options?.destroy?.();
            _options = null;

            if (viewer?.el && typeof viewer.el.destroy === 'function') {
                await viewer.el.destroy();
                viewer.el.remove?.();
            } else {
                await viewer?.destroy?.();
            }

            _unsubs.forEach(fn => fn?.());
            window.removeEventListener('dragenter', _onHistDragEnter);
            window.removeEventListener('dragleave', _onHistDragLeave);
            window.removeEventListener('dragover',  _onHistDragOver);
            window.removeEventListener('drop',      _onHistDrop);
            _dropOverlay.el.destroy?.();
            _dropOverlay.el.remove();
            historyList.destroy?.();
            historyTools.destroy?.();
            _historyDeleteDialog.destroy?.();
            _settingsOverlay.destroy?.();
            _pb?.el?.destroy?.();
            _pb = null;
            if (_compareOverlay) {
                try { _compareOverlay.el.hide?.(); } catch (_) {}
                _compareOverlay.el.destroy?.();
                _compareOverlay = null;
            }
        };
    },
});
