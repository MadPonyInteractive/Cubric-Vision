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
import { createImageItem, createItemGroup, appendToHistory, addGroupToProject } from '../../data/projectModel.js';

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

    // ── Stub handlers ───────────────────────────────────────────────────────
    grid.on('compare',  ({ groups: g }) => console.log('[gallery] compare',  g.map(x => x.id)));
    grid.on('download', ({ groups: g }) => console.log('[gallery] download', g.map(x => x.id)));
    grid.on('delete',   ({ groups: g }) => console.log('[gallery] delete',   g.map(x => x.id)));

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

            exec.onComplete = (urls) => {
                _activeExec = null;
                promptBox.el.setGenerating(false);

                if (!urls.length) {
                    console.warn('[gallery] Generation completed but no Output node images returned.');
                    StatusBar.progress.cancel();
                    grid.el.removeGeneratingCard(tempId);
                    return;
                }

                // Build the MediaItem and ItemGroup
                const item = createImageItem({
                    filePath:      urls[0], // comfy view URL; server-persisted path added later
                    modelId:       activeModel.id,
                    operation,
                    prompt:        positive,
                    negativePrompt: negative,
                });

                let group = createItemGroup(cardType, { name: positive.slice(0, 48) || 'Untitled' });
                group = appendToHistory(group, item);

                // Update in-memory project state
                if (state.currentProject) {
                    state.currentProject = addGroupToProject(state.currentProject, group);
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
