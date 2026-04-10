/**
 * assetService.js — Fetches and caches LoRA and upscale model lists from ComfyUI.
 * Populates state.availableLoras and state.upscaleModels.
 * Call loadAll() once after comfy:ready.
 */

import { state }        from '../state.js';
import { clientLogger } from './clientLogger.js';

async function _listFiles(subDir) {
    const res = await fetch(`/comfy/list-files?subDir=${subDir}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.files; // string[] of filenames
}

/**
 * Fetch both asset lists and write them into state.
 * Silently logs errors — a failed fetch leaves the lists empty (not a crash).
 */
export async function loadAll() {
    try {
        const [loras, upscalers] = await Promise.all([
            _listFiles('loras'),
            _listFiles('upscale_models'),
        ]);
        state.availableLoras  = loras;
        state.upscaleModels   = upscalers;
    } catch (err) {
        clientLogger.error('assetService', 'Failed to load asset lists', err);
    }
}
