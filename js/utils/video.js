/**
 * videoUtils.js — Video Processing Utilities
 */

/**
 * Captures a specific region of a video frame.
 *
 * @param {HTMLVideoElement} video
 * @param {Object} cropRect - { x, y, width, height } in 0–1 range
 * @returns {Promise<string>} Data URL (PNG)
 */
export async function captureFrame(video, cropRect = { x: 0, y: 0, width: 1, height: 1 }) {
    if (!video || video.readyState < 2) throw new Error('Video is not ready for capture.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const sx = cropRect.x * vW;
    const sy = cropRect.y * vH;
    const sw = cropRect.width * vW;
    const sh = cropRect.height * vH;
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png', 1.0);
}

/**
 * Captures a frame and returns both a Blob and a Data URL.
 *
 * @param {HTMLVideoElement} video
 * @param {Object} cropRect - { x, y, width, height } in 0–1 range
 * @returns {Promise<{blob: Blob, dataUrl: string}>}
 */
export async function captureFrameBlob(video, cropRect = { x: 0, y: 0, width: 1, height: 1 }) {
    if (!video || video.readyState < 2) throw new Error('Video is not ready for capture.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const sx = cropRect.x * vW;
    const sy = cropRect.y * vH;
    const sw = cropRect.width * vW;
    const sh = cropRect.height * vH;
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
    return { blob, dataUrl };
}

/**
 * Returns crop-box bounds as percentages of the videoContainer dimensions.
 * @param {HTMLVideoElement} video 
 * @param {HTMLElement} container 
 * @returns {Object} { left, top, width, height, videoAspect } in percentages.
 */
export function getVideoBounds(video, container) {
    if (!video || !container) return null;
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const videoAspect = videoWidth / videoHeight;
    const containerAspect = containerWidth / containerHeight;

    let actualWidth, actualHeight, left, top;

    if (videoAspect > containerAspect) {
        // Wider than container: fits to width, pillarbox top/bottom
        actualWidth = containerWidth;
        actualHeight = containerWidth / videoAspect;
        left = 0;
        top = (containerHeight - actualHeight) / 2;
    } else {
        // Taller than container: fits to height, letterbox sides
        actualHeight = containerHeight;
        actualWidth = containerHeight * videoAspect;
        top = 0;
        left = (containerWidth - actualWidth) / 2;
    }

    return {
        left: (left / containerWidth) * 100,
        top: (top / containerHeight) * 100,
        width: (actualWidth / containerWidth) * 100,
        height: (actualHeight / containerHeight) * 100,
        videoAspect
    };
}

/**
 * Handles the right-click "Snapshot" context menu for a video with crop support.
 * 
 * @param {MouseEvent} e - The context menu event.
 * @param {HTMLVideoElement} video - The source video.
 * @param {Object} cropRect - The crop region { x, y, width, height } in 0-1 range.
 * @param {Object} callbacks - { onExtract(saveToLibrary) }
 * @param {Object} options - { labelOverrides, extraActions }
 */
export async function handleSnapshot(e, video, cropRect, callbacks = {}, options = {}) {
    video.pause();

    // Default fallback rect (center 50%)
    const finalRect = cropRect || { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

    try {
        const frameUrl = await captureFrame(video, finalRect);
    } catch (err) {
        console.error("Snapshot failed:", err);
    }
}
