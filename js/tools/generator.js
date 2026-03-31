/**
 * generator.js — Generator tool.
 * Standalone ComfyUI image generator with direct prompt input,
 * prompt history, and action buttons to route to other tools.
 * 
 * ==========================================================
 * I. IMPORTS & DEPENDENCIES
 * Imports from global state, ComfyUI controller, and utility
 * libraries for UI and image processing.
 * ==========================================================
 */

import { state, getToolComfySettings } from '../state.js';
import { ComfyUIController } from '../comfyController.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { resizeImageIfNeeded } from '../imageProcessor.js';
import { refreshComfyWorkflowRegistry, getWorkflowStatus } from '../comfyModelManager.js';
import { showProvisioningScreen } from '../shell.js';
import { generateSeed } from '../uiHelpers.js';
import { getModelRatios, RATIO_ICONS } from '../ratioUtils.js';
import { MediaContextMenu } from '../components/mediaContextMenu.js';
import { setRunButtonState, onComfyRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

/* ----------------------------------------------------------
   GLOBAL REFERENCES & MODULE STATE
   ---------------------------------------------------------- */
import { PromptBox } from '../components/PromptBox.js';

// DOM Elements & UI Selectors
let previewBtn, seedInput, autoSeedCb,
    newSeedBtn, useRefinerCb, useTurboCb, progressWrapper, progressBar,
    historyList, genFlow, emptyState, batchToggleBtn, batchMenu, batchCountText,
    thumbStrip;

// Aspect Ratio & Layout State
let ratioToggleBtn, ratioMenu, ratioOrientationToggle, ratioGrid, currentRatioIcon, currentRatioText;
let _currentOrientation = 'portrait';
let _currentRatioLabel = '1:1';
let _currentW = 1024;
let _currentH = 1024;

// Prompt Box Reference for text/image input management
let promptBox;

/* ==========================================================
   II. INITIALIZATION
   Main entry point for the Generator tool. Handles DOM 
   binding, state restoration, and global event listeners.
   ========================================================== */

/**
 * Bootstraps the Generator tool: loads state, binds UI elements,
 * and initializes sub-components like PromptBox.
 */
export function initGenerator() {
    previewBtn = document.getElementById('gen-previewBtn');
    seedInput = document.getElementById('gen-seedInput');
    autoSeedCb = document.getElementById('gen-autoSeed');
    newSeedBtn = document.getElementById('gen-newSeedBtn');
    useRefinerCb = document.getElementById('gen-useRefiner');
    useTurboCb = document.getElementById('gen-useTurbo');
    progressWrapper = document.getElementById('gen-progressWrapper');
    progressBar = document.getElementById('gen-progressBar');
    historyList = document.getElementById('gen-history');
    genFlow = document.getElementById('gen-flow');
    emptyState = document.getElementById('gen-emptyState');
    batchToggleBtn = document.getElementById('gen-batchToggleBtn');
    batchMenu = document.getElementById('gen-batchMenu');
    batchCountText = document.getElementById('gen-batchCountText');

    thumbStrip = document.getElementById('gen-thumbs');

    state.generatorImages = state.generatorImages || [];


    let currentBatchSize = 1;

    if (batchToggleBtn) {
        batchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            batchMenu.classList.toggle('hide');
        });

        batchMenu.querySelectorAll('.batch-option').forEach(opt => {
            opt.onclick = (e) => {
                e.stopPropagation();
                currentBatchSize = parseInt(opt.dataset.value);
                if (batchCountText) batchCountText.textContent = currentBatchSize;
                batchMenu.querySelectorAll('.batch-option').forEach(o => o.classList.toggle('active', o === opt));
                batchMenu.classList.add('hide');
                saveToolState('generator', { batchSize: currentBatchSize });
            };
        });
    }

    document.addEventListener('click', () => {
        if (batchMenu) batchMenu.classList.add('hide');
        if (ratioMenu) ratioMenu.classList.add('hide');
    });

    // Initialize the module prompt box
    promptBox = new PromptBox({
        toolId: 'generator',
        container: document.getElementById('gen-prompt-wrapper'),
        toggleContainer: document.getElementById('gen-prompt-toggle-container'),
        onImageDrop: async (file) => await _addImage(file)
    });


    // ── Restore persisted state ──────────────────────────────────────────────
    const saved = loadToolState('generator');
    if (saved) {
        if (saved.seed) seedInput.value = saved.seed;
        if (saved.autoSeed !== undefined) {
            autoSeedCb.checked = saved.autoSeed;
            newSeedBtn.disabled = autoSeedCb.checked;
        }
        if (saved.aspectLabel) _currentRatioLabel = saved.aspectLabel;
        if (saved.aspectOrientation) _currentOrientation = saved.aspectOrientation;
        if (saved.useRefiner !== undefined) {
            useRefinerCb.checked = saved.useRefiner;
        }
        if (saved.useTurbo !== undefined) {
            useTurboCb.checked = saved.useTurbo;
        }
        if (saved.batchSize !== undefined) {
            currentBatchSize = saved.batchSize;
            if (batchCountText) batchCountText.textContent = currentBatchSize;
            batchMenu.querySelectorAll('.batch-option').forEach(o => o.classList.toggle('active', parseInt(o.dataset.value) === currentBatchSize));
        }
    }

    // Pre-fill with any pending prompt routed from another tool (overrides saved)
    if (state.generatorPrompt) {
        promptBox.setPrompt(state.generatorPrompt);
        state.generatorPrompt = '';
    }
    if (state.generatorSeed) {
        seedInput.value = state.generatorSeed;
        autoSeedCb.checked = false;
        newSeedBtn.disabled = false; // Enable the button since auto-seed is now off
        state.generatorSeed = null;
    }

    // seed persistence moved to _setupSeed

    // useRefiner persistence moved to _setupRefiner

    // Refresh history when project changes
    document.addEventListener('project:changed', () => {
        if (historyList) _loadHistory();
        state.generatorImages = [];
        _renderThumbs();
    });

    /**
     * Adds an image file to the local generator state and triggers a thumbnail re-render.
     */
    async function _addImage(file) {
        const { base64, url } = await resizeImageIfNeeded(file);
        state.generatorImages.push({
            base64,
            name: file.name,
            objectUrl: url
        });
        _renderThumbs();
    }

    /**
     * Re-renders the thumbnail strip for image-to-image/controlnet inputs.
     */
    function _renderThumbs() {
        if (!thumbStrip) return;
        thumbStrip.innerHTML = '';
        if (state.generatorImages.length === 0) {
            thumbStrip.style.display = 'none';
            return;
        }
        thumbStrip.style.display = 'flex';
        state.generatorImages.forEach((img, i) => {
            const card = document.createElement('div');
            card.className = 'thumb-card';
            card.innerHTML = `
                <img src="${img.objectUrl}" alt="${img.name}">
                <span class="thumb-remove" data-idx="${i}">✕</span>`;
            card.querySelector('.thumb-remove').onclick = () => {
                state.generatorImages.splice(i, 1);
                _renderThumbs();
            };
            thumbStrip.appendChild(card);
        });
    }

    _renderThumbs();

    // ── Seed controls ────────────────────────────────────────────────────────
    _setupSeed();

    // ── Aspect ratio setup ───────────────────────────────────────────────────
    _setupRefiner();
    _setupTurbo();
    ratioToggleBtn = document.getElementById('gen-ratioToggleBtn');
    ratioMenu = document.getElementById('gen-ratioMenu');
    ratioOrientationToggle = document.getElementById('gen-ratioOrientationToggle');
    ratioGrid = document.getElementById('gen-ratioGrid');
    currentRatioIcon = document.getElementById('gen-currentRatioIcon');
    currentRatioText = document.getElementById('gen-currentRatioText');

    ratioToggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        ratioMenu.classList.toggle('hide');
    });

    document.addEventListener('click', (e) => {
        if (ratioMenu && !ratioMenu.classList.contains('hide') && !ratioToggleBtn.contains(e.target) && !ratioMenu.contains(e.target)) {
            ratioMenu.classList.add('hide');
        }
    });

    ratioOrientationToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        _currentOrientation = _currentOrientation === 'portrait' ? 'landscape' : 'portrait';
        // Auto-invert the current ratio label if possible (e.g. 16:9 -> 9:16)
        if (_currentRatioLabel !== '1:1') {
            const parts = _currentRatioLabel.split(':');
            _currentRatioLabel = `${parts[1]}:${parts[0]}`;
        }
        _renderRatioMenu();
        saveToolState('generator', { aspectLabel: _currentRatioLabel, aspectOrientation: _currentOrientation });
    });

    _renderRatioMenu();

    // ── Generate / Cancel ────────────────────────────────────────────────────
    previewBtn.addEventListener('click', triggerGenerate);

    // Placeholder drag from preview removed in Flow layout

    _loadHistory();

    // Global error handler for broken history images
    window.handleGenImageError = (img) => {
        const wrapper = img.parentElement;
        if (wrapper && wrapper.classList.contains('gen-image-wrapper')) {
            wrapper.classList.add('is-deleted');
            img.style.display = 'none';
        }
    };

    // Listen for deletions or updates from the modal to refresh history
    document.addEventListener('media:deleted', (e) => {
        const deletedFile = e.detail?.name;
        if (deletedFile) {
            _markFileAsDeletedInHistory(deletedFile);
        }
        if (state.currentPage === 'tool' && state.currentTool === 'generator') _loadHistory();
    });
    document.addEventListener('media:updated', () => {
        if (state.currentPage === 'tool' && state.currentTool === 'generator') _loadHistory();
    });
}

