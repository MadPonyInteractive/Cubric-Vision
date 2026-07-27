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

/** Same filenames in the same order — the lists are flat string arrays. */
function _same(next, prev) {
    return Array.isArray(prev) && prev.length === next.length && next.every((v, i) => v === prev[i]);
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
        // Assign ONLY on a real content change. The state Proxy emits
        // 'state:changed' on every assign, so an unconditional write turns each
        // rescan into a fake change event — a rescan that finds nothing new must
        // not wake every subscriber (MPI-356: MpiModelSettings answers these two
        // keys by re-rendering, and its own open-time rescan re-entered open()).
        if (!_same(loras, state.availableLoras))    state.availableLoras = loras;
        if (!_same(upscalers, state.upscaleModels)) state.upscaleModels  = upscalers;
    } catch (err) {
        clientLogger.error('assetService', 'Failed to load asset lists', err);
    }
}
