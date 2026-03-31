import { state } from '../state.js';
import { Events } from '../events.js';
import { qs } from '../utils/dom.js';
import { InteractiveCanvas } from '../components/interactiveCanvas.js';
import { MpiMediaDropzone } from '../components/Compounds/MpiMediaDropzone/MpiMediaDropzone.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { resizeImageIfNeeded } from '../imageProcessor.js';

/**
 * js/tools/compare.js
 * Tool for side-by-side image comparison using InteractiveCanvas.
 */

let compareCanvas = null;
let leftImage = null;
let rightImage = null;

let leftDropzone = null;
let rightDropzone = null;

export async function initCompare() {
    const saved = loadToolState('compare');
    leftImage = saved?.leftImage || null;
    rightImage = saved?.rightImage || null;

    const container = qs('#compare-canvasContainer');
    if (container) {
        if (compareCanvas) {
            compareCanvas.destroy();
        }
        compareCanvas = new InteractiveCanvas(container);
    }

    mountComponents();
    renderCompare();
}

function mountComponents() {
    const leftSlot = qs('#compare-leftInput-slot');
    const rightSlot = qs('#compare-rightInput-slot');

    if (leftSlot) {
        leftDropzone = MpiMediaDropzone.mount(leftSlot, {
            title: 'Left Side',
            text: 'Drop Image',
            value: formatUrl(leftImage),
            mediaType: ['image'],
            width: '160px'
        });

        leftDropzone.on('click', () => openSideAssetBrowser('left'));
        leftDropzone.on('drop', (data) => handleFileUpload(data.file, 'left'));
        leftDropzone.on('remove', () => setImage('left', null));
    }

    if (rightSlot) {
        rightDropzone = MpiMediaDropzone.mount(rightSlot, {
            title: 'Right Side',
            text: 'Drop Image',
            value: formatUrl(rightImage),
            mediaType: ['image'],
            width: '160px'
        });

        rightDropzone.on('click', () => openSideAssetBrowser('right'));
        rightDropzone.on('drop', (data) => handleFileUpload(data.file, 'right'));
        rightDropzone.on('remove', () => setImage('right', null));
    }
}

/**
 * Formats a project path into a usable URL.
 */
function formatUrl(path) {
    if (!path) return null;
    if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('/project-file')) {
        return path;
    }
    return `/project-file?path=${encodeURIComponent(path)}`;
}

/**
 * Opens asset browser specifically for one side.
 */
async function openSideAssetBrowser(side) {
    const { openAssetBrowser } = await import('../components/assetBrowserModal.js');
    openAssetBrowser((asset) => {
        let url = asset.url;
        if (url.includes('?path=')) {
            url = decodeURIComponent(url.split('path=')[1]);
        }
        setImage(side, url);
    });
}

/**
 * Handles file upload for specific side.
 */
async function handleFileUpload(file, side) {
    if (!state.currentProject) {
        window.MpiAlert("Please open a project first.");
        return;
    }
    try {
        const { base64 } = await resizeImageIfNeeded(file);
        const res = await fetch(`/project-media/${state.currentProject.id}/upload?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: `compare_${side}_${Date.now()}_${file.name}`,
                base64Data: base64
            })
        });
        const data = await res.json();
        if (data.success && data.filePath) {
            setImage(side, data.filePath);
            Events.emit('media:updated', { projectId: state.currentProject.id });
        }
    } catch (e) {
        console.error('[Compare] Upload failed:', e);
    }
}

/**
 * Updates the internal state, component UI, and persists.
 */
function setImage(side, path) {
    if (side === 'left') {
        leftImage = path;
        if (leftDropzone) leftDropzone.update({ value: formatUrl(path) });
    } else {
        rightImage = path;
        if (rightDropzone) rightDropzone.update({ value: formatUrl(path) });
    }

    saveToolState('compare', { leftImage, rightImage });
    renderCompare();
}

/**
 * Renders the comparison on the InteractiveCanvas.
 */
async function renderCompare() {
    if (!compareCanvas) return;

    const leftUrl = formatUrl(leftImage);
    const rightUrl = formatUrl(rightImage);

    if (leftUrl) {
        await compareCanvas.loadImage(leftUrl);
        if (rightUrl) {
            await compareCanvas.loadComparisonImage(rightUrl);
        }
    } else if (rightUrl) {
        // If only right is set, treat it as the main image
        await compareCanvas.loadImage(rightUrl);
    } else {
        // Clear canvas if no images
        compareCanvas.ctx.clearRect(0, 0, compareCanvas.canvas.width, compareCanvas.canvas.height);
        compareCanvas.img = new Image();
        compareCanvas.imgAfter = new Image();
        compareCanvas.isComparisonMode = false;
    }
}
