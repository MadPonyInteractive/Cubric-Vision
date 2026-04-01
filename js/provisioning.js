/**
 * provisioning.js — Download Manager, Engine Setup, and Advanced Settings screens.
 *
 * Extracted from shell.js (was 500+ lines of inline UI builders in the app orchestrator).
 * Shell.js imports and re-exports these so call sites don't need to change.
 *
 * RULES FOR AGENTS:
 * - Changes to the Download Manager UI → edit this file only.
 * - Changes to Advanced Settings (LoRA stack, model selectors) → edit this file only.
 * - Do not import this file directly from tools — use the shell.js re-exports.
 */

import { state, getToolComfySettings } from './state.js';
import { navigate, PAGE_LANDING, PAGE_TOOL } from './router.js';
import { getRequiredModelsForTool } from './modelManager.js';
import { refreshComfyWorkflowRegistry, listComfyFiles, getDefaultWorkflowId } from './comfyModelManager.js';
import { TOOL_REGISTRY } from './toolRegistry.js';
import { MpiDropdown } from './components/Blocks/MpiDropdown/MpiDropdown.js';
import { ensureTemplate } from './templateLoader.js';

// Shell's toolContainer — injected by initProvisioning() to avoid circular imports
let _toolContainer = null;
let _loadToolInternal = null;

/**
 * Must be called once by shell.js during initShell() to inject dependencies.
 * @param {HTMLElement} toolContainer
 * @param {function} loadToolInternal
 */
export function initProvisioning(toolContainer, loadToolInternal) {
    _toolContainer = toolContainer;
    _loadToolInternal = loadToolInternal;
}

// ── Engine Provisioning Screen ─────────────────────────────────────────────────

/**
 * Shows the engine download screen (Python/ComfyUI or LLM backend).
 * Triggered when the engine binary is missing entirely.
 */
