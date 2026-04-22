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
import { activeGenerations } from './activeGenerations.js';

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
 * @param {{ existingGroup?: Object, scope?: string, groupId?: string, tempId?: string, placeholderGroup?: Object }} [opts]
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

    const { id: _regId } = activeGenerations.start({
        scope:             opts.scope ?? (opts.existingGroup ? 'groupHistory' : 'gallery'),
        groupId:           opts.groupId ?? opts.existingGroup?.id ?? null,
        tempId:            opts.tempId ?? null,
        operation,
        modelId:           model.id,
        placeholderGroup:  opts.placeholderGroup ?? null,
        extraTempIds:      opts.extraTempIds ?? [],
        extraPlaceholders: opts.extraPlaceholders ?? [],
        exec,
    });

    exec.onPreview = (url) => {
        activeGenerations.setPreview(_regId, url);
        callbacks.onPreview?.(url);
    };

    exec.onProgress = (value) => StatusBar.progress.update(value);

    exec.onComplete = async (urls) => {
        PromptBoxService.component?.setGenerating(false);

        if (!urls.length) {
            clientLogger.warn('generationService', 'Generation completed but no output returned.');
            Events.emit('tool:cancelled', { tool: 'groupHistory' });
            const _cancelEntry = activeGenerations.get(_regId);
            const _cancelTempId = _cancelEntry?.tempId ?? null;
            const _cancelExtraTempIds = _cancelEntry?.extraTempIds ?? [];
            activeGenerations.end(_regId, { revokePreview: true });
            Events.emit('generation:cancelled', { id: _regId, tempId: _cancelTempId, extraTempIds: _cancelExtraTempIds });
            callbacks.onCancel?.();
            return;
        }

        const width  = injectionParams.Width  || 0;
        const height = injectionParams.Height || 0;
        const elapsedMs = Date.now() - generationStartTime;

        // Build one item per output URL. Each item gets its own uuid (first reuses
        // the pre-allocated itemId so existing telemetry stays consistent).
        const builtItems = [];
        let firstDisplayName = operation;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const thisItemId = i === 0 ? itemId : crypto.randomUUID();
            let filePath = url;
            let displayName = operation;

            if (state.currentProject?.folderPath) {
                try {
                    const data = await saveGeneration({
                        folderPath: state.currentProject.folderPath,
                        comfyViewUrl: url,
                        itemId: thisItemId,
                        operation,
                        meta: { prompt: positive, negativePrompt: negative, modelId: model.id },
                        generationMs: elapsedMs,
                        pixelDimensions: width
                            ? { w: width, h: height }
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
            if (i === 0) firstDisplayName = displayName;

            const item = isVideo
                ? createVideoItem({ id: thisItemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id })
                : createImageItem({ id: thisItemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id });
            builtItems.push(item);
        }

        // Project mutation.
        if (opts.existingGroup) {
            // GroupHistory mode — append all items to existing group (history view).
            let working = opts.existingGroup;
            for (const it of builtItems) {
                working = appendToHistory(working, it);
            }
            const updatedGroup = {
                ...working,
                width:  opts.existingGroup.width  || width,
                height: opts.existingGroup.height || height,
            };
            updateGroup(updatedGroup);
            activeGenerations.end(_regId, { revokePreview: false });
            const lastItem = builtItems[builtItems.length - 1];
            Events.emit('generation:complete', { id: _regId, item: lastItem, group: updatedGroup });
            callbacks.onComplete?.({ item: lastItem, group: updatedGroup });
        } else {
            // Gallery mode — one group (card) per item.
            const _galleryTempId = activeGenerations.get(_regId)?.tempId ?? null;
            const groups = builtItems.map((it) => {
                const name = truncateCardName(it.operation || firstDisplayName);
                const g = createItemGroup(model.mediaType, { name, width, height });
                return appendToHistory(g, it);
            });
            for (const g of groups) addGroup(g);
            activeGenerations.end(_regId, { revokePreview: false });
            const firstItem = builtItems[0];
            const firstGroup = groups[0];
            // Single emit — handler reads state.currentProject.itemGroups (already
            // contains all N groups via addGroup) and rebuilds grid with them.
            const _galleryExtraTempIds = activeGenerations.get(_regId)?.extraTempIds ?? [];
            Events.emit('generation:complete', { id: _regId, item: firstItem, group: firstGroup, tempId: _galleryTempId, extraTempIds: _galleryExtraTempIds });
            callbacks.onComplete?.({ item: firstItem, group: firstGroup });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
    };

    exec.onError = (err) => {
        PromptBoxService.component?.setGenerating(false);
        Events.emit('tool:cancelled', { tool: 'groupHistory' });
        const _errEntry = activeGenerations.get(_regId);
        const _errTempId = _errEntry?.tempId ?? null;
        const _errExtraTempIds = _errEntry?.extraTempIds ?? [];
        activeGenerations.end(_regId, { revokePreview: true });
        Events.emit('generation:error', { id: _regId, tempId: _errTempId, extraTempIds: _errExtraTempIds });
        callbacks.onError?.();
    };

    return { cancel: () => exec.cancel() };
}
