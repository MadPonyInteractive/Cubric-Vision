// Image ingestion, resizing, base64 encoding, thumbnail rendering, and removal.
import { state } from './state.js';
import { els } from './elements.js';
import { showImagePopup } from './uiHelpers.js';

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

export async function processImage(file) {
    const { base64, url, wasDownscaled } = await resizeImageIfNeeded(file);
    state.g_images.push({ base64, name: file.name, url, wasDownscaled });
    state.g_imagesDirty = true;
}

export async function processImageFromUrl(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64 = dataUrl.split(',')[1];
            state.g_images.push({
                base64,
                name: `preview_${Date.now()}.jpg`,
                url: dataUrl,
                wasDownscaled: false
            });
            state.g_imagesDirty = true;
            resolve();
        };
        img.onerror = () => { console.error("Failed to load image from URL:", url); resolve(); };
        img.src = url;
    });
}

export function renderThumbnails() {
    els.thumbnailStrip.innerHTML = '';
    state.g_images.forEach((img, idx) => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.innerHTML = `
      <img src="${img.url}">
      <div class="thumb-remove" onclick="removeImage(${idx})">×</div>
      <div class="thumb-badge">@${idx + 1}</div>
    `;
        els.thumbnailStrip.appendChild(card);
    });
}

export function renderDownscaledThumbnails() {
    const container = document.getElementById('downscaledThumbnails');
    if (!container) return;
    container.innerHTML = '';
    const downscaled = state.g_images.filter(img => img.wasDownscaled);
    if (downscaled.length === 0) {
        document.getElementById('downscaledSection').classList.add('hide');
        return;
    }
    document.getElementById('downscaledSection').classList.remove('hide');
    downscaled.forEach(img => {
        const thumb = document.createElement('div');
        thumb.className = 'downscaled-thumb';
        thumb.innerHTML = `<img src="${img.url}" title="Click to view/download">`;
        thumb.onclick = () => showImagePopup(img);
        container.appendChild(thumb);
    });
}

export function removeImage(index) {
    state.g_images.splice(index, 1);
    state.g_imagesDirty = true;
    renderThumbnails();
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
