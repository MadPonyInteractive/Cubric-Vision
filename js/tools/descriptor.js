/**
 * descriptor.js — Descriptor tool.
 * User drops images onto a textarea, can reference them with @1, @2 etc.
 * Uses qwen3-vl:4b to describe/blend the images with the base prompt.
 * Output: a prompt text box + copy + open Generator button.
 *
 * Rebuilt for R8 using factory components.
 */

import { state } from '../state.js';
import { resizeImageIfNeeded } from '../utils/images.js';
import { getFirstAvailableModel } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { llamaGenerate } from '../llmService.js';
import { onLlmRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

// Factory & Utils
import { MpiPromptBox } from '../components/Compounds/MpiPromptBox/MpiPromptBox.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../components/Primitives/MpiIcon/MpiIcon.js';
import { ICONS } from '../utils/icons.js';
import { Events } from '../events.js';
import { qs, qsa, on } from '../utils/dom.js';
import { debounce } from '../utils/async.js';

// ── Module state ──────────────────────────────────────────────────────────────
let _abortCtrl = null;
let promptBoxInstance;
let addAssetBtn, describeBtn, copyBtn, toGeneratorBtn;

// DOM refs
let thumbStrip, outputBox, loadingEl, loadingText, resultSection, resultLoadingEl;

// ── Public init (called from shell.js after template mount) ───────────────────
export function initDescriptor() {
    _abortCtrl = null;

    // 1. Mount Prompt Box
    const promptWrapper = qs('#desc-prompt-wrapper');
    if (!promptWrapper) return;

    promptBoxInstance = MpiPromptBox.mount(promptWrapper, {
        value: '',
        includeNegative: false
    });

    // Handle drops on the prompt box area
    on(promptWrapper, 'dragover', (e) => e.preventDefault());
    on(promptWrapper, 'drop', async (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            await _addImage(file);
        } else {
            const url = e.dataTransfer.getData('text/plain');
            if (url) await _addImageFromUrl(url);
        }
    });

    // 2. Mount Action Buttons
    addAssetBtn = MpiButton.mount(qs('#desc-add-asset-slot'), {
        icon: 'plus',
        variant: 'secondary',
        size: 'md',
        info: 'Add Media from Library',
        extraClasses: 'round-btn'
    });

    describeBtn = MpiButton.mount(qs('#desc-describe-btn-slot'), {
        icon: 'generate',
        variant: 'primary',
        size: 'md',
        info: 'Describe & Generate (Ctrl+Enter)',
        extraClasses: 'round-btn action-glow'
    });

    copyBtn = MpiButton.mount(qs('#desc-copy-btn-slot'), {
        icon: 'copy',
        variant: 'ghost',
        size: 'sm',
        info: 'Copy Prompt'
    });

    toGeneratorBtn = MpiButton.mount(qs('#desc-actions-slot'), {
        text: 'Go to Generator',
        variant: 'primary',
        size: 'md',
        extraClasses: 'action-glow'
    });

    // 3. Cache static DOM refs
    thumbStrip = qs('#desc-thumbs');
    outputBox = qs('#desc-output');
    loadingEl = qs('#desc-loading');
    loadingText = qs('#desc-loadingText');
    resultSection = qs('#desc-result');
    resultLoadingEl = qs('#desc-result-loading');

    // 4. Load saved state
    const saved = loadToolState('descriptor');
    if (saved) {
        if (saved.promptText) {
            promptBoxInstance.update({ value: saved.promptText });
        }
        if (saved.images && state.descriptorImages.length === 0) {
            state.descriptorImages = saved.images;
        }
        if (saved.output) {
            outputBox.value = saved.output;
            if (resultSection) {
                resultSection.classList.remove('hide');
                resultSection.style.display = 'block';
            }
        }
    }

    _renderThumbs();
    _updateButtonState();

    // 5. Global Navigation / Tool running cleanup
    Events.on('nav:tool', (data) => {
        if (data.toolName !== 'descriptor') {
            cancelDescriptor();
        }
    });

    // 6. Bind Listeners
    addAssetBtn.on('click', async () => {
        const { openAssetBrowser } = await import('../components/assetBrowserModal.js');
        openAssetBrowser(async (asset) => {
            await _addImageFromUrl(asset.url);
        });
    });

    describeBtn.on('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            _runDescribe();
        }
    });

    copyBtn.on('click', () => {
        navigator.clipboard.writeText(outputBox.value);
        copyBtn.update({ icon: 'check' });
        setTimeout(() => copyBtn.update({ icon: 'copy' }), 2000);
    });

    toGeneratorBtn.on('click', () => {
        state.generatorPrompt = outputBox.value;
        navigate(PAGE_TOOL, { name: 'generator' });
    });

    // Handle Ctrl+Enter
    on(document, 'keydown', (e) => {
        if (state.currentTool !== 'descriptor') return;
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            _runDescribe();
        }
    });
}

