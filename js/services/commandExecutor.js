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
import { COMMANDS, getCommandMediaInputs } from '../data/commandRegistry.js';
import { Events } from '../events.js';
import { clientLogger } from './clientLogger.js';
import { state } from '../state.js';
import { getModelSettings, getToolSettings } from '../data/projectModel.js';
import { DEPS } from '../data/modelConstants/dependencies.js';
import { buildWeightMap, create as createAggregator } from './progressAggregator.js';
import { INJECTORS } from './workflowInjectors/index.js';

function _buildComfyViewUrl(fileInfo) {
    const params = new URLSearchParams();
    for (const key of ['filename', 'type', 'subfolder', 'format', 'frame_rate', 'workflow', 'fullpath']) {
        const value = fileInfo?.[key];
        if (value !== undefined && value !== null) params.set(key, value);
    }
    return `${ComfyUIController.httpBase()}/view?${params.toString()}`;
}

function _collectComfyOutputUrls(nodeOutput, target) {
    if (nodeOutput?.images) {
        nodeOutput.images.forEach(img => target.push(_buildComfyViewUrl(img)));
    }
    if (nodeOutput?.gifs) {
        nodeOutput.gifs.forEach(gif => target.push(_buildComfyViewUrl(gif)));
    }
    // Vanilla ComfyUI `SaveVideo` (portable, card-agnostic encode — replaces
    // VHS_VideoCombine whose nvenc encode fails on the Blackwell Pod, B3) emits
    // under `videos`. Same file-dict shape as gifs, so the /view URL builds
    // identically. Mirrors the controller copy in comfyController.js.
    if (nodeOutput?.videos) {
        nodeOutput.videos.forEach(vid => target.push(_buildComfyViewUrl(vid)));
    }
}

// Native `SaveAudioMP3`/`SaveAudio` (the `Output_Audio` node in the split
// video/audio output design — MPI-64 B3) emits its saved file under `audio`.
// Collected separately from the video URLs so save-generation can mux the
// pair (video is master). Returns the FIRST audio /view URL or null.
function _collectComfyAudioUrl(nodeOutput) {
    const a = nodeOutput?.audio;
    if (Array.isArray(a) && a.length) return _buildComfyViewUrl(a[0]);
    return null;
}

function _collectComfyLatents(nodeOutput, target) {
    if (!Array.isArray(nodeOutput?.latents)) return;
    nodeOutput.latents.forEach(latent => {
        if (latent?.filename) target.push({ ...latent });
    });
}

async function _prepareWorkflowInputs(payload) {
    if (!String(payload.operation || '').endsWith('_ms')) return;
    const res = await fetch('/comfy/prepare-workflow-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: payload.operation }),
    });
    if (!res.ok) {
        let message = `prepare-workflow-inputs returned ${res.status}`;
        try {
            const data = await res.json();
            if (data?.error) message = data.error;
        } catch (_) { /* keep status message */ }
        throw new Error(message);
    }
}

/**
 * Decode a /project-file?path=... URL to an absolute filesystem path.
 * Returns the input unchanged if it doesn't match the project-file pattern.
 */
function _decodeProjectFileUrl(value) {
    if (!value || typeof value !== 'string') return value;
    if (value.includes('project-file?path=') || value.includes('project-file%3Fpath%3D')) {
        const match = value.match(/[?&]path=([^&]+)/);
        if (match) {
            try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
        }
    }
    return value;
}

async function _stagePreviewLatent(payload) {
    if (!payload?.loadLatentName || !payload?.previewLatentFilePath) return;
    const engineInputName = payload.loadLatentName;
    const sourcePath = _decodeProjectFileUrl(payload.previewLatentFilePath);
    const res = await fetch('/comfy/stage-preview-latent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, engineInputName }),
    });
    if (!res.ok) {
        let message = `stage-preview-latent returned ${res.status}`;
        try {
            const data = await res.json();
            if (data?.error) message = data.error;
        } catch (_) { /* keep status message */ }
        throw new Error(message);
    }
}

