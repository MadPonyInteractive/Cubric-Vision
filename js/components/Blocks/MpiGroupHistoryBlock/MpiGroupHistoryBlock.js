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
import { MpiHistoryList } from '../../Compounds/MpiHistoryList/MpiHistoryList.js';
import { PromptBoxService } from '../../../shell/promptBoxService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { navigate, PAGE_GALLERY } from '../../../router.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands, getToolCommands } from '../../../data/commandRegistry.js';
import { runCommand } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { clientLogger } from '../../../services/clientLogger.js';
import {
    promoteHistoryEntry,
    appendToHistory,
    updateGroupInProject,
    removeHistoryEntry,
} from '../../../data/projectModel.js';
import { MpiModelsModal } from '../MpiModelsModal/MpiModelsModal.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';

function _resolveUrl(filePath) {
    if (!filePath) return '';
    const p = filePath;
    if (p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')) return p;
    return `/project-file?path=${encodeURIComponent(p.replace(/\\/g, '/'))}`;
}

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
        const installedModels = getModelsByType(isVideo ? 'video' : 'image')
            .filter(m => m.installed !== false);

        let activeModelId = state.s_selectedModelId
            ? (installedModels.find(m => m.id === state.s_selectedModelId)?.id ?? installedModels[0]?.id ?? null)
            : (installedModels[0]?.id ?? null);

        let activeModel = activeModelId
            ? (installedModels.find(m => m.id === activeModelId) || installedModels[0] || null)
            : (installedModels[0] || null);

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

        // ── Persist helper ───────────────────────────────────────────────────

        function _persistGroup() {
            if (!state.currentProject) return;
            state.currentProject = updateGroupInProject(state.currentProject, _group);
            Events.emit('media:updated', { projectId: state.currentProject.id });
            fetch('/update-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folderPath: state.currentProject.folderPath,
                    updates: { itemGroups: state.currentProject.itemGroups },
                }),
            }).catch(err => console.warn('[MpiGroupHistoryBlock] update-project failed:', err));
        }

        // ── Mount sub-components ──────────────────────────────────────────────

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

        const historyTools = MpiHistoryTools.mount(el.querySelector('#left-slot'), {
            tools: [
                { mode: 'crop', icon: 'crop', info: 'Crop' },
                { mode: 'mask', icon: 'edit', info: 'Draw Mask' },
                ..._universalTools,
            ],
        });

        const canvasViewer = MpiCanvasViewer.mount(el.querySelector('#centre-slot'), {
            initialImageUrl: _resolveUrl(_group.history[_currentIdx]?.filePath),
            initialIdx: _currentIdx,
        });

        const historyList = MpiHistoryList.mount(el.querySelector('#right-slot'), {
            history: _group.history,
            selectedIndex: _currentIdx,
        });

        // ── PromptBox via PromptBoxService ────────────────────────────────────

        const bottomSlot = el.querySelector('#bottom-slot');

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

                promptBox.on('settings', () => {
                    _settingsOverlay.el.open({ modelId: activeModel.id });
                });

                promptBox.on('model-change', ({ model }) => {
                    state.s_selectedModelId = model.id;
                    activeModelId = model.id;
                    activeModel = model;
                    PromptBoxService.component?.setModel(model);
                    _refreshOpOptions();
                });

                promptBox.on('operation-change', ({ operation }) => {
                    activeOperation = operation;
                });

                promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams }) => {
                    const maskDataUrl = canvasViewer.el.hasMask()
                        ? canvasViewer.el.getCurrentMaskDataURL()
                        : null;
                    _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl, injectionParams });
                });

                promptBox.on('cancel', () => {
                    _activeExec?.cancel();
                    _activeExec = null;
                    StatusBar.progress.cancel();
                });
            }
        }

        // ── Generation ───────────────────────────────────────────────────────

        let _activeExec = null;

        function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
            if (!activeModel) return;

            Events.emit('tool:running', { tool: 'groupHistory', type: operation });
            StatusBar.progress.start('Generating...');
            canvasViewer.el.setGenerating(true);

            // Always inject current selected history entry as input image
            // unless user has dropped a replacement
            const currentItem = _group.history[_currentIdx];
            const hasDroppedImage = mediaItems.some(m => m.mediaType === 'image');
            const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
                ? [{ url: _resolveUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
                : mediaItems;

            _activeExec = runCommand({
                operation,
                modelId: activeModel.id,
                positive,
                negative,
                mediaItems: resolvedMedia,
                maskDataUrl,
                injectionParams,
            });
            const exec = _activeExec;

            exec.onPreview = async (url) => {
                canvasViewer.el.setGenerating(false);
                canvasViewer.el.isComparisonMode = false;
                try { await canvasViewer.el.loadEntry({ filePath: url }, _currentIdx); } catch (_) { }
            };

            exec.onProgress = (value) => StatusBar.progress.update(value);

            exec.onComplete = async (urls) => {
                _activeExec = null;
                PromptBoxService.component?.setGenerating(false);
                canvasViewer.el.setGenerating(false);

                if (!urls.length) {
                    clientLogger.warn('MpiGroupHistoryBlock', 'Generation completed but no output returned.');
                    StatusBar.progress.cancel();
                    return;
                }

                let filePath = urls[0];
                let displayName = operation;

                if (state.currentProject?.folderPath) {
                    try {
                        const res = await fetch('/project/save-generation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                folderPath: state.currentProject.folderPath,
                                comfyViewUrl: urls[0],
                                operation,
                                meta: { prompt: positive, negativePrompt: negative, modelId: activeModel.id },
                            }),
                        });
                        if (!res.ok) throw new Error(`save-generation ${res.status}`);
                        const data = await res.json();
                        if (data.success) {
                            filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                            displayName = data.filename.replace(/\.[^.]+$/, '');
                        }
                    } catch (err) {
                        clientLogger.warn('MpiGroupHistoryBlock', 'save-generation failed, using comfy URL:', err);
                    }
                }

                const newItem = {
                    id: crypto.randomUUID(),
                    filePath,
                    modelId: activeModel.id,
                    operation: displayName,
                    prompt: positive,
                    negativePrompt: negative,
                    createdAt: new Date().toISOString(),
                };

                // Clear all saved masks — they are stale after generation
                canvasViewer.el.exitMode?.();
                _canvasHasMask = false;
                _refreshOpOptions();

                _group = appendToHistory(_group, newItem);
                _currentIdx = _group.selectedIndex;
                _persistGroup();
                historyList.el.appendEntry(newItem);
                canvasViewer.el.loadEntry(newItem, _currentIdx);

                Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
                StatusBar.progress.complete('Done!');
            };

            exec.onError = (err) => {
                _activeExec = null;
                PromptBoxService.component?.setGenerating(false);
                canvasViewer.el.setGenerating(false);
                Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
                StatusBar.progress.cancel();
                clientLogger.error('MpiGroupHistoryBlock', 'Generation error:', err);
            };
        }

        // ── Wire sub-component events ─────────────────────────────────────────

        historyTools.on('activate', ({ mode }) => {
            canvasViewer.el.enterMode(mode);
        });
        historyTools.on('deactivate', ({ mode }) => {
            canvasViewer.el.exitMode();
        });

        historyList.on('entry-selected', ({ idx, item }) => {
            canvasViewer.el.loadEntry(item, idx);
            _currentIdx = idx;
            _group = promoteHistoryEntry(_group, idx);
            _persistGroup();
        });

        historyList.on('compare-requested', ({ idxA, idxB }) => {
            canvasViewer.el.loadCompare(_group.history[idxA], _group.history[idxB]);
        });

        historyList.on('selection-changed', () => {
            PromptBoxService.hide();
        });

        historyList.on('selection-exited', () => {
            PromptBoxService.show();
        });

        historyList.on('delete-requested', ({ indices }) => {
            const sorted = [...indices].sort((a, b) => b - a);
            for (const idx of sorted) {
                _group = removeHistoryEntry(_group, idx);
            }
            _currentIdx = _group.selectedIndex;
            _persistGroup();
            historyList.el.removeEntries(indices);
            if (_group.history[_currentIdx]) {
                canvasViewer.el.loadEntry(_group.history[_currentIdx], _currentIdx);
            }
        });

        canvasViewer.on('mode-changed', ({ mode }) => {
            historyTools.el.syncMode(mode);
            if (mode === 'none') {
                bottomSlot.classList.remove('mpi-group-history-block__bottom--hidden');
            } else {
                bottomSlot.classList.add('mpi-group-history-block__bottom--hidden');
            }
        });

        canvasViewer.on('crop-applied', ({ item }) => {
            _group = appendToHistory(_group, item);
            _currentIdx = _group.selectedIndex;
            _persistGroup();
            historyList.el.appendEntry(item);
            canvasViewer.el.loadEntry(item, _currentIdx);
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
            _canvasHasMask = hasMask;
            PromptBoxService.component?.updateContext({
                ..._baseCtx,
                hasMask: _canvasHasMask,
                filterNoInputOps: true,
            });
        });

        // ── Radial → operation sync ───────────────────────────────────────────

        const _unsubSetOp = Events.on('workspace:set-operation', ({ operation }) => {
            if (!PromptBoxService.component) return;
            const opts = _opOptions();
            const match = opts.find(o => o.value === operation && !o.disabled);
            if (match) {
                activeOperation = operation;
                PromptBoxService.component?.setOperation(activeOperation);
            }
        });

        // ── State model change subscription ────────────────────────────────────

        const _onStateModelChange = ({ key, value }) => {
            if (key !== 's_selectedModelId') return;
            if (!value || value === activeModelId) return;
            const newModel = installedModels.find(m => m.id === value);
            if (newModel && newModel !== activeModel) {
                activeModelId = value;
                activeModel = newModel;
                PromptBoxService.component?.setModel(newModel);
                _refreshOpOptions();
            }
        };
        Events.on('state:changed', _onStateModelChange);

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

        const _onZeroInstalled = ({ key }) => {
            if (key !== 's_installedModelIds') return;
            if (!_hasInstalledImageModels()) _modelsModal.el.show();
        };
        Events.on('state:changed', _onZeroInstalled);
        Events.on('models:all-installed', () => _modelsModal.el.hide());

        if (!_hasInstalledImageModels()) _modelsModal.el.show();

        // ── Cleanup ───────────────────────────────────────────────────────────

        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                _unsubSetOp();
                Events.off('state:changed', _onStateModelChange);
                Events.off('state:changed', _onZeroInstalled);
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    },
});
