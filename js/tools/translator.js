/**
 * translator.js — Translator tool.
 * User pastes a prompt; tool translates it to Chinese using gemma3:12b.
 * First-visit modal explains why Chinese prompts can be better.
 */

import { state } from '../state.js';
import { getFirstAvailableModel } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { llamaGenerate } from '../llmService.js';
import { setLlmButtonState, onLlmRunStart, setRunningTool, clearRunningTool } from '../toolUtils.js';

const FIRST_VISIT_KEY = 'mpi_translator_visited';

let _abortCtrl = null;

// DOM refs
import { PromptBox } from '../components/PromptBox.js';
let promptBox;

let translateBtn, cancelBtn, outputBox, copyBtn, toGeneratorBtn,
    loadingEl, actionsEl, firstVisitModal, dismissModalBtn, resultSection;

export function initTranslator() {
    _abortCtrl = null;

    promptBox = new PromptBox({
        toolId: 'translator',
        container: document.getElementById('trans-prompt-wrapper'),
        enableDragDrop: false
    });

    translateBtn   = document.getElementById('trans-translateBtn');
    cancelBtn      = document.getElementById('trans-cancelBtn');
    outputBox      = document.getElementById('trans-output');
    copyBtn        = document.getElementById('trans-copyBtn');
    toGeneratorBtn = document.getElementById('trans-toGeneratorBtn');
    loadingEl      = document.getElementById('trans-loading');
    actionsEl      = document.getElementById('trans-actions');
    firstVisitModal = document.getElementById('trans-firstVisitModal');
    dismissModalBtn = document.getElementById('trans-dismissModal');
    resultSection   = document.getElementById('trans-result');
    const copyInputBtn = document.getElementById('trans-copyInputBtn');

    if (!promptBox) return;

    // Restore saved state
    const saved = loadToolState('translator');
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

    // First-visit modal
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
        firstVisitModal.classList.remove('hide');
    }
    dismissModalBtn?.addEventListener('click', () => {
        localStorage.setItem(FIRST_VISIT_KEY, '1');
        firstVisitModal.classList.add('hide');
    });

    translateBtn.addEventListener('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            _runTranslate();
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

export async function _runTranslate() {
    const text = promptBox.positivePrompt.trim();
    if (!text) { alert('Please enter a prompt to translate.'); return; }

    onLlmRunStart();
    _setLoading(true);
    _abortCtrl = new AbortController();

    const system = `You are a professional translator. English to Chinese.\nKEEP block titles (VISUAL STYLE, etc.) and abbreviations (CU, WS, etc.) in English.\nReturn ONLY the translation.`;

    try {
        const data = await llamaGenerate({
            modelId: state.toolModelIds['translator'] || getFirstAvailableModel('translator')?.id || 'gemma-3-12b-it-qat',
            system,
            prompt: text,
            signal: _abortCtrl.signal
        });
        outputBox.value = cleanLLMResponse(data.response);
        outputBox.classList.remove('hide');
        if (resultSection) resultSection.classList.remove('hide');
        if (actionsEl) actionsEl.classList.remove('hide');
        saveToolState('translator', { output: outputBox.value });
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
    state.translatorRunning = on;
    if (on) setRunningTool('translator', 'llm');
    else clearRunningTool('llm');
    setLlmButtonState(translateBtn, on, 'Translate (Ctrl+Enter)', 'Stop (Ctrl+Enter)');
    if (on) {
        loadingEl.classList.remove('hide');
    } else {
        loadingEl.classList.add('hide');
    }
}
export function cancelTranslator() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}
