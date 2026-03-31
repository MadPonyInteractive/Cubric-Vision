/**
 * comfyClient.js — Prepares parameters and manages ComfyUI inference execution.
 */
import { state, getToolComfySettings } from '../../state.js';
import { ComfyUIController } from '../../comfyController.js';
import { getLoadableUrl, setRunButtonState, onComfyRunStart, setRunningTool, clearRunningTool, buildComfyMask } from '../../toolUtils.js';
import { generateSeed } from '../../uiHelpers.js';
import { ctx, saveState } from './context.js';
import { applyMaskOverlay, getMaskDataUrl } from './maskCanvas.js';
import { renderDetectedThumbnails } from './renderer.js';

function buildParams(overrides = {}) {
    const toolSettings = getToolComfySettings('detailer');
    const isAutoMode = state.detailerMaskMode !== 'manual';
    const maskDataUrl = getMaskDataUrl();

    if (ctx.currentSeed === null) ctx.currentSeed = generateSeed();

    const params = {
        Input_Image: state.detailerInputImage,
        Positive: ctx.promptBox?.positivePrompt?.trim() || '',
        Negative: ctx.promptBox?.negativePrompt?.trim() || '',
        Denoise: parseFloat(ctx.denoiseSlider?.value || '0.6'),
        Seed: ctx.currentSeed,
        Auto_Mask: isAutoMode,
        Box: !!(ctx.detBoxRadio?.checked),
        Selected_Masks_Input: state.detailerSelectedMasks || '',
        ...overrides,
    };

    const model = toolSettings?.model;
    if (model) params.Checkpoint = model;

    const rawSams = ctx.maskModeSelect?.value || '';
    const samsBase = (rawSams && rawSams !== 'manual' ? rawSams : 'face_yolov8n');
    params.sams = 'bbox/' + samsBase + '.pt';

    if (toolSettings?.loras && Array.isArray(toolSettings.loras)) {
        toolSettings.loras.forEach((lora, i) => {
            if (lora?.name && lora.name !== 'None') {
                params[`Lora_${i + 1}`] = lora.name;
            }
        });
    }

    return params;
}

export async function runDetect() {
    if (!state.detailerInputImage) {
        window.MpiAlert?.('Please load a source image first.');
        return;
    }
    if (ComfyUIController.isRunning) return;

    const workflowId = state.toolModelIds?.['detailer'];
    if (!workflowId) {
        console.warn('[detailer] No workflow selected');
        return;
    }

    if (ctx.detectBtn) {
        ctx.detectBtn.disabled = true;
        ctx.detectBtn.textContent = 'Detecting...';
    }

    const comfyMask = await buildComfyMask(ctx.currentMaskRaw);
    const params = buildParams({ Ready: false, ...(comfyMask ? { Input_Mask: comfyMask } : {}) });

    try {
        await ComfyUIController.runWorkflow(workflowId, params, (msg) => {
            if (msg?.type === 'executed') {
                const title = (msg.data?.node_title || '').toLowerCase();
                if (title === 'detected' && msg.data?.output?.images?.length) {
                    renderDetectedThumbnails(msg.data.output.images, runDetect);
                }
                if (title === 'output_mask' && msg.data?.output?.images?.[0]) {
                    applyMaskOverlay(msg.data.output.images[0]);
                }
            }
        });
    } catch (e) {
        console.error('[detailer] Detect failed:', e);
    } finally {
        if (ctx.detectBtn) {
            ctx.detectBtn.disabled = false;
            ctx.detectBtn.textContent = 'DETECT';
        }
    }
}

export async function triggerEnhance() {
    if (!state.detailerInputImage) {
        window.MpiAlert?.('Please load a source image first.');
        return;
    }

    onComfyRunStart();
    setRunningTool('detailer', 'comfy');

    const workflowId = state.toolModelIds?.['detailer'];
    if (!workflowId) {
        window.MpiAlert?.('No workflow selected.');
        return;
    }

    if (ctx.currentSeed === null) {
        ctx.currentSeed = generateSeed();
        if (ctx.newSeedBtn) ctx.newSeedBtn.title = `Seed: ${ctx.currentSeed}`;
        saveState();
    }

    const comfyMask = await buildComfyMask(ctx.currentMaskRaw);
    const params = buildParams({ Ready: true, ...(comfyMask ? { Input_Mask: comfyMask } : {}) });

    setRunButtonState(ctx.enhanceBtn, true);
    if (ctx.progressWrapper) ctx.progressWrapper.classList.remove('hide');
    if (ctx.progressBar) ctx.progressBar.style.width = '0%';

    let outputImageUrl = null;

    try {
        const result = await ComfyUIController.runWorkflow(workflowId, params, (msg) => {
            if (!msg) return;

            if (msg.type === 'preview' && msg.url && ctx.resultCanvas) {
                ctx.resultCanvas.loadImage(msg.url).catch(() => { });
                return;
            }

            if (msg.type === 'progress' && msg.data) {
                const pct = Math.round((msg.data.value / msg.data.max) * 100);
                if (ctx.progressBar) ctx.progressBar.style.width = pct + '%';
                return;
            }

            if (msg.type === 'executed') {
                const title = (msg.data?.node_title || '').toLowerCase();
                if (title === 'output' && msg.data?.output?.images?.length) {
                    const img = msg.data.output.images[0];
                    outputImageUrl = `http://${ComfyUIController.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`;
                }
            }
        });

        const finalUrl = outputImageUrl || (result?.images?.length ? result.images[result.images.length - 1] : null);

        if (finalUrl) {
            ctx.currentResultUrl = finalUrl;

            if (ctx.resultCanvas?.canvas) {
                ctx.resultCanvas.canvas.dataset.mediaUrl = getLoadableUrl(state.detailerInputImage);
                ctx.resultCanvas.canvas.dataset.comparisonUrl = ctx.currentResultUrl;
            }

            const sourceLoadUrl = getLoadableUrl(state.detailerInputImage);
            await ctx.resultCanvas.loadImage(sourceLoadUrl);
            await ctx.resultCanvas.loadComparisonImage(ctx.currentResultUrl);
            if (ctx.resultCanvas.draw) ctx.resultCanvas.draw();

            if (ctx.transferBtn) ctx.transferBtn.classList.remove('hide');
            saveState();
        }
    } catch (e) {
        if (e?.message?.toLowerCase().includes('interrupt')) {
            console.log('[detailer] Generation cancelled by user');
        } else {
            console.error('[detailer] Enhance failed:', e);
            window.MpiAlert?.('Detailer workflow failed: ' + e.message);
        }
    } finally {
        setRunButtonState(ctx.enhanceBtn, false);
        clearRunningTool('comfy');
        if (ctx.progressWrapper) ctx.progressWrapper.classList.add('hide');
        if (ctx.progressBar) ctx.progressBar.style.width = '0%';
    }
}

export async function cancelGeneration() {
    await ComfyUIController.interrupt();
    setRunButtonState(ctx.enhanceBtn, false);
    if (ctx.progressWrapper) ctx.progressWrapper.classList.add('hide');
}
