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
import { getWorkflowFile, getUniversalWorkflow, getModelById } from '../data/modelRegistry.js';
import { getCommandMediaInputs } from '../data/commandRegistry.js';
import { Events } from '../events.js';
import { clientLogger } from './clientLogger.js';
import { state } from '../state.js';
import { getModelSettings, getToolSettings } from '../data/projectModel.js';
import { DEPS } from '../data/modelConstants/dependencies.js';
import { buildWeightMap, create as createAggregator } from './progressAggregator.js';

function _buildComfyViewUrl(fileInfo) {
    const params = new URLSearchParams();
    for (const key of ['filename', 'type', 'subfolder', 'format', 'frame_rate', 'workflow', 'fullpath']) {
        const value = fileInfo?.[key];
        if (value !== undefined && value !== null) params.set(key, value);
    }
    return `http://${ComfyUIController.serverAddress}/view?${params.toString()}`;
}

function _collectComfyOutputUrls(nodeOutput, target) {
    if (nodeOutput?.images) {
        nodeOutput.images.forEach(img => target.push(_buildComfyViewUrl(img)));
    }
    if (nodeOutput?.gifs) {
        nodeOutput.gifs.forEach(gif => target.push(_buildComfyViewUrl(gif)));
    }
}

/**
 * @typedef {Object} RunPayload
 * @property {string}   operation    - Command key (e.g. 't2i', 'upscale')
 * @property {string}   modelId      - Model id from modelRegistry
 * @property {string}   positive     - Positive prompt text
 * @property {string}   [negative]   - Negative prompt text
 * @property {number}   [seed]       - Explicit seed; randomised if omitted
 * @property {Object}   [injectionParams] - Additional params from PromptBox controls (e.g. Width, Height, Steps, Denoise)
 * @property {Array<{url:string, mediaType:'image'|'video'|'audio', source:string, role?:string}>} [mediaItems]
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
 * @property {function(string[]):void} onMasks    - Called with ordered per-pick mask image URLs from "Output" (length = picks.size)
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
 * Resolves just the filename portion of a dep's path (strips folder prefix).
 * e.g. "upscale_models/4x_NMKD-Siax_200k.pth" → "4x_NMKD-Siax_200k.pth"
 * @param {string} depId
 * @returns {string|null}
 */
