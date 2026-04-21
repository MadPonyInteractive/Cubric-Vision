/**
 * mediaDimensions.js — Measure pixel dimensions of image/video sources.
 *
 * Accepts a File, Blob, or string (data URL / object URL / remote URL).
 * Always resolves (never rejects) — returns { w: 0, h: 0 } on failure so
 * callers can proceed without try/catch.
 */

function _toSrc(input) {
    if (typeof input === 'string') return { src: input, revoke: false };
    const src = URL.createObjectURL(input);
    return { src, revoke: true };
}

/**
 * @param {File|Blob|string} input
 * @returns {Promise<{w: number, h: number}>}
 */
export function measureImageDimensions(input) {
    return new Promise((resolve) => {
        const { src, revoke } = _toSrc(input);
        const cleanup = () => { if (revoke) URL.revokeObjectURL(src); };
        const img = new Image();
        img.onload = () => {
            const dims = { w: img.naturalWidth, h: img.naturalHeight };
            cleanup();
            resolve(dims);
        };
        img.onerror = () => { cleanup(); resolve({ w: 0, h: 0 }); };
        img.src = src;
    });
}

/**
 * @param {File|Blob|string} input
 * @returns {Promise<{w: number, h: number}>}
 */
export function measureVideoDimensions(input) {
    return new Promise((resolve) => {
        const { src, revoke } = _toSrc(input);
        const cleanup = () => { if (revoke) URL.revokeObjectURL(src); };
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
            const dims = { w: v.videoWidth, h: v.videoHeight };
            cleanup();
            resolve(dims);
        };
        v.onerror = () => { cleanup(); resolve({ w: 0, h: 0 }); };
        v.src = src;
    });
}

/**
 * Dispatches on mediaType.
 * @param {File|Blob|string} input
 * @param {'image'|'video'} mediaType
 * @returns {Promise<{w: number, h: number}>}
 */
export function measureMediaDimensions(input, mediaType) {
    if (mediaType === 'image') return measureImageDimensions(input);
    if (mediaType === 'video') return measureVideoDimensions(input);
    return Promise.resolve({ w: 0, h: 0 });
}
