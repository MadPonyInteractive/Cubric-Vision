/**
 * events.js — Event hook bindings and drag-and-drop implementations
 */
import { state } from '../../state.js';
import { getLoadableUrl, uploadMediaToProject } from '../../toolUtils.js';
import { openMediaModal } from '../../components/mediaDetailModal.js';
import { openAssetBrowser } from '../../components/assetBrowserModal.js';
import { ComfyUIController } from '../../comfyController.js';
import { generateSeed, setupWheelControl } from '../../uiHelpers.js';
import { ctx, saveState } from './context.js';
import { renderDetailer, updateMaskModeUI } from './renderer.js';
import { runDetect, triggerEnhance, cancelGeneration } from './comfyClient.js';
import { clearMaskOverlay } from './maskCanvas.js';

export function openBrowser() {
    openAssetBrowser(async (asset) => {
        state.detailerInputImage = asset.url;
        ctx.currentResultUrl = null;
        state.detailerSelectedMasks = '';
        clearMaskOverlay();
        if (ctx.detectedThumbnails) ctx.detectedThumbnails.innerHTML = '';
        if (ctx.detectedResults) ctx.detectedResults.classList.add('hide');
        await renderDetailer();
        saveState();
    });
}

export function bindEvents() {
    if (ctx.emptyState) {
        ctx.emptyState.addEventListener('click', () => openBrowser());
    }
    if (ctx.addAssetBtn) {
        ctx.addAssetBtn.addEventListener('click', () => openBrowser());
    }

    if (ctx.sourcePreview) {
        ctx.sourcePreview.addEventListener('click', (e) => {
            if (ctx.emptyState && !ctx.emptyState.classList.contains('hide')) return;
            if (!state.detailerInputImage) return;

            const item = {
                url: getLoadableUrl(state.detailerInputImage),
                type: 'image',
                name: state.detailerInputImage.split('/').pop().split('?')[0] || 'source_image'
            };
            openMediaModal(item, state.currentProject?.folderPath, true, ctx.currentMaskRaw || null);
        });

        ctx.sourcePreview.addEventListener('dragover', (e) => {
            e.preventDefault();
            ctx.sourcePreview.classList.add('drag-over');
        });
        ctx.sourcePreview.addEventListener('dragleave', () => {
            ctx.sourcePreview.classList.remove('drag-over');
        });
        ctx.sourcePreview.addEventListener('drop', async (e) => {
            e.preventDefault();
            ctx.sourcePreview.classList.remove('drag-over');

            const url = e.dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http') || url.startsWith('/') || url.includes('project-file'))) {
                state.detailerInputImage = url;
                ctx.currentResultUrl = null;
                await renderDetailer();
                saveState();
                return;
            }

            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                const result = await uploadMediaToProject(files[0], 'detailer');
                if (result?.filePath) {
                    state.detailerInputImage = result.filePath;
                    ctx.currentResultUrl = null;
                    await renderDetailer();
                    saveState();
                }
            }
        });
    }

    if (ctx.maskModeSelect) {
        ctx.maskModeSelect.addEventListener('change', () => {
            state.detailerMaskMode = ctx.maskModeSelect.value;
            if (ctx.detectedThumbnails) ctx.detectedThumbnails.innerHTML = '';
            if (ctx.detectedResults) ctx.detectedResults.classList.add('hide');
            state.detailerSelectedMasks = '';
            updateMaskModeUI();
            saveState();
        });
    }

    if (ctx.detectBtn) {
        ctx.detectBtn.addEventListener('click', () => runDetect());
    }

    // Denoise Slider listeners are now handled internally by Slider component instantiated in initDetailer

    if (ctx.newSeedBtn) {
        ctx.newSeedBtn.addEventListener('click', () => {
            ctx.currentSeed = generateSeed();
            ctx.newSeedBtn.style.color = 'var(--primary)';
            ctx.newSeedBtn.title = `Seed: ${ctx.currentSeed}`;
            setTimeout(() => { ctx.newSeedBtn.style.color = ''; }, 800);
            saveState();
        });
    }

    if (ctx.transferBtn) {
        ctx.transferBtn.addEventListener('click', async () => {
            if (!ctx.currentResultUrl) return;
            state.detailerInputImage = ctx.currentResultUrl;
            ctx.currentResultUrl = null;
            state.detailerInputMask = null;
            state.detailerSelectedMasks = '';
            clearMaskOverlay();
            if (ctx.detectedThumbnails) ctx.detectedThumbnails.innerHTML = '';
            if (ctx.detectedResults) ctx.detectedResults.classList.add('hide');
            await renderDetailer();
            saveState();
        });
    }

    if (ctx.enhanceBtn) {
        ctx.enhanceBtn.addEventListener('click', () => {
            if (ComfyUIController.isRunning) {
                cancelGeneration();
            } else {
                triggerEnhance();
            }
        });
    }

    if (ctx.sourceImg) {
        ctx.sourceImg.addEventListener('load', () => {
            ctx.sourceImg.dataset.mediaUrl = getLoadableUrl(state.detailerInputImage) || '';
        });
    }
}