function _depFilename(depId) {
    const dep = DEPS[depId];
    if (!dep?.filename) return null;
    return dep.filename.split('/').pop();
}

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
    const { positive, negative, seed, mediaItems = [], injectionParams = {} } = payload;
    const resolvedSeed = seed ?? ComfyUIController.generateRandomSeed();

    const params = {
        Positive: positive || '',
        Negative: negative || '',
        Seed:     resolvedSeed,
    };

    // Merge operation-specific control params (ratio, steps, denoise, etc.)
    Object.assign(params, injectionParams);

    if (String(payload.operation || '').endsWith('_ms')) {
        params['Preview_Only'] = payload.previewOnly === true;
    }

    // Map media to operation-declared Comfy input slots. Slots are role-first:
    // explicit item.role wins, then remaining media fills matching mediaType in
    // declared order. This supports future multi-image/video/audio workflows.
    const mediaSlots = getCommandMediaInputs(payload.operation);
    if (mediaSlots.length) {
        const usedIds = new Set();
        const assigned = new Map();
        const fallbackAssigned = new Set();

        for (const slot of mediaSlots) {
            const explicit = mediaItems.find(item =>
                item.role === slot.key &&
                item.mediaType === slot.mediaType &&
                item.url &&
                !usedIds.has(item.id || item.url)
            );
            if (!explicit) continue;
            usedIds.add(explicit.id || explicit.url);
            assigned.set(slot.key, explicit);
            params[slot.title] = explicit.url;
        }

        for (const slot of mediaSlots) {
            if (assigned.has(slot.key)) continue;
            const item = mediaItems.find(candidate =>
                candidate.mediaType === slot.mediaType &&
                candidate.url &&
                !usedIds.has(candidate.id || candidate.url)
            );
            if (!item) continue;
            usedIds.add(item.id || item.url);
            assigned.set(slot.key, item);
            params[slot.title] = item.url;
        }

        // Future-proof fallback: every declared media slot should receive a
        // valid asset when any matching media exists. This prevents Comfy from
        // using stale filenames embedded in the workflow JSON for optional or
        // newly-added input nodes.
        for (const slot of mediaSlots) {
            if (assigned.has(slot.key)) continue;
            const fallback = mediaItems.find(candidate =>
                candidate.mediaType === slot.mediaType &&
                candidate.url
            );
            if (!fallback) continue;
            assigned.set(slot.key, fallback);
            fallbackAssigned.add(slot.key);
            params[slot.title] = fallback.url;
        }

        const endFrameSlot = mediaSlots.find(slot => slot.key === 'endFrame');
        if (endFrameSlot) {
            params['Use_End_Image'] = assigned.has(endFrameSlot.key) && !fallbackAssigned.has(endFrameSlot.key);
        }
    } else {
        // Backward compatibility for any command not yet migrated.
        const imageItem = mediaItems.find(m => m.mediaType === 'image');
        const videoItem = mediaItems.find(m => m.mediaType === 'video');
        if (imageItem) params['Input_Image'] = imageItem.url;
        if (videoItem) params['Input_Video'] = videoItem.url;
    }

    if (payload.maskDataUrl) params['Input_Mask'] = payload.maskDataUrl;

    // ── Model / Tool Settings injection ───────────────────────────────────────
    const project = state.currentProject;
    if (project) {
        if (payload.modelId) {
            // Model context: inject LoRA slots + upscale model
            const settings = getModelSettings(project, payload.modelId);
            const modelDef = getModelById(payload.modelId);

            // LoRA slots — only inject non-null entries
            if (modelDef?.loraStages?.length) {
                modelDef.loraStages.forEach(stage => {
                    const stageSlots = settings.loras?.[stage.key] || [];
                    stageSlots.forEach((slot, i) => {
                        if (!slot.name) return;
                        params[`${stage.injectionPrefix}_${i + 1}`] = {
                            lora_name:      slot.name,
                            strength_model: slot.strengthModel ?? 1.0,
                            strength_clip:  slot.strengthClip  ?? 1.0,
                        };
                    });
                });
            } else {
                (settings.loras || []).forEach((slot, i) => {
                    if (!slot.name) return;
                    params[`Lora_${i + 1}`] = {
                        lora_name:      slot.name,
                        strength_model: slot.strengthModel ?? 1.0,
                        strength_clip:  slot.strengthClip  ?? 1.0,
                    };
                });
            }

            // Upscale model — user selection takes priority, else model default
            const upscaleFilename = settings.upscaleModel
                || _depFilename(modelDef?.defaultUpscale);
            if (upscaleFilename) params['Upscale_Model'] = upscaleFilename;

        } else if (payload.operation) {
            // Tool/universal context: inject upscale model only
            const settings = getToolSettings(project, payload.operation);
            if (settings.upscaleModel) params['Upscale_Model'] = settings.upscaleModel;
        }
    }

    return params;
}

/**
 * Executes the auto-mask workflow (img_auto_mask.json).
 *
 * Two outputs are captured from a single workflow run:
 *   - "Detected" node  → thumbnail images of each detected segment
 *   - "Output" node    → ordered list of per-pick mask images (length = picks.size)
 *
 * When `picks` is empty the caller should skip running the workflow. If invoked
 * with empty picks the "Output" emit is suppressed.
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
        onMasks:    null,
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

        let _detectedFired = false;

        const onMessage = (msg) => {
            if (msg.type !== 'executed') return;

            const nodeId    = msg.data?.node;
            const nodeOutput = msg.data?.output;

            if (detectedNodeIds.has(nodeId) && nodeOutput?.images) {
                const urls = nodeOutput.images.map(img => _buildComfyViewUrl(img));
                _detectedFired = true;
                exec.onDetected?.(urls);
            }

            if (outputNodeIds.has(nodeId) && nodeOutput?.images) {
                if (!payload.picks?.size) return;
                const urls = nodeOutput.images.map(img => _buildComfyViewUrl(img));
                exec.onMasks?.(urls);
            }
        };

        try {
            await ComfyUIController.runWorkflow(workflow, params, onMessage);
            // ComfyUI skips the "Detected" preview node when SEGS is empty —
            // no `executed` event fires. Synthesize an empty-detection signal
            // so listeners can show "Nothing detected".
            if (!_detectedFired) exec.onDetected?.([]);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a workflow error into a user-friendly title and message.
 * Detects model-not-found errors and returns specific copy.
 * @param {string} errMessage
 * @param {string} modelId
 * @returns {{ title: string, message: string }}
 */
