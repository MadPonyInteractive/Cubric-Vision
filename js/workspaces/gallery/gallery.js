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
import { MpiPromptBox } from '../../components/Compounds/MpiPromptBox/MpiPromptBox.js';
import { MpiDropdown } from '../../components/Primitives/MpiDropdown/MpiDropdown.js';
import { getModelsByType } from '../../data/modelRegistry.js';
import { getAvailableCommands } from '../../data/commandRegistry.js';
import { refreshRadial } from '../../shell/navigation.js';
import { runCommand } from '../../services/commandExecutor.js';
import { StatusBar } from '../../shell/statusBar.js';
import { createImageItem, createItemGroup, appendToHistory, addGroupToProject, getSelectedItem, removeGroupFromProject, updateGroupInProject } from '../../data/projectModel.js';
import { MpiCompareOverlay } from '../../components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiOkCancel } from '../../components/Compounds/MpiOkCancel/MpiOkCancel.js';

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
        }).catch(err => console.warn('[gallery] update-project failed:', err));
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
                }).catch(err => console.warn('[gallery] delete file failed:', err));
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

    const imageModels    = getModelsByType('image');
    let activeModel      = imageModels[0] || null;
    state.g_selectedModel = activeModel;
    let activeOperation  = 't2i';
    let imageCount       = 0;
    let videoCount       = 0;

    const promptSlot = grid.el.getPromptSlot();
    let opDropdown   = null;
    let promptBox    = null;

    /** Build { value, label, disabled } options from getAvailableCommands */
    function _opOptions() {
        if (!activeModel) return [];
        return getAvailableCommands(activeModel.mediaType, activeModel, { imageCount, videoCount })
            .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
    }

    /** Rebuild the options list and current value on the existing op dropdown */
    function _syncOpDropdown() {
        if (!opDropdown) return;
        const opts = _opOptions();
        // If active operation is no longer available, fall back to first available
        const stillAvailable = opts.find(o => o.value === activeOperation && !o.disabled);
        if (!stillAvailable) {
            const first = opts.find(o => !o.disabled);
            if (first) {
                activeOperation = first.value;
                promptBox?.el.setOperation(activeOperation);
            }
        }
        // Re-render dropdown options in place
        opDropdown.el.setOptions(opts, activeOperation);
    }

    function _mountPromptBox() {
        promptSlot.innerHTML = '';
        opDropdown  = null;
        promptBox   = null;
        imageCount  = 0;
        videoCount  = 0;

        if (!activeModel) return;

        // Operation dropdown (right side of PromptBox)
        opDropdown = MpiDropdown.mount(document.createElement('div'), {
            options:     _opOptions(),
            value:       activeOperation,
            info:        'Generation operation',
            direction:   'up',
        });

        opDropdown.on('change', ({ value }) => {
            activeOperation = value;
            promptBox?.el.setOperation(activeOperation);
            Events.emit('workspace:set-operation', { operation: activeOperation });
        });

        // Model picker (left side) — only shown when more than one model available
        const modelDropdown = imageModels.length > 1
            ? MpiDropdown.mount(document.createElement('div'), {
                options:   imageModels.map(m => ({ value: m.id, label: m.name })),
                value:     activeModel.id,
                info:      'Active model',
                direction: 'up',
              })
            : null;

        if (modelDropdown) {
            modelDropdown.on('change', ({ value }) => {
                activeModel           = imageModels.find(m => m.id === value) || activeModel;
                state.g_selectedModel = activeModel;
                activeOperation       = 't2i';
                _mountPromptBox();
            });
        }

        promptBox = MpiPromptBox.mount(promptSlot, {
            model:           activeModel,
            operation:       activeOperation,
            includeNegative: true,
            LeftA:           modelDropdown,
            rightA:          opDropdown,
        });

        promptBox.on('media-change', ({ imageCount: ic, videoCount: vc }) => {
            imageCount = ic;
            videoCount = vc;
            _syncOpDropdown();
            refreshRadial({ imageCount, videoCount });
        });

        let _activeExec = null;

        promptBox.on('run', ({ operation, positive, negative, mediaItems }) => {
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
                    console.warn('[gallery] Generation completed but no Output node images returned.');
                    StatusBar.progress.cancel();
                    grid.el.removeGeneratingCard(tempId);
                    return;
                }

                // Persist to disk and get a stable filename
                let filePath = urls[0]; // fallback: comfy view URL (ephemeral)
                let displayName = operation; // fallback card name

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
                            // Serve the saved file through project-file API
                            filePath    = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                            displayName = data.filename.replace(/\.[^.]+$/, ''); // no extension
                        }
                    } catch (err) {
                        console.warn('[gallery] save-generation failed, using comfy URL:', err);
                    }
                }

                // Truncate display name to 28 chars max
                const cardName = displayName.length > 28
                    ? displayName.slice(0, 27) + '…'
                    : displayName;

                // Build the MediaItem and ItemGroup
                const item = createImageItem({
                    filePath,
                    modelId:        activeModel.id,
                    operation,
                    prompt:         positive,
                    negativePrompt: negative,
                });

                let group = createItemGroup(cardType, { name: cardName });
                group = appendToHistory(group, item);

                // Persist itemGroups to project.json
                if (state.currentProject) {
                    state.currentProject = addGroupToProject(state.currentProject, group);
                    _persistGroups();
                }

                StatusBar.progress.complete('Image generated!');
                grid.el.finalizeCard(tempId, group);
            };

            exec.onError = (err) => {
                _activeExec = null;
                console.error('[gallery] Generation error:', err);
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

    _mountPromptBox();

    // ── Radial menu → op dropdown sync ────────────────────────────────────
    // When the radial fires an operation change, update the dropdown to match.
    const _onSetOperation = ({ operation }) => {
        if (!opDropdown) return;
        const opts = _opOptions();
        const match = opts.find(o => o.value === operation);
        if (match && !match.disabled) {
            activeOperation = operation;
            opDropdown.el.setOptions(opts, activeOperation);
            promptBox?.el.setOperation(activeOperation);
        }
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
