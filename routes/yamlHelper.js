'use strict';

const { createRequire } = require('module');

const _require = createRequire(__filename);

/**
 * Builds the extra_model_paths.yaml content.
 *
 * ComfyUI reads every top-level block in this file as an independent search
 * root, so the file is ADDITIVE: the default models root is ALWAYS emitted as
 * its own block, and when the user picks a different primary root that root is
 * emitted as a SECOND block. This means changing the models folder ADDS a
 * search location instead of replacing it — models the engine installed under
 * the default `mpi_models` stay visible to ComfyUI after the user repoints the
 * folder. User-added read-only `loras`/`upscale_models` folders are merged into
 * the primary block as additive multiline entries.
 *
 * Folder entries are derived from dep filenames in dependencies.js — the first
 * path segment of each filename IS the ComfyUI folder type key (e.g.
 * "sams/sam_vit_b.pth" → "sams: sams/"). Custom-node-registered sub-types
 * (ultralytics_bbox, ultralytics_segm, onnx) are added as static extras since
 * they are registered by Impact Pack at startup and are not derivable from
 * dep filenames alone.
 *
 * When a new dep with a new folder type is added to dependencies.js, the YAML
 * auto-includes it on the next engine install or path set — no manual edits needed.
 *
 * @param {string} basePath - Absolute path to the primary (active) models root.
 * @param {{ loras?: string[], upscale_models?: string[] }} [extras] - Absolute bucket folders to add.
 * @param {string} [defaultRoot] - Absolute path to the default models root. Always
 *   emitted as its own block so it is never dropped when basePath is custom. When
 *   omitted or equal to basePath, only the primary block is written.
 * @returns {string} YAML file content.
 */
function buildExtraModelPathsYaml(basePath, extras = {}, defaultRoot = null) {
    const normalizedBase = basePath.replace(/\\/g, '/');
    const normalizedDefault = defaultRoot ? defaultRoot.replace(/\\/g, '/') : null;
    const normalizedExtras = {
        loras: _normalizeExtraPaths(extras.loras),
        upscale_models: _normalizeExtraPaths(extras.upscale_models),
    };

    // Primary block carries the active root + any user-added additive folders.
    let yaml = _buildBlock('comfyui', normalizedBase, normalizedExtras);

    // Always keep the default root searchable as a separate block, unless it IS
    // the primary root (no point emitting it twice). The default block does not
    // carry the additive extras — those belong to whatever the user picked.
    if (normalizedDefault && normalizedDefault !== normalizedBase) {
        yaml += _buildBlock('comfyui_default', normalizedDefault, { loras: [], upscale_models: [] });
    }

    return yaml;
}

/**
 * Builds a single top-level ComfyUI config block (base_path + folder-type map).
 * @param {string} blockKey - Top-level YAML key (e.g. "comfyui", "comfyui_default").
 * @param {string} normalizedBase - Forward-slash base path for this block.
 * @param {{ loras: string[], upscale_models: string[] }} normalizedExtras - Additive folders.
 * @returns {string}
 */
function _buildBlock(blockKey, normalizedBase, normalizedExtras) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const additiveKeys = new Set(['loras', 'upscale_models']);

    // Derive unique folder keys from dep filenames (non-custom-node deps only).
    // First segment of filename = ComfyUI folder type = subfolder name.
    const folderKeys = new Set();
    for (const dep of Object.values(DEPS)) {
        if (dep.type === 'custom_nodes' || !dep.filename) continue;
        const firstSegment = dep.filename.split('/')[0];
        if (firstSegment) folderKeys.add(firstSegment);
    }

    // Static extras registered by custom nodes at runtime (Impact Pack, city96 GGUF).
    // Not derivable from dep filenames — must be listed explicitly. `unet_gguf` is the
    // category city96/ComfyUI-GGUF registers for GGUF transformers (LTX-2.3 Q8_0 etc.);
    // it points at the SAME `unet/` folder (the GGUF loader reads from `unet`, the
    // `unet_gguf` key only populates the node's dropdown), so it must map to `unet/`,
    // NOT `unet_gguf/`.
    const staticExtras = {
        onnx: 'onnx/',
        ultralytics: 'ultralytics/',
        ultralytics_bbox: 'ultralytics/bbox/',
        ultralytics_segm: 'ultralytics/segm/',
        unet_gguf: 'unet/',
    };

    // Core ComfyUI folder types not covered by current deps but needed for completeness.
    const coreExtras = [
        'clip', 'clip_vision', 'configs', 'controlnet', 'embeddings',
        'loras', 'unet', 'diffusers', 'vae_approx', 'gligen',
        'hypernetworks', 'photomaker', 'classifiers', 'style_models',
        'face_models', 'ipadapter', 'model_patches', 'audio_encoders',
        'latent_upscale_models', 'text_encoders',
    ];
    for (const key of coreExtras) folderKeys.add(key);

    let yaml = `\n${blockKey}:\n    base_path: ${normalizedBase}\n`;

    for (const key of [...folderKeys].sort()) {
        const extraPaths = additiveKeys.has(key) ? normalizedExtras[key] : [];
        if (extraPaths?.length) {
            yaml += `    ${key}: |\n`;
            yaml += `        ${key}/\n`;
            for (const extraPath of extraPaths) {
                yaml += `        ${extraPath}\n`;
            }
        } else {
            yaml += `    ${key}: ${key}/\n`;
        }
    }

    for (const [key, subpath] of Object.entries(staticExtras)) {
        yaml += `    ${key}: ${subpath}\n`;
    }

    return yaml;
}

function _normalizeExtraPaths(paths) {
    if (!Array.isArray(paths)) return [];
    const seen = new Set();
    const result = [];
    for (const item of paths) {
        if (typeof item !== 'string') continue;
        const normalized = item.trim().replace(/\\/g, '/');
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

module.exports = { buildExtraModelPathsYaml };
