import { findClosestRatio, getModelRatios, RATIO_MODES } from './ratios.js';
import { getCommand, getCommandDefault } from '../data/commandRegistry.js';
import { PROMPT_CONTROL_DEFAULTS } from '../data/promptControlDefaults.js';

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

function _operationOf(item = {}, source = {}) {
    return source.operation || item.operation || item.generationSettings?.operation || '';
}

function _isI2V(item = {}, source = {}) {
    return _operationOf(item, source).startsWith('i2v');
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
    if (!_isI2V(item)) return [];
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

    const previewMediaItems = _isI2V(item, source) ? _mediaItemsFromPreviewAssets(item) : [];
    const savedMediaItems = _mediaItemsFrom(source);

    return {
        positive: item.prompt ?? source.prompt ?? '',
        negative: item.negativePrompt ?? source.negative ?? '',
        modelId: item.modelId ?? source.modelId ?? null,
        operation: source.operation ?? item.operation ?? null,
        injectionParams,
        mediaItems: previewMediaItems.length ? previewMediaItems : savedMediaItems,
        previewOnly: source.previewOnly === true,
        generationSettings: _clone(source),
        item,
    };
}

export async function resolvePromptReuseMediaItems(payload = {}, project = {}) {
    const previewItems = await _previewAssetMediaItems(payload.item, project);
    if (previewItems.length) return previewItems;
    const existing = Array.isArray(payload.mediaItems) ? payload.mediaItems.filter(Boolean) : [];
    if (existing.length) return existing;
    return [];
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

export function buildPromptReuseSettings(payload = {}, model = {}) {
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

    const duration = _number(params.Duration ?? payload.item?.duration ?? payload.item?.videoMeta?.duration);
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

    const modelSettings = payload.generationSettings?.modelSettings;
    const modelUpdates = {};
    if (modelSettings && typeof modelSettings === 'object') {
        if ('loras' in modelSettings) modelUpdates.loras = _clone(modelSettings.loras);
        if ('upscaleModel' in modelSettings) modelUpdates.upscaleModel = modelSettings.upscaleModel ?? null;
    }

    return { sharedUpdates, opUpdates, modelUpdates };
}
