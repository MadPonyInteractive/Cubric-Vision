/**
 * promptBuilder.js — Logic for the new Prompt Builder tool (Stage 11).
 * Handles modular prompt construction, reordering, and synthesis.
 */

import { state } from '../state.js';
import { els, refreshElems } from '../elements.js';
import { loadGuide, buildDynamicForm, getFormAnswers } from '../formBuilder.js';
import { saveTemplate, loadTemplates, loadTemplateSelection, deletePreset } from '../templateManager.js';
import { navigate, PAGE_TOOL } from '../router.js';

import { PromptBox } from '../components/PromptBox.js';

// Internal State for the Prompt Builder
let promptBox;
let pbState = {
    addedTools: [], // Array of { id, toolId, name, text, formValues }
    activeToolIndex: -1,
    draggedIndex: -1,
    currentEditingToolId: "",
    currentEditingToolName: "", // Store the human-readable name
    fullGuide: null // Store the full fetched guide to avoid corruption
};

/**
 * Initialize the Prompt Builder tool.
 */
export async function initPromptBuilder() {
    refreshElems();
    setupPBEventListeners();

    // Load global presets
    loadTemplates('pb_global_presets', els.pbGlobalTemplateSelector);

    // Initial UI state
    renderAddedTools();

    if (pbState.addedTools.length === 0) {
        if (els.pbEmptyFormState) els.pbEmptyFormState.classList.remove('hide');
        if (els.pbToolEditorContainer) els.pbToolEditorContainer.classList.add('hide');

        // Show the prompt box
        if (els.pbPromptGroup) {
            els.pbPromptGroup.classList.add('active'); // Ensure proper visibility if needed
        }
    }

    promptBox = new PromptBox({
        toolId: 'promptBuilder',
        container: document.getElementById('pb-prompt-wrapper'),
        readonly: true
    });
}

function setupPBEventListeners() {
    // Tool selection dropdown - Using Event Delegation on the container
    if (els.pbPromptGroup) {
        els.pbPromptGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('#pb-toolSelectBtn');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                if (els.pbToolMenu) {
                    els.pbToolMenu.classList.toggle('hide');
                }
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (els.pbToolMenu && !els.pbToolMenu.classList.contains('hide') && !e.target.closest('.pb-tool-selector-wrapper')) {
            els.pbToolMenu.classList.add('hide');
        }
    });

    // Menu item selection (Event Delegation)
    if (els.pbToolMenu) {
        els.pbToolMenu.onclick = async (e) => {
            const item = e.target.closest('.pb-menu-item');
            if (item) {
                const toolId = item.dataset.id;
                const toolName = item.textContent;
                await selectTool(toolId, toolName);
                els.pbToolMenu.classList.add('hide'); // Auto-close
            }
        };
    }

    // View Combined Prompt button (Repurposed from Submit)
    if (els.pbSubmitBtn) {
        els.pbSubmitBtn.onclick = () => {
            showFinalPromptOverlay();
        };
    }

    // Overlay buttons
    if (els.pbCloseOverlayBtn) {
        els.pbCloseOverlayBtn.onclick = () => {
            els.pbViewPromptOverlay.classList.add('hide');
        };
    }

    if (els.pbOverlayCopyBtn) {
        els.pbOverlayCopyBtn.onclick = () => {
            const text = els.pbFinalPromptTextarea.value;
            navigator.clipboard.writeText(text);
        };
    }

    if (els.pbOverlayGenerateBtn) {
        els.pbOverlayGenerateBtn.onclick = () => {
            const text = els.pbFinalPromptTextarea.value;
            // Send to Generator
            state.generatorPrompt = text;
            navigate(PAGE_TOOL, { name: 'generator' });
            // Close overlay
            els.pbViewPromptOverlay.classList.add('hide');
        };
    }

    // Global Presets
    if (els.pbGlobalSaveTemplateBtn) {
        els.pbGlobalSaveTemplateBtn.onclick = () => {
            saveTemplate('pb_global_presets', els.pbGlobalTemplateSelector, {
                addedTools: [...pbState.addedTools]
            });
        };
    }
    if (els.pbGlobalTemplateSelector) {
        els.pbGlobalTemplateSelector.onchange = (e) => {
            loadTemplateSelection(e, 'pb_global_presets', (data) => {
                pbState.addedTools = data.addedTools || [];
                pbState.activeToolIndex = -1; // Reset selection
                renderAddedTools();
                updateGlobalPromptBox();
                // Close editor if open
                els.pbToolEditorContainer.classList.add('hide');
                els.pbEmptyFormState.classList.remove('hide');
            });
        };
    }
    if (els.pbGlobalDeleteTemplateBtn) {
        els.pbGlobalDeleteTemplateBtn.onclick = () => {
            deletePreset('pb_global_presets', els.pbGlobalTemplateSelector);
        };
    }

    // Tool Presets
    if (els.pbToolSaveTemplateBtn) {
        els.pbToolSaveTemplateBtn.onclick = () => {
            if (!pbState.currentEditingToolId) return;
            saveTemplate('pb_tool_presets_' + pbState.currentEditingToolId, els.pbToolTemplateSelector);
        };
    }
    if (els.pbToolTemplateSelector) {
        els.pbToolTemplateSelector.onchange = (e) => {
            loadTemplateSelection(e, 'pb_tool_presets_' + pbState.currentEditingToolId, (data) => {
                state.g_formValues = data.formValuesCache || {};
                const originalContainer = els.dynamicFormContainer;
                els.dynamicFormContainer = els.pbDynamicForm;
                buildDynamicForm();
                els.dynamicFormContainer = originalContainer;
                updateCurrentToolPreview(); // Trigger real-time update
            });
        };
    }
    if (els.pbToolDeleteTemplateBtn) {
        els.pbToolDeleteTemplateBtn.onclick = () => {
            deletePreset('pb_tool_presets_' + pbState.currentEditingToolId, els.pbToolTemplateSelector);
        };
    }

    // Real-time Form Listener
    if (els.pbDynamicForm) {
        ['input', 'change'].forEach(evt => {
            els.pbDynamicForm.addEventListener(evt, () => {
                updateCurrentToolPreview();
            });
        });
    }

    // Sync prompt box back to Text tool if active
    if (promptBox && promptBox.inputEl) {
        promptBox.inputEl.addEventListener('input', () => {
            const tool = pbState.addedTools[pbState.activeToolIndex];
            if (tool && tool.toolId === 'text_') {
                // Sync to form input element if it's currently rendered
                // This ensures updateCurrentToolPreview & getFormAnswers pick it up
                const contentEl = document.getElementById('dyn_text_content');
                if (contentEl) contentEl.value = promptBox.inputEl.value;

                // Trigger real-time save to current tool layer
                updateCurrentToolPreview(true); // true = skip setting value back to box (avoids cursor skip)
            }
        });
    }
}

