// Pure image utility functions for resizing and thumbnail generation.

/**
 * Check if the image exceeds the maximum size and downscale it if needed.
 * @param {File} file - The image file object.
 * @param {number} maxSize - Maximum size in bytes (default: 10MB).
 * @param {number} maxDim - Maximum dimension for resizing.
 * @returns {Promise<{base64: string, url: string, wasDownscaled: boolean}>}
 */
export async function resizeImageIfNeeded(file, maxSize = 10485760, maxDim = 1024) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            if (file.size < maxSize) {
                resolve({
                    base64: dataUrl.split(',')[1],
                    url: dataUrl,
                    wasDownscaled: false
                });
            } else {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
                        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const resizedUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve({
                        base64: resizedUrl.split(',')[1],
                        url: resizedUrl,
                        wasDownscaled: true
                    });
                };
                img.src = dataUrl;
            }
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Creates a downscaled JPEG thumbnail from an image URL or base64 string.
 * @param {string} src - Image URL or data URL.
 * @param {number} maxDim - Maximum dimension for the thumbnail.
 * @returns {Promise<string>} - Resolves with the data URL (base64) of the thumbnail.
 */
export async function createThumbnail(src, maxDim = 256) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height *= maxDim / width;
                    width = maxDim;
                } else {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (e) => reject(new Error('Failed to load image for thumbnail creation'));
        img.src = src;
    });
}