function _markFileAsDeletedInHistory(filename) {
    const key = _historyKey();
    let items = JSON.parse(localStorage.getItem(key) || '[]');
    let changed = false;

    // Filter items: 
    // 1. Remove specific filename from imgUrl arrays/objects
    // 2. Remove entire item if its imgUrl becomes empty
    items = items.filter(item => {
        let urls = Array.isArray(item.imgUrl) ? item.imgUrl : [item.imgUrl];

        // Find if this item contains the deleted filename
        const hasFile = urls.some(u => (u.filename === filename || u === filename));

        if (hasFile) {
            changed = true;
            // Remove the specific file from the urls array
            urls = urls.filter(u => (u.filename !== filename && u !== filename));

            // If no images left, filter out the entire prompt item
            if (urls.length === 0) return false;

            // Otherwise, update the item's imgUrl with the remaining images
            item.imgUrl = Array.isArray(item.imgUrl) ? urls : urls[0];
        }
        return true;
    });

    if (changed) {
        localStorage.setItem(key, JSON.stringify(items));
    }
}

/* ==========================================================
   III. CORE GENERATION PIPELINE
   Entry points and state management for running the
   ComfyUI workflow and handling input/output flow.
   ========================================================== */

/**
 * Global entry point for generation.
 * Handles the toggle between starting a run and interrupting.
 */
