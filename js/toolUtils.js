/**
 * toolUtils.js — Shared utility functions for all MpiAiSuite tools.
 *
 * RULES FOR AGENTS:
 * - Import from here instead of copy-pasting. Every function here is the
 *   canonical implementation. Fix bugs here once, they fix everywhere.
 * - Do not add tool-specific logic here. Functions must work for ANY tool.
 * - See dev_docs/implement_new_tool.md for usage examples.
 */

import { state } from './state.js';
import { resizeImageIfNeeded } from './imageProcessor.js';
import { ComfyUIController } from './comfyController.js';
import { Events } from './events.js';

// ─── URL Normalization ─────────────────────────────────────────────────────────

/**
 * Converts an absolute file path or partial project-file URL into a
 * browser-loadable URL via the /project-file proxy.
 *
 * Handles three cases:
 *   1. Already a /project-file?path=... URL → re-encodes path param safely
 *   2. Bare absolute path (e.g. C:/...) → wraps in /project-file?path=
 *   3. Already a relative or http URL → returns as-is
 */
export function getLoadableUrl(url) {
    if (!url) return null;
    if (url.includes('path=')) {
        const parts = url.split('path=');
        return parts[0] + 'path=' + encodeURIComponent(decodeURIComponent(parts[1]));
    }
    if (!url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('http')) {
        return `/project-file?path=${encodeURIComponent(url)}`;
    }
    return url;
}

// ─── Media Upload ──────────────────────────────────────────────────────────────

/**
 * Unified media uploader for any media type (image, video, audio).
 *
 * 1. For images: Uses local resizing (via imageProcessor.js) if small enough,
 *    then uploads via the standard /upload endpoint (Base64).
 * 2. For others (video/audio): Uses the high-performance /upload-raw binary
 *    streaming route to bypass browser buffer and Base64 overhead limits.
 *
 * @param {File} file — the File object from a drop or paste event
 * @param {string} prefix — filename prefix, e.g. 'detailer', 'crop_extract'
 * @returns {Promise<{filePath: string, filename: string}|null>}
 */
export async function uploadMediaToProject(file, prefix = 'media') {
    if (!state.currentProject) {
        window.MpiAlert?.('Please open a project first.');
        return null;
    }

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext);
        const filename = `${prefix}_${Date.now()}_${file.name}`;

        // --- Path A: Processable Small Images (Base64) ---
        // We use the older /upload route here because it supports resizing/prompt metadata
        if (isImage && file.size < 10 * 1024 * 1024) {
            const { base64 } = await resizeImageIfNeeded(file);
            const res = await fetch(
                `/project-media/${state.currentProject.id}/upload?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: filename,
                        base64Data: base64
                    })
                }
            );
            const data = await res.json();
            if (data.success) {
                document.dispatchEvent(new CustomEvent('media:updated'));
                return { filePath: data.filePath, filename: data.filename };
            }
            return null;
        }

        // --- Path B: Generic Binary Streaming (Large Images, Video, Audio) ---
        // Uses the high-speed pipe route.
        const res = await fetch(
            `/project-media/${state.currentProject.id}/upload-raw?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`,
            {
                method: 'POST',
                headers: {
                    'x-filename': filename,
                    'Content-Type': 'application/octet-stream'
                },
                body: file // Direct binary stream
            }
        );

        const data = await res.json();
        if (data.success) {
            document.dispatchEvent(new CustomEvent('media:updated'));
            return { filePath: data.filePath, filename: data.filename };
        }
        return null;
    } catch (e) {
        console.error(`[toolUtils] Media upload failed (${prefix}):`, e);
        return null;
    }
}

/**
 * Saves a result URL (ComfyUI /view URL or any loadable URL) to the project's
 * media library.
 *
 * This is the canonical implementation of the Fetch → Blob → FileReader → base64
 * → POST pattern. Do NOT re-implement this pattern in individual tools.
 *
 * Usage:
 *   try {
 *     await saveResultToLibrary(currentResultUrl, 'detailer_result');
 *     // show success feedback
 *   } catch (e) {
 *     window.MpiAlert('Save failed: ' + e.message);
 *   }
 *
 * Side effect: dispatches 'media:updated' CustomEvent on success so the Media
 * Library refreshes automatically.
 *
 * @param {string} resultUrl — URL to the image to save
 * @param {string} prefix — filename prefix, e.g. 'detailer_result', 'upscaler_result'
 * @returns {Promise<{success: true, filename: string}>}
 * @throws on network errors or upload failure
 */
export async function saveResultToLibrary(resultUrl, prefix = 'result') {
    if (!state.currentProject) throw new Error('No active project');

    const res = await fetch(resultUrl);
    if (!res.ok) throw new Error(`Could not fetch result image (HTTP ${res.status})`);
    const blob = await res.blob();

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const uploadRes = await fetch(
        `/project-media/${state.currentProject.id}/upload?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: `${prefix}_${Date.now()}.png`,
                base64Data: base64
            })
        }
    );
    const data = await uploadRes.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');

    document.dispatchEvent(new CustomEvent('media:updated'));
    Events.emit('media:updated', { projectId: state.currentProject?.id });
    return { success: true, filename: data.filename || data.filePath };
}