export async function showEngineProvisioningScreen(toolName, type, isManual = false) {
    const isLlama = type === 'llama';
    const engineName = isLlama ? 'Llama.cpp Backend Server' : 'ComfyUI Portable Engine';
    const engineDesc = isLlama
        ? 'Required to run language and vision models entirely offline.'
        : 'Python environment + ComfyUI core required for image generation.';

    const tpl = await ensureTemplate('tpl-provisioning');
    if (!tpl) {
        _toolContainer.innerHTML = `
            <div class="tool-panel" style="padding: 2rem; max-width: 600px; margin: 0 auto;">
                <h2>Setting up engine workspace...</h2>
                <p>The ${engineName} is missing. We need to download and extract the portable environment.</p>
                <button id="btnDownloadEngine" class="btn primary">Download Engine</button>
                <div id="engineProgressContainer" class="download-progress-container hide" style="margin-top:1rem;">
                    <div class="download-progress-bar pulsing"></div>
                </div>
                <div id="engineStatusMsg" style="margin-top:1rem;font-size:0.9rem;color:#ccc;"></div>
            </div>`;
    } else {
        const el = tpl.content.cloneNode(true);
        const container = el.getElementById('provisionModelContainer');
        container.innerHTML = `
            <div class="model-provision-card">
                <div class="model-provision-header">
                    <span class="model-provision-name">${engineName}</span>
                </div>
                <div class="model-provision-description">${engineDesc}</div>
                <button id="btnDownloadEngine" class="btn primary prov-download-btn" style="margin-top: 1rem;">Download & Setup Engine</button>
                <div id="engineProgressContainer" class="download-progress-container hide" style="margin-top:1rem;">
                    <div class="download-progress-bar pulsing"></div>
                </div>
                <div id="engineStatusMsg" style="margin-top:1rem;font-size:0.9rem;color:#ccc;"></div>
            </div>
        `;
        _toolContainer.appendChild(el);
    }

    const closeBtn = document.getElementById('closeProvisionBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (isManual) {
                _loadToolInternal(toolName);
            } else {
                const page = state.previousPage || PAGE_LANDING;
                const params = state.previousParams || {};
                navigate(page, params);
            }
        });
    }

    const btn = document.getElementById('btnDownloadEngine');
    const prog = document.getElementById('engineProgressContainer');
    const msg = document.getElementById('engineStatusMsg');

    btn.addEventListener('click', async () => {
        btn.classList.add('hide');
        prog.classList.remove('hide');
        msg.textContent = 'Downloading and extracting (this may take several minutes)...';
        try {
            const res = await fetch(`/engine/download?type=${type}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                msg.textContent = 'Engine ready! Loading tool...';
                setTimeout(() => _loadToolInternal(toolName), 1000);
            } else {
                msg.textContent = `Error: ${data.error}`;
                btn.classList.remove('hide');
                prog.classList.add('hide');
            }
        } catch (e) {
            msg.textContent = `Setup failed: ${e.message}`;
            btn.classList.remove('hide');
            prog.classList.add('hide');
        }
    });
}

// ── Model / Workflow Provisioning Screen (Download Manager) ───────────────────

/**
 * Shows the Download Manager (ComfyUI workflows) or Model Manager (LLM models).
 * Also used as the "Manage Workflows" / "Manage Models" manual entry point.
 *
 * @param {string} toolName
 * @param {boolean} [isManual=false] — true when opened manually via gear button
 */
export async function showProvisioningScreen(toolName, isManual = false) {
    const toolDef = TOOL_REGISTRY[toolName];
    const isComfy = toolDef?.type === 'comfy';
    const tpl = await ensureTemplate('tpl-provisioning');
    const el = tpl.content.cloneNode(true);
    const container = el.getElementById('provisionModelContainer');
    const titleEl = el.getElementById('provisionTitle');
    const descEl = el.getElementById('provisionDesc');

    if (isComfy) {
        titleEl.textContent = 'Download Manager';
        descEl.style.whiteSpace = 'pre-line'; // To make /n work
        descEl.textContent = 'This tool requires specialized workflows \n and their dependencies to be installed locally.';
        container.innerHTML = '<div class="spinner"></div>';
        await refreshComfyWorkflowRegistry();

        const expectedType = toolDef?.comfyType || 'image_generation';
        const defaultWfId = getDefaultWorkflowId(toolName);
        const selectedWorkflowId = state.toolModelIds[toolName] || defaultWfId;
        const { getWorkflowStatus } = await import('./comfyModelManager.js');

        if (!isManual && getWorkflowStatus(selectedWorkflowId)) {
            _loadToolInternal(toolName);
            return;
        }

        container.innerHTML = '';
        const filteredWfs = (state.allComfyWorkflows || []).filter(wf => wf.type === expectedType);

        filteredWfs.forEach(wf => {
            const card = document.createElement('div');
            card.className = 'model-provision-card';
            card.innerHTML = `
                <div class="model-provision-header">
                    <span class="model-provision-name">${wf.name}</span>
                    <span class="field-hint">${(wf.totalRequiredSize / (1024 ** 3)).toFixed(2)}GB REQUIRED</span>
                </div>
                <div class="model-provision-description">${wf.description || ''}</div>
                <div class="model-provision-info">🧠 ${wf.maxVramRequired} VRAM REQUIRED</div>
                <div class="model-status-row" id="status-${wf.id}">
                    ${wf.installed ? `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
                            <div class="model-status-badge local">INSTALLED</div>
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <label class="checkbox-pill small" style="padding: 2px 8px; font-size: 0.7rem;" title="If unchecked, models will be kept on disk (custom_nodes are always internal).">
                                    <input type="checkbox" class="prov-delete-assets-check" checked>
                                    <span>Delete Models</span>
                                </label>
                                <button class="btn secondary small prov-delete-workflow-btn">Uninstall</button>
                            </div>
                        </div>
                    ` : wf.isInstalled ? `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
                            <div class="model-status-badge local" style="background: var(--accent-blue); color: white;">ASSETS READY</div>
                            <p class="field-hint" style="font-size: 0.65rem;">All dependencies found on disk.</p>
                            <button class="btn primary small prov-activate-workflow-btn">Finalize Setup</button>
                        </div>
                    ` : `
                        <button class="btn primary prov-download-workflow-btn">Download Workflow Assets</button>
                    `}
                </div>
                <div class="download-progress-container hide" id="progress-wf-${wf.id}">
                    <div class="download-progress-bar pulsing"></div>
                    <p class="progress-message" id="msg-wf-${wf.id}" style="margin-top:0.5rem;font-size:0.75rem;"></p>
                </div>
            `;

            const activeDl = state.downloadingWorkflows[wf.id];
            const statusRow = card.querySelector(`#status-${wf.id}`);
            if (activeDl) {
                const progCont = card.querySelector(`#progress-wf-${wf.id}`);
                const progMsg = card.querySelector(`#msg-wf-${wf.id}`);
                statusRow.classList.add('hide');
                progCont.classList.remove('hide');
                progMsg.textContent = `Downloading ${activeDl.name} (${activeDl.current}/${activeDl.total})...`;
            }

            const downBtn = card.querySelector('.prov-download-workflow-btn');
            const delBtn = card.querySelector('.prov-delete-workflow-btn');
            const actBtn = card.querySelector('.prov-activate-workflow-btn');
            const progCont = card.querySelector(`#progress-wf-${wf.id}`);
            const progMsg = card.querySelector(`#msg-wf-${wf.id}`);

            const handleSetupSuccess = () => { _loadToolInternal(toolName); };

            downBtn?.addEventListener('click', async () => {
                downBtn.classList.add('hide');
                progCont.classList.remove('hide');
                const { downloadWorkflowDependencies } = await import('./comfyModelManager.js');
                const success = await downloadWorkflowDependencies(wf.id, (name, current, total) => {
                    progMsg.textContent = `Downloading ${name} (${current}/${total})...`;
                });
                if (success) {
                    handleSetupSuccess();
                } else {
                    window.MpiAlert(`Setup failed. Please check console for details.`);
                    showProvisioningScreen(toolName);
                }
            });

            actBtn?.addEventListener('click', async () => {
                actBtn.disabled = true;
                actBtn.textContent = 'Activating...';
                try {
                    const res = await fetch('/comfy/workflow/install-complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: wf.id })
                    });
                    if (res.ok) {
                        const { refreshComfyWorkflowRegistry } = await import('./comfyModelManager.js');
                        await refreshComfyWorkflowRegistry();
                        handleSetupSuccess();
                    } else {
                        window.MpiAlert('Activation failed. Please try again.');
                        actBtn.disabled = false;
                        actBtn.textContent = 'Finalize Setup';
                    }
                } catch (e) {
                    window.MpiAlert('Activation error: ' + e.message);
                    actBtn.disabled = false;
                    actBtn.textContent = 'Finalize Setup';
                }
            });

            delBtn?.addEventListener('click', async () => {
                const deleteModels = card.querySelector('.prov-delete-assets-check')?.checked ?? true;
                const msgText = deleteModels
                    ? `Uninstall "${wf.name}" and delete its model files?`
                    : `Uninstall "${wf.name}"? Model files will be kept on disk.`;
                if (await window.MpiConfirm(msgText)) {
                    const { deleteWorkflow } = await import('./comfyModelManager.js');
                    const success = await deleteWorkflow(wf.id, deleteModels);
                    if (success) {
                        showProvisioningScreen(toolName, true);
                    } else {
                        window.MpiAlert('Uninstall failed.');
                    }
                }
            });

            container.appendChild(card);
        });

    } else {
        // LLM model provisioning
        titleEl.textContent = 'Download Manager';
        descEl.textContent = 'To enable offline logic processing, please download AI models.';
        const models = getRequiredModelsForTool(toolName);
        container.innerHTML = '';
        models.forEach(m => {
            const card = document.createElement('div');
            card.className = 'model-provision-card';
            card.innerHTML = `
                <div class="model-provision-header">
                    <span class="model-provision-name">${m.name}</span>
                    <span class="field-hint">${m.size}</span>
                </div>
                ${m.description ? `<div class="model-provision-description">${m.description}</div>` : ''}
                <div class="model-provision-info">🧠 ${m.vram} VRAM required</div>
                <div class="model-status-row">
                    ${m.exists ? `
                        <div class="model-status-badge local" style="margin-bottom: 0.5rem;">INSTALLED</div>
                        <button class="btn secondary small prov-delete-btn" data-id="${m.id}">Delete Model</button>
                    ` : `
                        <button class="btn primary prov-download-btn" data-id="${m.id}">Download & Unlock Tool</button>
                    `}
                </div>
                <div class="download-progress-container hide">
                    <div class="download-progress-bar"></div>
                </div>
            `;

            const btnDown = card.querySelector('.prov-download-btn');
            const btnDel = card.querySelector('.prov-delete-btn');
            const prog = card.querySelector('.download-progress-container');
            const bar = card.querySelector('.download-progress-bar');

            if (btnDown) {
                btnDown.addEventListener('click', async () => {
                    btnDown.classList.add('hide');
                    prog.classList.remove('hide');
                    bar.classList.add('pulsing');
                    const result = await import('./modelManager.js').then(mod => mod.downloadModel(m.id));
                    if (result.success) {
                        showProvisioningScreen(toolName);
                    } else {
                        alert(`Download failed: ${result.error}`);
                        showProvisioningScreen(toolName);
                    }
                });
            }

            if (btnDel) {
                btnDel.addEventListener('click', async () => {
                    if (await window.MpiConfirm(`Are you sure you want to delete ${m.name}?`)) {
                        await import('./modelManager.js').then(mod => mod.deleteModel(m.id));
                        showProvisioningScreen(toolName);
                    }
                });
            }
            container.appendChild(card);
        });
    }

    _toolContainer.innerHTML = '';
    _toolContainer.appendChild(el);

    const closeBtn = document.getElementById('closeProvisionBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeActiveSubPage(toolName, isManual));
    }

    state.activeSubPage = { toolName, isManual };
}