function _formatWorkflowError(errMessage, modelId) {
    const msg = errMessage || '';
    const modelName = modelId ? getModelById(modelId)?.name || modelId : '';

    // Detect ComfyUI "model not found" errors (various forms)
    const isModelError = /model not found|checkpoint not found|lora not found|vae not found|upscale not found|failed to find|missing model|model missing|\(model\) not|no model specified|cannot load model|model not load/i.test(msg);

    if (isModelError) {
        return {
            title: 'Missing model',
            message: modelName
                ? `"${modelName}" is not installed. Please install it from the model manager.`
                : `A required model is not installed. Please install it from the model manager.`,
        };
    }

    return {
        title: 'Generation failed',
        message: msg,
    };
}

const LOADER_CLASS_TYPES = new Set([
    'CheckpointLoaderSimple', 'CheckpointLoader',
    'UNETLoader', 'UnetLoaderGGUF',
    'DiffusionModelLoader',
    'CLIPLoader', 'DualCLIPLoader',
    'VAELoader',
    'SAMLoader',
    'UpscaleModelLoader',
    'LoraLoader', 'LoraLoaderModelOnly',
    'MpiLoraModel', 'MpiLoraModelClip',
    'MpiFromCheckpoint',
]);

const IMMEDIATE_WORK_KINDS = new Set(['sampler', 'imageUpscale', 'vhs']);
const DELAYED_WORK_KINDS = new Set(['ultimateSDUpscale']);
const TERMINAL_PHASE_WORK_KINDS = new Set(['sampler']);
const ULTIMATE_START_PROGRESS = 0.75;

