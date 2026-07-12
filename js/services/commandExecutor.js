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

import { ComfyUIController, getEngine } from './comfyController.js';
import { getUniversalWorkflow, getModelById, getModelDepStatus } from '../data/modelRegistry.js';
import { remoteEngineClient } from './remoteEngineClient.js';
import { resolveDeps, resolveWorkflowFile, variantDepsOf, archVariantOptions } from '../data/modelConstants/resolveModelDeps.js';
import { downloadService } from './downloadService.js';
import { COMMANDS, getCommandMediaInputs, filterMediaInputsForModel, commandIsMultiStage } from '../data/commandRegistry.js';
import { Events } from '../events.js';
import { clientLogger } from './clientLogger.js';
import { state } from '../state.js';
import { getModelSettings, getToolSettings } from '../data/projectModel.js';
import { DEPS } from '../data/modelConstants/dependencies.js';
import { sizeToGb } from '../data/modelConstants/footprint.js';
import { buildWeightMap, create as createAggregator } from './progressAggregator.js';
import { createStageProgress } from './phaseProgress.js';
import { stagesFor } from '../data/progressStages.js';
import { INJECTORS } from './workflowInjectors/index.js';
import { buildComfyViewUrl, collectComfyOutputUrls, readComfyOutputText } from '../utils/comfyOutputUrls.js';
import { generationStore, PHASES } from './generationStore.js';

// Adapters over the shared js/utils/comfyOutputUrls.js (MPI-176). MPI-74: a
// force-local run's output lives on LOCAL ComfyUI — build the /view URL against
// the local engine's base so save-generation downloads from the right engine
// (otherwise a remote-mode save would 404 against the Pod and lose the gen).
// getEngine(forceLocal) picks the local-pinned instance.
function _buildComfyViewUrl(fileInfo, forceLocal = false) {
    return buildComfyViewUrl(getEngine(forceLocal).httpBase(), fileInfo);
}

function _collectComfyOutputUrls(nodeOutput, target, forceLocal = false) {
    collectComfyOutputUrls(f => _buildComfyViewUrl(f, forceLocal), nodeOutput, target);
}

// Native `SaveAudioMP3`/`SaveAudio` (the `Output_Audio` node in the split
// video/audio output design — MPI-64 B3) emits its saved file under `audio`.
// Collected separately from the video URLs so save-generation can mux the
// pair (video is master). Returns the FIRST audio /view URL or null.
function _collectComfyAudioUrl(nodeOutput, forceLocal = false) {
    const a = nodeOutput?.audio;
    if (Array.isArray(a) && a.length) return _buildComfyViewUrl(a[0], forceLocal);
    return null;
}

// Tags each collected latent with its role from the SaveLatent node title:
// Output_Video_Latent -> 'video', Output_Audio_Latent -> 'audio' (LTX dual-latent,
// MPI-128). Untitled / legacy bare "SaveLatent" -> 'video' (WAN is single video).
function _latentRoleFromTitle(title) {
    const t = String(title || '').toLowerCase();
    if (t.includes('audio')) return 'audio';
    return 'video';
}

function _collectComfyLatents(nodeOutput, target, role = 'video') {
    if (!Array.isArray(nodeOutput?.latents)) return;
    nodeOutput.latents.forEach(latent => {
        if (latent?.filename) target.push({ ...latent, role });
    });
}

/**
 * Case-insensitive truthy lookup of an injection param by node title. Titles are
 * matched case-insensitively at injection time (comfyController), and the graphs
 * are authored by hand — `Input_enhance_prompt` and `Input_Enhance_Prompt` are the
 * same node. Reading the param must be just as forgiving or the two spellings
 * disagree about how many progress bars the run will emit.
 */
function _paramIsTrue(params, title) {
    const want = title.toLowerCase();
    for (const [k, v] of Object.entries(params || {})) {
        if (k.toLowerCase() === want) return v === true;
    }
    return false;
}

/** Media-input node classes whose baked filename must resolve in the engine `input/`. */
const _MEDIA_INPUT_CLASSES = new Set(['LoadImage', 'LoadImageMask', 'LoadAudio', 'LoadLatent']);