export function triggerGenerate() {
    if (!previewBtn) return;
    if (ComfyUIController.isRunning) {
        _interrupt();
    } else {
        onComfyRunStart();
        setRunningTool('generator', 'comfy');
        _runGeneration();
    }
}

/* ----------------------------------------------------------
   IV. UI ELEMENT SETUP & CONFIGURATION (PRIVATE)
   ---------------------------------------------------------- */

/**
 * Initializes listeners for Seed input, Auto-Seed toggle,
 * and Seed regeneration button.
 */
function _setupSeed() {
    if (!seedInput || !autoSeedCb || !newSeedBtn) return;

    // Initial state setup
    newSeedBtn.disabled = autoSeedCb.checked;
    if (autoSeedCb.checked) {
        seedInput.value = '';
    }

    autoSeedCb.onchange = () => {
        const isAuto = autoSeedCb.checked;
        newSeedBtn.disabled = isAuto;
        if (isAuto) seedInput.value = '';
        saveToolState('generator', { autoSeed: isAuto, seed: seedInput.value });
    };

    newSeedBtn.onclick = () => {
        const newSeed = generateSeed();
        seedInput.value = newSeed;
        saveToolState('generator', { seed: newSeed });
    };

    seedInput.oninput = () => {
        saveToolState('generator', { seed: seedInput.value });
    };
}

function _setupRefiner() {
    if (!useRefinerCb) return;
    useRefinerCb.onchange = () => {
        if (useRefinerCb.checked && useTurboCb) {
            useTurboCb.checked = false;
            saveToolState('generator', { useTurbo: false });
        }
        saveToolState('generator', { useRefiner: useRefinerCb.checked });
    };
}

function _setupTurbo() {
    if (!useTurboCb) return;
    useTurboCb.onchange = () => {
        if (useTurboCb.checked && useRefinerCb) {
            useRefinerCb.checked = false;
            saveToolState('generator', { useRefiner: false });
        }
        saveToolState('generator', { useTurbo: useTurboCb.checked });
    };
}

/**
 * Renders the Aspect Ratio selection menu dynamically based
 * on the current Model Type and Orientation.
 */
