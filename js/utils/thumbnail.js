/**
 * thumbnail.js — Downscale a source image/video element to a small data URL
 * suitable for cheap Comfy preview round-trips.
 *
 * Returns:
 *   {
 *     dataUrl,        // image/png data URL of the downscaled frame
 *     width,          // thumbnail width  (px)
 *     height,         // thumbnail height (px)
 *     sourceWidth,    // original natural width  (px)
 *     sourceHeight,   // original natural height (px)
 *   }
 *
 * For video: caller is responsible for ensuring the video has a paint-ready
 * first frame (loadeddata + currentTime=0 nudge) before calling. See memory
 * `feedback_video_first_frame_paint`.
 */

const DEFAULT_MAX_EDGE = 512;

function _intrinsicDims(source) {
    if (source instanceof HTMLImageElement) {
        return { w: source.naturalWidth || source.width || 0, h: source.naturalHeight || source.height || 0 };
    }
    if (source instanceof HTMLVideoElement) {
        return { w: source.videoWidth || 0, h: source.videoHeight || 0 };
    }
    if (source instanceof HTMLCanvasElement) {
        return { w: source.width, h: source.height };
    }
    return { w: 0, h: 0 };
}

/**
 * Wait until a video element has rendered its first frame so drawImage()
 * produces non-transparent pixels.
 *
 * Pass `{ awaitNextLoad: true }` when the caller has just triggered a src
 * change and the video may still report readyState>=2 from the previous
 * source. The returned promise then waits for the next `loadeddata` event
 * regardless of current state, then nudges currentTime to force a paint
 * flush in Chromium.
 */
export function waitForVideoFrame(video, opts = {}) {
    const { timeoutMs = 4000, awaitNextLoad = false } = opts;
    return new Promise((resolve) => {
        if (!(video instanceof HTMLVideoElement)) { resolve(false); return; }

        const finishReady = () => {
            try { video.currentTime = video.currentTime || 0; } catch (_) {}
            // RAF nudge — drawImage(video) is transparent until the browser
            // paints the new frame after currentTime change.
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        };

        if (!awaitNextLoad && video.readyState >= 2 && video.videoWidth > 0) {
            finishReady();
            return;
        }

        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            video.removeEventListener('loadeddata', onLoaded);
            if (ok) finishReady();
            else resolve(false);
        };
        const onLoaded = () => {
            try { video.currentTime = 0; } catch (_) {}
            finish(true);
        };
        video.addEventListener('loadeddata', onLoaded);
        setTimeout(() => finish(false), timeoutMs);
    });
}

/**
 * Extract a downscaled thumbnail of the source as a PNG data URL.
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} source
 * @param {number} [maxEdge=512]
 */
export function extractThumbnail(source, maxEdge = DEFAULT_MAX_EDGE) {
    const { w: sw, h: sh } = _intrinsicDims(source);
    if (!sw || !sh) return null;

    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);

    return {
        dataUrl: canvas.toDataURL('image/png'),
        width: w,
        height: h,
        sourceWidth: sw,
        sourceHeight: sh,
    };
}