// ─── Icon Constants ────────────────────────────────────────────────────────────
// Use these in innerHTML assignments instead of hardcoding SVG paths.
// Changing an icon here fixes it in every tool at once.

/** Checkmark icon — used for "Positive" prompt mode */
export const ICON_POSITIVE = `<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>`;

/** Prohibited circle icon — used for "Negative" prompt mode */
export const ICON_NEGATIVE = `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1c1.06 1.35 1.69 3.05 1.69 4.9 0 4.42-3.58 8-8 8z"/>`;

/** Arrow-right icon — used for "Run / Generate / Upscale" buttons */
export const ICON_RUN = `<path d="M5 13h11.17l-4.88 4.88c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l6.59-6.59a.996.996 0 0 0 0-1.41l-6.58-6.6a.996.996 0 1 0-1.41 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z"/>`;

/** Square stop icon — used for "Cancel / Stop" state on run buttons */
export const ICON_STOP = `<rect x="6" y="6" width="12" height="12" rx="2"/>`;

// ─── UI Helpers ────────────────────────────────────────────────────────────────

/**
 * Unified run/cancel dispatcher for any tool.
 * Call this from BOTH Ctrl+Enter hotkey AND button click handlers.
 *
 * For ComfyUI tools: pass ComfyUIController.isRunning as isRunning.
 * For LLM tools:    pass !!state.xyzRunning as isRunning.
 *
 * @param {boolean}  isRunning  — true if the tool is currently active
 * @param {Function} runFn      — called when idle (starts the workflow)
 * @param {Function} cancelFn  — called when running (cancels the workflow)
 */
export function triggerToolAction(isRunning, runFn, cancelFn) {
    if (isRunning) cancelFn(); else runFn();
}

/**
 * Toggles the primary action button (Run/Stop) for any ComfyUI tool.
 * Sets the icon and danger class. Title is tool-specific — set it separately.
 *
 * Usage:
 *   setRunButtonState(enhanceBtn, true);   // → stop icon + danger class
 *   setRunButtonState(enhanceBtn, false);  // → run icon, no danger class
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} isRunning
 */
export function setRunButtonState(btn, isRunning) {
    if (!btn) return;
    if (isRunning) {
        btn.classList.add('danger');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${ICON_STOP}</svg>`;
    } else {
        btn.classList.remove('danger');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${ICON_RUN}</svg>`;
    }
}

/**
 * Sets the visual state of an LLM tool's action button (run ↔ stop).
 * Use this in every LLM tool's _setLoading() for visual consistency.
 * For ComfyUI tools use setRunButtonState() instead.
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} isRunning
 * @param {string}  runTitle   — tooltip when idle,    e.g. 'Send (Ctrl+Enter)'
 * @param {string}  stopTitle  — tooltip when running, e.g. 'Stop (Ctrl+Enter)'
 */
export function setLlmButtonState(btn, isRunning, runTitle, stopTitle) {
    if (!btn) return;
    if (isRunning) {
        btn.classList.add('danger');
        btn.title = stopTitle;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${ICON_STOP}</svg>`;
    } else {
        btn.classList.remove('danger');
        btn.title = runTitle;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${ICON_RUN}</svg>`;
    }
}

// ─── Resource Handoff ──────────────────────────────────────────────────────────
// Call these fire-and-forget at each tool's run entry-point.
// They run silently in the background — no await needed, fail gracefully.

/**
 * Call at the start of ANY LLM run.
 * Asks ComfyUI to unload its models AND clear its cache (deep=true),
 * freeing maximum VRAM + system RAM for the LLM.
 * ComfyUI process stays alive so the next ComfyUI workflow cold-starts instantly.
 */
export function onLlmRunStart() {
    fetch('/comfy/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deep: true })
    }).catch(() => null); // silent — ComfyUI may not be running
}

/**
 * Call at the start of ANY ComfyUI workflow.
 * Unloads the llama-server model from VRAM (kills the process — fast 2-5s restart).
 * Frees maximum VRAM for ComfyUI.
 */
