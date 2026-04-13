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
import { MpiGalleryGrid } from '../MpiGalleryGrid/MpiGalleryGrid.js';
import { MpiCompareOverlay } from '../../Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { PromptBoxService } from '../../../shell/promptBoxService.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { navigate, PAGE_GROUP_HISTORY } from '../../../router.js';
import { getModelsByType } from '../../../data/modelRegistry.js';
import { getAvailableCommands } from '../../../data/commandRegistry.js';
import { refreshRadial } from '../../../shell/navigation.js';
import { runCommand } from '../../../services/commandExecutor.js';
import { StatusBar } from '../../../shell/statusBar.js';
import { clientLogger } from '../../../services/clientLogger.js';
import {
    createImageItem,
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
            fetch('/update-project', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    folderPath: state.currentProject.folderPath,
                    updates:    { itemGroups: state.currentProject.itemGroups },
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

            promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
                if (!activeModel) return;

                const tempId   = crypto.randomUUID();
                const cardType = activeModel.mediaType;

                grid.el.addGeneratingCard(tempId, cardType);
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

                exec.onPreview  = (url) => grid.el.updatePreview(tempId, url);
                exec.onProgress = (value) => StatusBar.progress.update(value);

                exec.onComplete = async (urls) => {
                    _activeExec = null;
                    PromptBoxService.component?.setGenerating(false);

                    if (!urls.length) {
                        clientLogger.warn('MpiGalleryBlock', 'Generation completed but no Output node images returned.');
                        StatusBar.progress.cancel();
                        grid.el.removeGeneratingCard(tempId);
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
                                    operation,
                                    meta: {
                                        prompt:         positive,
                                        negativePrompt: negative,
                                        modelId:        activeModel.id,
                                    },
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
                    grid.el.finalizeCard(tempId, group);
                };

                exec.onError = (err) => {
                    _activeExec = null;
                    clientLogger.error('MpiGalleryBlock', 'Generation error:', err);
                    PromptBoxService.component?.setGenerating(false);
                    StatusBar.progress.cancel();
                    grid.el.removeGeneratingCard(tempId);
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

        // ── Cleanup when block is removed from DOM ──────────────────────────────
        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                _unsubSetOp();
                _unsubZeroInstalled();
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    },
});