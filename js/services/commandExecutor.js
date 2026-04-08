/**
 * commandExecutor.js — Bridge between PromptBox 'run' events and ComfyUI.
 *
 * Accepts a run payload (operation, model, prompt, mediaItems), resolves the
 * correct workflow file, builds the title-based param map, and drives
 * ComfyUIController.runWorkflow. Only images from nodes titled exactly
 * "Output" (case-insensitive) are captured as results — all other executed
 * nodes are ignored to avoid history duplication.
 *
 * Usage:
 *   const exec = await runCommand(payload);
 *   exec.onPreview = (url) => { ... };  // latent preview frames
 *   exec.onComplete = (urls) => { ... }; // final output image URLs
 *   exec.onError = (err) => { ... };
 *   exec.cancel();
 *
 * @module commandExecutor
 */

'use strict';

import { ComfyUIController } from './comfyController.js';
import { getWorkflowFile, UNIVERSAL_WORKFLOWS } from '../data/modelRegistry.js';
import { getCommand } from '../data/commandRegistry.js';
import { showError } from '../shell.js';
import { clientLogger } from './clientLogger.js';

/**
 * @typedef {Object} RunPayload
 * @property {string}   operation    - Command key (e.g. 't2i', 'upscale')
 * @property {string}   modelId      - Model id from modelRegistry
 * @property {string}   positive     - Positive prompt text
 * @property {string}   [negative]   - Negative prompt text
 * @property {number}   [seed]       - Explicit seed; randomised if omitted
 * @property {Array<{url:string, mediaType:'image'|'video', source:string}>} [mediaItems]
 */

/**
 * @typedef {Object} Execution
 * @property {function(string):void}   onPreview  - Called with each latent preview URL
 * @property {function(number):void}   onProgress - Called with 0–1 progress value from ComfyUI
 * @property {function(string[]):void} onComplete - Called with final output URLs on success
 * @property {function(Error):void}    onError    - Called on failure
 * @property {function():void}         cancel     - Interrupt the running generation
 */

/**
 * Resolves the workflow filename for a given operation + model.
 * Universal workflows (not model-tied) are checked first.
 * @param {string} modelId
 * @param {string} operation
 * @returns {string}  workflow filename (e.g. 'sdxl_t2i_nsfw.json')
 * @throws {Error} if no workflow file is registered
 */
function _resolveWorkflowFile(modelId, operation) {
    // Universal workflows take precedence (they don't need a model)
    if (UNIVERSAL_WORKFLOWS[operation]) return UNIVERSAL_WORKFLOWS[operation];

    const file = getWorkflowFile(modelId, operation);
    if (!file) throw new Error(`No workflow registered for model "${modelId}", operation "${operation}"`);
    return file;
}

/**
 * Builds the title-keyed param map that comfyController.runWorkflow injects
 * into the workflow via title-based node matching.
 *
 * Titles follow the ComfyUI Mapping Rules standard (see .agents/workflows/comfyui_mapping_rules.md).
 *
 * @param {RunPayload} payload
 * @returns {Record<string, any>}
 */
function _buildParams(payload) {
    const { positive, negative, seed, mediaItems = [] } = payload;
    const resolvedSeed = seed ?? ComfyUIController.generateRandomSeed();

    const params = {
        Positive: positive || '',
        Negative: negative || '',
        Seed:     resolvedSeed,
    };

    // Map dropped media to standard injection titles
    const imageItem = mediaItems.find(m => m.mediaType === 'image');
    const videoItem = mediaItems.find(m => m.mediaType === 'video');

    if (imageItem) params['Input_Image'] = imageItem.url;
    if (videoItem) params['Input_Image'] = videoItem.url; // video ops use same slot

    if (payload.maskDataUrl) params['Input_Mask'] = payload.maskDataUrl;

    return params;
}

/**
 * Executes a generative command.
 *
 * Returns an Execution handle synchronously — attach callbacks before the
 * first async tick to avoid missing early messages.
 *
 * @param {RunPayload} payload
 * @returns {Execution}
 */
export function runCommand(payload) {
    const exec = {
        onPreview:  null,
        onProgress: null,
        onComplete: null,
        onError:    null,
        cancel() { ComfyUIController.interrupt(); },
    };

    (async () => {
        let workflowFile;
        try {
            workflowFile = _resolveWorkflowFile(payload.modelId, payload.operation);
        } catch (err) {
            exec.onError?.(err);
            return;
        }

        const params = _buildParams(payload);

        // Load the workflow JSON so we can identify "Output" node ids before
        // execution — needed for filtering executed messages by title.
        let workflow;
        try {
            const res = await fetch(`/comfy_workflows/${workflowFile}`);
            if (!res.ok) throw new Error(`Failed to load workflow: ${workflowFile}`);
            workflow = await res.json();
        } catch (err) {
            exec.onError?.(err);
            return;
        }

        // Build a set of node ids whose _meta.title === "output" (case-insensitive)
        // Only images from these nodes are treated as final results.
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output'
            )
        );

        // Message handler — forwards previews + collects Output-titled results
        const outputUrls = [];
        const onMessage = (msg) => {
            if (msg.type === 'preview') {
                exec.onPreview?.(msg.url);
                return;
            }

            if (msg.type === 'progress') {
                const { value, max } = msg.data || {};
                if (max > 0) exec.onProgress?.(value / max);
                return;
            }

            if (msg.type === 'executed') {
                const nodeId = msg.data?.node;
                if (!outputNodeIds.has(nodeId)) return; // ignore non-Output nodes

                const nodeOutput = msg.data?.output;
                if (nodeOutput?.images) {
                    nodeOutput.images.forEach(img => {
                        outputUrls.push(
                            `http://${ComfyUIController.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`
                        );
                    });
                }
                return;
            }

            // execution complete signal
            if (msg.type === 'executing' && msg.data?.node === null) {
                exec.onComplete?.(outputUrls);
            }
        };

        try {
            await ComfyUIController.runWorkflow(workflow, params, onMessage);
        } catch (err) {
            clientLogger.error('comfy', `Workflow failed: ${payload.operation} / ${payload.modelId}`, err);
            showError('Generation failed', err.message);
            exec.onError?.(err);
        }
    })();

    return exec;
}