function _validTrimRange(trim) {
    const rangeIn = Number(trim?.in);
    const rangeOut = Number(trim?.out);
    if (!Number.isFinite(rangeIn) || !Number.isFinite(rangeOut)) return null;
    if (rangeIn < 0 || rangeOut <= rangeIn) return null;
    return { in: rangeIn, out: rangeOut };
}

async function _prepareTrimmedVideoInputs(payload) {
    const project = state.currentProject;
    const mediaItems = Array.isArray(payload?.mediaItems) ? payload.mediaItems : [];
    const tempPaths = [];
    let changed = false;

    try {
        const nextMediaItems = [];
        for (const item of mediaItems) {
            const trim = item?.mediaType === 'video' ? _validTrimRange(item.trim) : null;
            if (!trim) {
                nextMediaItems.push(item);
                continue;
            }
            if (!project?.folderPath) {
                throw new Error('Project folder is required to prepare a trimmed video input.');
            }

            const res = await fetch('/api/video/trim-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folderPath: project.folderPath,
                    sourcePath: item.url || item.filePath,
                    trimIn: trim.in,
                    trimOut: trim.out,
                }),
            });

            let data = null;
            try { data = await res.json(); } catch (_) { /* keep status fallback */ }
            if (!res.ok || !data?.success || !data?.url) {
                throw new Error(data?.error || `trim-input returned ${res.status}`);
            }

            tempPaths.push(data.filePath || data.url);
            nextMediaItems.push({
                ...item,
                url: data.url,
                filePath: data.url,
                source: item.source || 'history-trim',
                trimSourceUrl: item.url || item.filePath || null,
                trim,
            });
            changed = true;
        }

        return {
            payload: changed ? { ...payload, mediaItems: nextMediaItems } : payload,
            tempPaths,
        };
    } catch (err) {
        await _cleanupTrimmedVideoInputs(tempPaths);
        throw err;
    }
}

