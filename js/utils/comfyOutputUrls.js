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
