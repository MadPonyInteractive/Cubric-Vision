// Image state management and UI rendering handlers.
import { state } from '../state.js';
import { els } from '../elements.js';
import { showImagePopup } from '../uiHelpers.js';
import { resizeImageIfNeeded } from '../utils/images.js';

/**
 * Process an image file by resizing it if needed and adding it to the global images state.
 * @param {File} file - The image file to process.
 * @returns {Promise<void>}
 */
export async function processImage(file) {
    const { base64, url, wasDownscaled } = await resizeImageIfNeeded(file);
    state.g_images.push({ base64, name: file.name, url, wasDownscaled });
    state.g_imagesDirty = true;
}

/**
 * Load an image from a URL, convert it to base64, and add it to the global images state.
 * @param {string} url - The URL of the image to load.
 * @returns {Promise<void>}
 */
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

/**
 * Render all images from state as thumbnail cards in the thumbnail strip.
 * @returns {void}
 */
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

/**
 * Render downscaled images as thumbnails in a dedicated section. Hides the section if no downscaled images exist.
 * @returns {void}
 */
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

/**
 * Remove an image from state by index and re-render thumbnails.
 * @param {number} index - The index of the image to remove.
 * @returns {void}
 */
export function removeImage(index) {
    state.g_images.splice(index, 1);
    state.g_imagesDirty = true;
    renderThumbnails();
}