async function _cleanupTrimmedVideoInputs(paths = []) {
    if (!paths.length) return;
    try {
        await fetch('/api/video/trim-input/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths }),
        });
    } catch (err) {
        clientLogger.warn('commandExecutor', 'Failed to clean temporary trimmed video inputs', err);
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
 * @property {function(string[], {latents?: object[]}):void} onComplete - Called with final output URLs and side outputs on success
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

function _resolveUpscaleFilename(value) {
    if (!value || typeof value !== 'string') return null;
    return _depFilename(value) || value;
}

const _baseName = (f) => String(f || '').replace(/\\/g, '/').split('/').pop();
const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

/**
 * Resolve a saved LoRA/upscale name to the EXACT string in the current asset
 * list, separator-agnostically. list-files emits the engine-native separator
 * (Windows '\\' local, '/' remote) which ComfyUI's enum expects; project.json
 * may hold a legacy forward-slash value. Returning the list string makes the
 * injected `lora_name`/`model_name` match ComfyUI's enum so it does not 400 with
 * "value not in list". Falls back to the saved value when no list match exists.
 */
function _resolveModelName(value, available) {
    if (!value) return value;
    const list = available || [];
    const want = _pathKey(value);
    // 1) Exact full-path match (separator-agnostic) — preferred.
    const exact = list.find(f => _pathKey(f) === want);
    if (exact) return exact;
    // 2) The exact path is gone but a same-BASENAME file exists elsewhere (e.g. the
    //    LoRA's subfolder was removed and the file now sits at root). Heal to it ONLY
    //    when unambiguous (exactly one basename match); multiple matches are genuinely
    //    different files, so don't guess — leave the value as-is (stays "missing").
    const base = _baseName(value).toLowerCase();
    const byName = list.filter(f => _baseName(f).toLowerCase() === base);
    if (byName.length === 1) return byName[0];
    return value;
}

/**
 * Resolve the upscale param for injection. Unlike LoRAs (which hard-block when
 * missing), upscale always has a guaranteed default (SIAX, bundled with the
 * engine), so a missing custom upscaler FALLS BACK to SIAX and warns rather than
 * 400-ing the generation. Returns the engine-correct upscale filename to inject.
 */
function _resolveUpscaleParam(upscaleFilename) {
    if (!upscaleFilename) return upscaleFilename;
    const available = state.upscaleModels;
    if (!Array.isArray(available) || !available.length) return upscaleFilename; // engine not ready
    // Resolvable = exact path OR unique basename heal (see _resolveModelName).
    const resolved = _resolveModelName(upscaleFilename, available);
    if (resolved !== upscaleFilename || available.some(f => _pathKey(f) === _pathKey(upscaleFilename))) {
        return resolved;
    }

    // Missing / ambiguous → fall back to SIAX (engine-bundled, always present) + warn.
    const siax = _depFilename('4x-NMKD-Siax');
    const siaxResolved = siax ? _resolveModelName(siax, available) : null;
    Events.emit('ui:warning', {
        message: `Upscale model "${_baseName(upscaleFilename)}" was not found in your folders. `
            + `Using the default (${siax || 'built-in'}) instead. Add it in Settings → External Connections, or pick another.`,
    });
    return siaxResolved || upscaleFilename;
}

/**
 * Pre-generation guard for LoRAs. A selected LoRA whose file is NOT in any of the
 * folders the system points at (the `/comfy/list-files` union mirrored in
 * state.availableLoras) would fail at the loader node with a cryptic "model not
 * found". This catches it BEFORE submission so we can warn the user to add the
 * file (drag-drop in Settings → External Connections) or pick another. Compared
 * by basename to tolerate subfolder-prefixed list entries.
 *
 * LoRAs HARD-BLOCK (a missing LoRA is an explicit user intent that must not be
 * silently dropped). Upscale models are handled differently: they always have a
 * guaranteed default (SIAX), so a missing upscale falls back + warns instead of
 * blocking — see _resolveUpscaleParam.
 *
 * The asset lists are loaded lazily — if they are empty (engine not ready), the
 * guard allows the run rather than blocking on an unpopulated list.
 * @param {Record<string, any>} params  built workflow params (LoRA objs)
 * @returns {string|null} missing LoRA name, or null if nothing blocks
 */
function _findMissingModel(params) {
    const loras = state.availableLoras;
    // params.lora_name is already _resolveModelName-healed by _buildParams, so a
    // resolvable LoRA now equals an exact list entry. Block only when the name
    // STILL has no exact match — i.e. the file is gone, or its basename is
    // ambiguous (multiple folders) so we refused to guess. Empty list (engine not
    // ready) → don't block.
    const resolvable = (name) => {
        if (!Array.isArray(loras) || !loras.length) return true;
        const want = _pathKey(name);
        return loras.some(f => _pathKey(f) === want);
    };

    for (const value of Object.values(params || {})) {
        if (value && typeof value === 'object' && value.lora_name) {
            if (!resolvable(value.lora_name)) return value.lora_name;
        }
    }
    return null;
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
 * Stage-2 workflow filename derivation. Convention: `<base>.json` + `<base>_stage2.json`.
 * Stage-2 workflows have the stage-1 sampler bypassed (saved via ComfyUI's
 * Save (API) with that node's bypass toggled on) and the `Is_Continue` /
 * `Preview_Only` booleans pre-baked so no per-run injection is needed.
 */
function _toStage2Filename(file) {
    if (!file || typeof file !== 'string') return file;
    return file.replace(/\.json$/i, '_stage2.json');
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
        // Preview_Only only applies to the stage-1 workflow. Stage-2 workflows
        // (resolved via _stage2 filename swap) have no Preview_Only node, and
        // comfyController defensively strips this param when the node is absent.
        // History workspace forces single-stage execution: `historyMode` from
        // the payload overrides any previewStage toggle so re-generation from
        // history never produces a preview card.
        params['Preview_Only'] = payload.historyMode === true ? false : (payload.previewOnly === true);
        // LoadLatent is always required for _ms workflows. ComfyUI validates the
        // node even when its output is unreached. Stage-1 uses the default
        // engine-input latent; stage-2 uses the per-preview <uuid>.latent staged
        // by /comfy/stage-preview-latent. Default applies when no explicit
        // loadLatentName is supplied (every stage-1 run).
        params['LoadLatent'] = payload.loadLatentName || 'ComfyUI_00001_.latent';
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
                            lora_name:      _resolveModelName(slot.name, state.availableLoras),
                            strength_model: slot.strengthModel ?? 1.0,
                            strength_clip:  slot.strengthClip  ?? 1.0,
                        };
                    });
                });
            } else {
                (settings.loras || []).forEach((slot, i) => {
                    if (!slot.name) return;
                    params[`Lora_${i + 1}`] = {
                        lora_name:      _resolveModelName(slot.name, state.availableLoras),
                        strength_model: slot.strengthModel ?? 1.0,
                        strength_clip:  slot.strengthClip  ?? 1.0,
                    };
                });
            }

            // Upscale model — user selection takes priority, else model default
            const upscaleFilename = _resolveUpscaleFilename(settings.upscaleModel)
                || _depFilename(modelDef?.defaultUpscale);
            if (upscaleFilename) params['Upscale_Model'] = _resolveUpscaleParam(upscaleFilename);

        } else if (payload.operation) {
            // Tool/universal context: inject upscale model only
            const settings = getToolSettings(project, payload.operation);
            const upscaleFilename = _resolveUpscaleFilename(settings.upscaleModel);
            if (upscaleFilename) params['Upscale_Model'] = _resolveUpscaleParam(upscaleFilename);
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
        cacheHit:        false,
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
            if (payload.isStage2 === true) {
                workflowFile = _toStage2Filename(workflowFile);
            }
        } catch (err) {
            exec.onError?.(err);
            return;
        }

        let workingPayload = payload;
        let tempTrimInputPaths = [];
        try {
            const prepared = await _prepareTrimmedVideoInputs(payload);
            workingPayload = prepared.payload;
            tempTrimInputPaths = prepared.tempPaths;
        } catch (err) {
            clientLogger.error('commandExecutor', 'Failed to prepare trimmed video input', err);
            exec.onError?.(err);
            return;
        }

        const params = _buildParams(workingPayload);
        exec.seed = params.Seed ?? null;

        // Guard: block submission if a selected LoRA/upscale model is not in any
        // of the configured model folders — the loader would fail with a cryptic
        // "model not found". Warn and abort cleanly instead.
        const missingModel = _findMissingModel(params);
        if (missingModel) {
            await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
            Events.emit('ui:warning', {
                message: `"${_baseName(missingModel)}" was not found in your LoRA/upscale folders. `
                    + 'Add it in Settings → External Connections (drag-drop), or pick another in Model Settings.',
            });
            exec.onError?.(new Error('model_missing'));
            return;
        }

        // Load the workflow JSON so we can identify "Output" node ids before
        // execution — needed for filtering executed messages by title.
        let workflow;
        try {
            const res = await fetch(`/comfy_workflows/${workflowFile}`);
            if (!res.ok) throw new Error(`Failed to load workflow: ${workflowFile}`);
            workflow = await res.json();
        } catch (err) {
            await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
            exec.onError?.(err);
            return;
        }

        const opDef = COMMANDS[workingPayload.operation];
        if (opDef?.injector) {
            const injector = INJECTORS[opDef.injector];
            if (!injector) {
                clientLogger.error('commandExecutor', `Missing injector "${opDef.injector}" for op ${workingPayload.operation}`);
            } else {
                try {
                    injector(workflow, workingPayload.injectionParams || {});
                    // Standalone injector params are already written into the
                    // workflow. Remove them so the generic title injector below
                    // cannot re-match names like `flip` against a `Flip` node.
                    Object.keys(workingPayload.injectionParams || {}).forEach(key => {
                        delete params[key];
                    });
                    clientLogger.info('commandExecutor', `Applied injector "${opDef.injector}"`);
                } catch (err) {
                    await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
                    exec.onError?.(err);
                    return;
                }
            }
        }

        try {
            await _prepareWorkflowInputs(workingPayload);
        } catch (err) {
            clientLogger.error('commandExecutor', 'Failed to prepare workflow input defaults', err);
            await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
            exec.onError?.(err);
            return;
        }

        try {
            await _stagePreviewLatent(workingPayload);
        } catch (err) {
            clientLogger.error('commandExecutor', 'Failed to stage preview latent', err);
            Events.emit('ui:error', { title: 'Stage-2 setup failed', message: err.message });
            await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
            exec.onError?.(err);
            return;
        }

        // Build a set of node ids whose _meta.title === "output" (case-insensitive)
        // — or "preview" when this is a preview-only run on a multi-stage workflow.
        // Only images/gifs/videos from these nodes are treated as final results.
        // Split video/audio output (B3): video workflows replace the single
        // "Output" VHS_VideoCombine (nvenc-broken on Blackwell) with a
        // "Output_Video" SaveVideo + an optional "Output_Audio" SaveAudio node.
        // Treat "Output_Video" as an output node too so the SAME capture path
        // works for every video workflow; the audio node is tracked separately
        // and muxed server-side at save time (video is master). Preview-only
        // multi-stage runs still capture the "Preview" node.
        const _captureTitle = workingPayload.previewOnly === true && String(workingPayload.operation || '').endsWith('_ms')
            ? 'preview'
            : 'output';
        const _videoOutputTitle = _captureTitle === 'output' ? 'output_video' : null;
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id => {
                const t = workflow[id]._meta?.title?.toLowerCase();
                return t === _captureTitle || (_videoOutputTitle && t === _videoOutputTitle);
            })
        );
        const outputAudioNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output_audio'
            )
        );

        // Cache-hit dedupe only fires for workflows that do NOT inject a fresh
        // seed. Convention: every seeded workflow has a node titled exactly
        // "Seed" (case-insensitive). Universal workflows like Upscale have no
        // such node and benefit from dedupe.
        const _hasSeedNode = Object.values(workflow).some(node =>
            node?._meta?.title?.toLowerCase() === 'seed'
        );

        // Map nodeId → class_type for loader detection
        const saveLatentNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id].class_type === 'SaveLatent' ||
                workflow[id]._meta?.title?.toLowerCase() === 'savelatent'
            )
        );

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
        const latentOutputs = [];
        // First "Output_Audio" file URL, when a video workflow saved audio
        // alongside the video (B3 split output). null when the source had no
        // audio (the workflow's MpiHasAudio gate skips the audio save). Muxed
        // into the video server-side at save time.
        let audioOutputUrl = null;
        let _samplingStartFired = false;
        let _modelInitializing = hasTerminalPhaseSampler;
        // Tool-panel previews (e.g. resize thumbnail round-trip) bypass
        // generationService and call runCommand directly with
        // `suppressLifecycleEvents: true`. They must not emit StatusBar
        // lifecycle signals — there is no `tool:running`/`tool:idle` pair
        // wrapping them, so any sampling-start/loading-model emit would
        // strand StatusBar in the active state.
        // NOTE: do NOT gate on `previewOnly` alone — multi-stage `_ms`
        // previews flow through generationService and DO want lifecycle
        // events.
        const _suppressLifecycleEvents = workingPayload.suppressLifecycleEvents === true;
        const emitSamplingStart = () => {
            if (_samplingStartFired) return;
            if (_modelInitializing) return;
            _modelInitializing = false;
            _samplingStartFired = true;
            if (!_suppressLifecycleEvents) {
                Events.emit('tool:sampling-start', { tool: 'groupHistory', operation: workingPayload.operation });
            }
            exec.onSamplingStart?.();
        };
        const emitProgress = (value) => {
            if (!_suppressLifecycleEvents && _samplingStartFired) {
                Events.emit('tool:progress', { tool: 'groupHistory', value });
            }
            exec.onProgress?.(value);
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
                if (!_samplingStartFired && !_suppressLifecycleEvents) Events.emit('tool:loading-model', { tool: 'groupHistory' });
            });
            comfyEventSource.addEventListener('comfy:model-init-complete', () => {
                _modelInitializing = false;
                if (!_samplingStartFired && !_suppressLifecycleEvents) Events.emit('tool:loading-model', { tool: 'groupHistory' });
            });
        }
        const onMessage = (msg) => {
            if (msg.type === 'prompt_ack') {
                exec.promptId = msg.prompt_id;
                exec.onPromptAck?.(msg.prompt_id);
                return;
            }

            if (msg.type === 'execution_cached') {
                // ComfyUI lists nodes served from cache. Pure cache hit =
                // every output-titled node appears in the cached set. Skip
                // entirely for seeded workflows — a fresh seed invalidates
                // the cache by design, so a "cache hit" there would be a
                // false positive.
                if (_hasSeedNode) return;
                const cachedNodes = msg.data?.nodes;
                if (Array.isArray(cachedNodes) && cachedNodes.length && outputNodeIds.size) {
                    const cachedSet = new Set(cachedNodes.map(String));
                    let allCached = true;
                    for (const id of outputNodeIds) {
                        if (!cachedSet.has(String(id))) { allCached = false; break; }
                    }
                    if (allCached) exec.cacheHit = true;
                }
                return;
            }

            if (msg.type === 'preview') {
                emitSamplingStart();
                exec.onPreview?.(msg.url);
                return;
            }

            if (msg.type === 'progress_state') {
                aggregator.onProgressState(msg);
                const nodeData = msg.data?.nodes || {};
                const workRunning = Object.entries(nodeData).some(([id, info]) => {
                    if (info.state !== 'running') return false;
                    if (isTerminalPhaseWorkNode(id)) return progressFraction(info) > 0;
                    if (isImmediateWorkNode(id)) return true;
                    if (isDelayedWorkNode(id)) return progressFraction(info) >= ULTIMATE_START_PROGRESS;
                    return false;
                });
                if (!_samplingStartFired) {
                    // Only flip badge when a work node is actually running
                    if (workRunning) {
                        _modelInitializing = false;
                        emitSamplingStart();
                    }
                }
                if (_modelInitializing) return;
                emitProgress(aggregator.percent());
                return;
            }

            if (msg.type === 'progress') {
                aggregator.onProgress(msg);
                const nodeId = msg.data?.node;
                const workRunning = (
                    (isTerminalPhaseWorkNode(nodeId) && progressFraction(msg.data) > 0) ||
                    (!isTerminalPhaseWorkNode(nodeId) && isImmediateWorkNode(nodeId)) ||
                    (isDelayedWorkNode(nodeId) && progressFraction(msg.data) >= ULTIMATE_START_PROGRESS)
                );
                if (!_samplingStartFired) {
                    if (workRunning) {
                        _modelInitializing = false;
                        emitSamplingStart();
                    }
                }
                if (_modelInitializing) return;
                emitProgress(aggregator.percent());
                return;
            }

            if (msg.type === 'executing') {
                const nodeId = msg.data?.node;

                if (nodeId !== null) {
                    const nodeKind = weightMap.nodes[nodeId]?.kind;
                    if (!_samplingStartFired && !_suppressLifecycleEvents && LOADER_CLASS_TYPES.has(nodeClassMap[nodeId])) {
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
                exec.onComplete?.(outputUrls, { latents: latentOutputs, audioUrl: audioOutputUrl });
                return;
            }

            if (msg.type === 'executed') {
                const nodeId = msg.data?.node;
                const nodeOutput = msg.data?.output;
                if (saveLatentNodeIds.has(nodeId)) {
                    _collectComfyLatents(nodeOutput, latentOutputs);
                }
                if (outputNodeIds.has(nodeId)) {
                    _collectComfyOutputUrls(nodeOutput, outputUrls);
                }
                if (outputAudioNodeIds.has(nodeId)) {
                    audioOutputUrl = _collectComfyAudioUrl(nodeOutput) || audioOutputUrl;
                }
            }
        };

        try {
            await ComfyUIController.runWorkflow(workflow, params, onMessage);
        } catch (err) {
            closeComfyEventSource();
            clientLogger.error('comfy', `Workflow failed: ${workingPayload.operation} / ${workingPayload.modelId}`, err);
            const { title, message } = _formatWorkflowError(err.message, workingPayload.modelId);
            Events.emit('ui:error', { title, message });
            exec.onError?.(err);
        } finally {
            await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
        }
    })();

    return exec;
}
