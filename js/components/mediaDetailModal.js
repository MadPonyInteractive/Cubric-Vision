import { state } from '../state.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { InteractiveCanvas } from './interactiveCanvas.js';

let modalOverlay, closeBtn, previewContainer, nameEl, metaEl;
let promptSection, promptText, copyPromptBtn;
let negPromptSection, negPromptText, copyNegPromptBtn;
let reuseBtn, upscaleBtn, enhanceBtn, downloadBtn, deleteBtn, favoriteBtn;
let maskBtn, maskPanel, brushBtn, eraserBtn, opacitySlider, opacityValue, brushSizeText, flipColorBtn, clearMaskBtn, sendToDetailerBtn;
let interactiveCanvas = null;
let isMaskingMode = false;

let currentMediaItem = null;
let currentProjectFolder = null;

export function initMediaDetailModal() {
    modalOverlay = document.getElementById('mediaDetailModal');
    closeBtn = document.getElementById('closeMediaDetailModal');
    previewContainer = document.getElementById('media-modalPreviewContainer');
    nameEl = document.getElementById('media-modalName');
    metaEl = document.getElementById('media-modalMeta');
    
    promptSection = document.getElementById('media-modalPromptSection');
    promptText = document.getElementById('media-modalPromptText');
    copyPromptBtn = document.getElementById('media-modalCopyPrompt');

    negPromptSection = document.getElementById('media-modalNegativePromptSection');
    negPromptText = document.getElementById('media-modalNegativePromptText');
    copyNegPromptBtn = document.getElementById('media-modalCopyNegativePrompt');
    
    reuseBtn = document.getElementById('media-modalReuseBtn');
    upscaleBtn = document.getElementById('media-modalUpscaleBtn');
    enhanceBtn = document.getElementById('media-modalEnhanceBtn');
    downloadBtn = document.getElementById('media-modalDownloadBtn');
    deleteBtn = document.getElementById('media-modalDeleteBtn');
    favoriteBtn = document.getElementById('media-modalFavoriteBtn');
    
    // Masking Elements
    maskBtn = document.getElementById('media-modalMaskBtn');
    maskPanel = document.getElementById('media-modalMaskingPanel');
    brushBtn = document.getElementById('mask-brushBtn');
    eraserBtn = document.getElementById('mask-eraserBtn');
    opacitySlider = document.getElementById('mask-opacitySlider');
    opacityValue = document.getElementById('mask-opacityValue');
    brushSizeText = document.getElementById('mask-brushSizeText');
    flipColorBtn = document.getElementById('mask-flipColorBtn');
    clearMaskBtn = document.getElementById('mask-clearBtn');
    sendToDetailerBtn = document.getElementById('mask-sendBtn');

    if (!modalOverlay) return;

    // Initialize Interactive Canvas
    interactiveCanvas = new InteractiveCanvas(previewContainer, {
        onBrushSizeChange: (size) => {
            if (brushSizeText) brushSizeText.textContent = `Size: ${size}px`;
        },
        onBrushTypeChange: (type) => {
            if (type === 'brush') {
                brushBtn?.classList.add('active');
                eraserBtn?.classList.remove('active');
            } else {
                eraserBtn?.classList.add('active');
                brushBtn?.classList.remove('active');
            }
        }
    });

    // Prevent buttons from staying in focus after click (interferes with Space shortcut)
    document.querySelectorAll('#mediaDetailModal button').forEach(btn => {
        btn.addEventListener('click', () => btn.blur());
    });

    closeBtn.addEventListener('click', closeMediaModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeMediaModal();
    });

    // Masking Toggle
    maskBtn?.addEventListener('click', () => {
        isMaskingMode = !isMaskingMode;
        maskBtn.classList.toggle('active', isMaskingMode);
        maskPanel.classList.toggle('hide', !isMaskingMode);
        
        // When masking mode is active, we might want to hide the prompt section to save space
        promptSection.classList.toggle('hide', isMaskingMode || !promptText.textContent);
        if (negPromptSection) negPromptSection.classList.toggle('hide', isMaskingMode || !negPromptText.textContent);

        if (interactiveCanvas) {
            interactiveCanvas.setMaskingMode(isMaskingMode);
        }
    });

    brushBtn?.addEventListener('click', () => {
        interactiveCanvas?.setBrushType('brush');
        brushBtn.classList.add('active');
        eraserBtn.classList.remove('active');
    });

    eraserBtn?.addEventListener('click', () => {
        interactiveCanvas?.setBrushType('eraser');
        eraserBtn.classList.add('active');
        brushBtn.classList.remove('active');
    });

    flipColorBtn?.addEventListener('click', () => {
        interactiveCanvas?.flipMaskColor();
    });

    opacitySlider?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        opacityValue.textContent = `${Math.round(val * 100)}%`;
        interactiveCanvas?.setMaskOpacity(val);
    });

    clearMaskBtn?.addEventListener('click', () => {
        interactiveCanvas?.clearMask();
    });

    sendToDetailerBtn.addEventListener('click', async () => {
        if (!currentMediaItem || !interactiveCanvas) return;
        
        const maskDataUrl = interactiveCanvas.getMaskDataURL();
        
        const imgUrl = currentMediaItem.url || `/project-file?path=${encodeURIComponent(currentMediaItem.path)}`;
        state.detailerInputImage = imgUrl; // Storing the URL for direct use or path extraction
        state.detailerInputMask = maskDataUrl;
        
        // 3. Set preference to Manual Mask
        state.detailerMaskMode = 'manual';
        
        // 4. Navigate to Detailer
        console.log('[MediaDetailModal] Navigating to Detailer with image:', state.detailerInputImage);
        closeMediaModal();
        navigate(PAGE_TOOL, { name: 'detailer' });
    });

    copyPromptBtn.addEventListener('click', async () => {
        if (!promptText.textContent) return;
        await navigator.clipboard.writeText(promptText.textContent);
        const origIcon = copyPromptBtn.innerHTML;
        copyPromptBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => copyPromptBtn.innerHTML = origIcon, 1500);
    });

    copyNegPromptBtn?.addEventListener('click', async () => {
        if (!negPromptText.textContent) return;
        await navigator.clipboard.writeText(negPromptText.textContent);
        const origIcon = copyNegPromptBtn.innerHTML;
        copyNegPromptBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => copyNegPromptBtn.innerHTML = origIcon, 1500);
    });

    favoriteBtn.addEventListener('click', async () => {
        if (!currentMediaItem || !state.currentProject) return;
        
        const isFavorite = !favoriteBtn.classList.contains('active');
        favoriteBtn.classList.toggle('active', isFavorite);
        
        // Update local state and server
        if (!currentMediaItem.metadata) currentMediaItem.metadata = {};
        currentMediaItem.metadata.favorite = isFavorite;

        try {
            await fetch(`/project-media/${state.currentProject.id}/update-meta?folderPath=${encodeURIComponent(currentProjectFolder || '')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: currentMediaItem.name,
                    updates: { favorite: isFavorite }
                })
            });
            // We dispatch an event so Media Library can refresh
            document.dispatchEvent(new CustomEvent('media:updated', { detail: currentMediaItem }));
        } catch (err) {
            console.error("Failed to toggle favorite", err);
        }
    });

    reuseBtn.addEventListener('click', () => {
        if (!currentMediaItem) return;
        // Set pending image for tools that can accept it (Generator img2img)
        state.pendingImageUrl = `/project-file?path=${encodeURIComponent(currentMediaItem.path)}`;
        
        // If there's a prompt or seed, we inject them into state for the Generator tool
        if (currentMediaItem.promptContext || currentMediaItem.prompt) {
            state.generatorPrompt = currentMediaItem.promptContext || currentMediaItem.prompt;
        }
        if (currentMediaItem.seed) {
            state.generatorSeed = currentMediaItem.seed;
        }
        
        // Trigger navigation to Generator
        closeMediaModal();
        navigate(PAGE_TOOL, { name: 'generator' });
    });

    upscaleBtn?.addEventListener('click', () => {
        if (!currentMediaItem) return;
        state.pendingImageUrl = `/project-file?path=${encodeURIComponent(currentMediaItem.path)}`;
        closeMediaModal();
        navigate(PAGE_TOOL, { name: 'upscaler' });
    });

    enhanceBtn?.addEventListener('click', () => {
        if (!currentMediaItem) return;
        state.pendingImageUrl = `/project-file?path=${encodeURIComponent(currentMediaItem.path)}`;
        closeMediaModal();
        navigate(PAGE_TOOL, { name: 'detailer' });
    });

    downloadBtn.addEventListener('click', () => {
        if (!currentMediaItem) return;
        // If we have a direct URL, use it, otherwise use project-media path
        let dlUrl = currentMediaItem.url;
        if (!dlUrl && state.currentProject && currentProjectFolder) {
            dlUrl = `/project-media/${state.currentProject.id}/download/${encodeURIComponent(currentMediaItem.name)}?folderPath=${encodeURIComponent(currentProjectFolder)}`;
        }
        if (dlUrl) {
            const a = document.createElement('a');
            a.href = dlUrl;
            a.download = currentMediaItem.name || 'image.png';
            a.click();
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (!currentMediaItem || !state.currentProject) return;

        try {
            const fileName = currentMediaItem.name;
            const res = await fetch(`/project-media/${state.currentProject.id}/${encodeURIComponent(fileName)}?folderPath=${encodeURIComponent(currentProjectFolder || '')}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                // We dispatch an event so Media Library and tools can refresh
                document.dispatchEvent(new CustomEvent('media:deleted', { 
                    detail: { name: fileName } 
                }));
                closeMediaModal();
            } else {
                alert('Failed to delete: ' + data.error);
            }
        } catch (e) {
            alert('Error deleting file: ' + e.message);
        }
    });

    // Global Modal Shortcuts
    window.addEventListener('keydown', (e) => {
        if (modalOverlay.classList.contains('hide')) return;
        
        // Don't trigger if user is typing in an input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (isMaskingMode) {
                sendToDetailerBtn?.click();
            } else {
                maskBtn?.click(); // Open masking mode on Enter if not active? 
                // Wait, user said Enter = send to detailer.
                sendToDetailerBtn?.click();
            }
        }

        if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            maskBtn?.click();
        }
    });
}

