import { state } from '../state.js';
import { getFirstAvailableModel } from '../modelManager.js';
import { cleanLLMResponse } from '../uiHelpers.js';
import { navigate, PAGE_TOOL } from '../router.js';
import { saveToolState, loadToolState } from '../toolState.js';
import { llamaGenerate } from '../llmService.js';
import { onLlmRunStart, setLlmButtonState, setRunningTool, clearRunningTool } from '../toolUtils.js';

// Factory components
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiPromptBox } from '../components/Compounds/MpiPromptBox/MpiPromptBox.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';

// Utils
import { Events } from '../events.js';
import { qs, on } from '../utils/dom.js';

const FIRST_VISIT_KEY = 'mpi_translator_visited';

let _abortCtrl = null;

// Component instances
let promptBox;
let translateBtn;
let copyBtn;
let toGeneratorBtn;

// DOM refs
let outputBox, loadingEl, firstVisitModal, dismissModalBtn, resultSection, actionsEl;

export function initTranslator() {
    _abortCtrl = null;

    // 1. Initialize Action Buttons (will be passed to PromptBox)
    translateBtn = MpiButton.mount(document.createElement('div'), {
        icon: 'translate',
        iconActive: 'stop',
        info: 'Translate (Ctrl+Enter)',
        variant: 'primary',
        size: 'md',
        toggleable: true
    });

    translateBtn.on('click', () => {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        } else {
            _runTranslate();
        }
    });

    // 2. Mount PromptBox
    promptBox = MpiPromptBox.mount(qs('#trans-prompt-wrapper'), {
        rightA: [translateBtn]
    });

    // Handle PromptBox events if needed (like Ctrl+Enter via init.js which usually targets the textarea)
    // init.js manages global shortcuts, so we don't add them here.

    // 3. Mount Result Section Buttons
    copyBtn = MpiButton.mount(qs('#trans-copy-slot'), {
        icon: 'copy',
        info: 'Copy Translation',
        variant: 'secondary',
        size: 'sm'
    });

    toGeneratorBtn = MpiButton.mount(qs('#trans-toGenerator-slot'), {
        text: 'Go to Generator',
        variant: 'primary',
        extraClasses: 'action-glow'
    });

    // 4. Get remaining DOM refs
    outputBox = qs('#trans-output');
    loadingEl = qs('#trans-loading');
    actionsEl = qs('#trans-actions');
    firstVisitModal = qs('#trans-firstVisitModal');
    dismissModalBtn = qs('#trans-dismissModal');
    resultSection = qs('#trans-result');

    // 5. Restore saved state
    const saved = loadToolState('translator');
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

    // 6. First-visit modal Logic
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
        firstVisitModal?.classList.remove('hide');
    }

    if (dismissModalBtn) {
        on(dismissModalBtn, 'click', () => {
            localStorage.setItem(FIRST_VISIT_KEY, '1');
            firstVisitModal.classList.add('hide');
        });
    }

    // 7. Result Handlers
    copyBtn.on('click', () => {
        if (!outputBox.value) return;
        navigator.clipboard.writeText(outputBox.value);
        MpiToast.mount(document.body, {
            message: 'Translation copied to clipboard!',
            variant: 'success',
            duration: 2000
        });
    });

    toGeneratorBtn.on('click', () => {
        state.generatorPrompt = outputBox.value;
        navigate(PAGE_TOOL, { name: 'generator' });
    });
}

export async function _runTranslate() {
    const textarea = qs('textarea', promptBox.el);
    const text = textarea?.value.trim();
    if (!text) {
        MpiToast.mount(document.body, { message: 'Please enter a prompt to translate.', variant: 'warning' });
        return;
    }

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
        resultSection?.classList.remove('hide');
        actionsEl?.classList.remove('hide');

        // Save both input and output
        saveToolState('translator', { input: text, output: outputBox.value });

        Events.emit('media:updated', { projectId: state.currentProject?.id }); // If we wanted to track any "generation"
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
    state.translatorRunning = on;
    if (on) setRunningTool('translator', 'llm');
    else clearRunningTool('llm');

    // Use toolUtils to sync the button state (handles icon swap and danger class)
    setLlmButtonState(translateBtn.el, on, 'Translate (Ctrl+Enter)', 'Stop (Ctrl+Enter)');

    if (on) {
        loadingEl?.classList.remove('hide');
    } else {
        loadingEl?.classList.add('hide');
    }
}

export function cancelTranslator() {
    if (_abortCtrl) {
        _abortCtrl.abort();
        _abortCtrl = null;
    }
}

