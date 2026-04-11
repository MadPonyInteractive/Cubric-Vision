/**
 * gallery.js — Main project gallery workspace.
 *
 * Displays all ItemGroups as cards in an adaptive grid.
 * Contains the PromptBox — running a generation creates a new ItemGroup.
 * Selection mode replaces the PromptBox with MpiSelectionBar.
 *
 * Entry point: mount(container)
 */

import { state } from '../../state.js';
import { Events } from '../../events.js';
import { navigate, PAGE_GROUP_HISTORY } from '../../router.js';
import { MpiGalleryGrid } from '../../components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js';
import { MpiPromptBox } from '../../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { getModelsByType } from '../../data/modelRegistry.js';
import { getAvailableCommands } from '../../data/commandRegistry.js';
import { refreshRadial } from '../../shell/navigation.js';
import { runCommand } from '../../services/commandExecutor.js';
import { StatusBar } from '../../shell/statusBar.js';
import { createImageItem, createItemGroup, appendToHistory, addGroupToProject, getSelectedItem, removeGroupFromProject, updateGroupInProject } from '../../data/projectModel.js';
import { MpiCompareOverlay } from '../../components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiModelSettings } from '../../components/Compounds/MpiModelSettings/MpiModelSettings.js';
import { clientLogger } from '../../services/clientLogger.js';

