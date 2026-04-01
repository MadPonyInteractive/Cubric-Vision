/**
 * jsonFormatter.js — JSON Formatter tool.
 * User pastes a prompt; tool formats it as a structured JSON object using gemma3:12b.
 * Rebuilt using Mpi Component Factory (Phase 2.2).
 */

import { state } from '../state.js';
import { getFirstAvailableModel } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { llamaGenerate } from '../llmService.js';
import { setLlmButtonState, onLlmRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

// Factory components
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { MpiPromptBox } from '../components/Compounds/MpiPromptBox/MpiPromptBox.js';

// Utils
import { Events } from '../events.js';
import { qs, on } from '../utils/dom.js';

let _abortCtrl = null;

// Component instances
let promptBox;
let formatBtn;
let copyBtn;
let toGeneratorBtn;

// DOM refs
let outputBox, loadingEl, actionsEl, resultSection;

export function initJsonFormatter() {
    _abortCtrl = null;

    // 1. Initialize Action Button (to be passed to PromptBox)
    formatBtn = MpiButton.mount(document.createElement('div'), {
        icon: 'generate',
        iconActive: 'stop',
        info: 'Format (Ctrl+Enter)',
        variant: 'primary',
        size: 'md',
        toggleable: true
    });

    formatBtn.on('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            _runFormat();
        }
    });

    // 2. Mount MpiPromptBox
    promptBox = MpiPromptBox.mount(qs('#json-prompt-wrapper'), {
        id: 'json-prompt',
        placeholder: 'Paste text to format into JSON...',
        rightA: [formatBtn]
    });

    // 3. Mount Result Section Components
    copyBtn = MpiButton.mount(qs('#json-copy-slot'), {
        icon: 'copy',
        info: 'Copy JSON',
        variant: 'secondary',
        size: 'sm'
    });

    toGeneratorBtn = MpiButton.mount(qs('#json-toGenerator-slot'), {
        text: 'Go to Generator',
        variant: 'primary',
        extraClasses: 'action-glow'
    });

    // 4. Get remaining DOM refs
    outputBox = qs('#json-output');
    loadingEl = qs('#json-loading');
    actionsEl = qs('#json-actions');
    resultSection = qs('#json-result');

    // 5. Restore saved state
    const saved = loadToolState('jsonFormatter');
    if (saved) {
        const textarea = qs('textarea', promptBox.el);
        if (saved.input && textarea) {
            textarea.value = saved.input;
        }
        if (saved.output && outputBox) {
            outputBox.value = saved.output;
            resultSection?.classList.remove('hide');
            actionsEl?.classList.remove('hide');
        }
    }

    // 6. Action Handlers
    copyBtn.on('click', () => {
        if (!outputBox.value) return;
        navigator.clipboard.writeText(outputBox.value);
        MpiToast.mount(document.body, {
            message: 'JSON copied to clipboard!',
            variant: 'success',
            duration: 2000
        });
    });

    toGeneratorBtn.on('click', () => {
        state.generatorPrompt = outputBox.value;
        navigate(PAGE_TOOL, { name: 'generator' });
    });
}

export async function _runFormat() {
    const textarea = qs('textarea', promptBox.el);
    const text = textarea?.value.trim();
    if (!text) {
        MpiToast.mount(document.body, { message: 'Please enter a prompt to format.', variant: 'warning' });
        return;
    }

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

        resultSection?.classList.remove('hide');
        actionsEl?.classList.remove('hide');

        // Save both input and output
        saveToolState('jsonFormatter', { input: text, output: outputBox.value });

        Events.emit('media:updated', { projectId: state.currentProject?.id });
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(e);
        outputBox.value = `Error: ${e.message}`;
        resultSection?.classList.remove('hide');
    } finally {
        _setLoading(false);
    }
}

function _setLoading(on) {
    state.jsonFormatterRunning = on;
    if (on) setRunningTool('jsonFormatter', 'llm');
    else clearRunningTool('llm');

    // Use toolUtils to sync the button state
    setLlmButtonState(formatBtn.el, on, 'Format (Ctrl+Enter)', 'Stop (Ctrl+Enter)');

    if (on) {
        loadingEl?.classList.remove('hide');
    } else {
        loadingEl?.classList.add('hide');
    }
}

export function cancelJsonFormatter() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}
