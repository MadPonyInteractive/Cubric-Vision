'use strict';

const { createRequire } = require('module');

const _require = createRequire(__filename);

/**
 * Builds the extra_model_paths.yaml content for a given base path.
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
 * @param {string} basePath - Absolute path to the primary models root directory.
 * @param {{ loras?: string[], upscale_models?: string[] }} [extras] - Absolute bucket folders to add.
 * @returns {string} YAML file content.
 */
function buildExtraModelPathsYaml(basePath, extras = {}) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');

    const normalizedBase = basePath.replace(/\\/g, '/');
    const additiveKeys = new Set(['loras', 'upscale_models']);
    const normalizedExtras = {
        loras: _normalizeExtraPaths(extras.loras),
        upscale_models: _normalizeExtraPaths(extras.upscale_models),
    };

    // Derive unique folder keys from dep filenames (non-custom-node deps only).
    // First segment of filename = ComfyUI folder type = subfolder name.
    const folderKeys = new Set();
    for (const dep of Object.values(DEPS)) {
        if (dep.type === 'custom_nodes' || !dep.filename) continue;
        const firstSegment = dep.filename.split('/')[0];
        if (firstSegment) folderKeys.add(firstSegment);
    }

    // Static extras registered by custom nodes at runtime (Impact Pack).
    // Not derivable from dep filenames — must be listed explicitly.
    const staticExtras = {
        onnx: 'onnx/',
        ultralytics: 'ultralytics/',
        ultralytics_bbox: 'ultralytics/bbox/',
        ultralytics_segm: 'ultralytics/segm/',
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

    let yaml = `\ncomfyui:\n    base_path: ${normalizedBase}\n`;

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