// ── Private helpers ───────────────────────────────────────────────────────────
async function _addImage(file) {
    const { base64, url } = await resizeImageIfNeeded(file);

    state.descriptorImages.push({
        base64,
        name: file.name,
        objectUrl: url,
        description: "",
        isAnalyzing: false,
        controller: null
    });
    _renderThumbs();
    _analyzeImage(state.descriptorImages.length - 1);

    // Background upload to Media folder
    if (state.currentProject) {
        fetch(`/project-media/${state.currentProject.id}/upload?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, base64Data: url })
        }).catch(err => console.error('Media upload failed:', err));
    }
}

async function _addImageFromUrl(url) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], 'image.jpg', { type: blob.type });
        await _addImage(file);
    } catch (e) { console.error('URL image load failed:', e); }
}

/**
 * Perform background vision analysis on an image immediately after addition.
 */
async function _analyzeImage(index) {
    const img = state.descriptorImages[index];
    if (!img) return;

    img.isAnalyzing = true;
    img.controller = new AbortController();
    _updateButtonState();

    const system = `You are an expert in image analysis and prompt engineering for AI image generation.

Describe the image provided with exhaustive, precise detail so it can be replicated exactly by an AI image generator and look as close to it as possible, include camera type, lens, angle, shot size, colour grading, brightness, style (realistic, anime, cartoon, render, etc), details (fog, specs of dust, etc), characters (clothing, pose, gesture, expression, etc) time of day, lighting, etc.

You MUST output a single continuous block of narrative prose following this exact structural flow:
[Subject] + [Action] + [Location/context] + [Composition] + [Style]

No titles, descriptions of what you done or anything like than. Do NOT use sections or headers. Output a SINGLE block of continuous prose`;

    try {
        const modelId = state.toolModelIds['descriptor'] || getFirstAvailableModel('descriptor')?.id || 'qwen3-vl-4b-instruct';
        const data = await llamaGenerate({
            modelId,
            prompt: system,
            images: [img.base64],
            signal: img.controller.signal
        });

        img.description = cleanLLMResponse(data.response);
        img.modelId = modelId; // Store which model generated this description
        _saveState();
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(`Background analysis failed for image ${index}:`, e);
        img.description = "Analysis failed.";
    } finally {
        img.isAnalyzing = false;
        img.controller = null;
        _updateButtonState();
    }
}

function _saveState() {
    const promptText = promptBoxInstance?.el.querySelector('textarea')?.value || '';
    saveToolState('descriptor', {
        promptText,
        images: state.descriptorImages.map(img => ({
            ...img,
            controller: null, // Don't persist abort controller
            isAnalyzing: false
        })),
        output: outputBox?.value || ""
    });
}

/**
 * Sync the Generate button text and state with background progress.
 */
function _updateButtonState() {
    if (!describeBtn) return;
    const analyzingCount = state.descriptorImages.filter(img => img.isAnalyzing).length;

    if (analyzingCount > 0) {
        describeBtn.update({ variant: 'loading', icon: 'spinner' }); // variant loading handles spinner
    } else {
        describeBtn.update({ variant: 'primary', icon: 'generate' });
    }
}

function _renderThumbs() {
    thumbStrip.innerHTML = '';
    state.descriptorImages.forEach((img, i) => {
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.innerHTML = `
            <img src="${img.objectUrl}" alt="${img.name}">
            <span class="thumb-badge">@${i + 1}</span>
            <div class="thumb-remove-slot"></div>`;

        MpiButton.mount(card.querySelector('.thumb-remove-slot'), {
            icon: 'close',
            variant: 'danger',
            size: 'sm',
            extraClasses: 'thumb-remove'
        }).on('click', () => {
            const removed = state.descriptorImages.splice(i, 1)[0];
            if (removed && removed.controller) removed.controller.abort();
            _renderThumbs();
            _updateButtonState();
            _saveState();
        });

        thumbStrip.appendChild(card);
    });
}

export async function _runDescribe() {
    const promptText = promptBoxInstance?.el.querySelector('textarea')?.value || '';
    const userPrompt = promptText.trim();
    const count = state.descriptorImages.length;
    const hasP = !!userPrompt;

    if (!hasP && count === 0) {
        alert('Please enter instructions or add at least one image.');
        return;
    }

    onLlmRunStart();
    _setLoading(true);
    _abortCtrl = new AbortController();

    try {
        const modelId = state.toolModelIds['descriptor'] || getFirstAvailableModel('descriptor')?.id || 'qwen3-vl-4b-instruct';

        // 1. If images were analyzed with a different model, re-analyze them sequentially
        const needsReanalyze = state.descriptorImages.some(img => img.description && img.modelId !== modelId);
        if (needsReanalyze) {
            for (let i = 0; i < state.descriptorImages.length; i++) {
                await _analyzeImage(i);
            }
        }

        let finalSystemText = "";

        if (count === 0) {
            finalSystemText = `You are an expert in prompt engineering. 
Enhance this concept into a highly descriptive image generation prompt.
User Concept: "${userPrompt}"

Output a SINGLE block of continuous prose following this flow: [Subject] + [Action] + [Location/context] + [Composition] + [Style].`;
        } else if (count === 1 && !hasP) {
            outputBox.value = state.descriptorImages[0].description || "Description not ready. Please wait.";
            outputBox.classList.remove('hide');
            if (resultSection) resultSection.classList.remove('hide');
            _setLoading(false);
            return;
        } else if (count === 1 && hasP) {
            finalSystemText = `I am going to provide you with a image generation prompt and instructions to change elements on it.
please follow my instructions and change the prompt only where is needed to match my instructions.
Example: the prompt has a person dressed in a suit and the environment is a city, 
if my instructions are the person is wearing shorts and is at a jungle, you should then only change the part of the prompt that specifies the person clothing and the location.

instructions: ${userPrompt}

prompt: ${state.descriptorImages[0].description}

You MUST output a single continuous block of narrative prose following this exact structural flow:
[Subject] + [Action] + [Location/context] + [Composition] + [Style]
No titles, descriptions of what you done or anything like than, only the prompt.            

Output a SINGLE block of continuous prose. No headers, no titles.`;
        } else if (count > 1 && !hasP) {
            const combinedDescriptions = state.descriptorImages
                .map((img, i) => `Prompt @${i + 1}: ${img.description || "(No description available)"}`)
                .join('\n\n');

            finalSystemText = `
You are an expert in prompt engineering for AI image generation.

Prompts:
${combinedDescriptions}

You have received multiple prompts. 
Blend elements, styles, and characters from these prompts randomly into a cohesive, 
highly descriptive analysis spanning the different prompts. 
Form a unique synthesis making sure you have visual elements from all prompts.
Describe your creation with exhaustive, precise detail so it can be replicated 
exactly by an AI image generator and look as close to it as possible, 
include camera type, lens, angle, shot size, colour grading, brightness, 
style (realistic, anime, cartoon, render, etc), details (fog, specs of dust, etc), 
characters (clothing, pose, gesture, expression, etc) time of day, lighting, etc.
You MUST output a single continuous block of narrative prose following this exact structural flow:
[Subject] + [Action] + [Location/context] + [Composition] + [Style]
No titles, descriptions of what you done or anything like than, only the prompt.            

Output a SINGLE block of continuous prose. No headers, no titles.`;
        } else {
            const prompts = state.descriptorImages
                .map((img, i) => `Prompt @${i + 1}: ${img.description || "(No description available)"}`)
                .join('\n');

            finalSystemText = `

You are an expert in prompt engineering for AI image generation.

Prompts:
${prompts}

You have received multiple prompts. 
The user has provided specific instructions on how to blend them. 
The user may reference the prompts as @1, @2, @3, or by element, character, location, object, style, etc.

User instructions: "${userPrompt}"

Follow the user instructions perfectly. 
The user might want the style of @2 applied to the person in @1, 
the user might ask to place the person from @1 in the location of @2, 
the user may say the 2 women in the car, and 1 prompt has a car description and another prompt has one of the women and another prompt has the other woman, etc.
Write the final description satisfying that fusion.

Describe the final image with exhaustive, precise detail so it can be replicated exactly 
by an AI image generator and look as close to it as possible, include 
camera type, lens, angle, shot size, colour grading, brightness, style 
(realistic, anime, cartoon, render, etc), details (fog, specs of dust, etc), 
characters (clothing, pose, gesture, expression, etc) time of day, lighting, etc.

You MUST output a single continuous block of narrative prose following this exact structural flow:
[Subject] + [Action] + [Location/context] + [Composition] + [Style]

CRITICAL:No titles, no symbols of any type, no prefixes, no descriptions of what you done or anything like that, 
absolutely no mentions of the images provided, only the prompt like it was created by you and you were not aware of any images provided.`;
        }

        const data = await llamaGenerate({
            modelId: state.toolModelIds['descriptor'] || getFirstAvailableModel('descriptor')?.id || 'qwen3-vl-4b-instruct',
            prompt: finalSystemText,
            signal: _abortCtrl.signal
        });

        outputBox.value = cleanLLMResponse(data.response);
        outputBox.classList.remove('hide');
        if (resultSection) resultSection.classList.remove('hide');
        _saveState();
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error("Refinement call failed:", e);
        outputBox.value = `Error: ${e.message}`;
        outputBox.classList.remove('hide');
    } finally {
        _setLoading(false);
    }
}

function _setLoading(on) {
    state.descriptorRunning = on;
    if (on) {
        setRunningTool('descriptor', 'llm');
        Events.emit('tool:running', { tool: 'descriptor', type: 'llm' });
    } else {
        clearRunningTool('llm');
        Events.emit('tool:idle', { tool: 'descriptor', type: 'llm' });
    }

    if (on) {
        if (resultSection && !resultSection.classList.contains('hide')) {
            resultLoadingEl?.classList.remove('hide');
        } else {
            loadingEl.classList.remove('hide');
            describeBtn.update({ variant: 'loading', text: 'Stop' });
        }
        loadingText.textContent = 'Describing…';
    } else {
        loadingEl.classList.add('hide');
        resultLoadingEl?.classList.add('hide');
        describeBtn.update({ variant: 'primary', icon: 'generate', text: '' });
    }
}

export function cancelDescriptor() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}


