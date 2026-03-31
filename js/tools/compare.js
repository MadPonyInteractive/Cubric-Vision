import { state } from '../state.js';
import { InteractiveCanvas } from '../components/interactiveCanvas.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { resizeImageIfNeeded } from '../imageProcessor.js';

let compareCanvas = null;
let leftImage = null;
let rightImage = null;

export async function initCompare() {
    const saved = loadToolState('compare');
    leftImage = saved?.leftImage || null;
    rightImage = saved?.rightImage || null;

    const container = document.getElementById('compare-canvasContainer');
    if (container) {
        if (compareCanvas) {
            compareCanvas.destroy();
        }
        compareCanvas = new InteractiveCanvas(container);
    }

    setupEventListeners();
    renderCompare();
}

function setupEventListeners() {
    const leftSlot = document.getElementById('compare-leftInput');
    const rightSlot = document.getElementById('compare-rightInput');

    if (!leftSlot || !rightSlot) return;

    [leftSlot, rightSlot].forEach(slot => {
        const side = slot.dataset.side;
        
        // Remove old listeners to avoid stacking
        const newSlot = slot.cloneNode(true);
        slot.parentNode.replaceChild(newSlot, slot);

        newSlot.addEventListener('click', async () => {
            const { openAssetBrowser } = await import('../components/assetBrowserModal.js');
            openAssetBrowser((asset) => {
                let url = asset.url;
                if (url.includes('?path=')) {
                    url = decodeURIComponent(url.split('path=')[1]);
                }
                setImage(side, url);
            });
        });

        newSlot.addEventListener('dragover', (e) => {
            e.preventDefault();
            newSlot.classList.add('drag-over');
        });

        newSlot.addEventListener('dragleave', () => newSlot.classList.remove('drag-over'));

        newSlot.addEventListener('drop', async (e) => {
            e.preventDefault();
            newSlot.classList.remove('drag-over');
            const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
            if (file) {
                await handleFileUpload(file, side);
            }
        });
    });
}

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
        }
    } catch (e) {
        console.error('[Compare] Upload failed:', e);
    }
}

function setImage(side, path) {
    if (side === 'left') leftImage = path;
    else rightImage = path;

    saveToolState('compare', { leftImage, rightImage });
    renderCompare();
}

async function renderCompare() {
    if (!compareCanvas) return;

    const leftSlot = document.getElementById('compare-leftInput');
    const rightSlot = document.getElementById('compare-rightInput');
    const leftThumb = document.getElementById('compare-leftThumb');
    const rightThumb = document.getElementById('compare-rightThumb');
    const leftEmpty = leftSlot?.querySelector('.compare-input-empty');
    const rightEmpty = rightSlot?.querySelector('.compare-input-empty');

    const updateSlot = (path, thumb, empty) => {
        if (path) {
            let url = path;
            if (!url.startsWith('data:') && !url.startsWith('http') && !url.startsWith('/project-file')) {
                url = `/project-file?path=${encodeURIComponent(path)}`;
            }
            if (thumb) {
                thumb.src = url;
                thumb.classList.remove('hide');
            }
            if (empty) empty.classList.add('hide');
            return url;
        } else {
            if (thumb) {
                thumb.src = '';
                thumb.classList.add('hide');
            }
            if (empty) empty.classList.remove('hide');
            return null;
        }
    };

    const leftUrl = updateSlot(leftImage, leftThumb, leftEmpty);
    const rightUrl = updateSlot(rightImage, rightThumb, rightEmpty);

    if (leftUrl) {
        await compareCanvas.loadImage(leftUrl);
        if (rightUrl) {
            await compareCanvas.loadComparisonImage(rightUrl);
        }
    } else if (rightUrl) {
        // If only right is set, treat it as the main image for now? 
        // Or just show right. Usually compare needs two.
        await compareCanvas.loadImage(rightUrl);
    } else {
        // Clear canvas if no images
        compareCanvas.ctx.clearRect(0, 0, compareCanvas.canvas.width, compareCanvas.canvas.height);
        compareCanvas.img = new Image();
        compareCanvas.imgAfter = new Image();
        compareCanvas.isComparisonMode = false;
    }
}
