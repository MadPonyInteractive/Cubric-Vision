/**
 * videoUtils.js — Shared Video Processing Utilities
 */
import { MediaContextMenu } from './components/mediaContextMenu.js';
import { getLoadableUrl } from './toolUtils.js';

/**
 * Captures a specific region of a video frame into a Data URL.
 * (Inlined to avoid circular dependency with cropExtract sub-modules)
 *
 * @param {HTMLVideoElement} video
 * @param {Object} cropRect - { x, y, width, height } in 0–1 range
 * @returns {Promise<string>} Data URL
 */
async function captureFrame(video, cropRect = { x: 0, y: 0, width: 1, height: 1 }) {
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
        
        MediaContextMenu.show(
            e.clientX, e.clientY,
            { url: frameUrl, filename: `crop_${Date.now()}.png`, type: 'image', isSaved: false },
            'history',
            { onSaved: () => document.dispatchEvent(new CustomEvent('media:updated')) },
            {
                labelOverrides: options.labelOverrides || { save: 'Save Frame', download: 'Download Frame' },
                extraActions: [
                    {
                        id: 'save-video',
                        label: 'Save Video',
                        icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
                        execute: async () => {
                            if (callbacks.onExtract) {
                                await callbacks.onExtract(true);
                                if (window.MpiAlert) window.MpiAlert('Video clip saved to Project Library.');
                            }
                        }
                    },
                    {
                        id: 'download-video',
                        label: 'Download Video',
                        icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
                        execute: async () => {
                            if (callbacks.onExtract) {
                                const filePath = await callbacks.onExtract(false);
                                if (filePath) {
                                    const a = document.createElement('a');
                                    a.href = getLoadableUrl(filePath);
                                    a.download = `clip_${Date.now()}.mp4`;
                                    a.click();
                                }
                            }
                        }
                    },
                    ...(options.extraActions || [])
                ]
            }
        );
    } catch (err) {
        console.error("Snapshot failed:", err);
    }
}