/**
 * Select a tool from the dropdown to edit its form.
 */
export async function selectTool(toolId, toolName, existingData = null) {
    if (!existingData) {
        // AUTO-ADD: Create a new layer immediately
        const newTool = {
            id: Date.now(),
            toolId: toolId,
            name: toolName,
            text: "",
            formValues: {}
        };
        pbState.addedTools.push(newTool);
        existingData = newTool;
    }

    pbState.currentEditingToolId = toolId;
    pbState.currentEditingToolName = toolName;
    const guideFile = 'dev_configs/prompt_options.json';

    // Fetch the guide only once to avoid unnecessary network requests
    if (!pbState.fullGuide) {
        await loadGuide(guideFile);
        pbState.fullGuide = JSON.parse(JSON.stringify(state.g_currentGuide)); // Deep copy the full guide
    } else {
        state.g_currentGuide = JSON.parse(JSON.stringify(pbState.fullGuide)); // Restore from cache
    }

    // Filter questions for the dynamic form
    state.g_currentGuide.questions = state.g_currentGuide.questions.filter(q => q.id.startsWith(toolId));

    // Load tool-specific presets
    loadTemplates('pb_tool_presets_' + toolId, els.pbToolTemplateSelector);

    // Update state and UI
    state.g_formValues = { ...existingData.formValues };

    const originalContainer = els.dynamicFormContainer;
    els.dynamicFormContainer = els.pbDynamicForm;
    buildDynamicForm();
    els.dynamicFormContainer = originalContainer;

    // Show editor
    els.pbEmptyFormState.classList.add('hide');
    els.pbToolEditorContainer.classList.remove('hide');
    els.pbSubmitBtn.disabled = false;
    promptBox.inputEl.placeholder = `Configuring ${toolName}...`;

    pbState.activeToolIndex = pbState.addedTools.findIndex(t => t.id === existingData.id);

    // Unlock prompt box if it's a 'Text' tool
    if (toolId === 'text_') {
        promptBox.inputEl.readOnly = false;
        promptBox.inputEl.classList.add('editable');
    } else {
        promptBox.inputEl.readOnly = true;
        promptBox.inputEl.classList.remove('editable');
    }

    renderAddedTools();
    updateCurrentToolPreview(); // Trigger initial preview and save empty state

    els.pbDynamicForm.scrollTop = 0;
}

/**
 * Update the prompt box in real-time while editing a tool.
 */
