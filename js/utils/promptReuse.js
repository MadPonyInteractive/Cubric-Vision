import { findClosestRatio, getModelRatios, qualityTiersFor, usesOrientation, usesQualityTier, clampQualityTier } from './ratios.js';
import { getCommand, getCommandDefault, getCommandMediaInputs } from '../data/commandRegistry.js';
import { PROMPT_CONTROL_DEFAULTS } from '../data/promptControlDefaults.js';

function _clone(value) {
    if (value == null) return value;
    try {
        return structuredClone(value);
    } catch (_) {
        return JSON.parse(JSON.stringify(value));
    }
}

function _number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function _mediaItemsFrom(settings = {}) {
    return Array.isArray(settings.mediaItems)
        ? settings.mediaItems
            .filter(item => item && (item.url || item.filePath))
            .map((item, index) => ({
                id:        item.id ?? `reuse-media-${index}`,
                url:       item.url ?? item.filePath,
                mediaType: item.mediaType ?? item.type,
                source:    item.source ?? 'history',
                role:      item.role ?? undefined,
                thumbPath:  item.thumbPath ?? undefined,
                trim:      item.trim ?? undefined,
            }))
            .filter(item => item.url && item.mediaType)
        : [];
}

function _opHasMediaInput(op, mediaType) {
    return !!op && getCommandMediaInputs(op).some(slot => slot.mediaType === mediaType);
}
function _opHasImageInput(op) { return _opHasMediaInput(op, 'image'); }

// True when the reused operation declares an image input slot (op-driven, via
// commandRegistry) — NOT a hardcoded model/op family. Drives whether saved
// frame snapshots are resurfaced for reuse, so any current/future image-input
// op works without special-casing.
//
// Extend is the special case: the extended item's own op is `extend` (video
// input only), but the start-frame image lives in its generationSettings — the
// underlying i2v op the chunk was generated with. So also accept when the
// generation snapshot's op declares an image input.
function _opAcceptsImageInput(item = {}, source = {}) {
    if (_opHasImageInput(source.operation || item.operation)) return true;
    return _opHasImageInput(item.generationSettings?.operation);
}

// Video/audio input parallels of _opAcceptsImageInput (MPI-227). Same op-driven
// gate (commandRegistry media slots), same extend fallback via generationSettings.
// Video-input ops: extend, interpolate, videoUpscale, resizeVideo. Audio-input
// ops: t2v_ms, i2v_ms (LTX only — capability-gated, so non-LTX naturally false).
function _opAcceptsVideoInput(item = {}, source = {}) {
    if (_opHasMediaInput(source.operation || item.operation, 'video')) return true;
    return _opHasMediaInput(item.generationSettings?.operation, 'video');
}
function _opAcceptsAudioInput(item = {}, source = {}) {
    if (_opHasMediaInput(source.operation || item.operation, 'audio')) return true;
    return _opHasMediaInput(item.generationSettings?.operation, 'audio');
}

function _mediaItemsFromPreviewAssets(item = {}) {
    const snapshots = Array.isArray(item.previewAssets?.snapshots)
        ? item.previewAssets.snapshots
        : [];
    return snapshots
        .filter(snap => snap && snap.status !== 'missing' && (snap.filePath || snap.url))
        .filter(snap => snap.role === 'startFrame' || snap.role === 'endFrame')
        .map((snap, index) => ({
            id:        snap.id ?? `reuse-preview-asset-${index}`,
            url:       snap.filePath || snap.url,
            mediaType: snap.mediaType || 'image',
            source:    'previewAsset',
            role:      snap.role,
        }));
}

// MPI-227: the sidecar snapshot filePath is authoritative — the store is now
// content-addressed, flat, and permanent (migration rewrites old per-item refs to
// the flat SHA path). The old `_materializedPreviewAssetMediaItems` probed the
// per-item `.preview-assets/<id>/startFrame.png` layout via /file-exists; that
// path no longer exists, so we read the snapshot ref directly.
function _previewAssetMediaItems(item = {}) {
    if (!_opAcceptsImageInput(item)) return [];
    return _mediaItemsFromPreviewAssets(item);
}