export function runCommand(payload) {
    const exec = {
        promptId:        null,
        seed:            null,
        onPreview:       null,
        onProgress:      null,
        onSamplingStart: null,
        onPromptAck:     null,
        onComplete:      null,
        onError:         null,
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
        exec.seed = params.Seed ?? null;

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
        // — or "preview" when this is a preview-only run on a multi-stage workflow.
        // Only images/gifs from these nodes are treated as final results.
        const _captureTitle = payload.previewOnly === true ? 'preview' : 'output';
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === _captureTitle
            )
        );

        // Map nodeId → class_type for loader detection
        const nodeClassMap = {};
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type) nodeClassMap[id] = node.class_type;
        }

        // Build weight map and create aggregator for this execution
        const weightMap  = buildWeightMap(workflow);
        const aggregator = createAggregator(weightMap);
        const hasTerminalPhaseSampler = Object.values(weightMap.nodes).some(node =>
            TERMINAL_PHASE_WORK_KINDS.has(node.kind)
        );
        let comfyEventSource = null;

        // Message handler — forwards previews + collects Output-titled results
        const outputUrls = [];
        let _samplingStartFired = false;
        let _modelInitializing = hasTerminalPhaseSampler;
        const emitSamplingStart = () => {
            if (_samplingStartFired) return;
            if (_modelInitializing) return;
            _modelInitializing = false;
            _samplingStartFired = true;
            Events.emit('tool:sampling-start', { tool: 'groupHistory' });
            exec.onSamplingStart?.();
        };
        const isImmediateWorkNode = (nodeId) => IMMEDIATE_WORK_KINDS.has(weightMap.nodes[nodeId]?.kind);
        const isDelayedWorkNode = (nodeId) => DELAYED_WORK_KINDS.has(weightMap.nodes[nodeId]?.kind);
        const isTerminalPhaseWorkNode = (nodeId) => TERMINAL_PHASE_WORK_KINDS.has(weightMap.nodes[nodeId]?.kind);
        const progressFraction = (info) => {
            const value = Number(info?.value);
            const max   = Number(info?.max);
            if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
            return value / max;
        };
        const closeComfyEventSource = () => {
            if (!comfyEventSource) return;
            comfyEventSource.close();
            comfyEventSource = null;
        };
        exec.cancel = () => {
            closeComfyEventSource();
            ComfyUIController.interrupt();
        };
        if (hasTerminalPhaseSampler && typeof EventSource !== 'undefined') {
            comfyEventSource = new EventSource('/comfy/events/stream');
            comfyEventSource.addEventListener('comfy:model-initializing', () => {
                _modelInitializing = true;
                if (!_samplingStartFired) Events.emit('tool:loading-model', { tool: 'groupHistory' });
            });
            comfyEventSource.addEventListener('comfy:model-init-complete', () => {
                _modelInitializing = false;
                if (!_samplingStartFired) Events.emit('tool:loading-model', { tool: 'groupHistory' });
            });
        }
        const onMessage = (msg) => {
            if (msg.type === 'prompt_ack') {
                exec.promptId = msg.prompt_id;
                exec.onPromptAck?.(msg.prompt_id);
                return;
            }

            if (msg.type === 'preview') {
                emitSamplingStart();
                exec.onPreview?.(msg.url);
                return;
            }

            if (msg.type === 'progress_state') {
                aggregator.onProgressState(msg);
                if (_modelInitializing) return;
                if (!_samplingStartFired) {
                    // Only flip badge when a work node is actually running
                    const nodeData = msg.data?.nodes || {};
                    const workRunning = Object.entries(nodeData).some(([id, info]) => {
                        if (info.state !== 'running') return false;
                        if (isTerminalPhaseWorkNode(id)) return progressFraction(info) > 0;
                        if (isImmediateWorkNode(id)) return true;
                        if (isDelayedWorkNode(id)) return progressFraction(info) >= ULTIMATE_START_PROGRESS;
                        return false;
                    });
                    if (workRunning) emitSamplingStart();
                }
                exec.onProgress?.(aggregator.percent());
                return;
            }

            if (msg.type === 'progress') {
                aggregator.onProgress(msg);
                if (_modelInitializing) return;
                if (!_samplingStartFired) {
                    const nodeId = msg.data?.node;
                    if (isTerminalPhaseWorkNode(nodeId) && progressFraction(msg.data) > 0) {
                        emitSamplingStart();
                    } else if (!isTerminalPhaseWorkNode(nodeId) && isImmediateWorkNode(nodeId)) {
                        emitSamplingStart();
                    } else if (isDelayedWorkNode(nodeId) && progressFraction(msg.data) >= ULTIMATE_START_PROGRESS) {
                        emitSamplingStart();
                    }
                }
                exec.onProgress?.(aggregator.percent());
                return;
            }

            if (msg.type === 'executing') {
                const nodeId = msg.data?.node;

                if (nodeId !== null) {
                    const nodeKind = weightMap.nodes[nodeId]?.kind;
                    if (!_samplingStartFired && LOADER_CLASS_TYPES.has(nodeClassMap[nodeId])) {
                        Events.emit('tool:loading-model', { tool: 'groupHistory' });
                    } else if (!_modelInitializing && !_samplingStartFired && IMMEDIATE_WORK_KINDS.has(nodeKind) && !TERMINAL_PHASE_WORK_KINDS.has(nodeKind)) {
                        emitSamplingStart();
                    }
                    aggregator.onExecuting(msg);
                    return;
                }

                // node === null: execution complete signal
                aggregator.onExecutionSuccess();
                closeComfyEventSource();
                exec.onComplete?.(outputUrls);
                return;
            }

            if (msg.type === 'executed') {
                const nodeId = msg.data?.node;
                if (!outputNodeIds.has(nodeId)) return; // ignore non-Output nodes

                const nodeOutput = msg.data?.output;
                _collectComfyOutputUrls(nodeOutput, outputUrls);
            }
        };

        try {
            await ComfyUIController.runWorkflow(workflow, params, onMessage);
        } catch (err) {
            closeComfyEventSource();
            clientLogger.error('comfy', `Workflow failed: ${payload.operation} / ${payload.modelId}`, err);
            const { title, message } = _formatWorkflowError(err.message, payload.modelId);
            Events.emit('ui:error', { title, message });
            exec.onError?.(err);
        }
    })();

    return exec;
}