function _renderRatioMenu() {
    if (!ratioGrid || !currentRatioIcon || !currentRatioText) return;
    ratioGrid.innerHTML = '';

    // Determine the base model by looking up the workflow configuration
    const currentWorkflowId = state.toolModelIds['generator'];
    const wfConfig = (state.allComfyWorkflows || []).find(w => w.id === currentWorkflowId);

    // Use our new modular helper
    const sourceArr = getModelRatios(wfConfig?.model_type, _currentOrientation);

    // Find the current active object, fallback to 1:1 if not found in current orientation
    let activeItem = sourceArr.find(r => r.label === _currentRatioLabel);
    if (!activeItem) activeItem = sourceArr[0]; // fallback

    // Update active button toggle display
    _currentRatioLabel = activeItem.label;
    _currentW = activeItem.w;
    _currentH = activeItem.h;
    currentRatioText.textContent = _currentRatioLabel;
    currentRatioIcon.innerHTML = RATIO_ICONS[activeItem.icon] || `<rect x="4" y="4" width="16" height="16" rx="2"/>`;

    // Render grid options
    sourceArr.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'btn secondary small'; // Removed icon-only
        if (item.label === _currentRatioLabel) btn.classList.add('outline'); // highlight active
        btn.style.width = 'auto'; // Adjust width to auto
        btn.style.height = 'auto'; // Adjust height to auto
        btn.style.padding = '4px 8px'; // Add padding
        btn.title = `${item.label} (${item.w}x${item.h})`;
        btn.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:0.7rem; opacity:0.9; font-weight:800; font-family:var(--font-display); line-height:1;">${item.label}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.9; pointer-events:none;">
                    ${RATIO_ICONS[item.icon]}
                </svg>
            </div>
        `;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _currentRatioLabel = item.label;
            _renderRatioMenu();
            saveToolState('generator', { aspectLabel: _currentRatioLabel, aspectOrientation: _currentOrientation });
            ratioMenu.classList.add('hide');
        });

        ratioGrid.appendChild(btn);
    });

    _updateLayout();
}

function _updateLayout() {
    // Aspect ratio logic for the source prompt box or future items can go here
}

function _setLoading(on) {
    ComfyUIController.isRunning = on;
    if (!on) clearRunningTool('comfy');
    if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.title = on ? 'Cancel Generation (Ctrl+Enter)' : 'Generate (Ctrl+Enter)';
        setRunButtonState(previewBtn, on);
    }
}

/* ----------------------------------------------------------
   V. EXECUTION & WS ORCHESTRATION (PRIVATE)
   ---------------------------------------------------------- */

/**
 * Cancels the currently running generation via ComfyUI server.
 */
async function _interrupt() {
    try {
        await fetch(`http://${ComfyUIController.serverAddress}/interrupt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: ComfyUIController.clientId }),
        });
        _setLoading(false);
        progressWrapper.classList.add('hide');
    } catch (e) { console.error('Interrupt failed:', e); }
}



let _activeFlowUnit = null;
let _currentPrompt = ""; // Track the prompt used for the active generation
let _currentSeed = "";   // Track the seed used for the active generation

/**
 * Updates the UI to show a failure state for the active generation unit.
 */
function _handleGenerationError(errText) {
    if (!_activeFlowUnit) return;
    _activeFlowUnit.classList.remove('pending');
    _activeFlowUnit.classList.add('error');
    _activeFlowUnit.querySelector('.gen-flow-media').innerHTML = `
        <div style="color:var(--danger); padding:2rem; text-align:center;">
             <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style="opacity:0.5; margin-bottom:1rem;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
             <p>Generation Failed</p>
             <p style="font-size:0.75rem; opacity:0.7; margin-top:0.5rem;">${errText}</p>
        </div>
    `;
    _activeFlowUnit.querySelector('.flow-info-meta').innerHTML = '<div>ERROR</div>';
    _setLoading(false);
    _activeFlowUnit = null;
}

/**
 * Creates a "Pending" UI unit in the history list to act as a placeholder
 * while the generation is running.
 */
function _createPendingUnit(prompt, w, h) {
    if (emptyState) emptyState.classList.add('hide');
    // Clear the historyList if it contains the "No generations yet" message
    const emptyMsg = historyList.querySelector('.gen-history-empty');
    if (emptyMsg) emptyMsg.remove();

    const unit = document.createElement('div');
    unit.className = 'gen-flow-unit pending';
    unit.innerHTML = `
        <div class="gen-flow-media">
            <div class="comfy-preview-box" style="width: auto; max-width: 100%; max-height: 550px; aspect-ratio:${w}/${h}; display:flex; align-items:center; justify-content:center; background:var(--surface-2); border-radius:var(--radius-lg); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);">
                <div class="spinner"></div>
            </div>
        </div>
        <div class="gen-flow-info">
             <div class="flow-info-prompt">${_truncate(prompt, 500)}</div>
             <div class="flow-info-meta">
                <div>QUEUED...</div>
             </div>
        </div>
    `;
    historyList.prepend(unit);
    unit.scrollIntoView({ behavior: 'smooth', block: 'start' });
    _activeFlowUnit = unit;
}

/**
 * Updates the placeholder image in the active pending unit with 
 * a real-time latent preview from ComfyUI.
 */
function _updateActiveUnitPreview(url) {
    if (!_activeFlowUnit) return;
    const mediaContainer = _activeFlowUnit.querySelector('.gen-flow-media');
    let img = mediaContainer.querySelector('img');
    if (!img) {
        mediaContainer.innerHTML = `<img src="${url}" style="max-height: 550px; width: auto; height: auto;">`;
    } else {
        // In a batch, we show the latest received image as preview
        img.src = url;
    }
}

/**
 * Converts a pending unit into a permanent history item once
 * the generation is complete and images are saved.
 */