function updateCurrentToolPreview(skipBoxSync = false) {
    const originalContainer = els.dynamicFormContainer;
    els.dynamicFormContainer = els.pbDynamicForm;
    const answers = getFormAnswers();
    els.dynamicFormContainer = originalContainer;

    const toolText = Object.values(answers.details).filter(Boolean).join(', ');

    if (pbState.activeToolIndex >= 0) {
        const tool = pbState.addedTools[pbState.activeToolIndex];

        // SPECIAL CASE: Text Tool
        if (tool.toolId === 'text_') {
            const title = state.g_formValues['text_title'] || 'Text';
            const content = state.g_formValues['text_content'] || '';
            tool.name = title;
            tool.text = content;
        } else {
            // AUTO-SAVE: Update the persistent state for this layer
            tool.text = toolText;
        }

        tool.formValues = { ...state.g_formValues };

        // Update the global preview box
        updateGlobalPromptBox(skipBoxSync);
        renderAddedTools(); // Re-render to show updated names
    }
}

/**
 * Render the vertical list of added tools (layers).
 */
function renderAddedTools() {
    if (!els.pbAddedToolsList) return;
    els.pbAddedToolsList.innerHTML = '';

    if (pbState.addedTools.length === 0) {
        els.pbListEmptyState.classList.remove('hide');
        return;
    } else {
        els.pbListEmptyState.classList.add('hide');
    }

    pbState.addedTools.forEach((tool, index) => {
        const item = document.createElement('div');
        item.className = 'pb-tool-item';
        if (index === pbState.activeToolIndex) item.classList.add('active');
        item.draggable = true;

        item.innerHTML = `
            <div class="pb-drag-handle">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
            </div>
            <div class="pb-tool-item-label">${tool.name}</div>
            <button class="pb-tool-item-delete" title="Remove Layer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
            </button>
        `;

        item.onclick = (e) => {
            if (e.target.closest('.pb-tool-item-delete')) return;
            selectTool(tool.toolId, tool.name, tool);
        };

        item.querySelector('.pb-tool-item-delete').onclick = (e) => {
            e.stopPropagation();
            pbState.addedTools.splice(index, 1);
            if (pbState.activeToolIndex === index) {
                pbState.activeToolIndex = -1;
                els.pbToolEditorContainer.classList.add('hide');
                els.pbEmptyFormState.classList.remove('hide');
            } else if (pbState.activeToolIndex > index) {
                pbState.activeToolIndex--;
            }
            renderAddedTools();
            updateGlobalPromptBox();
        };

        item.ondragstart = (e) => {
            pbState.draggedIndex = index;
            item.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
        };
        item.ondragend = () => {
            item.style.opacity = '1';
        };
        item.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        item.ondrop = (e) => {
            e.preventDefault();
            const from = pbState.draggedIndex;
            const to = index;
            if (from !== to) {
                const temp = pbState.addedTools[from];
                pbState.addedTools.splice(from, 1);
                pbState.addedTools.splice(to, 0, temp);

                if (pbState.activeToolIndex === from) pbState.activeToolIndex = to;
                else if (from < pbState.activeToolIndex && to >= pbState.activeToolIndex) pbState.activeToolIndex--;
                else if (from > pbState.activeToolIndex && to <= pbState.activeToolIndex) pbState.activeToolIndex++;

                renderAddedTools();
                updateGlobalPromptBox();
            }
        };

        els.pbAddedToolsList.appendChild(item);
    });
}

/**
 * Updates the prompt box at the bottom with the text of the currently selected tool.
 */
function updateGlobalPromptBox(skipValue = false) {
    let activeText = "";
    if (pbState.activeToolIndex >= 0 && pbState.addedTools[pbState.activeToolIndex]) {
        activeText = pbState.addedTools[pbState.activeToolIndex].text || "";
    }

    if (!skipValue) {
        // Only update if value changed to avoid unnecessary churn and cursor issues
        if (promptBox.inputEl.value !== activeText) {
            promptBox.inputEl.value = activeText;
        }

        // Auto-height is handled by initAutoExpand listener via 'input' event dispatch.
        // We only dispatch if script-updated (skipValue=false) to trigger the resize.
        promptBox.inputEl.dispatchEvent(new Event('input'));
    }

    // If skipValue is true, it means we are here because of a natural user 'input' event.
    // The browser already dispatched it, so initAutoExpand will catch it naturally.
    // Re-dispatching it here would cause 'Maximum call stack size exceeded'.
}

/**
 * Show the final combined prompt in an editable overlay.
 * Exported so init.js can call it via Ctrl+Enter global handler.
 */
export function showFinalPrompt() {
    showFinalPromptOverlay();
}

function showFinalPromptOverlay() {
    const combined = pbState.addedTools.map(t => t.text).filter(Boolean).join(', ');
    els.pbFinalPromptTextarea.value = combined;
    els.pbViewPromptOverlay.classList.remove('hide');
}
