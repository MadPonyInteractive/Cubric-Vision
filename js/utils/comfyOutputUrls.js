/**
 * comfyOutputUrls.js — build ComfyUI /view URLs from a node's output payload.
 *
 * MPI-176: the same algorithm was implemented twice with diverged calling
 * conventions — comfyController.js (takes httpBase, used by history reconcile)
 * vs commandExecutor.js (took forceLocal, derived httpBase via getEngine).
 * When ComfyUI's output shape changed (`videos` joined `gifs`) both copies had
 * to be found and updated. Single source now with the controller signature;
 * the executor keeps a 2-line forceLocal adapter that supplies httpBase.
 */

export function buildComfyViewUrl(httpBase, fileInfo) {
    const params = new URLSearchParams();
    for (const key of ['filename', 'type', 'subfolder', 'format', 'frame_rate', 'workflow', 'fullpath']) {
        const value = fileInfo?.[key];
        if (value !== undefined && value !== null) params.set(key, value);
    }
    return `${httpBase}/view?${params.toString()}`;
}

// Appends /view URLs for every image/gif/video in a node's output to `target`.
// buildOne is the per-file URL builder — comfyController passes a bound
// buildComfyViewUrl(httpBase, …); commandExecutor passes its forceLocal adapter.
export function collectComfyOutputUrls(buildOne, nodeOutput, target) {
    if (nodeOutput?.images) {
        for (const img of nodeOutput.images) target.push(buildOne(img));
    }
    if (nodeOutput?.gifs) {
        for (const gif of nodeOutput.gifs) target.push(buildOne(gif));
    }
    // The vanilla ComfyUI `SaveVideo` node (replacing VHS_VideoCombine for
    // portable, card-agnostic encoding — VHS's nvenc encode fails on the
    // Blackwell Pod container, B3) emits its result under `videos` instead of
    // `gifs`. Same { filename, subfolder, type, format } file dict, so the
    // /view URL builds identically.
    if (nodeOutput?.videos) {
        for (const vid of nodeOutput.videos) target.push(buildOne(vid));
    }
}

/**
 * The label a save node gave its own file, read back off a /view URL.
 *
 * MPI-663 — a multi-output run lands N otherwise identical cards, and the only thing
 * telling them apart is the name the GRAPH chose: Stems titles its four saves
 * `filename_prefix: stems/Bass` … `stems/Vocals`, so ComfyUI writes `Bass_00001_.flac`.
 * Strips the extension and ComfyUI's `_00001_` counter, leaving `Bass`.
 *
 * Returns null when the URL carries no filename, or when nothing survives the strip —
 * the caller falls back to the op's own prefix.
 *
 * @param {string} url  a ComfyUI /view URL
 * @returns {string|null}
 */
export function labelFromComfyOutputUrl(url) {
    const m = /[?&]filename=([^&]+)/.exec(String(url || ''));
    if (!m) return null;
    let name;
    try { name = decodeURIComponent(m[1]); } catch (_) { name = m[1]; }
    return name.replace(/\.[^.]+$/, '').replace(/_\d+_?$/, '') || null;
}

/**
 * Reads the string a `PreviewAny` node emits. `PreviewAny.main` returns
 * `{"ui": {"text": (value,)}}` (comfy_extras/nodes_preview_any.py) and is an
 * OUTPUT_NODE, so the value arrives on the `executed` message as `text: [str]`.
 * It carries no file dict — it is NOT a /view URL and must never join the
 * image/gif/video `target` array, or every media consumer downstream chokes.
 *
 * @param {object} nodeOutput  `msg.data.output` for one node
 * @returns {string|null}      the string, or null when absent/empty
 */
export function readComfyOutputText(nodeOutput) {
    const t = nodeOutput?.text;
    if (!Array.isArray(t) || t.length === 0) return null;
    const value = typeof t[0] === 'string' ? t[0].trim() : '';
    return value === '' ? null : value;
}
