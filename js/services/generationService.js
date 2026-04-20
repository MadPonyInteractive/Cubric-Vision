/**
 * generationService.js — Generation lifecycle manager.
 *
 * Encapsulates the full "run generation → save result → update project" flow.
 * Both MpiGalleryBlock and MpiGroupHistoryBlock call startGeneration()
 * and provide UI callbacks for their specific rendering needs.
 */

import { runCommand } from './commandExecutor.js';
import { saveGeneration, addGroup, updateGroup } from './projectService.js';
import { createImageItem, createVideoItem, createItemGroup, appendToHistory } from '../data/projectModel.js';
import { PromptBoxService } from '../shell/promptBoxService.js';
import { StatusBar } from '../shell/statusBar.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';

/**
 * @typedef {Object} GenerationConfig
 * @property {string}   operation
 * @property {Object}   model           — full model object (from modelRegistry)
 * @property {string}   positive
 * @property {string}   negative
 * @property {Array}    mediaItems
 * @property {string}   [maskDataUrl]
 * @property {Object}   [injectionParams]
 */

/**
 * @typedef {Object} GenerationCallbacks
 * @property {function(string):void}        [onPreview]  — called with preview URL
 * @property {function({item, group}):void} [onComplete] — called with final item and group
 * @property {function():void}              [onError]    — called on failure
 * @property {function():void}              [onCancel]   — called on cancel/empty result
 */

/**
 * Start a generation, manage the lifecycle, and persist results.
 *
 * For Gallery: creates a new group with the generated item.
 * For GroupHistory: appends the generated item to an existing group.
 *
 * @param {GenerationConfig} config
 * @param {GenerationCallbacks} callbacks
 * @param {{ existingGroup?: Object }} [opts] — if existingGroup is provided, appends to it instead of creating new
 * @returns {{ cancel: function }}
 */
export function startGeneration(config, callbacks = {}, opts = {}) {
    const { operation, model, positive, negative, mediaItems = [], maskDataUrl, injectionParams = {} } = config;
    const generationStartTime = Date.now();
    const itemId = crypto.randomUUID();
    const isVideo = model.mediaType === 'video';

    Events.emit('tool:running', { tool: 'groupHistory', type: operation });

    const exec = runCommand({
        operation,
        modelId: model.id,
        positive,
        negative,
        mediaItems,
        maskDataUrl,
        injectionParams,
    });

    exec.onPreview = (url) => callbacks.onPreview?.(url);

    exec.onProgress = (value) => StatusBar.progress.update(value);

    exec.onComplete = async (urls) => {
        PromptBoxService.component?.setGenerating(false);

        if (!urls.length) {
            clientLogger.warn('generationService', 'Generation completed but no output returned.');
            Events.emit('tool:cancelled', { tool: 'groupHistory' });
            callbacks.onCancel?.();
            return;
        }

        let filePath = urls[0];
        let displayName = operation;

        // Save to project folder
        if (state.currentProject?.folderPath) {
            try {
                const elapsedMs = Date.now() - generationStartTime;
                const data = await saveGeneration({
                    folderPath: state.currentProject.folderPath,
                    comfyViewUrl: urls[0],
                    itemId,
                    operation,
                    meta: { prompt: positive, negativePrompt: negative, modelId: model.id },
                    generationMs: elapsedMs,
                    pixelDimensions: injectionParams.Width
                        ? { w: injectionParams.Width, h: injectionParams.Height }
                        : { w: 0, h: 0 },
                });
                if (data.success) {
                    filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                    displayName = data.filename.replace(/\.[^.]+$/, '');
                }
            } catch (err) {
                clientLogger.warn('generationService', 'save-generation failed, using comfy URL:', err);
            }
        }

        displayName = truncateCardName(displayName);

        // Create full item object
        const item = isVideo
            ? createVideoItem({ id: itemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id })
            : createImageItem({ id: itemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id });

        // Project mutation
        if (opts.existingGroup) {
            // GroupHistory mode — append to existing group
            const updatedGroup = appendToHistory(opts.existingGroup, item);
            updateGroup(updatedGroup);
            callbacks.onComplete?.({ item, group: updatedGroup });
        } else {
            // Gallery mode — create new group
            const group = createItemGroup(model.mediaType, { name: displayName });
            const finalGroup = appendToHistory(group, item);
            addGroup(finalGroup);
            callbacks.onComplete?.({ item, group: finalGroup });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
    };

    exec.onError = (err) => {
        PromptBoxService.component?.setGenerating(false);
        Events.emit('tool:cancelled', { tool: 'groupHistory' });
        callbacks.onError?.();
    };

    return { cancel: () => exec.cancel() };
}
