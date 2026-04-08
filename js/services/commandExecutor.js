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
import { getWorkflowFile, getUniversalWorkflow } from '../data/modelRegistry.js';
import { getCommand } from '../data/commandRegistry.js';
import { Events } from '../events.js';
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
 * @typedef {Object} AutoMaskPayload
 * @property {string}     imageUrl     - URL of the source image to detect on
 * @property {string}     detectorModel - Filename for the sams/UltralyticsDetector node (e.g. 'bbox/face_yolov8n.pt')
 * @property {boolean}    useBox       - true = box detection, false = segment detection
 * @property {Set<number>} picks       - Currently selected segment indices (0-based); empty = detect only
 */

/**
 * @typedef {Object} AutoMaskExecution
 * @property {function(string[]):void} onDetected - Called with thumbnail URLs from the "Detected" node
 * @property {function(string):void}   onMask     - Called with the combined mask image URL from "Output"
 * @property {function(Error):void}    onError    - Called on failure
 * @property {function():void}         cancel     - Interrupt the running workflow
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
    // Universal workflows take precedence — use helper to stay decoupled from shape
    const universal = getUniversalWorkflow(operation);
    if (universal) return universal;

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
 * Executes the auto-mask workflow (img_auto_mask.json).
 *
 * Two outputs are captured from a single workflow run:
 *   - "Detected" node  → thumbnail images of each detected segment
 *   - "Output" node    → combined mask image (white = selected, black = background)
 *
 * When `picks` is empty the workflow still runs end-to-end; the "Output" will be
 * an all-black mask (no picks selected) which the caller must ignore.
 *
 * Returns an AutoMaskExecution handle synchronously — attach callbacks before
 * the first async tick to avoid missing early messages.
 *
 * @param {AutoMaskPayload} payload
 * @returns {AutoMaskExecution}
 */
export function runAutoMask(payload) {
    const exec = {
        onDetected: null,
        onMask:     null,
        onError:    null,
        cancel() { ComfyUIController.interrupt(); },
    };

    (async () => {
        const workflowFile = getUniversalWorkflow('autoMaskImg');
        if (!workflowFile) {
            exec.onError?.(new Error('autoMaskImg workflow not registered'));
            return;
        }

        let workflow;
        try {
            const res = await fetch(`/comfy_workflows/${workflowFile}`);
            if (!res.ok) throw new Error(`Failed to load workflow: ${workflowFile}`);
            workflow = await res.json();
        } catch (err) {
            exec.onError?.(err);
            return;
        }

        // Identify "Detected" and "Output" node ids by title
        const detectedNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'detected'
            )
        );
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output'
            )
        );

        // Build picks string — 1-based indices as ComfyUI ImpactSEGSPicker expects
        const picksStr = payload.picks?.size
            ? [...payload.picks].map(i => i + 1).join(',')
            : '';

        const params = {
            Input_Image:           payload.imageUrl,
            sams:                  payload.detectorModel,
            Box:                   payload.useBox === true,
            Selected_Masks_Input:  picksStr,
        };

        const onMessage = (msg) => {
            if (msg.type !== 'executed') return;

            const nodeId    = msg.data?.node;
            const nodeOutput = msg.data?.output;

            if (detectedNodeIds.has(nodeId) && nodeOutput?.images) {
                const urls = nodeOutput.images.map(img =>
                    `http://${ComfyUIController.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`
                );
                exec.onDetected?.(urls);
            }

            if (outputNodeIds.has(nodeId) && nodeOutput?.images) {
                const url = `http://${ComfyUIController.serverAddress}/view?filename=${nodeOutput.images[0].filename}&type=${nodeOutput.images[0].type}&subfolder=${nodeOutput.images[0].subfolder || ''}`;
                exec.onMask?.(url);
            }
        };

        try {
            await ComfyUIController.runWorkflow(workflow, params, onMessage);
        } catch (err) {
            clientLogger.error('comfy', `autoMask workflow failed`, err);
            Events.emit('ui:error', { title: 'Auto-mask failed', message: err.message });
            exec.onError?.(err);
        }
    })();

    return exec;
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
            Events.emit('ui:error', { title: 'Generation failed', message: err.message });
            exec.onError?.(err);
        }
    })();

    return exec;
}
