import { findClosestRatio, getModelRatios, RATIO_MODES } from './ratios.js';
import { getCommand, getCommandDefault, getCommandMediaInputs } from '../data/commandRegistry.js';
import { PROMPT_CONTROL_DEFAULTS } from '../data/promptControlDefaults.js';
import { clampQualityTier } from '../components/Compounds/MpiOptionSelector/MpiOptionSelector.js';

const QUALITY_TIERS = ['very_low', 'low', 'medium', 'high', 'very_high'];

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

function _opHasImageInput(op) {
    return !!op && getCommandMediaInputs(op).some(slot => slot.mediaType === 'image');
}

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

function _projectFileUrl(filePath) {
    return `/project-file?path=${encodeURIComponent(filePath)}`;
}

async function _fileExists(filePath) {
    try {
        const res = await fetch(`/file-exists?path=${encodeURIComponent(filePath)}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data?.exists === true;
    } catch (_) {
        return false;
    }
}

async function _materializedPreviewAssetMediaItems(item = {}, project = {}) {
    if (!_opAcceptsImageInput(item)) return [];
    if (!item.id || !project.folderPath) return [];

    const base = `${project.folderPath}\\Media\\.preview-assets\\${item.id}`;
    const candidates = [
        { role: 'startFrame', filename: 'startFrame.png' },
        { role: 'endFrame', filename: 'endFrame.png' },
    ];
    const mediaItems = [];
    for (const candidate of candidates) {
        const filePath = `${base}\\${candidate.filename}`;
        if (await _fileExists(filePath)) {
            mediaItems.push({
                id: `reuse-${item.id}-${candidate.role}`,
                url: _projectFileUrl(filePath),
                mediaType: 'image',
                source: 'previewAsset',
                role: candidate.role,
            });
        }
    }
    return mediaItems;
}

async function _previewAssetMediaItems(item = {}, project = {}) {
    if (!_opAcceptsImageInput(item)) return [];
    const materialized = await _materializedPreviewAssetMediaItems(item, project);
    if (materialized.length) return materialized;
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

    const previewMediaItems = _opAcceptsImageInput(item, source) ? _mediaItemsFromPreviewAssets(item) : [];
    const savedMediaItems = _mediaItemsFrom(source);

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

export async function resolvePromptReuseMediaItems(payload = {}, project = {}) {
    // Materialized preview-asset frames are the authoritative IMAGE source. Merge
    // them with the payload's saved NON-image media (audio, non-frame video) so an
    // i2v gen with audio recalls its frames AND its audio — not one or the other.
    const previewItems = await _previewAssetMediaItems(payload.item, project);
    const existing = Array.isArray(payload.mediaItems) ? payload.mediaItems.filter(Boolean) : [];
    const merged = _mergeReuseMedia(previewItems, existing);
    return merged;
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
    const mode = RATIO_MODES[modelType] ?? 'orientation';
    const next = {};

    if (mode === 'quality') {
        let selectedTier = null;
        if (width && height) {
            for (const tier of QUALITY_TIERS) {
                const match = getModelRatios(modelType, undefined, tier).find(r => {
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
            const defaultTierRatios = getModelRatios(modelType, undefined, PROMPT_CONTROL_DEFAULTS.qualityTier);
            if (defaultTierRatios.some(r => r.label === label)) selectedTier = PROMPT_CONTROL_DEFAULTS.qualityTier;
        }
        if (selectedTier) next.qualityTier = selectedTier;
    } else {
        const orientation = width && height && width > height ? 'landscape' : 'portrait';
        const ratios = getModelRatios(modelType, orientation);
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
    const mode = RATIO_MODES[model.type ?? 'sdxl'] ?? 'orientation';
    if (mode === 'quality') {
        return {
            qualityTier: PROMPT_CONTROL_DEFAULTS.qualityTier,
            selectedRatio: PROMPT_CONTROL_DEFAULTS.ratio,
        };
    }
    return {
        orientation: PROMPT_CONTROL_DEFAULTS.orientation,
        selectedRatio: PROMPT_CONTROL_DEFAULTS.ratio,
    };
}

// Clamp a reused per-model qualityTier (MPI-133) to one the TARGET model has.
// A cross-model reuse (LTX 2k/4k → Wan, model toggle OFF) carries a tier the
// target lacks; clampQualityTier maps it to 'very_high' (nearest equivalent),
// so the reused clip lands at the target's max quality, never a silent mid drop.
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
        RATIO_MODES[model.type ?? 'sdxl'] === 'quality' &&
        !sharedUpdates.ratioSelector?.qualityTier
    ) {
        sharedUpdates.ratioSelector = {
            ...(sharedUpdates.ratioSelector || {}),
        qualityTier: PROMPT_CONTROL_DEFAULTS.qualityTier,
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
    }

    return { sharedUpdates, opUpdates, modelUpdates };
}