function _settingsSource(item = {}) {
    if (item.generationSettings && typeof item.generationSettings === 'object') {
        return item.generationSettings;
    }
    if (item.frozenParams && typeof item.frozenParams === 'object') {
        return {
            operation: item.operation,
            injectionParams: item.frozenParams.injectionParams || {},
            mediaItems: item.frozenParams.mediaItems || [],
            previewOnly: item.stage === 'preview',
        };
    }
    return {};
}

export function buildPromptReusePayload(item = {}) {
    const source = _settingsSource(item);
    const injectionParams = _clone(source.injectionParams || {});
    if (!injectionParams.Ratio_Label && item.ratioLabel) {
        injectionParams.Ratio_Label = item.ratioLabel;
    }
    if (!injectionParams.Width && item.pixelDimensions?.w) {
        injectionParams.Width = item.pixelDimensions.w;
    }
    if (!injectionParams.Height && item.pixelDimensions?.h) {
        injectionParams.Height = item.pixelDimensions.h;
    }
    if (!injectionParams.Seed && item.seed != null && item.seed !== -1) {
        injectionParams.Seed = item.seed;
    }

    const acceptsImage = _opAcceptsImageInput(item, source);
    const acceptsVideo = _opAcceptsVideoInput(item, source);
    const acceptsAudio = _opAcceptsAudioInput(item, source);
    const previewMediaItems = acceptsImage ? _mediaItemsFromPreviewAssets(item) : [];
    // Op-gate saved media by its declared input slots (MPI-225 → MPI-227). Heals
    // sidecars where a leftover chip was snapshotted into an op that can't consume
    // it — e.g. a phantom start-frame on a t2i lights up "Use Images" and injects
    // the wrong image. Each media type is now gated by whether the reused op
    // declares that input: image (MPI-225), and video + audio (MPI-227). A media
    // type with no declared slot is dropped so its Use-* toggle greys correctly.
    const savedMediaItems = _mediaItemsFrom(source).filter(m => {
        const type = m.mediaType ?? m.type;
        if (type === 'image') return acceptsImage;
        if (type === 'video') return acceptsVideo;
        if (type === 'audio') return acceptsAudio;
        return true;
    });

    return {
        positive: item.prompt ?? source.prompt ?? '',
        negative: item.negativePrompt ?? source.negative ?? '',
        modelId: item.modelId ?? source.modelId ?? null,
        operation: source.operation ?? item.operation ?? null,
        injectionParams,
        // Frame snapshots are the authoritative IMAGE source; saved media supplies
        // everything else (audio, non-frame video). Merging — not either/or — so an
        // i2v gen with audio carries BOTH its start/end frames AND its audio clip.
        mediaItems: _mergeReuseMedia(previewMediaItems, savedMediaItems),
        previewOnly: source.previewOnly === true,
        generationSettings: _clone(source),
        item,
    };
}

// Frames (from preview-assets) are authoritative for images; saved media fills
// every OTHER media type (audio, non-frame video). If frames are present, saved
// images are dropped to avoid a duplicate start-frame chip.
function _mergeReuseMedia(frameItems = [], savedItems = []) {
    if (!frameItems.length) return savedItems;
    const savedNonImage = savedItems.filter(m => (m.mediaType ?? m.type) !== 'image');
    return [...frameItems, ...savedNonImage];
}

export async function resolvePromptReuseMediaItems(payload = {}) {
    // Preview-asset frames (from the flat content-addressed store, MPI-227) are the
    // authoritative IMAGE source. Merge them with the payload's saved NON-image
    // media (audio, non-frame video) so an i2v gen with audio recalls its frames
    // AND its audio — not one or the other. Kept async for caller compatibility.
    const previewItems = _previewAssetMediaItems(payload.item);
    const existing = Array.isArray(payload.mediaItems) ? payload.mediaItems.filter(Boolean) : [];
    const merged = _mergeReuseMedia(previewItems, existing);
    return merged;
}