async function _finalizeActiveUnit(outputs) {
    if (!_activeFlowUnit) return;
    _activeFlowUnit.classList.remove('pending');

    // Save to actual history & media library
    // We store either a string (single) or array (batch) of URLs
    const urls = outputs.map(o => o.url);

    await _saveToHistory(_currentPrompt, urls, {
        width: _currentW,
        height: _currentH,
        seed: _currentSeed,
        negativePrompt: promptBox.negativePrompt,
        workflow: state.toolModelIds['generator'] || 'FLUX'
    });

    // The history refresh will rebuild the full unit with proper icons/links
    _activeFlowUnit = null;
    ComfyUIController._deferredOutputs = []; // Final clean
}

/**
 * Handles the main generation loop:
 * 1. Validates inputs & workflow status
 * 2. Prepares the pre-injected workflow JSON
 * 3. Dispatches via ComfyUIController.runWorkflow
 * 4. Aggregates results into history
 */
async function _runGeneration() {
    // Determine the actual prompts to use from PromptBox
    let targetPos = promptBox.positivePrompt.trim();
    let targetNeg = promptBox.negativePrompt.trim();

    if (!targetPos) {
        alert('Please enter a prompt first!');
        return;
    }

    progressWrapper.classList.add('hide');
    progressBar.style.width = '0%';
    _setLoading(true);
    _currentPrompt = targetPos; // Legacy field for history label
    _createPendingUnit(targetPos, _currentW, _currentH);

    // Reset outputs for this run
    ComfyUIController._deferredOutputs = [];

    // Stage 9: Check for missing models (checkpoints) for the selected workflow
    const selectedWorkflowId = state.toolModelIds['generator'] || 'app_test_workflow';
    try {
        await refreshComfyWorkflowRegistry();
        if (!getWorkflowStatus(selectedWorkflowId)) {
            _setLoading(false);
            showProvisioningScreen('generator');
            return;
        }
    } catch (e) {
        console.warn('Workflow registry check failed:', e);
    }

    try {
        await ComfyUIController.ensureServerRunning();
    } catch (e) {
        alert("Could not start ComfyUI engine: " + e.message);
        _setLoading(false);
        return;
    }

    try {
        const wfConfig = (state.allComfyWorkflows || []).find(w => w.id === selectedWorkflowId);
        const fallbackWf = 'sdxl_t2i_nsfw.json';
        const res = await fetch(`/comfy_workflows/${wfConfig?.file || fallbackWf}`);
        if (!res.ok) throw new Error('Failed to load workflow');
        const workflow = await res.json();

        // Title-Based Node Injection — same pattern as Detailer/Upscaler
        const findNodeId = (title) => {
            const lower = title.toLowerCase();
            return Object.keys(workflow).find(k => (workflow[k]._meta?.title || '').toLowerCase() === lower);
        };
        const findNodeIds = (title) => {
            const lower = title.toLowerCase();
            return Object.keys(workflow).filter(k => (workflow[k]._meta?.title || '').toLowerCase() === lower);
        };
        const _injectValue = (nodeId, val) => {
            if (!nodeId) return false;
            const node = workflow[nodeId];
            if (!node?.inputs) return false;
            const keys = ['int', 'value', 'text', 'boolean', 'seed', 'noise_seed', 'denoise', 'steps', 'image', 'mask'];
            for (const k of keys) { if (k in node.inputs) { node.inputs[k] = val; return true; } }
            return false;
        };

        console.log('[generator] Workflow titles found:', Object.values(workflow).map(n => n._meta?.title).filter(Boolean));

        _injectValue(findNodeId('Width'), _currentW);
        _injectValue(findNodeId('Height'), _currentH);
        console.log(`[generator] Injecting Resolution (${_currentW}x${_currentH})`);

        _injectValue(findNodeId('Positive'), targetPos);
        const negNodeId = findNodeId('Negative');
        if (negNodeId) { _injectValue(negNodeId, targetNeg); }
        else { console.warn("[generator] 'Negative' node not found — skipped."); }

        const refinerNodeId = findNodeId('Use_Refiner');
        if (refinerNodeId) { _injectValue(refinerNodeId, useRefinerCb.checked); }

        const turboNodeId = findNodeId('Turbo');
        if (turboNodeId) { _injectValue(turboNodeId, useTurboCb?.checked || false); }

        const batchNodeId = findNodeId('Batch_Size');
        if (batchNodeId) { _injectValue(batchNodeId, parseInt(batchCountText?.textContent || '1')); }

        const seed = autoSeedCb.checked
            ? generateSeed()
            : (parseInt(seedInput.value) || generateSeed());
        seedInput.value = seed;
        _currentSeed = seed;
        const seedNodeIds = findNodeIds('Seed');
        if (seedNodeIds.length > 0) {
            seedNodeIds.forEach(id => _injectValue(id, seed));
        } else {
            Object.values(workflow).forEach(node => {
                if (node.class_type?.includes('KSampler') && node.inputs) {
                    if ('noise_seed' in node.inputs) node.inputs.noise_seed = seed;
                    if ('seed' in node.inputs) node.inputs.seed = seed;
                }
            });
        }

        // Model Injection
        const toolSettings = getToolComfySettings('generator');
        if (toolSettings.model) {
            const modelNodeId = findNodeId('Model') || findNodeId('Checkpoint');
            if (modelNodeId) {
                const node = workflow[modelNodeId];
                const modelPath = toolSettings.model.replace(/\//g, '\\');
                console.log(`[generator] Injecting model (${modelPath}) into node ${modelNodeId}`);
                if (node.inputs && 'ckpt_name' in node.inputs) node.inputs.ckpt_name = modelPath;
                else if (node.inputs && 'unet_name' in node.inputs) node.inputs.unet_name = modelPath;
                else if (node.inputs && 'model_name' in node.inputs) node.inputs.model_name = modelPath;
            } else {
                console.warn("[generator] 'Model'/'Checkpoint' node not found — skipped.");
            }
        }

        // LoRA Injection
        toolSettings.loras.forEach((lora, index) => {
            if (lora?.name && lora.name !== 'None') {
                const loraNodeId = findNodeId(`Lora_${index + 1}`);
                if (loraNodeId) {
                    const node = workflow[loraNodeId];
                    const loraPath = lora.name.replace(/\//g, '\\');
                    console.log(`[generator] Injecting LoRA ${index + 1} (${loraPath})`);
                    if (node.inputs) {
                        if ('lora_name' in node.inputs) node.inputs.lora_name = loraPath;
                        if ('strength_model' in node.inputs) node.inputs.strength_model = lora.modelStrength;
                        if ('strength_clip' in node.inputs) node.inputs.strength_clip = lora.clipStrength;
                    }
                }
            }
        });

        // ── Dispatch via shared runWorkflow — WS is managed by ComfyUIController ──
        // Passing the pre-injected workflow object directly (empty params = skip injection).
        // runWorkflow injects msg.data.node_title so the Output-only filter works in the callback.
        await ComfyUIController.runWorkflow(workflow, {}, (msg) => {
            if (msg.type === 'preview') {
                _updateActiveUnitPreview(msg.url);
                return;
            }
            if (msg.type === 'progress') {
                progressWrapper.classList.remove('hide');
                progressBar.style.width = Math.round((msg.data.value / msg.data.max) * 100) + '%';
                return;
            }
            if (msg.type === 'executed') {
                const title = (msg.data?.node_title || '').toLowerCase();
                if (title === 'output') {
                    if (!ComfyUIController._deferredOutputs) ComfyUIController._deferredOutputs = [];
                    (msg.data?.output?.images || []).forEach(img => {
                        const url = `http://${ComfyUIController.serverAddress}/view?filename=${img.filename}&type=${img.type}&subfolder=${img.subfolder || ''}`;
                        ComfyUIController._deferredOutputs.push({ img, url, type: 'image' });
                    });
                    (msg.data?.output?.audio || []).forEach(aud => {
                        const url = `http://${ComfyUIController.serverAddress}/view?filename=${aud.filename}&type=${aud.type}&subfolder=${aud.subfolder || ''}`;
                        ComfyUIController._deferredOutputs.push({ aud, url, type: 'audio' });
                    });
                }
            }
        });

        // runWorkflow resolved — execution complete (or interrupted)
        progressWrapper.classList.add('hide');
        _setLoading(false);

        if (ComfyUIController._deferredOutputs?.length) {
            const outputs = [...ComfyUIController._deferredOutputs];
            ComfyUIController._deferredOutputs = [];
            await _finalizeActiveUnit(outputs);
        } else {
            _handleGenerationError('Generation finished but no image was returned by the workflow.');
        }
    } catch (e) {
        console.error(e);
        _handleGenerationError(e.message);
    }
}

function _showOutputActions() {
    if (outputActionsGroup) outputActionsGroup.classList.remove('hide');
}

/* ==========================================================
   VI. PERSISTENCE & PROJECT HISTORY
   Logic for storing and retrieving generation results from
   local storage and the project's media folder.
   ========================================================== */

/**
 * @returns {string} The localStorage key prefixed by project ID.
 */
function _historyKey() {
    return `mpi_gen_history_${state.currentProject?.id || 'global'}`;
}

function _loadHistory() {
    if (!historyList) return;
    let items = JSON.parse(localStorage.getItem(_historyKey()) || '[]');

    // Keep temp URLs as they represent the final state of some flow units
    // items = items.filter(i => !i.imgUrl.includes('type=temp'));

    historyList.innerHTML = '';
    if (items.length === 0) {
        historyList.innerHTML = '<p class="gen-history-empty">No generations yet in this project.</p>';
        return;
    }
    items.slice().reverse().forEach(item => historyList.appendChild(_buildHistoryItem(item)));
}

/**
 * Persists the result of a generation to the project folder.
 * Synchronizes file system storage with history metadata.
 */
async function _saveToHistory(prompt, imgUrls, metadata = {}) {
    const urlList = Array.isArray(imgUrls) ? imgUrls : [imgUrls];
    const permanentUrls = [];

    // Phase 1: Persist images to project folder if possible
    for (let i = 0; i < urlList.length; i++) {
        const u = urlList[i];
        if (u.startsWith('data:') || !state.currentProject) {
            permanentUrls.push(u);
            continue;
        }

        try {
            const res = await fetch(u);
            const blob = await res.blob();
            const base64 = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });

            const uploadRes = await fetch(`/project-media/${state.currentProject.id}/upload?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: `gen_${Date.now()}_${i}.png`,
                    base64Data: base64,
                    promptContext: prompt,
                    negativePrompt: metadata.negativePrompt, // Pass negative prompt to backend
                    width: metadata.width,
                    height: metadata.height,
                    autoSequence: true
                })
            });
            const data = await uploadRes.json();
            if (data.success && data.filePath) {
                const actualFilename = data.filePath.split(/[\\/]/).pop();
                permanentUrls.push({
                    url: `/project-file?path=${encodeURIComponent(data.filePath)}`,
                    filename: actualFilename
                });
            } else {
                permanentUrls.push({ url: u });
            }
        } catch (e) {
            console.error("[generator] Failed to persist image to project history:", e);
            permanentUrls.push(u);
        }
    }

    const finalUrl = permanentUrls.length > 1 ? permanentUrls : permanentUrls[0];
    const items = JSON.parse(localStorage.getItem(_historyKey()) || '[]');
    items.push({ prompt, imgUrl: finalUrl, date: new Date().toISOString(), metadata });
    if (items.length > 50) items.shift();
    localStorage.setItem(_historyKey(), JSON.stringify(items));

    _loadHistory();
    return permanentUrls;
}

/**
 * Constructs the DOM structure for a single history item.
 * Includes event listeners for:
 * - Reuse (Prompts/Seed)
 * - Deletion (Disk + LocalStorage)
 * - Media Context Menu (Right-click)
 * - Detail Modal (Click)
 */
function _buildHistoryItem(item) {
    const el = document.createElement('div');
    el.className = 'gen-flow-unit';
    const date = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const urls = Array.isArray(item.imgUrl) ? item.imgUrl : [item.imgUrl];
    const isBatch = urls.length > 1;
    const workflowLabel = item.metadata?.workflow || 'Nano Banana 2';

    const mediaHtml = isBatch
        ? `<div class="gen-flow-media batch-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%;">
             ${urls.map((u, i) => `
                <div class="gen-image-wrapper">
                    <img src="${u.url || u}" alt="Batch image ${i + 1}" loading="lazy" style="width:100%; aspect-ratio:${item.metadata?.width || 1024}/${item.metadata?.height || 1024}; object-fit:contain; cursor:pointer;" onerror="this.style.display='none'; this.parentElement.classList.add('is-deleted');">
                    <div class="gen-image-overlay">
                        <button class="overlay-btn dl-btn" title="Download Image">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                        </button>
                        <button class="overlay-btn opt-btn" title="Image Options">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </button>
                    </div>
                    <div class="image-deleted-placeholder">
                        <svg viewBox="0 0 24 24" width="28" height="28" style="margin-bottom:0.75rem; fill: #ff4d4d; filter: drop-shadow(0 0 5px rgba(255,77,77,0.3));"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        <span style="color: #ff4d4d; font-weight: 600; font-size: 0.9rem; letter-spacing: 0.5px;">IMAGE DELETED</span>
                    </div>
                </div>`).join('')}
           </div>`
        : `<div class="gen-flow-media">
             <div class="gen-image-wrapper">
                <img src="${urls[0]?.url || urls[0]}" alt="Generated image" loading="lazy" style="cursor:pointer;" onerror="if(window.handleGenImageError) window.handleGenImageError(this)">
                <div class="gen-image-overlay">
                    <button class="overlay-btn dl-btn" title="Download Image">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                    <button class="overlay-btn opt-btn" title="Image Options">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                    </button>
                </div>
                <div class="image-deleted-placeholder">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="#ff4d4d" style="margin-bottom:0.5rem; opacity:0.8;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    <span style="color: #ff4d4d;">Image Deleted</span>
                </div>
             </div>
           </div>`;

    el.innerHTML = `
        ${mediaHtml}
        <div class="gen-flow-info">
            <div class="flow-info-actions" style="position: relative; z-index: 10; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn secondary small icon-only reuse-btn" title="Reuse Prompt & Seed" style="color: var(--text-2);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="pointer-events:none;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                </button>
                <button class="btn secondary small icon-only delete-btn" title="Delete Batch" style="color: var(--text-2);">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="pointer-events:none;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
            <div class="flow-info-prompt">${item.prompt}</div>
            ${item.metadata?.negativePrompt ? `
            <div class="flow-info-negative" style="color: var(--danger); opacity: 0.7; font-size: 0.8rem; margin-top: 0.5rem; border-top: 1px solid rgba(239, 68, 68, 0.1); padding-top: 0.25rem;">
                <span style="font-weight: 800; font-size: 0.65rem; margin-right: 0.5rem;">NEGATIVE</span>
                ${item.metadata.negativePrompt}
            </div>` : ''}
            <div class="flow-info-meta">
                <div>Created ${date}</div>
                <div>✨ ${workflowLabel}</div>
            </div>
        </div>
    `;

    // Handlers
    el.querySelector('.reuse-btn').onclick = (e) => {
        e.stopPropagation();

        // Restore both positive and negative prompts
        _positivePrompt = item.prompt;
        _negativePrompt = item.metadata?.negativePrompt || "";

        // Apply to UI based on current mode
        if (_currentPromptMode === 'negative') {
            promptInput.value = _negativePrompt;
        } else {
            promptInput.value = _positivePrompt;
        }

        saveToolState('generator', {
            prompt: _positivePrompt,
            positivePrompt: _positivePrompt,
            negativePrompt: _negativePrompt
        });

        if (item.metadata?.seed) {
            seedInput.value = item.metadata.seed;
            autoSeedCb.checked = false;
            newSeedBtn.disabled = false;
        }
        promptInput.scrollIntoView({ behavior: 'smooth' });
    };
    el.querySelector('.delete-btn').onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Phase 1: Delete all associated image files from disk
        if (state.currentProject?.folderPath) {
            const deletePromises = urls.map(u => {
                if (u.filename) {
                    return fetch(`/project-media/${state.currentProject.id}/${encodeURIComponent(u.filename)}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                        method: 'DELETE'
                    }).catch(err => console.error('[generator] Failed to delete file:', u.filename, err));
                }
                return Promise.resolve();
            });
            await Promise.all(deletePromises);
        }

        // Phase 2: Remove from local history
        const items = JSON.parse(localStorage.getItem(_historyKey()) || '[]');
        localStorage.setItem(_historyKey(), JSON.stringify(items.filter(i => JSON.stringify(i.imgUrl) !== JSON.stringify(item.imgUrl))));
        _loadHistory();
    };

    // Overlay handlers for each image
    el.querySelectorAll('.gen-image-wrapper').forEach((wrapper, idx) => {
        const u = urls[idx];
        const dlBtn = wrapper.querySelector('.dl-btn');
        const optBtn = wrapper.querySelector('.opt-btn');
        const img = wrapper.querySelector('img');

        if (dlBtn) {
            dlBtn.onclick = (e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = u;
                a.download = `gen_${Date.now()}_${idx}.png`;
                a.click();
            };
        }

        if (optBtn) {
            optBtn.onclick = (e) => {
                e.stopPropagation();
                MediaContextMenu.show(e.clientX, e.clientY, {
                    url: u.url || u,
                    filename: u.filename || `Gen_${new Date(item.date).getTime()}_${idx}.png`,
                    type: 'image',
                    isSaved: (u.url || u).includes('/project-file?')
                }, 'history', { onDeleted: () => _loadHistory() });
            };
        }

        img.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            MediaContextMenu.show(e.clientX, e.clientY, {
                url: u.url || u,
                filename: u.filename || `Gen_${new Date(item.date).getTime()}_${idx}.png`,
                type: 'image',
                isSaved: (u.url || u).includes('/project-file?')
            }, 'history', { onDeleted: () => _loadHistory() });
        };

        img.onclick = (e) => {
            e.stopPropagation();
            import('../components/mediaDetailModal.js').then(m => {
                m.openMediaModal({
                    url: u.url || u,
                    prompt: item.prompt,
                    negativePrompt: item.metadata?.negativePrompt || "",
                    resolution: `${item.metadata?.width || 1024} x ${item.metadata?.height || 1024}`,
                    name: u.filename || `Gen_${new Date(item.date).getTime()}_${idx}`,
                    type: 'image', ext: 'png'
                }, state.currentProject.folderPath);
            });
        };
    });



    return el;
}

function _truncate(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
}