export function onComfyRunStart() {
    fetch('/llm/unload', { method: 'POST' }).catch(() => null);
}

// ─── Running Tool Tracking ─────────────────────────────────────────────────────

/**
 * Mark a tool as actively running. Updates state and fires 'tool:running-changed'
 * so shell.js can update the sidebar indicator without being coupled to this module.
 *
 * @param {string} toolId   — e.g. 'generator', 'llm', 'translator'
 * @param {'comfy'|'llm'} type
 */
export function setRunningTool(toolId, type) {
    if (type === 'comfy') {
        state.runningComfyTool = toolId;
    } else {
        state.runningLlmTool = toolId;
    }
    document.dispatchEvent(new CustomEvent('tool:running-changed', {
        detail: { toolId, type, running: true }
    }));
    Events.emit('tool:running', { tool: toolId, type });
}

/**
 * Clear the active run tracking. Call in the finally block of each tool's run.
 *
 * @param {'comfy'|'llm'} type
 */
export function clearRunningTool(type) {
    const toolId = type === 'comfy' ? state.runningComfyTool : state.runningLlmTool;
    if (type === 'comfy') {
        state.runningComfyTool = null;
    } else {
        state.runningLlmTool = null;
    }
    document.dispatchEvent(new CustomEvent('tool:running-changed', {
        detail: { toolId, type, running: false }
    }));
    Events.emit('tool:idle', { tool: null, type });
}

/**
 * Applies the visual state for positive/negative prompt mode to the UI elements.
 * Call this when initializing the mode from saved state OR after a toggle.
 *
 * Usage:
 *   applyPromptMode('neg', promptArea, modeIcon, toggleBtn, {
 *     posPlaceholder: 'What do you want to create?',
 *     negPlaceholder: 'What do you want to EXCLUDE?',
 *   });
 *
 * @param {'pos'|'neg'} mode
 * @param {HTMLTextAreaElement} promptArea
 * @param {HTMLElement} modeIcon — the SVG element whose innerHTML gets the path
 * @param {HTMLElement} toggleBtn — gets style.color set for visual feedback
 * @param {{ posPlaceholder?: string, negPlaceholder?: string }} [options]
 */
export function applyPromptMode(mode, promptArea, modeIcon, toggleBtn, options = {}) {
    const {
        posPlaceholder = 'Positive prompt...',
        negPlaceholder = 'Negative prompt (what to avoid)...',
    } = options;

    const isNeg = mode === 'neg';

    if (promptArea) {
        promptArea.placeholder = isNeg ? negPlaceholder : posPlaceholder;
        promptArea.style.color = isNeg ? 'var(--danger)' : 'var(--text-main)';
    }
    if (modeIcon) {
        modeIcon.innerHTML = isNeg ? ICON_NEGATIVE : ICON_POSITIVE;
    }
    if (toggleBtn) {
        toggleBtn.style.color = isNeg ? 'var(--danger)' : '';
    }
}

/**
 * Produces the mask PNG ComfyUI expects as Input_Mask.
 *
 * ComfyUI's LoadImage derives the mask from the ALPHA channel, then INVERTS it:
 *   mask_tensor = 1 - (alpha / 255)
 *
 *   A=0   (transparent) → mask = 1.0 → SELECTED  (area to detail) ✓
 *   A=255 (opaque)      → mask = 0.0 → NOT selected (background)  ✓
 *
 * Previous code set A=255 everywhere → all-zero mask tensor → "Empty mask" error.
 * RGB values are irrelevant; only alpha matters for mask derivation.
 *
 * @param {string} maskDataUrl - The data URL of the raw mask image.
 * @returns {Promise<string|null>} - The data URL of the processed mask PNG, or null.
 */
export async function buildComfyMask(maskDataUrl) {
    if (!maskDataUrl) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const out = ctx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < pixels.data.length; i += 4) {
                // Painted = brush gave it any opacity or brightness
                const isPainted = pixels.data[i + 3] > 32 || pixels.data[i] > 128;
                // Painted → A=0 (transparent) → ComfyUI mask=1.0 → selected for detail
                // Background → A=255 (opaque) → ComfyUI mask=0.0 → skipped
                out.data[i] = 0;                   // R (irrelevant)
                out.data[i + 1] = 0;                   // G (irrelevant)
                out.data[i + 2] = 0;                   // B (irrelevant)
                out.data[i + 3] = isPainted ? 0 : 255; // Alpha encodes the mask
            }
            ctx.putImageData(out, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = maskDataUrl;
    });
}