// True when a reuse payload actually carries an input image to reuse. A card
// generated WITHOUT an input image (e.g. a t2i output) resolves to no image
// media here, so "Use Images" is meaningless for it — offering it injects an
// empty slot, which both warns ("No saved frame images…") and leaves an
// image-required target op unrunnable (MPI-212). Callers use this to grey out /
// skip the images reuse for such sources. Sync: reads the payload's already-built
// mediaItems (buildPromptReusePayload); the async resolver can additionally find
// materialized frames on disk, but only for ops that accept image input — which a
// no-input-image source's op does not, so the sync check matches.
export function payloadHasReusableImages(payload = {}) {
    return _payloadHasReusableType(payload, 'image');
}

// Video/audio parallels (MPI-227). The op-gate in buildPromptReusePayload already
// dropped video/audio that the reused op can't consume, so a truthy result means
// the source both HAS that media and the op ACCEPTS it — the Reuse dialog uses
// these to enable/grey the "Use Video" / "Use Audio" toggles.
export function payloadHasReusableVideos(payload = {}) {
    return _payloadHasReusableType(payload, 'video');
}
export function payloadHasReusableAudio(payload = {}) {
    return _payloadHasReusableType(payload, 'audio');
}
function _payloadHasReusableType(payload = {}, mediaType) {
    const items = Array.isArray(payload?.mediaItems) ? payload.mediaItems : [];
    return items.some(m => m && (m.url || m.filePath) && (m.mediaType === mediaType || m.type === mediaType));
}

export function itemHasReusablePrompt(item = {}) {
    if (!item || item.uploaded === true) return false;
    const source = _settingsSource(item);
    return !!(
        item.prompt ||
        item.negativePrompt ||
        item.modelId ||
        source.modelId ||
        item.frozenParams
    );
}

export function findOriginalReusableItem(group = {}) {
    const history = Array.isArray(group.history) ? group.history : [];
    return history.find(item => item && item.uploaded !== true && itemHasReusablePrompt(item))
        || history.find(item => itemHasReusablePrompt(item))
        || null;
}

export function buildGalleryPromptReusePayloads(group = {}) {
    const currentItem = Array.isArray(group.history)
        ? group.history[group.selectedIndex ?? 0]
        : null;
    const originalItem = findOriginalReusableItem(group);
    const canUseCurrent = !!currentItem && currentItem.uploaded !== true && currentItem.inputPreview !== true;
    return {
        current: canUseCurrent ? buildPromptReusePayload(currentItem) : null,
        original: itemHasReusablePrompt(originalItem) ? buildPromptReusePayload(originalItem) : null,
        group,
    };
}

function _ratioSettingsFromParams(params = {}, item = {}, model = {}) {
    const width = _number(params.Width ?? params.width ?? item.pixelDimensions?.w);
    const height = _number(params.Height ?? params.height ?? item.pixelDimensions?.h);
    let label = params.Ratio_Label ?? params.ratioLabel ?? item.ratioLabel ?? '';
    const modelType = model.type ?? 'sdxl';
    const next = {};

    // The two axes are INDEPENDENT: a model may have either, or (krea2) both.
    // Recover each one that applies, rather than branching on a single mode.
    const orientation = usesOrientation(modelType)
        ? (width && height && width > height ? 'landscape' : 'portrait')
        : undefined;

    if (usesQualityTier(modelType)) {
        // Search THIS model's own tiers — a hardcoded list here used to miss
        // ltx's 2k/4k and krea2's 1k/2k entirely, silently losing the tier.
        const tiers = qualityTiersFor(modelType);
        let selectedTier = null;
        if (width && height) {
            for (const tier of tiers) {
                const match = getModelRatios(modelType, orientation, tier).find(r => {
                    if (label && r.label !== label) return false;
                    return r.w === width && r.h === height;
                });
                if (match) {
                    selectedTier = tier;
                    label ||= match.label;
                    break;
                }
            }
        } else if (label) {
            // No dims to match: accept the label if the model's first tier has it.
            const fallbackTier = tiers.includes(PROMPT_CONTROL_DEFAULTS.qualityTier)
                ? PROMPT_CONTROL_DEFAULTS.qualityTier
                : tiers[0];
            if (getModelRatios(modelType, orientation, fallbackTier).some(r => r.label === label)) {
                selectedTier = fallbackTier;
            }
        }
        if (selectedTier) next.qualityTier = selectedTier;
    }

    if (orientation) {
        // Resolve the label against the tier we just recovered, so a
        // quality-orientation model matches in the right table.
        const ratios = getModelRatios(modelType, orientation, next.qualityTier);
        const closest = label
            ? ratios.find(r => r.label === label)
            : findClosestRatio(width, height, ratios);
        if (closest) label = closest.label;
        next.orientation = orientation;
    }

    if (label) next.selectedRatio = label;
    return Object.keys(next).length ? next : null;
}