// ── Advanced Settings Screen ───────────────────────────────────────────────────

/**
 * Shows the Advanced Settings overlay (base model, upscale model, LoRA stack).
 * Only available for tools with hasAdvancedSettings: true in the registry.
 *
 * @param {string} toolName
 */
export async function showAdvancedSettingsScreen(toolName) {
    const tpl = await ensureTemplate('tpl-provisioning');
    const el = tpl.content.cloneNode(true);
    const container = el.getElementById('provisionModelContainer');
    const titleEl = el.getElementById('provisionTitle');
    const descEl = el.getElementById('provisionDesc');
    const iconEl = el.getElementById('provisionIcon');

    titleEl.textContent = 'Advanced Settings';
    descEl.textContent = 'Fine-tune your generation parameters for the current workflow.';
    if (iconEl) iconEl.textContent = '🔧';

    container.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

    _toolContainer.innerHTML = '';
    _toolContainer.appendChild(el);

    // Hook up close button EARLY so users can exit if loading hangs
    const closeBtn = document.getElementById('closeProvisionBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeActiveSubPage(toolName, true));
    }

    // Add Manage Workflows button
    const manageBtn = document.createElement('button');
    manageBtn.className = 'btn secondary small';
    manageBtn.style.marginRight = '1rem';
    manageBtn.textContent = 'Manage Workflows';
    manageBtn.onclick = () => showProvisioningScreen(toolName, true);
    if (closeBtn) {
        closeBtn.parentElement.insertBefore(manageBtn, closeBtn);
    }

    try {
        const defaultWfId = getDefaultWorkflowId(toolName);
        const workflowId = state.toolModelIds[toolName] || defaultWfId;
        const workflow = (state.allComfyWorkflows || []).find(w => w.id === workflowId);
        const modelDep = workflow?.dependencies?.find(d => d.type === 'checkpoint' || d.type === 'diffusion_model');
        const modelType = modelDep?.type || 'checkpoint';
        const modelSubDir = modelType === 'checkpoint' ? 'models/checkpoints' : 'models/diffusion_models';

        const [models, loras, upscalers, workflowRes] = await Promise.all([
            listComfyFiles(modelSubDir).then(res => res || []),
            listComfyFiles('models/loras').then(res => res || []),
            listComfyFiles('models/upscale_models').then(res => res || []),
            fetch(`/comfy_workflows/${workflow?.file || 'sdxl_t2i_nsfw.json'}`)
        ]);

        state.upscaleModels = upscalers || [];

        let workflowData = {};
        try { workflowData = await workflowRes.json(); } catch (e) { }

        const modelNode = Object.values(workflowData).find(n =>
            n._meta?.title === 'Checkpoint' || n._meta?.title === 'Model'
        );
        const currentWorkflowModel = modelNode?.inputs?.ckpt_name || modelNode?.inputs?.unet_name || modelNode?.inputs?.model_name;

        const toolSettings = getToolComfySettings(toolName);

        // Pre-selection logic
        if (!toolSettings.model && currentWorkflowModel) {
            toolSettings.model = currentWorkflowModel.replace(/\\/g, '/');
        }
        if (models && models.length > 0) {
            if (!toolSettings.model || !models.includes(toolSettings.model)) {
                const baseName = toolSettings.model ? toolSettings.model.split('/').pop().toLowerCase() : '';
                const match = models.find(m => m && m.toLowerCase().endsWith('/' + baseName) || m.toLowerCase() === baseName);
                toolSettings.model = match || models[0];
            }
        }
        if (!toolSettings.upscaleModel && workflow?.dependencies) {
            const defaultUpscaler = workflow.dependencies.find(d => d.type === 'upscale_model')?.name;
            if (defaultUpscaler) toolSettings.upscaleModel = defaultUpscaler;
        }

        container.innerHTML = '';

        // ── Base Model ──
        const modelRow = document.createElement('div');
        modelRow.className = 'lora-row';
        modelRow.style.marginBottom = '1.5rem';
        modelRow.innerHTML = `
            <div class="lora-row-label">Base Model</div>
            <div style="flex:1; min-width: 0;" id="modelDropdownContainer"></div>
        `;
        container.appendChild(modelRow);
        MpiDropdown.mount(modelRow.querySelector('#modelDropdownContainer'), {
            titles: models,
            label: toolSettings.model || 'Select Model...',
            position: 'bottom'
        }).on('select', (data) => { toolSettings.model = data.value; });

        // ── Upscale Model (upscaler tool only) ──
        if (workflow?.type === 'upscaler' || toolName === 'upscaler') {
            const upscaleRow = document.createElement('div');
            upscaleRow.className = 'lora-row';
            upscaleRow.style.marginBottom = '1.5rem';
            upscaleRow.innerHTML = `
                <div class="lora-row-label">Upscale Model</div>
                <div style="flex:1; min-width: 0;" id="upscaleDropdownContainer"></div>
            `;
            container.appendChild(upscaleRow);
            MpiDropdown.mount(upscaleRow.querySelector('#upscaleDropdownContainer'), {
                titles: upscalers,
                label: toolSettings.upscaleModel || 'Select Upscaler...',
                position: 'bottom'
            }).on('select', (data) => { toolSettings.upscaleModel = data.value; });
        }

        // ── LoRA Stack (6 slots) ──
        const loraHeader = document.createElement('div');
        loraHeader.className = 'model-provision-header';
        loraHeader.style.marginBottom = '1rem';
        loraHeader.innerHTML = '<span class="model-provision-name">LoRA Stack</span>';
        container.appendChild(loraHeader);

        for (let i = 0; i < 6; i++) {
            const loraRow = document.createElement('div');
            loraRow.className = 'lora-row';
            const lorasArr = toolSettings.loras || [];
            const currentLora = lorasArr[i] || { name: null, modelStrength: 1.0, clipStrength: 1.0 };

            loraRow.innerHTML = `
                <div class="lora-row-label">Slot ${i + 1}</div>
                <div class="strength-control">
                    <label>Model</label>
                    <input type="number" step="0.01" class="mpi-number-lite" id="lora-m-strength" value="${(currentLora.modelStrength || 1.0).toFixed(2)}">
                </div>
                <div class="strength-control">
                    <label>Clip</label>
                    <input type="number" step="0.01" class="mpi-number-lite" id="lora-c-strength" value="${(currentLora.clipStrength || 1.0).toFixed(2)}">
                </div>
                <div style="flex:1; min-width: 0;" id="loraDropdownContainer"></div>
            `;
            container.appendChild(loraRow);

            const mInput = loraRow.querySelector('#lora-m-strength');
            const cInput = loraRow.querySelector('#lora-c-strength');
            mInput.addEventListener('input', (e) => { toolSettings.loras[i].modelStrength = parseFloat(e.target.value); });
            cInput.addEventListener('input', (e) => { toolSettings.loras[i].clipStrength = parseFloat(e.target.value); });

            MpiDropdown.mount(loraRow.querySelector('#loraDropdownContainer'), {
                titles: loras,
                label: currentLora.name || 'None',
                position: 'bottom'
            }).on('select', (data) => { toolSettings.loras[i].name = (data.value === 'None' ? null : data.value); });
        }

        state.activeSubPage = { toolName, isManual: true };

    } catch (err) {
        console.error('[provisioning] Failed to load Advanced Settings:', err);
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--danger);">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 1rem;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p>Failed to load settings. Please ensure ComfyUI is running.</p>
                <small style="opacity: 0.7;">${err.message}</small>
            </div>
        `;
    }
}

// ── Close / Restore ────────────────────────────────────────────────────────────

/**
 * Closes the active sub-page (Provisioning or Advanced Settings) and returns
 * to the tool or previous page.
 *
 * @param {string} toolName
 * @param {boolean} [isManual=false] — if true, returns to the tool; otherwise navigates back
 */
export function closeActiveSubPage(toolName, isManual = false) {
    if (state.currentPage === PAGE_TOOL) {
        import('./projectManager.js').then(m => {
            m.updateProject({ toolComfySettings: state.toolComfySettings });
        });
    }

    if (isManual) {
        _loadToolInternal(toolName);
    } else {
        const page = state.previousPage || 'landing';
        const params = state.previousParams || {};
        navigate(page, params);
    }
    state.activeSubPage = null;
}