/**
 * Mounts the gallery workspace into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
    container.innerHTML = '';

    const groups = state.currentProject?.itemGroups || [];
    const grid   = MpiGalleryGrid.mount(container, { groups });

    // ── Navigate to group history on card open ──────────────────────────────
    grid.on('open-group', ({ group }) => navigate(PAGE_GROUP_HISTORY, { groupId: group.id }));

    // ── Compare — two selected groups ──────────────────────────────────────
    const _compareOverlay = MpiCompareOverlay.mount(document.createElement('div'));

    grid.on('compare', ({ groups: g }) => {
        const itemA = getSelectedItem(g[0]);
        const itemB = getSelectedItem(g[1]);
        if (!itemA || !itemB) return;
        _compareOverlay.el.open(itemA, itemB);
    });

    // ── GC: missing file detected by card onerror ───────────────────────────
    // Helper: persist current itemGroups to project.json
    function _persistGroups() {
        if (!state.currentProject) return;
        fetch('/update-project', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                folderPath: state.currentProject.folderPath,
                updates:    { itemGroups: state.currentProject.itemGroups },
            }),
        }).catch(err => clientLogger.warn('gallery', 'update-project failed:', err));
    }

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

    // ── Download ────────────────────────────────────────────────────────────
    grid.on('download', ({ groups: g }) => {
        const project = state.currentProject;
        if (!project) return;
        for (const group of g) {
            const item = getSelectedItem(group);
            if (!item?.filePath) continue;
            // Extract filename from /project-file?path=... URL
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
        title:      'Delete',
        text:       'Permanently delete the selected cards and their media files?',
        okLabel:    'Delete',
        cancelLabel: 'Cancel',
    });

    let _pendingDeleteGroups = [];

    _deleteDialog.on('ok', async () => {
        const project = state.currentProject;
        if (!project || !_pendingDeleteGroups.length) return;
        const g = _pendingDeleteGroups;
        _pendingDeleteGroups = [];

        // Delete each group's media files from disk
        for (const group of g) {
            for (const item of group.history) {
                const fp = item.filePath;
                if (!fp) continue;
                // Extract filename from /project-file?path=... URL
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
                }).catch(err => clientLogger.warn('gallery', 'delete file failed:', err));
            }
        }

        // Remove groups from state and persist
        let updated = project;
        for (const group of g) {
            updated = removeGroupFromProject(updated, group.id);
        }
        state.currentProject = updated;
        _persistGroups();

        // Remove cards from the grid
        for (const group of g) {
            grid.el.removeCard(group.id);
        }
    });

    grid.on('delete', ({ groups: g }) => {
        _pendingDeleteGroups = g;
        _deleteDialog.el.show();
    });

    // ── PromptBox + operation dropdown ─────────────────────────────────────

    const installedImageModels = getModelsByType('image').filter(m => m.installed !== false);

    // Derive activeModelId from state (canonical) with fallback to first installed
    let activeModelId = state.s_selectedModelId
        ? (installedImageModels.find(m => m.id === state.s_selectedModelId)?.id ?? installedImageModels[0]?.id ?? null)
        : (installedImageModels[0]?.id ?? null);

    // activeModel is derived from activeModelId and kept in sync via setModel()
    let activeModel = activeModelId
        ? (installedImageModels.find(m => m.id === activeModelId) || installedImageModels[0] || null)
        : (installedImageModels[0] || null);

    // Ensure state is in sync on mount
    if (activeModelId) state.s_selectedModelId = activeModelId;

    let activeOperation = 't2i';
    let imageCount      = 0;
    let videoCount      = 0;

    const promptSlot = grid.el.getPromptSlot();
    let promptBox    = null;

    // Model settings overlay — single instance, reused across model changes
    const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));

    // ── Initial PromptBox mount ──────────────────────────────────────────
    {
        promptSlot.innerHTML = '';
        promptBox    = null;
        imageCount   = 0;
        videoCount   = 0;

        if (activeModel) {
            promptBox = MpiPromptBox.mount(promptSlot, {
                model:           activeModel,
                modelList:       installedImageModels,
                operation:       activeOperation,
                includeNegative: true,
            });

            promptBox.on('model-change', ({ model }) => {
                state.s_selectedModelId = model.id;
                activeModelId     = model.id;
                activeModel       = model;
                activeOperation   = model.supportedOps[0];
                promptBox.el.setModel(model);
                promptBox.el.setOperation(model.supportedOps[0]);
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
                promptBox.el.updateContext({ imageCount, videoCount, hasMask: false });
                refreshRadial({ imageCount, videoCount });
            });

            let _activeExec = null;

            promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
                if (!activeModel) return;

                const tempId = crypto.randomUUID();
                const cardType = activeModel.mediaType; // 'image' | 'video'

                grid.el.addGeneratingCard(tempId, cardType);
                StatusBar.progress.start('Generating...');

                _activeExec = runCommand({
                    operation,
                    modelId:   activeModel.id,
                    positive,
                    negative,
                    mediaItems,
                    injectionParams,
                });
                const exec = _activeExec;

                exec.onPreview = (url) => {
                    grid.el.updatePreview(tempId, url);
                };

                exec.onProgress = (value) => {
                    StatusBar.progress.update(value);
                };

                exec.onComplete = async (urls) => {
                    _activeExec = null;
                    promptBox.el.setGenerating(false);

                    if (!urls.length) {
                        clientLogger.warn('gallery', 'Generation completed but no Output node images returned.');
                        StatusBar.progress.cancel();
                        grid.el.removeGeneratingCard(tempId);
                        return;
                    }

                    let filePath = urls[0];
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
                            clientLogger.warn('gallery', 'save-generation failed, using comfy URL:', err);
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
                    clientLogger.error('gallery', 'Generation error:', err);
                    promptBox.el.setGenerating(false);
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
    }

    // ── Radial menu → op dropdown sync ────────────────────────────────────
    // When the radial fires an operation change, update the dropdown to match.
    const _onSetOperation = ({ operation }) => {
        if (!promptBox) return;
        activeOperation = operation;
        promptBox.el.setOperation(activeOperation);
    };
    Events.on('workspace:set-operation', _onSetOperation);

    // Cleanup when workspace is replaced
    const _observer = new MutationObserver(() => {
        if (!document.contains(container)) {
            Events.off('workspace:set-operation', _onSetOperation);
            _observer.disconnect();
        }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
}
