/**
 * jsonFormatter.js — JSON Formatter tool.
 * User pastes a prompt; tool formats it as a structured JSON object using gemma3:12b.
 */

import { state } from '../state.js';
import { getFirstAvailableModel } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { llamaGenerate } from '../llmService.js';
import { setLlmButtonState, onLlmRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

let _abortCtrl = null;

// DOM refs
import { PromptBox } from '../components/PromptBox.js';
let promptBox;

let formatBtn, cancelBtn, outputBox, copyBtn, toGeneratorBtn,
    loadingEl, actionsEl, resultSection;

export function initJsonFormatter() {
    _abortCtrl = null;

    promptBox = new PromptBox({
        toolId: 'jsonFormatter',
        container: document.getElementById('json-prompt-wrapper'),
        enableDragDrop: false
    });

    formatBtn = document.getElementById('json-formatBtn');
    cancelBtn = document.getElementById('json-cancelBtn');
    outputBox = document.getElementById('json-output');
    copyBtn = document.getElementById('json-copyBtn');
    toGeneratorBtn = document.getElementById('json-toGeneratorBtn');
    loadingEl = document.getElementById('json-loading');
    actionsEl = document.getElementById('json-actions');
    resultSection = document.getElementById('json-result');
    const copyInputBtn = document.getElementById('json-copyInputBtn');

    if (!promptBox) return;

    // Restore saved state
    const saved = loadToolState('jsonFormatter');
    if (saved) {
        if (saved.input && !promptBox.positivePrompt) {
            promptBox.inputEl.value = saved.input;
            promptBox.positivePrompt = saved.input;
        }
        if (saved.output) {
            outputBox.value = saved.output;
            if (resultSection) resultSection.classList.remove('hide');
            if (actionsEl) actionsEl.classList.remove('hide');
        }
    }

    formatBtn.addEventListener('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            _runFormat();
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(outputBox.value);
        const originalIcon = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => copyBtn.innerHTML = originalIcon, 2000);
    });

    toGeneratorBtn.addEventListener('click', () => {
        state.generatorPrompt = outputBox.value;
        navigate(PAGE_TOOL, { name: 'generator' });
    });
}

export async function _runFormat() {
    const text = promptBox.positivePrompt.trim();
    if (!text) { alert('Please enter a prompt to format.'); return; }

    onLlmRunStart();
    _setLoading(true);
    _abortCtrl = new AbortController();

    const system = `You are an expert AI prompt engineer.
Task: Convert the provided prompt text into a structured JSON object following the Nano Banana JSON blueprint.
Your final response MUST be pure JSON containing these exact top-level keys:
- "task": "generate_image"
- "style": nested object with "primary", "rendering_quality", "surface_textures" (array), "lighting" (object)
- "technical": nested object with "camera", "resolution", "rendering", "physics"
- "subjects": array of objects detailing characters/objects, their "attributes", and "clothing"
- "environment": nested object with "location", "atmosphere", "background"
- "composition": nested object with "perspective", "framing", "placement"
- "quality": nested object with "include" (array) and "avoid" (array)

Map all details from the prompt deeply into these hierarchical objects.
Ensure proper JSON syntax with escaped quotes and commas.
Do not wrap in markdown. Return plain JSON. The output must be in English.`;

    const userPrompt = `PROMPT TO CONVERT:\n"${text}"\n\nReturn the JSON mapping.`;

    try {
        const data = await llamaGenerate({
            modelId: state.toolModelIds['jsonFormatter'] || getFirstAvailableModel('jsonFormatter')?.id || 'gemma-3-12b-it-qat',
            system,
            prompt: userPrompt,
            signal: _abortCtrl.signal
        });
        const result = cleanLLMResponse(data.response);
        // Try to pretty-print if valid JSON
        try {
            outputBox.value = JSON.stringify(JSON.parse(result), null, 2);
        } catch {
            outputBox.value = result;
        }
        outputBox.classList.remove('hide');
        if (resultSection) resultSection.classList.remove('hide');
        if (actionsEl) actionsEl.classList.remove('hide');
        saveToolState('jsonFormatter', { output: outputBox.value });
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(e);
        outputBox.value = `Error: ${e.message}`;
        outputBox.classList.remove('hide');
    } finally {
        _setLoading(false);
    }
}

function _cancel() {
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    _setLoading(false);
}

function _setLoading(on) {
    state.jsonFormatterRunning = on;
    if (on) setRunningTool('jsonFormatter', 'llm');
    else clearRunningTool('llm');
    setLlmButtonState(formatBtn, on, 'Format (Ctrl+Enter)', 'Stop (Ctrl+Enter)');
    if (on) {
        loadingEl.classList.remove('hide');
    } else {
        loadingEl.classList.add('hide');
    }
}
export function cancelJsonFormatter() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}