export async function openMediaModal(item, folderPath, startMasking = false, initialMask = null) {
    if (!modalOverlay) return;
    currentMediaItem = item;
    currentProjectFolder = folderPath;

    // Reset Masking state
    isMaskingMode = false;
    maskBtn?.classList.remove('active');
    maskPanel?.classList.add('hide');
    brushBtn?.classList.add('active');
    eraserBtn?.classList.remove('active');
    if (opacitySlider) opacitySlider.value = 0.7;
    if (opacityValue) opacityValue.textContent = '70%';
    if (brushSizeText) brushSizeText.textContent = 'Size: 40px';

    if (interactiveCanvas) {
        interactiveCanvas.setMaskingMode(false);
        interactiveCanvas.clearMask();
        interactiveCanvas.setBrushSize(40);
        interactiveCanvas.setBrushType('brush');
        interactiveCanvas.setMaskOpacity(0.7);
    }
    // Update favorite state
    favoriteBtn.classList.toggle('active', !!item.metadata?.favorite);

    modalOverlay.classList.remove('hide');

    const resolution = item.resolution || '';
    metaEl.textContent = resolution;

    // Setup preview
    Array.from(previewContainer.children).forEach(child => {
        if (child.tagName === 'CANVAS') {
            child.style.display = 'none';
        } else {
            if (typeof child.pause === 'function') child.pause();
            child.remove();
        }
    });

    const fileUrl = item.url || (item.path ? `/project-file?path=${encodeURIComponent(item.path)}` : '');
    
    if (item.type === 'image') {
        if (interactiveCanvas && interactiveCanvas.canvas) {
            interactiveCanvas.canvas.style.display = 'block';
        }
        // Re-init canvas only for images
        if (interactiveCanvas) {
            // Wait for next frame to ensure layout is updated
            requestAnimationFrame(async () => {
                try {
                    await interactiveCanvas.loadImage(fileUrl);
                    if (initialMask) {
                        await interactiveCanvas.setMaskDataURL(initialMask);
                    }
                    if (startMasking) {
                        isMaskingMode = true;
                        maskBtn?.classList.add('active');
                        maskPanel?.classList.remove('hide');
                        promptSection?.classList.add('hide');
                        if (negPromptSection) negPromptSection.classList.add('hide');
                        interactiveCanvas.setMaskingMode(true);
                    }
                } catch (e) {
                    console.warn('[mediaDetailModal] Failed to load preview image:', e);
                    previewContainer.innerHTML = `<div style="color:var(--danger); padding:2rem; text-align:center;">This image has been moved to trash or deleted.</div>`;
                }
            });
        }
    } else if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = fileUrl;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        previewContainer.appendChild(video);
    } else if (item.type === 'audio') {
        const audio = document.createElement('audio');
        audio.src = fileUrl;
        audio.controls = true;
        audio.autoplay = true;
        audio.style.width = '80%';
        previewContainer.appendChild(audio);
    } else {
        previewContainer.innerHTML = `<div style="color:white;">Cannot preview this file type</div>`;
    }

    // Attempt to load prompt context
    const currentPrompt = item.promptContext || item.prompt || '';
    if (currentPrompt) {
        promptSection.classList.remove('hide');
        promptText.textContent = currentPrompt;
    } else {
        promptSection.classList.add('hide');
        promptText.textContent = '';
    }

    const currentNegPrompt = item.negativePrompt || item.metadata?.negativePrompt || '';
    if (currentNegPrompt && negPromptSection) {
        negPromptSection.classList.remove('hide');
        negPromptText.textContent = currentNegPrompt;
    } else if (negPromptSection) {
        negPromptSection.classList.add('hide');
        negPromptText.textContent = '';
    }

}

export function closeMediaModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.add('hide');
    
    // stop playback and cleanup
    Array.from(previewContainer.children).forEach(child => {
        if (child.tagName === 'CANVAS') {
            child.style.display = 'none';
        } else {
            if (typeof child.pause === 'function') child.pause();
            child.remove();
        }
    });
    
    if (interactiveCanvas) {
        interactiveCanvas.setMaskingMode(false);
        interactiveCanvas.clearMask();
    }
    
    currentMediaItem = null;
}
