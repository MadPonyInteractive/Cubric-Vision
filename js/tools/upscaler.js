/**
 * upscaler.js
 * Logic for the Upscaler tool, following the Detailer pattern.
 */

import { state, getToolComfySettings } from '../state.js';
import { InteractiveCanvas } from '../components/interactiveCanvas.js';
import { openAssetBrowser } from '../components/assetBrowserModal.js';
import { ComfyUIController } from '../comfyController.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { setupWheelControl, generateSeed } from '../uiHelpers.js';
import { uploadMediaToProject, setRunButtonState, onComfyRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';
import { Slider } from '../components/Slider.js';

let sourceCanvas = null;
let resultCanvas = null;
let currentResultUrl = null;
let currentSeed = null;
let _upscaleFn = null; // module-level ref set during init for external triggers

import { PromptBox } from '../components/PromptBox.js';
import { MediaContextMenu } from '../components/mediaContextMenu.js';
let promptBox;

export async function initUpscaler() {
    // Explicitly destroy existing instances if re-initializing (prevents leaks/broken controls)
    if (sourceCanvas) {
        console.log('[upscaler] Tearing down old sourceCanvas');
        sourceCanvas.destroy();
    }
    if (resultCanvas) {
        console.log('[upscaler] Tearing down old resultCanvas');
        resultCanvas.destroy();
    }

    const container = document.getElementById('tool-upscaler');
    if (!container) return;

    console.log('[upscaler] Initializing...');
    console.log('[upscaler] Initializing tool UI...');

    // 1. Inject Workflow Selector
    // Shell already handles this globally for all tools except promptBuilder
    // injectModelSelector('upscaler', container.querySelector('.tool-header'));

    // 2. Initialize Canvases
    const sourceContainer = container.querySelector('#upscaler-sourceContainer');
    const resultContainer = container.querySelector('#upscaler-canvasContainer');
    const emptyState = container.querySelector('#upscaler-emptyState');
    const sourcePreview = container.querySelector('#upscaler-sourcePreview');

    console.log('[upscaler] Creating canvas instances...', { sourceContainer, resultContainer });
    sourceCanvas = new InteractiveCanvas(sourceContainer);
    resultCanvas = new InteractiveCanvas(resultContainer);

    // Sync views (optional but helpful)
    // sourceCanvas.onViewChange = (s, ox, oy) => resultCanvas.setView(s, ox, oy);

    // 3. Bind UI Elements
    promptBox = new PromptBox({
        toolId: 'upscaler',
        container: container.querySelector('#upscaler-prompt-wrapper'),
        toggleContainer: container.querySelector('#upscaler-prompt-toggle-container'),
        onImageDrop: async (item) => {
            if (typeof item === 'string') {
                state.upscalerInputImage = item;
                currentResultUrl = null;
                await renderUpscaler();
                saveUpscalerState();
            } else {
                await handleImageUpload(item);
            }
        }
    });

    const upscaleFactorInput = container.querySelector('#upscaler-factor');
    const denoiseValue = container.querySelector('#upscaler-denoiseValue');
    const newSeedBtn = container.querySelector('#upscaler-newSeedBtn');

    // Initialize Slider Component
    const denoiseContainer = container.querySelector('#upscaler-denoise-container') || container.querySelector('#upscaler-denoise')?.parentElement;
    let denoiseSliderComponent = null;
    if (denoiseContainer) {
        denoiseContainer.innerHTML = '';
        denoiseSliderComponent = new Slider(denoiseContainer, {
            title: 'DENOISE',
            min: 0,
            max: 1,
            step: 0.01,
            value: state.toolComfySettings?.upscaler?.denoise || 0.3,
            showValue: true,
            minimal: true,
            onChange: (v) => {
                if (!state.toolComfySettings.upscaler) state.toolComfySettings.upscaler = {};
                state.toolComfySettings.upscaler.denoise = v;
            }
        });
    }

    const autoGridToggle = container.querySelector('#upscaler-autoGridToggle');
    const gridHInput = container.querySelector('#upscaler-gridH');
    const gridVInput = container.querySelector('#upscaler-gridV');
    const creativeToggle = container.querySelector('#upscaler-creativeToggle');

    const upscaleBtn = container.querySelector('#upscaler-upscaleBtn');
    const transferBtn = container.querySelector('#upscaler-transferBtn');
    const progressBar = container.querySelector('#upscaler-progressBar');
    const progressWrapper = container.querySelector('#upscaler-progressWrapper');
    const addAssetBtn = container.querySelector('#upscaler-addAssetBtn');
    const promptContainer = container.querySelector('#upscaler-promptContainer');
    const imageSizeFeedback = container.querySelector('#upscaler-imageSizeFeedback');

    // Update image size feedback (e.g. 1024x1024)
    const updateImageSizeFeedback = () => {
        if (sourceCanvas && sourceCanvas.img && sourceCanvas.img.width) {
            const w = sourceCanvas.img.width;
            const h = sourceCanvas.img.height;
            if (imageSizeFeedback) {
                imageSizeFeedback.textContent = `${w}x${h}`;
                imageSizeFeedback.classList.remove('hide');
            }
        } else {
            imageSizeFeedback?.classList.add('hide');
        }
    };

    // Adaptive height handler (Define before usage to avoid ReferenceError)
    const updateSourceHeight = () => {
        if (sourceCanvas && sourceCanvas.img && sourceCanvas.img.width) {
            const ar = sourceCanvas.img.height / sourceCanvas.img.width;
            const width = sourcePreview?.clientWidth || 0;
            if (width > 0) {
                const targetHeight = width * ar;
                sourcePreview.style.height = targetHeight + 'px';
                console.log('[upscaler] Adaptive height updated:', targetHeight);
            }
        }
    };
    window.addEventListener('resize', updateSourceHeight);

    // Restore state
    state.upscalerCreative = true; // DEFAULT to true (can be overridden by saved state)
    const saved = loadToolState('upscaler');
    if (saved) {
        if (saved.inputImage) state.upscalerInputImage = saved.inputImage;
        if (saved.resultUrl) currentResultUrl = saved.resultUrl;
        if (saved.autoGrid !== undefined) state.upscalerAutoGrid = !!saved.autoGrid;
        if (saved.gridH !== undefined) state.upscalerGridH = saved.gridH;
        if (saved.gridV !== undefined) state.upscalerGridV = saved.gridV;
        if (saved.creative !== undefined) state.upscalerCreative = !!saved.creative;
        if (saved.seed !== undefined) currentSeed = saved.seed;
    }
    if (upscaleFactorInput) upscaleFactorInput.value = state.toolComfySettings?.upscaler?.upscaleFactor || 1.5;
    if (denoiseSliderComponent) {
        denoiseSliderComponent.setValue(state.toolComfySettings?.upscaler?.denoise || 0.3, true);
    }

    if (gridHInput) gridHInput.value = state.upscalerGridH;
    if (gridVInput) gridVInput.value = state.upscalerGridV;

    updateGridUI();
    updateCreativeUI();

    if (state.upscalerCreative && denoiseSliderComponent) {
        denoiseSliderComponent.setDisabled(false);
    }

    // Check for pending image from Media Library or other tools
    if (state.pendingImageUrl) {
        state.upscalerInputImage = state.pendingImageUrl;
        state.pendingImageUrl = null; // Clear it so it doesn't re-inject on next init
        currentResultUrl = null;
        saveUpscalerState();
    }

    // --- Helpers ---
    function getLoadableUrl(url) {
        if (!url) return null;
        if (url.includes('path=')) {
            const parts = url.split('path=');
            return parts[0] + 'path=' + encodeURIComponent(decodeURIComponent(parts[1]));
        }
        if (!url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('http')) {
            return `/project-file?path=${encodeURIComponent(url)}`;
        }
        return url;
    }

    // Replace old restore logic with renderUpscaler
    await renderUpscaler();

    async function renderUpscaler() {
        const emptyState = container.querySelector('#upscaler-emptyState');
        const transferBtn = container.querySelector('#upscaler-transferBtn');

        // Defensive check for valid input image
        const hasInput = state.upscalerInputImage && state.upscalerInputImage !== 'null' && state.upscalerInputImage !== '';

        if (hasInput && sourceCanvas) {
            emptyState?.classList.add('hide');
            console.log('[upscaler] Rendering source image...', state.upscalerInputImage.substring(0, 50) + '...');

            try {
                const loadUrl = getLoadableUrl(state.upscalerInputImage);
                await sourceCanvas.loadImage(loadUrl);
                updateSourceHeight();
                updateImageSizeFeedback();

                // CRITICAL: Ensure the canvas resizes to the newly set container height
                // without waiting for the ResizeObserver, which can be inconsistent 
                // during tool transitions.
                requestAnimationFrame(() => {
                    sourceCanvas?.resize();
                    sourceCanvas?.draw();
                });

                // Restore comparison if result exists
                if (currentResultUrl && resultCanvas) {
                    await resultCanvas.loadImage(state.upscalerInputImage);
                    resultCanvas.loadComparisonImage(currentResultUrl);
                    resultCanvas.sliderPos = 0.5;
                    resultCanvas.draw();
                    transferBtn?.classList.remove('hide');
                } else {
                    transferBtn?.classList.add('hide');
                }
            } catch (err) {
                console.error('[upscaler] Failed to render upscaler image:', err);
                emptyState?.classList.remove('hide'); // Re-show if load fails
            }
        } else {
            console.log('[upscaler] Rendering empty state (input missing or invalid)');
            emptyState?.classList.remove('hide');
            transferBtn?.classList.add('hide');
            if (sourceCanvas) {
                sourceCanvas.clearImage();
            }
            if (resultCanvas) {
                resultCanvas.clearImage();
            }
        }
    }

    // ── Events ──

    // Denoise Slider listeners are now handled internally by denoiseSliderComponent

    // Upscale Factor
    upscaleFactorInput?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!state.toolComfySettings.upscaler) state.toolComfySettings.upscaler = {};
        state.toolComfySettings.upscaler.upscaleFactor = val;
    });

    // Auto Grid Toggle
    autoGridToggle?.addEventListener('click', () => {
        state.upscalerAutoGrid = !state.upscalerAutoGrid;
        console.log('[upscaler] Auto Grid toggled:', state.upscalerAutoGrid);
        updateGridUI();
    });

    // Grid Inputs
    gridHInput?.addEventListener('input', (e) => {
        state.upscalerGridH = parseInt(e.target.value) || 1;
        updateGridUI();
    });
    gridVInput?.addEventListener('input', (e) => {
        state.upscalerGridV = parseInt(e.target.value) || 1;
        updateGridUI();
    });

    // Creative Toggle
    creativeToggle?.addEventListener('click', () => {
        state.upscalerCreative = !state.upscalerCreative;
        updateCreativeUI();
    });

    function updateGridUI() {
        // Grid is visible if auto-grid is off
        const showGrid = !state.upscalerAutoGrid;

        if (state.upscalerAutoGrid) {
            autoGridToggle.style.background = "var(--primary)";
            autoGridToggle.style.color = "white";
            if (gridHInput) { gridHInput.disabled = true; gridHInput.style.opacity = "0.5"; }
            if (gridVInput) { gridVInput.disabled = true; gridVInput.style.opacity = "0.5"; }
            sourceCanvas?.setGrid(1, 1);
        } else {
            autoGridToggle.style.background = "rgba(255,255,255,0.05)";
            autoGridToggle.style.color = "var(--text-3)";
            if (gridHInput) { gridHInput.disabled = false; gridHInput.style.opacity = "1"; }
            if (gridVInput) { gridVInput.disabled = false; gridVInput.style.opacity = "1"; }
            sourceCanvas?.setGrid(state.upscalerGridH, state.upscalerGridV);
        }

        console.log('[upscaler] Updating Grid UI:', { showGrid, h: state.upscalerGridH, v: state.upscalerGridV });
    }

    function updateCreativeUI() {
        const creative = !!state.upscalerCreative;

        if (creative) {
            creativeToggle.style.background = "var(--primary)";
            creativeToggle.style.color = "white";
            if (denoiseSliderComponent) denoiseSliderComponent.setDisabled(false);
            if (newSeedBtn) {
                newSeedBtn.disabled = false;
                newSeedBtn.style.opacity = "1";
            }
            if (autoGridToggle) autoGridToggle.disabled = false;
            const gridGroup = container.querySelector('#upscaler-gridGroup');
            if (gridGroup) { gridGroup.style.opacity = "1"; gridGroup.style.pointerEvents = "auto"; }
        } else {
            creativeToggle.style.background = "rgba(255,255,255,0.05)";
            creativeToggle.style.color = "var(--text-3)";
            if (denoiseSliderComponent) denoiseSliderComponent.setDisabled(true);
            if (newSeedBtn) {
                newSeedBtn.disabled = true;
                newSeedBtn.style.opacity = "0.5";
            }
            if (autoGridToggle) autoGridToggle.disabled = true;
            const gridGroup = container.querySelector('#upscaler-gridGroup');
            if (gridGroup) { gridGroup.style.opacity = "0.3"; gridGroup.style.pointerEvents = "none"; }
        }

        // Ensure prompt container itself is visible, but inputs inside follow the toggle
        if (promptContainer) {
            promptContainer.classList.remove('hide');
        }

        // Keep grid sync independent of creative toggle for visual feedback
        updateGridUI();

        saveUpscalerState();
    }

    function saveUpscalerState() {
        saveToolState('upscaler', {
            inputImage: state.upscalerInputImage,
            resultUrl: currentResultUrl,
            autoGrid: state.upscalerAutoGrid,
            gridH: state.upscalerGridH,
            gridV: state.upscalerGridV,
            creative: state.upscalerCreative,
            seed: currentSeed
        });
    }

    // Seed
    newSeedBtn?.addEventListener('click', () => {
        currentSeed = generateSeed();
        console.log('[upscaler] New seed generated:', currentSeed);
        saveUpscalerState();

        // Visual feedback
        const originalColor = newSeedBtn.style.color;
        newSeedBtn.style.color = 'var(--accent-color)';
        setTimeout(() => newSeedBtn.style.color = originalColor, 500);
    });

    // Media Gallery
    addAssetBtn?.addEventListener('click', () => {
        openAssetBrowser((asset) => {
            const url = asset.url;
            state.upscalerInputImage = url;
            currentResultUrl = null;
            renderUpscaler().then(() => saveUpscalerState());
        });
    });

    // Source Preview Interaction
    sourcePreview?.addEventListener('click', () => {
        addAssetBtn?.click();
    });

    sourcePreview?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!state.upscalerInputImage || state.upscalerInputImage === 'null') return;

        MediaContextMenu.show(e.clientX, e.clientY, {
            url: getLoadableUrl(state.upscalerInputImage),
            filename: state.upscalerInputImage,
            type: 'image',
            isSaved: true
        }, 'input', {
            onClear: () => {
                state.upscalerInputImage = null;
                saveUpscalerState();
                requestAnimationFrame(() => renderUpscaler());
            }
        });
    });

    sourcePreview?.addEventListener('dragover', (e) => {
        e.preventDefault();
        sourcePreview.classList.add('drag-over');
    });
    sourcePreview?.addEventListener('dragleave', () => sourcePreview.classList.remove('drag-over'));

    sourcePreview?.addEventListener('drop', async (e) => {
        e.preventDefault();
        sourcePreview?.classList.remove('drag-over');

        // 1. Try to get a URL (from dragging an asset in the app)
        const url = e.dataTransfer.getData('text/plain');
        if (url && (url.startsWith('http') || url.startsWith('/'))) {
            state.upscalerInputImage = url;
            currentResultUrl = null;
            await renderUpscaler();
            saveUpscalerState();
            return;
        }

        // 2. Try to get a local file
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
        if (file) {
            await handleImageUpload(file);
        }
    });

    async function handleImageUpload(file) {
        const result = await uploadMediaToProject(file, 'upscaler');
        if (result?.filePath) {
            currentResultUrl = null;
            state.upscalerInputImage = result.filePath;
            await renderUpscaler();
            saveUpscalerState();
        }
    }

    emptyState?.addEventListener('click', (e) => {
        e.stopPropagation();
        addAssetBtn?.click();
    });

    // Transfer Result
    transferBtn?.addEventListener('click', async () => {
        if (!currentResultUrl) return;
        state.upscalerInputImage = currentResultUrl;
        // Keep currentResultUrl (latest result) so it can still be saved if forgotten
        await renderUpscaler();
        saveUpscalerState();
    });

    // Upscale Run
    upscaleBtn?.addEventListener('click', () => {
        console.log('[upscaler] Upscale button clicked. isGenerating:', ComfyUIController.isRunning);
        if (ComfyUIController.isRunning) {
            console.log('[upscaler] Interrupting generation...');
            ComfyUIController.interrupt();
            return;
        }
        triggerUpscale();
    });

    // Cleanup on unmount
    container.addEventListener('remove', () => {
        window.removeEventListener('resize', updateSourceHeight);
        if (sourceCanvas) sourceCanvas.destroy();
        if (resultCanvas) resultCanvas.destroy();
        sourceCanvas = null;
        resultCanvas = null;
    });

    async function triggerUpscale() {
        if (!state.upscalerInputImage) {
            alert("Please select a source image first.");
            return;
        }

        const workflowId = state.toolModelIds['upscaler'];
        if (!workflowId) return;

        onComfyRunStart();
        setRunButtonState(upscaleBtn, true);
        setRunningTool('upscaler', 'comfy');
        progressWrapper.classList.remove('hide');
        progressBar.style.width = '0%';

        if (currentSeed === null) {
            currentSeed = generateSeed();
            saveUpscalerState();
        }

        const toolSettings = getToolComfySettings('upscaler');
        const params = {
            "Input_Image": state.upscalerInputImage,
            "Upscale_Factor": state.toolComfySettings?.upscaler?.upscaleFactor || 2.0,
            "Denoise": state.upscalerCreative ? (state.toolComfySettings?.upscaler?.denoise || 0.6) : 0,
            "Seed": currentSeed,
            "Grid_H": state.upscalerGridH || 1,
            "Grid_V": state.upscalerGridV || 1,
            "Auto_Grid": state.upscalerAutoGrid || false,
            "Creative": state.upscalerCreative || false,
            "Positive": promptBox.positivePrompt.trim(),
            "Negative": promptBox.negativePrompt.trim(),
            "Base_Model": toolSettings.model,
            "Upscale_Model": toolSettings.upscaleModel,
        };

        // Add LoRAs
        if (toolSettings.loras && Array.isArray(toolSettings.loras)) {
            toolSettings.loras.forEach((lora, idx) => {
                if (lora && lora.name) {
                    params[`Lora_${idx + 1}_Name`] = lora.name;
                    params[`Lora_${idx + 1}_Strength_Model`] = lora.modelStrength ?? 1;
                    params[`Lora_${idx + 1}_Strength_Clip`] = lora.clipStrength ?? 1;
                }
            });
        }

        try {
            const result = await ComfyUIController.runWorkflow(workflowId, params, (msg) => {
                if (msg.type === 'preview' && resultCanvas) {
                    resultCanvas.loadImage(msg.url);
                }
                if (msg.type === 'progress') {
                    const progress = msg.data.value / msg.data.max;
                    progressBar.style.width = `${progress * 100}%`;
                }
            });

            if (result && result.images && result.images.length > 0) {
                const imgUrl = result.images[0];
                currentResultUrl = imgUrl; // Store result URL for transfer/save

                // Comparison Swap: Original (base) vs Upscaled (comparison)
                const sourceUrl = getLoadableUrl(state.upscalerInputImage);
                await resultCanvas.loadImage(sourceUrl).then(() => {
                    resultCanvas.loadComparisonImage(imgUrl); // Upscaled as comparison

                    // Set slider to middle
                    resultCanvas.sliderPos = 0.5;
                    resultCanvas.draw();
                });

                transferBtn.classList.remove('hide');
                saveUpscalerState();
            }
        } catch (err) {
            console.error('[upscaler] Run failed:', err);
        } finally {
            setRunButtonState(upscaleBtn, false);
            clearRunningTool('comfy');
            progressWrapper.classList.add('hide');
        }
    }

    // Store ref for external triggers (Ctrl+Enter via init.js)
    _upscaleFn = triggerUpscale;
}

/**
 * External trigger called by Ctrl+Enter global handler in init.js.
 * Calls the actual run logic via the stored module ref.
 */
export async function triggerUpscale() {
    if (_upscaleFn) {
        await _upscaleFn();
    } else {
        console.warn('[upscaler] triggerUpscale called before tool was initialised');
    }
}

/**
 * External cancel called by Ctrl+Enter global handler when isRunning=true.
 */
export function cancelUpscale() {
    ComfyUIController.interrupt();
}