async function _prepareWorkflowInputs(payload, workflow) {
    // A workflow carrying ANY media-input node (LoadImage/LoadAudio/LoadLatent) has a
    // baked placeholder filename that must exist in the engine `input/`, or ComfyUI
    // rejects the graph at prompt time — even for nodes whose output is gated off (a
    // t2v never uses the frame; a plain Krea2 t2i never uses Input_Image).
    //
    // This used to gate on `mediaType === 'video'`, which was itself a widening of an
    // earlier `commandIsMultiStage` gate. Both were op-type proxies for the real
    // question. Krea2 (MPI-242) is the first IMAGE model whose t2i graph carries an
    // OPTIONAL LoadImage, so the proxy failed again. Inspect the workflow instead —
    // that is the rule the add-model playbook §2 asks for.
    //
    // Staging is ~2.3MB locally (a copy), but on the REMOTE engine it uploads each
    // default to the Pod, so we must not run it for graphs that have no media node.
    if (!workflow || typeof workflow !== 'object') return;
    const hasMediaInput = Object.values(workflow).some(
        node => _MEDIA_INPUT_CLASSES.has(node?.class_type)
    );
    if (!hasMediaInput) return;
    const res = await fetch('/comfy/prepare-workflow-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: payload.operation, forceLocal: payload.forceLocal === true }),
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

async function _stageOneLatent(engineInputName, previewLatentFilePath, forceLocal) {
    const sourcePath = _decodeProjectFileUrl(previewLatentFilePath);
    const res = await fetch('/comfy/stage-preview-latent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, engineInputName, forceLocal: forceLocal === true }),
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

async function _stagePreviewLatent(payload) {
    if (payload?.loadLatentName && payload?.previewLatentFilePath) {
        await _stageOneLatent(payload.loadLatentName, payload.previewLatentFilePath, payload.forceLocal);
    }
    // Dual-latent (LTX, MPI-128): stage the per-preview audio latent under its own
    // engine input name so the stage-2 Input_Audio_Latent LoadLatent node validates
    // and loads it. WAN previews carry no audio latent → second stage is skipped.
    if (payload?.loadAudioLatentName && payload?.audioLatentFilePath) {
        await _stageOneLatent(payload.loadAudioLatentName, payload.audioLatentFilePath, payload.forceLocal);
    }
}

async function _restagePreviewLatentAfterRemoteRestart(payload, serverReady) {
    if (!serverReady?.remoteComfyRestarted) return;
    await _stagePreviewLatent(payload);
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
 * @property {function(string[], {latents?: object[], audioUrl?: string|null, promptText?: string|null}):void} onComplete - Called with final output URLs and side outputs on success. `promptText` is the string an `Output_prompt` node encoded (null when the workflow has none).
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
 * Build the injection object for one LoRA slot, or null to skip it.
 *  - Empty slot (no name) → null.
 *  - Bypassed slot (MPI-223) → strength 0 so the node stays in the graph with zero
 *    effect (no shape change / reload), BUT if the file is missing/unresolvable the
 *    slot is skipped (null) so it never trips the missing-LoRA block.
 *  - Normal slot → its saved strengths.
 */
function _loraSlotParam(slot) {
    if (!slot?.name) return null;
    const resolved = _resolveModelName(slot.name, state.availableLoras);
    if (slot.bypass) {
        const loras = state.availableLoras || [];
        const present = loras.some(f => _pathKey(f) === _pathKey(resolved));
        if (!present) return null; // bypassed + gone → inject nothing, don't block
        return { lora_name: resolved, strength_model: 0, strength_clip: 0 };
    }
    return {
        lora_name:      resolved,
        strength_model: slot.strengthModel ?? 1.0,
        strength_clip:  slot.strengthClip  ?? 1.0,
    };
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
 *
 * REMOTE NOTE (MPI-82): this guard is mode-AGNOSTIC by design. It blocks when a
 * LoRA is absent from the LOCAL folders, which is exactly the precondition both
 * local runs and remote runs need — in remote mode the file is auto-uploaded to
 * the Pod from local disk at generate-time (comfyController._uploadRemoteModels),
 * so "present locally" is the requirement either way. Do NOT add a remote branch
 * here: a local-missing LoRA can't be uploaded, so it must block in both modes.
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
 * MPI-74: for a force-local run, verify the selected model's deps are present on
 * LOCAL disk (the engine that will actually run it), independent of remote mode.
 * Hits /comfy/models/check-local (which ignores remote-active). Returns the model
 * display name when NOT fully installed locally, else null. On a check error,
 * returns null (fail-open) — the run then surfaces any real failure itself rather
 * than blocking on a flaky check.
 * Resolves only the REQUESTED operation's deps (commonDeps + that op's payload),
 * so a Wan run for an op the user installed isn't blocked because a DIFFERENT,
 * deliberately-omitted op's weights are absent (MPI-122). Flat/universal models
 * resolve to their full dep set.
 * @param {string} modelId
 * @param {string} [operation]
 * @returns {Promise<string|null>}
 */
async function _findModelNotLocal(modelId, operation = null) {
    const model = getModelById(modelId);
    if (!model) return null;
    const selectedOps = operation ? [operation] : null;
    // ALWAYS resolve the LOCAL engine set: this is the force-local preflight, so
    // an engine-split model (LTX bf16-local / GGUF-Pod) must check for the bf16
    // weight on disk, NOT the Pod-only GGUF (which is legitimately absent locally
    // and would wrongly block the local run). (MPI-163)
    // MPI-200: local arch selects the balanced tier's local transformer variant.
    const arch = await remoteEngineClient.arch('local');
    const deps = resolveDeps(model, selectedOps, null, 'local', { arch })
        .map(depId => {
            const dep = DEPS[depId];
            return dep ? { id: depId, type: dep.type, filename: dep.filename } : null;
        })
        .filter(Boolean);
    if (!deps.length) return null;
    try {
        const res = await fetch('/comfy/models/check-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: [{ id: model.id, deps }] }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const installed = data?.results?.[model.id]?.installed;
        return installed ? null : (model.name || model.id);
    } catch (e) {
        clientLogger.warn('commandExecutor', `local model check failed for ${modelId}: ${e.message}`);
        return null;
    }
}

// MPI-194: single-file size at/above which a remote weight is staged from the slow
// network volume onto the Pod's fast container disk before generating. 20GB (binary,
// to match footprint.js's sizeToGb which parses "41GB" as 41 * 1024^3). Selects only
// the LTX 41GB transformer today; the 9.45GB TE and <=13.55GB Wan files stay on the
// volume. See docs/playbooks/add-model/02-dependencies-r2.md (>=20GB PING-USER gate) + docs/runpod-*.
const HOT_STORE_MIN_GB = 20;

/**
 * Remote-engine gen preflight (MPI-194): stage any weight file >= HOT_STORE_MIN_GB
 * from the Pod's network volume onto its container disk so aimdo's per-stage
 * re-faults read local NVMe (~9s gap) not the 750MB/s volume (~36s gap). Sticky +
 * LRU on the Pod side; this call is idempotent (already-staged files return instantly).
 * Awaited before dispatch so the one-time ~55s first-stage shows a real progress
 * toast. Best-effort: on any failure the gen still runs from the volume — never blocks.
 */
async function _ensureRemoteHotStore(modelId, operation) {
    const model = getModelById(modelId);
    if (!model) return;
    const selectedOps = operation ? [operation] : null;
    // MPI-200: remote path → the pod's arch selects the one balanced transformer to
    // stage (else the >=20GB filter would miss it / stage the wrong variant).
    const arch = await remoteEngineClient.arch('remote');
    const files = resolveDeps(model, selectedOps, null, 'remote', { arch })
        .map(id => DEPS[id])
        .filter(dep => dep && dep.filename && sizeToGb(dep.size) >= HOT_STORE_MIN_GB)
        .map(dep => {
            // dep.type is often undefined; the real comfy subdir is the first path
            // segment of filename (e.g. "diffusion_models/ltx-...safetensors").
            const slash = dep.filename.indexOf('/');
            if (slash < 0) return null;
            return {
                type: dep.type || dep.filename.slice(0, slash),
                filename: dep.filename.slice(slash + 1),
                size_bytes: Math.round(sizeToGb(dep.size) * (1024 ** 3)),
                sha256: dep.sha256 || '',
            };
        })
        .filter(Boolean);
    if (!files.length) return;

    const post = (body) => fetch('/remote/hot-store/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    try {
        // Cheap dryRun first: toast ONLY when a real ~55s copy is pending (cold
        // stage). A warm gen (everything already on disk) shows nothing — the fix
        // for the "Preparing…" toast firing on every remote gen (MPI-194).
        const dry = await post({ files, dryRun: true });
        if (dry.ok) {
            const info = await dry.json().catch(() => null);
            if ((info?.pending || 0) > 0) {
                Events.emit('ui:info', { message: 'Preparing the cloud engine for a faster generation…' });
            }
        }
        // Real ensure (blocks ~55s only on a cold stage; instant when cached).
        const res = await post({ files });
        if (!res.ok) {
            clientLogger.warn('commandExecutor', `hot-store ensure HTTP ${res.status} — generating from volume`);
            return;
        }
        const data = await res.json().catch(() => null);
        const staged = (data?.results || []).filter(r => r.staged).length;
        clientLogger.info('commandExecutor', `hot-store: ${staged}/${files.length} file(s) on Pod disk`);
    } catch (e) {
        // Non-fatal — the volume copy still works, just slower.
        clientLogger.warn('commandExecutor', `hot-store ensure failed (${e.message}) — generating from volume`);
    }
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
        Input_Positive: positive || '',
        Input_Negative: negative || '',
        Input_Seed:     resolvedSeed,
    };

    // Constant params the OP always injects (commandRegistry.injectParams) — the
    // branch-selecting booleans on graphs shared by several ops (Krea2's t2i / i2i /
    // poseReference). Merged BEFORE injectionParams so a user control still wins.
    Object.assign(params, COMMANDS[payload.operation]?.injectParams || {});

    // Merge operation-specific control params (ratio, steps, denoise, etc.)
    Object.assign(params, injectionParams);

    if (commandIsMultiStage(payload.operation)) {
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
        const _latentName = payload.loadLatentName || 'ComfyUI_00001_.latent';
        // Video-latent load node (MPI-127). WAN + LTX stage-1 both load the single
        // engine-input latent here; stage-2 swaps in the staged preview latent.
        params['Input_Video_Latent'] = _latentName;
        // Dual-latent stage-2 (LTX, MPI-128). LTX saves TWO latents (video + audio)
        // and stage-2 loads BOTH via Input_Video_Latent + Input_Audio_Latent. When a
        // per-preview audio latent was staged, point its LoadLatent node at it; stage-1
        // and single-latent models (WAN) supply no audio name and fall back to the
        // baked engine default (validated, never read on those runs).
        params['Input_Audio_Latent'] = payload.loadAudioLatentName || 'ltx_audio_latent_00001_.latent';
    }

    // Map media to operation-declared Comfy input slots. Slots are role-first:
    // explicit item.role wins, then remaining media fills matching mediaType in
    // declared order. This supports future multi-image/video/audio workflows.
    // Audio slot is model-capability-gated (LTX yes, WAN no) — drop it for
    // models without audio so a WAN run never injects an Input_Audio_File.
    const mediaSlots = filterMediaInputsForModel(
        getCommandMediaInputs(payload.operation),
        getModelById(payload.modelId),
    );
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

            // LoRA slots — only inject non-null entries.
            // Bypassed slots inject at strength 0 (the node stays in the graph, so no
            // shape change / model reload) EXCEPT when the file is missing — then skip
            // the slot entirely so a bypassed-but-gone LoRA never hits the missing-LoRA
            // block (_findMissingModel). Bypass is meant to work regardless of the file. (MPI-223)
            if (modelDef?.loraStages?.length) {
                modelDef.loraStages.forEach(stage => {
                    const stageSlots = settings.loras?.[stage.key] || [];
                    stageSlots.forEach((slot, i) => {
                        const param = _loraSlotParam(slot);
                        if (param) params[`${stage.injectionPrefix}_${i + 1}`] = param;
                    });
                });
            } else {
                // Flat-lora models (image models + LTX). `settings.loras` may be a
                // non-array (e.g. a stale object from a model that previously had
                // loraStages, or {} from a partial settings merge), so coerce.
                const flatLoras = Array.isArray(settings.loras) ? settings.loras : [];
                flatLoras.forEach((slot, i) => {
                    const param = _loraSlotParam(slot);
                    if (param) params[`Lora_${i + 1}`] = param;
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

    // ── Input_ canonicalization pass (MPI-127 / MPI-252) ──────────────────────
    // The whole workflow fleet is now Input_*/Output_* titled (tier-1 deprecated).
    // A few params are still built with the bare control name (Preview_Only,
    // Use_End_Image, Upscale_Model, Lora_N, and any control returning a bare key).
    // Injection matches node title exactly and silently skips a param whose title
    // has no node, so rename each bare key to its Input_ form and drop the bare
    // half — there is no tier-1 node left to consume it. Keys already prefixed
    // (Input_*/Output_*) pass through untouched.
    for (const key of Object.keys(params)) {
        if (key.startsWith('Input_') || key.startsWith('Output_')) continue;
        const aliased = `Input_${key}`;
        if (!(aliased in params)) params[aliased] = params[key];
        delete params[key];
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
    // `_settled` flips true once the workflow has finished (resolved or thrown).
    // cancel() is then a no-op: there is no running ComfyUI step to interrupt, so
    // firing interrupt() would only surface the remote "Stopping…" toast for a
    // detect that already completed (re-DETECT re-cancels the stale exec; the
    // "Nothing detected" path also calls cancel() after a clean finish).
    let _settled = false;
    const exec = {
        onDetected: null,
        onMasks:    null,
        onError:    null,
        cancel() {
            if (_settled) return;
            getEngine(payload.forceLocal === true).interrupt();
        },
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
                workflow[id]._meta?.title?.toLowerCase() === 'output_detected'
            )
        );
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output_image'
            )
        );

        // Build picks string — 1-based indices as ComfyUI ImpactSEGSPicker expects
        const picksStr = payload.picks?.size
            ? [...payload.picks].map(i => i + 1).join(',')
            : '';

        const params = {
            Input_Image:                 payload.imageUrl,
            sams:                        payload.detectorModel,
            Input_Box:                   payload.useBox === true,
            Input_Selected_Masks_Input:  picksStr,
        };

        let _detectedFired = false;

        const onMessage = (msg) => {
            if (msg.type !== 'executed') return;

            const nodeId    = msg.data?.node;
            const nodeOutput = msg.data?.output;

            if (detectedNodeIds.has(nodeId) && nodeOutput?.images) {
                const urls = nodeOutput.images.map(img => _buildComfyViewUrl(img, payload.forceLocal === true));
                _detectedFired = true;
                exec.onDetected?.(urls);
            }

            if (outputNodeIds.has(nodeId) && nodeOutput?.images) {
                if (!payload.picks?.size) return;
                const urls = nodeOutput.images.map(img => _buildComfyViewUrl(img, payload.forceLocal === true));
                exec.onMasks?.(urls);
            }
        };

        try {
            await getEngine(payload.forceLocal === true).runWorkflow(workflow, params, onMessage);
            // Workflow has returned — mark settled BEFORE the synthesized empty
            // signal so the "Nothing detected" handler's exec.cancel() is a no-op
            // (the prompt is done; interrupt() would only flash the remote toast).
            _settled = true;
            // ComfyUI skips the "Detected" preview node when SEGS is empty —
            // no `executed` event fires. Synthesize an empty-detection signal
            // so listeners can show "Nothing detected".
            if (!_detectedFired) exec.onDetected?.([]);
        } catch (err) {
            clientLogger.error('comfy', `autoMask workflow failed`, err);
            Events.emit('ui:error', { title: 'Auto-mask failed', message: err.message });
            exec.onError?.(err);
        } finally {
            _settled = true;
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
 * MPI-209 generate-time arch-weight guard. For an arch-variant model, checks that
 * the weight matching `arch` (the live GPU's architecture) is on disk. When it is
 * missing, prompts the user to install it now (a blocking confirm), installs it, and
 * resolves true to continue the gen — or resolves false to abort cleanly (no cryptic
 * ComfyUI `unet_name not in []`). Returns true immediately for non-arch models, an
 * unknown arch, or when the weight is already present.
 *
 * @param {object|null} model
 * @param {string|null} arch  Live GPU arch token (null → cannot resolve → allow through).
 * @returns {Promise<boolean>} true = proceed with generation; false = abort.
 */
async function _ensureArchWeightOnDisk(model, arch) {
    if (!model || !arch) return true;
    const opts = archVariantOptions(model);
    if (opts.length === 0) return true; // not an arch-variant model
    const wantDeps = variantDepsOf(model, { arch });
    if (wantDeps.length === 0) return true; // arch not a declared option → nothing to require

    const depStatus = getModelDepStatus(model.id);
    // No cache yet → can't prove it's missing; let the normal not-installed gate handle it.
    if (!depStatus) return true;
    const onDisk = id => { const s = depStatus.get(id); return s === true || s?.installed === true; };
    if (wantDeps.every(onDisk)) return true; // this GPU's weight is present → proceed

    const opt = opts.find(o => o.token === arch);
    const label = opt?.label || arch;
    const sizeNote = opt?.size ? ` (~${opt.size})` : '';
    const deps = wantDeps.map(id => DEPS[id]).filter(Boolean);
    if (!deps.length) return true; // authoring gap — don't hard-block

    // Blocking confirm via MpiOkCancel (mounted here — commandExecutor is client-side).
    // MpiOkCancel emits 'cancel' only on the Cancel button; Escape/backdrop just
    // hide() with no event — so resolve(false) from a wrapped hide() too, else the
    // gen Promise would hang on dismiss. Default outcome is cancel (fail-safe).
    const { MpiOkCancel } = await import('../components/Compounds/MpiOkCancel/MpiOkCancel.js');
    const confirmed = await new Promise((resolve) => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
        const dlg = MpiOkCancel.mount(document.createElement('div'), {
            title: 'Install the weight for this GPU',
            text: `${model.name} needs the ${label} weight${sizeNote} for this GPU before it can generate. Install it now?`,
            okLabel: 'Install & Generate',
            cancelLabel: 'Cancel',
        });
        const _hide = dlg.el.hide;
        dlg.el.hide = () => { _hide(); finish(false); }; // Escape/backdrop → cancel
        dlg.on('ok', () => finish(true));
        dlg.on('cancel', () => finish(false));
        dlg.el.show();
    });
    if (!confirmed) return false;

    // Install the arch weight, then wait for the download to complete before proceeding.
    const done = new Promise((resolve) => {
        let off = () => {}, offFail = () => {};
        const cleanup = () => { off(); offFail(); };
        off = Events.on('download:complete', ({ modelId }) => {
            if (modelId === model.id) { cleanup(); resolve(true); }
        });
        offFail = Events.on('download:failed', ({ modelId }) => {
            if (modelId === model.id) { cleanup(); resolve(false); }
        });
    });
    await downloadService.start(model.id, deps);
    const ok = await done;
    if (!ok) {
        Events.emit('ui:warning', { title: 'Install failed', message: `Could not install the ${label} weight — generation aborted.` });
        return false;
    }
    return true;
}

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
// Kinds whose nodes emit tqdm step bars on stdout → the stage-progress SSE should
// open for them (MPI-147). Samplers + UltimateSDUpscale (tile/step passes).
const STEP_EMITTING_KINDS = new Set(['sampler', 'ultimateSDUpscale', 'detailer']);
const ULTIMATE_START_PROGRESS = 0.75;

export function runCommand(payload) {
    const exec = {
        promptId:        null,
        seed:            null,
        cacheHit:        false,
        // Set by generationService right after runCommand() returns. Stamped onto
        // every StatusBar lifecycle event so a late terminal from a STOPPED gen
        // can't reset the bar while a promoted successor is already running
        // (MPI-203 status-bar stomp).
        genId:           null,
        onPreview:       null,
        onProgress:      null,
        onSamplingStart: null,
        onPromptAck:     null,
        onComplete:      null,
        onError:         null,
        // Store job id for this generation. Assigned once the store registers the
        // job (after engine+arch resolve). cancel() delegates to the store so a
        // Stop aborts the in-flight pipeline (token) AND fires the frozen engine
        // interrupt — never a bare interrupt() that leaves the pipeline running
        // toward an orphan /prompt POST (MPI-208 disease 3).
        jobId:           null,
        cancel() {
            // Pre-register cancel (Stop before the job exists): nothing to abort
            // yet — the async head checks the store signal at each await boundary,
            // but there is no signal before register(). Fall back to a direct
            // engine interrupt so a Stop during the earliest preflight still stops
            // any server work; the store takes over the moment jobId is set.
            if (exec.jobId) { generationStore.cancel(exec.jobId); return; }
            getEngine(payload.forceLocal === true).interrupt();
        },
    };

    (async () => {
        // MPI-165 Phase A: resolve the engine ONCE per gen, from a FRESH signal.
        // `remoteEngineClient.isRemote()` reads `_active`, a mirror refreshed only by
        // refresh() — which otherwise runs LATER inside ensureServerRunning() (the
        // runWorkflow call far below). Reading it here without refreshing first means
        // the workflow swap saw the PREVIOUS gen's state: on the first gen right after
        // Pod connect, stale `false` → the bf16 workflow got locked in → sent to the Pod
        // → ComfyUI rejected `unet_name ...bf16... not in []`. So refresh first (skipped
        // for force-local — it always wants local), then resolve a concrete
        // 'local'|'remote' string ONCE and thread it. No consumer below re-reads
        // isRemote() for the swap. (comfyController.js:217 documents the same race for deps.)
        if (payload.forceLocal !== true) {
            try { await remoteEngineClient.refresh(); } catch { /* Express unreachable — fall through to local */ }
        }
        const engine = payload.forceLocal === true
            ? 'local'
            : (remoteEngineClient.isRemote() ? 'remote' : 'local');
        // MPI-200: resolve the arch token ONCE per gen, AFTER engine (arch is the
        // target machine's GPU), then thread it — same resolve-once discipline as
        // engine. Drives the balanced tier's arch-gated weight + workflow file.
        const arch = await remoteEngineClient.arch(engine);
        const variantTokens = { arch };

        // MPI-208 Phase 2: register this generation as a store job the moment engine
        // (and arch) are frozen. The store owns the abort token + the frozen engine
        // interrupt from here on. The interrupt callback captures the FROZEN engine
        // (payload.forceLocal, resolved once above) — never re-resolved at cancel
        // time — and closes the SSE. `_closeSSE` is reassigned when the SSE opens
        // (far below); until then it is a no-op, which is correct (nothing to close).
        const jobId = crypto.randomUUID();
        let _closeSSE = () => {};
        generationStore.register({
            jobId,
            genId: payload.genId ?? null,
            engine,
            scope: payload.scope || (payload.historyMode ? 'groupHistory' : 'gallery'),
            // Tool-internal preview runs (resize/upscale thumbnail previews) register
            // in the store for lifecycle/cancel, but they are NOT user Cue jobs — mark
            // them so queue-busy gates (e.g. the resize tool's own gate) can exclude
            // them and not self-revert on their own preview. (MPI-253)
            display: payload.previewOnly === true ? { previewKind: 'preview' } : undefined,
            interruptCb: () => {
                try { _closeSSE(); } catch (_) { /* SSE already closed */ }
                const _eng = getEngine(payload.forceLocal === true);
                // interrupt() only aborts the CURRENTLY-RUNNING prompt. A job that was
                // accepted but is still WAITING in ComfyUI's FIFO (queued behind another
                // gen on the same lane) is untouched by interrupt — so it would run later
                // when the queue advances, even though the user cancelled it (MPI-208:
                // a cancelled image gen completed when the next gen started). Also delete
                // THIS job's prompt from the engine queue by its promptId so a queued-
                // but-not-running prompt is truly killed. Both best-effort.
                try { _eng.interrupt(); } catch (_) { /* engine gone */ }
                if (exec.promptId) {
                    try { _eng.deleteQueueItem(exec.promptId); } catch (_) { /* engine gone / already ran */ }
                }
            },
        });
        exec.jobId = jobId;
        // Abort-boundary bail: called after each await. When the job's token is
        // aborted (a Stop landed mid-pipeline) we stop cleanly — clean up any temp
        // inputs, ensure the store job reaches a terminal, and return WITHOUT ever
        // POSTing /prompt (no orphan generation, no ghost history — MPI-208 disease
        // 3). The store.cancel() from exec.cancel() already fired the interrupt +
        // set the token; this just makes the pipeline honor it at the next boundary.
        const _abortedBail = async (tempPaths = []) => {
            if (!generationStore.getSignal(jobId)?.aborted) return false;
            await _cleanupTrimmedVideoInputs(tempPaths);
            // No-op if the store already moved the job to cancelled (the usual case,
            // since store.cancel() ran first); belt-and-suspenders for a token that
            // was aborted without going through store.cancel().
            generationStore.advance(jobId, PHASES.CANCELLED);
            exec.onError?.(new Error('cancelled_before_dispatch'));
            return true;
        };

        // MPI-209 generate-time guard: an arch-variant model (LTX balanced) needs the
        // weight matching the LIVE GPU's arch. If that weight is not on disk, block
        // BEFORE dispatch and offer to install it — never let ComfyUI fail with a
        // cryptic `unet_name ...not in []`. The install picker resolves arch as a
        // deliberate toggle, but the RUNNING machine can differ (a CPU-pod default,
        // a Pod swap, a reused gen), so this is the hard net. Skipped when the arch is
        // unknown (null → the model can't concretely resolve anyway).
        try {
            const _archModel = getModelById(payload.modelId);
            const proceed = await _ensureArchWeightOnDisk(_archModel, arch);
            if (!proceed) {
                await _cleanupTrimmedVideoInputs([]);
                exec.onError?.(new Error('arch_weight_missing'));
                return;
            }
        } catch (err) {
            clientLogger.error('commandExecutor', 'arch-weight guard failed', err);
            // Fail open: a guard bug must not block a gen whose weight is actually present.
        }
        if (await _abortedBail()) return;

        let workflowFile;
        try {
            // Universal workflows (not model-tied) win and have no engine/stage2
            // variance — resolve them first, verbatim.
            const universal = getUniversalWorkflow(payload.operation);
            if (universal) {
                workflowFile = universal;
            } else {
                // Model-tied: one resolver derives the filename with the variant
                // (_mxfp8/_fp8), _stage2 and engine suffixes in the build-script order
                // (base → variant → _stage2 → engine). The resolver reads the model's
                // `variants:` block for the arch suffix (MPI-200) and `engines:` for
                // the engine suffix (MPI-165).
                const _model = getModelById(payload.modelId);
                workflowFile = resolveWorkflowFile(
                    _model, payload.operation, engine, { stage2: payload.isStage2 === true, variantTokens });
                if (!workflowFile) {
                    throw new Error(`No workflow registered for model "${payload.modelId}", operation "${payload.operation}"`);
                }
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
        if (await _abortedBail(tempTrimInputPaths)) return;

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

        // MPI-74: a force-local run sends this generation to LOCAL ComfyUI even while
        // remote-connected. The model dropdowns reflect the Pod when remote, so the
        // selected checkpoint may live ONLY on the Pod volume and not on local disk —
        // the local run would then fail mid-prompt. Pre-check local presence and abort
        // with a clear toast (mirrors the missing-slot/LoRA guards) before dispatch.
        if (workingPayload.forceLocal === true) {
            const notLocal = await _findModelNotLocal(workingPayload.modelId, workingPayload.operation);
            if (notLocal) {
                await _cleanupTrimmedVideoInputs(tempTrimInputPaths);
                Events.emit('ui:warning', {
                    message: `"${notLocal}" is not installed on your local engine. `
                        + 'Install it locally, or turn off "Run locally" to generate on the cloud.',
                });
                exec.onError?.(new Error('model_not_local'));
                return;
            }
        }

        // MPI-194: remote gen — stage big (>=20GB) weights from the Pod's slow
        // network volume onto its fast container disk before dispatch (idempotent,
        // best-effort). Not for a force-local run (no Pod). Awaited so the one-time
        // ~55s first-stage shows a progress toast rather than a silent stall.
        if (engine === 'remote' && workingPayload.forceLocal !== true) {
            await _ensureRemoteHotStore(workingPayload.modelId, workingPayload.operation);
        }
        if (await _abortedBail(tempTrimInputPaths)) return;

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

        // Progress-stage tracker (MPI-147). The status bar runs the fill 0-100% PER
        // tqdm bar and shows "Stage N/M"; the bar count M is recorded per workflow +
        // run mode in js/data/progressStages.js (the JSON can't predict it, and the
        // SAME file yields a different count single vs preview vs stage2). 0 =
        // unrecorded → stages tick up without a total.
        const _stageMode = workingPayload.isStage2 === true ? 'stage2'
            : workingPayload.previewOnly === true ? 'preview' : 'single';
        // The prompt enhancer (MPI-242) runs the text encoder's LM head autoregressively
        // before sampling, emitting its own tqdm bar — but only when the toggle is on.
        // The static table can't know that, so the delta is supplied per run. Without
        // this the status bar shows `3/2` on an enhanced run: the counter climbs past
        // its own total, which reads as a hang right when the run is genuinely slower.
        const _enhanceBars = _paramIsTrue(params, 'Input_Enhance_Prompt') ? 1 : 0;
        const stageProgress = createStageProgress({ stages: stagesFor(workflowFile, _stageMode, _enhanceBars) });

        const opDef = COMMANDS[workingPayload.operation];
        if (opDef?.injector) {
            const injector = INJECTORS[opDef.injector];
            if (!injector) {
                clientLogger.error('commandExecutor', `Missing injector "${opDef.injector}" for op ${workingPayload.operation}`);
            } else {
                try {
                    injector(workflow, workingPayload.injectionParams || {});
                    // Standalone injector params are already written into the
                    // workflow. Remove them — BOTH the bare key AND its Input_ alias
                    // (added by the canonicalization pass) — so the generic title
                    // injector below cannot re-match them. Without the alias delete,
                    // `flip` → `Input_flip` survives and the generic loop injects the
                    // raw 'x'/'y' string into the MpiIfElse node titled `Input_Flip`,
                    // setting its `boolean` to false (val !== 'true') and silently
                    // overwriting the injector's correct boolean=true. Flip then no-ops.
                    Object.keys(workingPayload.injectionParams || {}).forEach(key => {
                        delete params[key];
                        delete params[`Input_${key}`];
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
            await _prepareWorkflowInputs(workingPayload, workflow);
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
        if (await _abortedBail(tempTrimInputPaths)) return;

        // Build the set of capture node ids by Output_* title (case-insensitive).
        // The fleet titles its final-result save nodes self-descriptively:
        //   image  → "Output_Image"
        //   video  → "Output_Video" SaveVideo (audio embedded; nvenc-broken VHS
        //            retired on Blackwell). A separate "Output_Audio" SaveAudio may
        //            still exist on older split graphs — tracked below and muxed
        //            server-side at save time (video is master).
        // Preview-only runs on a multi-stage workflow capture "Output_Preview".
        // The bare "output"/"preview" base string is kept only as a defensive
        // fallback; no shipping workflow titles a capture node without the Output_
        // prefix anymore (tier-1 deprecated, MPI-252).
        const _captureTitle = workingPayload.previewOnly === true && commandIsMultiStage(workingPayload.operation)
            ? 'preview'
            : 'output';
        const _videoOutputTitle = _captureTitle === 'output' ? 'output_video' : 'output_preview';
        const _imageOutputTitle = _captureTitle === 'output' ? 'output_image' : null;
        const outputNodeIds = new Set(
            Object.keys(workflow).filter(id => {
                const t = workflow[id]._meta?.title?.toLowerCase();
                return t === _captureTitle
                    || (_videoOutputTitle && t === _videoOutputTitle)
                    || (_imageOutputTitle && t === _imageOutputTitle);
            })
        );
        const outputAudioNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output_audio'
            )
        );

        // `Output_prompt` capture (MPI-242) — a `PreviewAny` node carrying the exact
        // string the text encoder saw. A workflow that has one is declaring "the
        // prompt I encoded is not necessarily the prompt the user typed": the app
        // may have injected an enhancer toggle upstream, and the graph may append a
        // style trigger downstream. Tapping the node instead of the prompt box gives
        // one unconditional read path — no "sometimes the box, sometimes the graph"
        // branch — and is why the tap sits BEFORE the style concat: the saved prompt
        // must stay re-styleable on reuse.
        //
        // Title-scoped on purpose. A workflow may use PreviewAny for debugging; only
        // the node titled `Output_prompt` is the contract. Case-insensitive, matching
        // every other title lookup here.
        //
        // GENERAL CONTRACT, not a Krea2 special case — see docs/playbooks/add-model/05-prompt-and-styles.md §10.
        const outputPromptNodeIds = new Set(
            Object.keys(workflow).filter(id =>
                workflow[id]._meta?.title?.toLowerCase() === 'output_prompt'
            )
        );

        // Cache-hit dedupe only fires for workflows that do NOT inject a fresh
        // seed. Convention: a seeded workflow has an MpiInt titled `Input_Seed`
        // (the MPI-116 naming law — `_buildParams` injects a random seed into it
        // every run). Universal workflows like Upscale have no such node and
        // benefit from dedupe. NOTE: the old match was `=== 'seed'`, which no
        // shipping workflow uses (all use `Input_Seed`) — it was dead fleet-wide
        // and only stayed harmless because a fresh seed usually dodges ComfyUI's
        // cache anyway. Boogu-Edit's frozen-seed high tier exposed it (MPI-257).
        // Bare `seed` kept as a defensive fallback for any legacy/hand graph.
        const _hasSeedNode = Object.values(workflow).some(node => {
            const t = node?._meta?.title?.toLowerCase();
            return t === 'input_seed' || t === 'seed';
        });

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
        // Open the stdout SSE for ANY node that emits tqdm step bars, not just
        // samplers — UltimateSDUpscale emits its own step bars, but its kind is
        // `ultimateSDUpscale` (not `sampler`), so gating the SSE on samplers alone
        // left upscaler workflows on the old WS path (bar hangs at ~90% during the
        // tile passes). (MPI-147)
        const hasStepEmittingNode = Object.values(weightMap.nodes).some(node =>
            STEP_EMITTING_KINDS.has(node.kind)
        );
        let comfyEventSource = null;

        // Message handler — forwards previews + collects Output-titled results
        const outputUrls = [];
        const latentOutputs = [];
        // Node ids whose `executed` payload was already collected. Guards against
        // double-collection when the history reconcile replays missed events after
        // SOME `executed` arrived live before the WS died (MPI-203) — each node
        // executes once per prompt in our static graphs, so a repeat id is always
        // a replay, never new data.
        const _executedSeenNodes = new Set();
        // First "Output_Audio" file URL, when a video workflow saved audio
        // alongside the video (B3 split output). null when the source had no
        // audio (the workflow's MpiHasAudio gate skips the audio save). Muxed
        // into the video server-side at save time.
        let audioOutputUrl = null;
        // The string captured from an `Output_prompt` PreviewAny node, when the
        // workflow has one. null for every workflow that doesn't — which is the
        // signal generationService uses to fall back to the prompt-box text.
        let promptTextOutput = null;
        let _samplingStartFired = false;
        // MPI-208 Phase 2: model-load state is now the store job's phase, not a
        // private closure. `_modelInitializing` is DERIVED — the job sits in
        // PHASES.LOADING while a model loads and leaves it the moment real sampling
        // begins. A model-tied sampler workflow starts in the loading phase (the
        // old `hasTerminalPhaseSampler` seed); everything else starts unloaded.
        // A store terminal (Stop) makes _modelInitializing read false so no stale
        // "LOADING MODEL" survives a cancel.
        const _isLoading = () => generationStore.byId(jobId)?.phase === PHASES.LOADING;
        const _enterLoading = () => {
            // Advance only from a non-terminal, pre-sampling phase — the store's
            // transition table no-ops an illegal move (e.g. loading→loading, or once
            // sampling/terminal is reached), so this is safe to call repeatedly.
            // NOTE: the phase table forbids ACCEPTED before LOADING, so this must run
            // only AFTER prompt_ack advanced the job to ACCEPTED (see onMessage).
            generationStore.advance(jobId, PHASES.LOADING);
        };
        // A model-tied sampler workflow spends its first phase loading the model.
        // Seeded on prompt_ack (once accepted), NOT at register — accepted must
        // precede loading in the phase table. `hasTerminalPhaseSampler` is the same
        // signal the old `_modelInitializing` closure used.
        // SSE frames on the merged remote-mode stream carry BOTH engines' events
        // (B1-B): local stdout tagged engine:'local', Pod relay tagged 'remote'.
        // This job reacts ONLY to frames matching its FROZEN engine — a force-local
        // gen ignores the Pod's install/relay noise, and a remote gen ignores local
        // stdout. Frames with no engine tag are treated as matching (backward-compat
        // with any untagged emitter). Kills MPI-208 disease 2 at the consumer.
        const _frameEngineMatches = (e) => {
            try {
                const d = JSON.parse(e.data);
                return !d.engine || d.engine === engine;
            } catch (_) { return true; }
        };
        // Once stdout tqdm progress arrives it is authoritative for the fill — the
        // WS aggregator is suppressed so the two don't fight (MPI-147).
        let _stdoutDriving = false;
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
            // Preserve the old `_modelInitializing` gate: a bare emit (e.g. from a
            // latent `preview` msg) does NOT fire while the job is still loading —
            // callers that KNOW sampling began call `_beginSampling()` which clears
            // loading first.
            if (_isLoading()) return;
            _samplingStartFired = true;
            // Advance the store past loading. No-op if already sampling/terminal.
            generationStore.advance(jobId, PHASES.SAMPLING);
            if (!_suppressLifecycleEvents) {
                Events.emit('tool:sampling-start', { tool: 'groupHistory', id: exec.genId, operation: workingPayload.operation });
            }
            exec.onSamplingStart?.();
        };
        // "Sampling has definitely begun" — clears the loading phase then emits.
        // Replaces the old `_modelInitializing = false; emitSamplingStart();` pair
        // at every call site that knows real work started (multi-step bar, tile
        // pass, imageUpscale, a running work node).
        const _beginSampling = () => {
            generationStore.advance(jobId, PHASES.SAMPLING);
            emitSamplingStart();
        };
        const emitProgress = (value) => {
            // Bar emission is decoupled from sampling-start (MPI-147). The bar
            // reflects honest node-completion progress from the first node, so it
            // climbs under the LOADING MODEL label instead of freezing at 0% and
            // snapping in mid-sampler. The elapsed TIMER stays gated on
            // tool:sampling-start (see statusBar) so card/toast durations still
            // exclude cold model-load time — only the visual fill moves early.
            if (!_suppressLifecycleEvents) {
                Events.emit('tool:progress', { tool: 'groupHistory', id: exec.genId, value });
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
        // Wire the store's frozen interruptCb to this run's SSE closer (registered
        // above with a no-op placeholder). store.cancel(jobId) → interruptCb →
        // _closeSSE() + engine interrupt. From here, exec.cancel() (which delegates
        // to store.cancel) tears down BOTH the SSE and the engine work.
        _closeSSE = closeComfyEventSource;
        if (hasStepEmittingNode && typeof EventSource !== 'undefined') {
            comfyEventSource = new EventSource('/comfy/events/stream');
            // Model-load markers (synthesized from WS on remote, parsed from stdout
            // locally) only drive the "Loading model" label — NOT the bar. The load
            // shows up as its own tqdm bar (stage 1) via step-progress below.
            // Engine-filtered (B1-B merged stream): ignore the OTHER engine's frames.
            comfyEventSource.addEventListener('comfy:model-initializing', (e) => {
                if (!_frameEngineMatches(e)) return;
                _enterLoading();
                if (!_samplingStartFired && !_suppressLifecycleEvents) Events.emit('tool:loading-model', { tool: 'groupHistory', id: exec.genId });
            });
            comfyEventSource.addEventListener('comfy:model-init-complete', (e) => {
                if (!_frameEngineMatches(e)) return;
                // Model finished loading, but sampling may not have emitted its first
                // step yet — leave the store in loading until real work fires
                // (_beginSampling). Only the label update is emitted here, matching
                // the old behavior (it re-emitted tool:loading-model to clear it).
                if (!_samplingStartFired && !_suppressLifecycleEvents) Events.emit('tool:loading-model', { tool: 'groupHistory', id: exec.genId });
            });
            // tqdm step progress parsed from ComfyUI stdout (MPI-147). The WS
            // progress_state is useless for LTX (slow phases report binary 0/1), so
            // the real per-step signal is stdout. The bar runs 0-100% PER tqdm bar;
            // the stage tracker counts bars and the status bar shows "Stage N/M" so
            // each reset reads as a new stage, not a bug. Authority (_stdoutDriving)
            // flips only here — on remote (no step events) the WS aggregator stays
            // the fallback. Stage 1 (model-load 0/1) does NOT count as sampling, so
            // the timer/badge only start once a multi-step bar (max>1) appears.
            comfyEventSource.addEventListener('comfy:step-progress', (e) => {
                if (!_frameEngineMatches(e)) return;
                let value = 0, max = 0;
                try {
                    const d = JSON.parse(e.data);
                    value = Number(d.value) || 0; max = Number(d.max) || 0;
                } catch (_err) { return; }
                if (!(max > 0)) return;
                _stdoutDriving = true;
                stageProgress.step(value, max);
                // Sampling proper begins at the first multi-step bar (the load bar is
                // max 1). Keeps the timer excluding cold model-load (user's rule).
                if (max > 1) _beginSampling();
                _emitStageAndProgress();
            });
            // UltimateSDUpscale outer tile bar (MPI-147). Sets the stage = tile #;
            // the interleaved inner step bars (above) only move the fill.
            comfyEventSource.addEventListener('comfy:tile-progress', (e) => {
                if (!_frameEngineMatches(e)) return;
                let tile = 0, tiles = 0;
                try {
                    const d = JSON.parse(e.data);
                    tile = Number(d.tile) || 0; tiles = Number(d.tiles) || 0;
                } catch (_err) { return; }
                if (!(tiles > 0)) return;
                _stdoutDriving = true;
                _beginSampling();
                stageProgress.tile(tile, tiles);
                _emitStageAndProgress();
            });
            // Detailer segment count (MPI-147). "# of Detected SEGS: N" sets the
            // total up front ("Detail 2/3"); each per-segment 0/8 step bar then ticks
            // the stage via the normal per-bar logic.
            comfyEventSource.addEventListener('comfy:segment-total', (e) => {
                if (!_frameEngineMatches(e)) return;
                try {
                    const d = JSON.parse(e.data);
                    if (d.total > 0) { stageProgress.setTotal(Number(d.total)); _emitStageAndProgress(); }
                } catch (_err) { /* ignore */ }
            });
        }
        function _emitStageAndProgress() {
            Events.emit('tool:stage', {
                tool: 'groupHistory',
                id: exec.genId,
                stage: stageProgress.stage(),
                total: stageProgress.total(),
            });
            emitProgress(stageProgress.percent());
        }
        // Idempotent gen-finish. ComfyUI may signal completion via the legacy
        // `executing node===null` sentinel (<=0.25.1) OR the new `execution_success`
        // message (0.26.0+) — and in mixed cases potentially both. Guard so
        // onComplete + the aggregator finish fire exactly once (MPI-152).
        let _generationFinished = false;
        const _finishGeneration = () => {
            if (_generationFinished) return;
            _generationFinished = true;
            // Settle the store job to done. R09 late-settle: a job that got a Stop
            // (cancelling overlay) but whose real output still arrived advances to
            // done here — the output SAVES. If the store already reached the
            // `cancelled` terminal (Stop fully landed before any output), settle()
            // no-ops and onComplete still runs against whatever outputs exist (the
            // empty-output branch in generationService then treats it as cancelled).
            generationStore.settle(jobId, PHASES.DONE);
            aggregator.onExecutionSuccess();
            // On completion the last stage's bar fills to 100% (the trailing vae
            // decode emits no tqdm). statusBar.complete() also flashes 100%, so this
            // is belt-and-suspenders for the fill. Only when stdout drove (local).
            if (_stdoutDriving) { stageProgress.finish(); emitProgress(stageProgress.percent()); }
            closeComfyEventSource();
            exec.onComplete?.(outputUrls, { latents: latentOutputs, audioUrl: audioOutputUrl, promptText: promptTextOutput });
        };

        const onMessage = (msg) => {
            if (msg.type === 'prompt_ack') {
                exec.promptId = msg.prompt_id;
                // Stamp the promptId on the store record (for engine-filtered reconcile
                // + cross-engine event matching) WITHOUT forcing a phase move — on a
                // fast dispatch a work signal can advance the job past `accepted` before
                // this ack lands, and a backward advance(accepted) would warn.
                generationStore.setPromptId(jobId, msg.prompt_id);
                // Move to `accepted` ONLY if the job is still pre-accepted (the ack won
                // the race). Once loading/sampling has begun the ack is just the promptId
                // stamp above — no phase change.
                const _phase = generationStore.byId(jobId)?.phase;
                if (_phase === PHASES.QUEUED || _phase === PHASES.PREFLIGHT || _phase === PHASES.SUBMITTING) {
                    generationStore.advance(jobId, PHASES.ACCEPTED);
                }
                // A sampler workflow now enters model-load — but ONLY if real work
                // hasn't already started (fast path: a work signal beat this ack). Once
                // sampling fired, seeding `loading` would wrongly flip the label back
                // (sampling→loading is legal for STAGED reloads, so it wouldn't warn but
                // would still mislabel here). Gate on _samplingStartFired.
                if (hasTerminalPhaseSampler && !_samplingStartFired) _enterLoading();
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

            // VHS video-preview window boundary (MPI-167): a new sampler stage starts
            // a fresh frame window. Reset the card's preview clip so stages don't
            // accumulate/concatenate into one ever-growing loop.
            if (msg.type === 'VHS_latentpreview') {
                exec.onPreviewReset?.();
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
                    if (workRunning) _beginSampling();
                }
                // Emit regardless of loading phase — the bar reflects node
                // progress and may legitimately climb before the sampler fires.
                // The timer stays gated on sampling-start (MPI-147).
                if (!_stdoutDriving) emitProgress(aggregator.percent());
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
                    if (workRunning) _beginSampling();
                }
                if (!_stdoutDriving) emitProgress(aggregator.percent());
                return;
            }

            if (msg.type === 'executing') {
                const nodeId = msg.data?.node;

                if (nodeId !== null) {
                    const nodeKind = weightMap.nodes[nodeId]?.kind;
                    if (!_samplingStartFired && LOADER_CLASS_TYPES.has(nodeClassMap[nodeId])) {
                        // A loader node is executing → the job is loading its model.
                        _enterLoading();
                        if (!_suppressLifecycleEvents) Events.emit('tool:loading-model', { tool: 'groupHistory', id: exec.genId });
                    } else if (!_isLoading() && !_samplingStartFired && IMMEDIATE_WORK_KINDS.has(nodeKind) && !TERMINAL_PHASE_WORK_KINDS.has(nodeKind)) {
                        emitSamplingStart();
                    }
                    // imageUpscale (ESRGAN) is a single-shot op with NO progress
                    // signal — show an indeterminate pulse while it runs, clear it
                    // when the graph moves to any other node (MPI-147).
                    if (!_suppressLifecycleEvents) {
                        const indeterminate = nodeKind === 'imageUpscale';
                        if (indeterminate) emitSamplingStart();
                        Events.emit('tool:indeterminate', { tool: 'groupHistory', id: exec.genId, active: indeterminate });
                    }
                    aggregator.onExecuting(msg);
                    // Coarse node-transition advances the bar even for nodes that
                    // emit no per-step progress (loaders, CLIP, VAE) — keeps it
                    // climbing through the pre-sampler graph (MPI-147).
                    if (!_stdoutDriving) emitProgress(aggregator.percent());
                    return;
                }

                // node === null: legacy (<=0.25.1) execution-complete signal.
                _finishGeneration();
                return;
            }

            // 0.26.0+ terminal: the `executing node===null` sentinel was dropped in
            // favour of a dedicated `execution_success` message. Without handling it
            // here, `exec.onComplete` never fires — outputs arrive (via `executed`)
            // but the gallery card + status bar hang forever (MPI-152). Handle BOTH
            // so the completion is engine-version-agnostic; `_finishGeneration` is
            // idempotent (whichever terminal arrives first wins).
            if (msg.type === 'execution_success') {
                _finishGeneration();
                return;
            }

            if (msg.type === 'executed') {
                const nodeId = msg.data?.node;
                const nodeOutput = msg.data?.output;
                if (_executedSeenNodes.has(nodeId)) return; // reconcile replay of a live-collected node (MPI-203)
                _executedSeenNodes.add(nodeId);
                if (saveLatentNodeIds.has(nodeId)) {
                    _collectComfyLatents(nodeOutput, latentOutputs, _latentRoleFromTitle(workflow[nodeId]?._meta?.title));
                }
                if (outputNodeIds.has(nodeId)) {
                    _collectComfyOutputUrls(nodeOutput, outputUrls, workingPayload.forceLocal === true);
                }
                if (outputAudioNodeIds.has(nodeId)) {
                    audioOutputUrl = _collectComfyAudioUrl(nodeOutput, workingPayload.forceLocal === true) || audioOutputUrl;
                }
                if (outputPromptNodeIds.has(nodeId)) {
                    promptTextOutput = readComfyOutputText(nodeOutput) || promptTextOutput;
                }
            }
        };

        // FINAL abort gate before dispatch (MPI-208 disease 3). A Stop that landed
        // during any preflight above aborted the job's token; do NOT POST /prompt for
        // an already-cancelled job — that is the orphan generation the store exists to
        // prevent. runWorkflow (which submits the prompt) is never reached on abort.
        if (await _abortedBail(tempTrimInputPaths)) return;
        // advance to `submitting` — the last non-terminal phase before the server
        // ACKs. (queued/accepted → submitting is legal; a no-op if already past it.)
        generationStore.advance(jobId, PHASES.SUBMITTING);

        try {
            // MPI-74 P6: per-generation force-local override selects the engine at
            // the call site. getEngine(true) is the LOCAL-pinned instance (own
            // socket/clientId — runs concurrently with a cloud gen) and skips the
            // remote model auto-upload (model already local). Defaults to the remote
            // engine so normal runs are unaffected.
            await getEngine(workingPayload.forceLocal === true).runWorkflow(workflow, params, onMessage, {
                beforePromptSubmit: async ({ serverReady }) => {
                    await _restagePreviewLatentAfterRemoteRestart(workingPayload, serverReady);
                },
            });
        } catch (err) {
            closeComfyEventSource();
            // Settle the store job to error (no-op if a Stop already reached the
            // `cancelled` terminal — an interrupt during runWorkflow throws here, but
            // store.cancel() already terminated the job). Non-terminal jobs become
            // `error` so no live job is stranded for the reconciler.
            generationStore.settle(jobId, PHASES.ERROR, { error: err?.message || String(err) });
            // A recoverable remote restart (A3): the proxy 503'd because the remote
            // ComfyUI process is re-initialising after an OOM container self-restart
            // (the Pod stays alive — see comfyController `engine_restarting`). This
            // is a routine transient, not a crash, so surface a soft toast and DON'T
            // open the GitHub bug-reporter modal (same family as E1a/G1).
            if (err?.code === 'engine_restarting') {
                clientLogger.warn('comfy', `Remote engine restarting (503) — ${workingPayload.operation} / ${workingPayload.modelId}`);
                Events.emit('ui:warning', {
                    message: 'Remote engine is restarting after a memory spike — try again in a moment.',
                });
                exec.onError?.(err);
                return;
            }
            // MPI-90: the Pod failed the pre-generation compatibility pre-check
            // (409). Expected + user-actionable — a warning toast with the backend's
            // own guidance, not the bug-reporter dialog.
            if (err?.code === 'pod_incompatible') {
                clientLogger.warn('comfy', `Pod incompatible — generation blocked: ${err.message}`);
                Events.emit('ui:warning', { title: 'Pod not compatible', message: err.message });
                exec.onError?.(err);
                return;
            }
            // MPI-229: a LoRA selected for a remote gen isn't on the Pod →
            // ComfyUI value_not_in_list. User-actionable (install it or switch to
            // the local engine), so a warning toast, not the bug-reporter dialog.
            if (err?.code === 'lora_missing_remote') {
                const name = err.loraName || 'A selected LoRA';
                clientLogger.warn('comfy', `Remote LoRA missing on Pod: ${name}`);
                Events.emit('ui:warning', {
                    title: 'LoRA not on the remote engine',
                    message: `"${name}" isn't installed on the remote Pod. Install it there, or switch to the local engine to use it.`,
                });
                exec.onError?.(err);
                return;
            }
            // The LOCAL twin of the block above: ComfyUI rejected `lora_name` because
            // the file is gone from the configured folders (e.g. the user removed the
            // folder that held it). The pre-dispatch `_findMissingModel` guard normally
            // catches this, but it fails OPEN when `state.availableLoras` is empty, so
            // this is the backstop. Same class of user-actionable error → same toast,
            // never the bug-reporter dialog.
            if (err?.code === 'lora_missing_local') {
                const name = err.loraName || 'A selected LoRA';
                clientLogger.warn('comfy', `Local LoRA missing from model folders: ${name}`);
                Events.emit('ui:warning', {
                    message: `"${name}" was not found in your LoRA/upscale folders. `
                        + 'Add it in Settings → External Connections (drag-drop), or pick another in Model Settings.',
                });
                exec.onError?.(err);
                return;
            }
            // MPI-227: a reused input asset was deleted (manual Cleanup wiped the
            // content-addressed store, or the source is otherwise gone). Expected +
            // user-actionable, so a warning toast — NOT the bug-reporter dialog
            // (downgrade of MPI-225's soft-fail ui:error).
            if (err?.code === 'input_asset_deleted') {
                clientLogger.warn('comfy', `Reused input asset missing — ${workingPayload.operation} / ${workingPayload.modelId}`);
                Events.emit('ui:warning', {
                    title: 'Prompt assets no longer exist',
                    message: err.message,
                });
                exec.onError?.(err);
                return;
            }
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