function _commandComponents(operation) {
    return getCommand(operation)?.components ?? [];
}

function _hasComponent(components, key) {
    return components.includes(key);
}

function _defaultRatioSettings(model = {}) {
    // Independent axes — a 'quality-orientation' model (krea2) gets BOTH keys.
    const type = model.type ?? 'sdxl';
    const next = { selectedRatio: PROMPT_CONTROL_DEFAULTS.ratio };
    if (usesQualityTier(type)) {
        const tiers = qualityTiersFor(type);
        next.qualityTier = tiers.includes(PROMPT_CONTROL_DEFAULTS.qualityTier)
            ? PROMPT_CONTROL_DEFAULTS.qualityTier
            : tiers[0];
    }
    if (usesOrientation(type)) next.orientation = PROMPT_CONTROL_DEFAULTS.orientation;
    return next;
}

// Clamp a reused per-model qualityTier (MPI-133) to one the TARGET model has.
// A cross-model reuse (LTX 2k/4k → Wan, or anything → Krea2's 1k/2k, model toggle
// OFF) carries a tier the target lacks; clampQualityTier maps it to the target's
// HIGHEST tier, so the reused item lands at max quality, never a silent mid drop.
function _clampReusedTier(modelUpdates, model) {
    if (!modelUpdates || !('qualityTier' in modelUpdates)) return modelUpdates;
    return { ...modelUpdates, qualityTier: clampQualityTier(model?.type, modelUpdates.qualityTier) };
}

export function buildPromptReuseSettings(payload = {}, model = {}) {
    // Fast path: items generated after MPI-115 carry the exact PromptBox control
    // state snapshotted at gen time. Replay it directly — no reverse-derivation.
    // Requires shared/op (the full snapshot); migrated old sidecars carry only
    // controlState.model and fall through to the legacy derive below.
    const controlState = payload.generationSettings?.controlState;
    if (controlState && (controlState.shared || controlState.op)) {
        return {
            sharedUpdates: _clone(controlState.shared || {}),
            opUpdates:     _clone(controlState.op || {}),
            modelUpdates:  _clampReusedTier(_clone(controlState.model || {}), model),
        };
    }

    // Legacy fallback: pre-controlState sidecars (and frozenParams-only preview
    // items) reverse-derive the buckets from injectionParams. Kept for robustness;
    // the v2→v3 migration backfills controlState onto all on-disk sidecars.
    const params = payload.injectionParams || {};
    const operation = payload.operation || '';
    const components = _commandComponents(operation);
    const sharedUpdates = {};
    const opUpdates = {};

    const ratioSelector = _ratioSettingsFromParams(params, payload.item, model);
    if (ratioSelector) {
        sharedUpdates.ratioSelector = ratioSelector;
    } else if (_hasComponent(components, 'ratio') || _hasComponent(components, 'qualityTier')) {
        sharedUpdates.ratioSelector = _defaultRatioSettings(model);
    }
    if (
        _hasComponent(components, 'qualityTier') &&
        usesQualityTier(model.type ?? 'sdxl') &&
        !sharedUpdates.ratioSelector?.qualityTier
    ) {
        // Backfill a tier the recovery could not determine — from the model's own
        // list, never a hardcoded 'medium' (krea2's tiers are 1k/2k).
        const tiers = qualityTiersFor(model.type ?? 'sdxl');
        sharedUpdates.ratioSelector = {
            ...(sharedUpdates.ratioSelector || {}),
            qualityTier: tiers.includes(PROMPT_CONTROL_DEFAULTS.qualityTier)
                ? PROMPT_CONTROL_DEFAULTS.qualityTier
                : tiers[0],
        };
    }

    const batch = _number(params.Batch_Size ?? params.batchSize);
    if (batch != null) sharedUpdates.batch = Math.min(4, Math.max(1, Math.round(batch)));
    else if (_hasComponent(components, 'batch')) sharedUpdates.batch = PROMPT_CONTROL_DEFAULTS.batch;

    // Duration comes ONLY from the saved generation param (the seconds the user
    // set in the PromptBox at generate time). Do NOT fall back to the clip's
    // actual length: derived ops (extend/videoUpscale/interpolate) have no
    // Duration param, and their item.duration is the COMBINED output length
    // (e.g. a 21s extend chain), which would wrongly drive the next generation.
    // Absent param → component default, same as every other control.
    const duration = _number(params.Duration);
    if (duration != null) sharedUpdates.duration = Math.min(30, Math.max(1, Math.round(duration)));
    else if (_hasComponent(components, 'duration')) sharedUpdates.duration = PROMPT_CONTROL_DEFAULTS.duration;

    const motion = _number(params.Motion_Intensity);
    if (motion != null) sharedUpdates.motionIntensity = Math.min(1, Math.max(0, motion));
    else if (_hasComponent(components, 'motionIntensity')) sharedUpdates.motionIntensity = PROMPT_CONTROL_DEFAULTS.motionIntensity;

    if (payload.previewOnly === true) sharedUpdates.previewStage = true;
    else if (_hasComponent(components, 'previewStage')) sharedUpdates.previewStage = PROMPT_CONTROL_DEFAULTS.previewStage;

    if (typeof params.Auto_Grid === 'boolean') opUpdates.useGrid = params.Auto_Grid;
    else if (_hasComponent(components, 'useGrid')) opUpdates.useGrid = PROMPT_CONTROL_DEFAULTS.useGrid;

    const upscale = _number(params.Upscale_Factor);
    if (upscale != null) opUpdates.upscaleFactor = upscale;
    else if (_hasComponent(components, 'upscaleFactor')) opUpdates.upscaleFactor = PROMPT_CONTROL_DEFAULTS.upscaleFactor;

    const denoise = _number(params.Denoise);
    if (denoise != null) opUpdates.denoise = Math.min(1, Math.max(0, denoise));
    else if (_hasComponent(components, 'denoise')) {
        const opDefault = _number(getCommandDefault(operation, 'denoise'));
        opUpdates.denoise = opDefault != null ? opDefault : PROMPT_CONTROL_DEFAULTS.denoise;
    }

    // Model-wide settings: prefer the migrated controlState.model, fall back to
    // the pre-MPI-115 modelSettings shape on un-migrated sidecars.
    const modelSrc = payload.generationSettings?.controlState?.model
        ?? payload.generationSettings?.modelSettings;
    const modelUpdates = {};
    if (modelSrc && typeof modelSrc === 'object') {
        if ('loras' in modelSrc) modelUpdates.loras = _clone(modelSrc.loras);
        if ('upscaleModel' in modelSrc) modelUpdates.upscaleModel = modelSrc.upscaleModel ?? null;
        // Keep in step with generationService's controlState.model snapshot: a
        // per-model control the sidecar recorded must survive this path too, or
        // reuse silently drops the tier and the whole style rack.
        for (const key of ['qualityTier', 'styleSelect', 'stylization', 'enhancePrompt']) {
            if (key in modelSrc) modelUpdates[key] = modelSrc[key];
        }
    }

    return { sharedUpdates, opUpdates, modelUpdates: _clampReusedTier(modelUpdates, model) };
}
