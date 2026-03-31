// UI helper functions: wizard navigation, tab switching, prompt display, 
// editing, and syntax highlighting.
import { state } from './state.js';
import { els } from './elements.js';

export function goToStep(step) {
    Object.values(els.steps).forEach(section => section.classList.remove('active'));
    els.steps[step].classList.add('active');
    state.g_wizardStep = step;
    if (step !== 3) cancelEdit();
}

// switchTab kept as a no-op stub so any remaining callers don't crash
export function switchTab() {}

export function toggleEdit() {
    state.g_originalText = els.finalPromptText.textContent;
    els.finalPromptEdit.value = state.g_originalText;
    els.finalPromptText.classList.add('hide');
    els.finalPromptEdit.classList.remove('hide');
    els.editBtn.classList.add('hide');
    els.editControls.classList.remove('hide');
}

export function cancelEdit() {
    els.finalPromptText.classList.remove('hide');
    els.finalPromptEdit.classList.add('hide');
    els.editBtn.classList.remove('hide');
    els.editControls.classList.add('hide');
}

// saveEdit still uses updatePromptDisplay internally
export async function saveEdit() {
    const newText = els.finalPromptEdit.value.trim();
    state.g_promptEN = newText;
    els.finalPromptText.textContent = newText;
    // Persist
    const { saveToolState } = await import('./toolState.js');
    saveToolState('promptBuilder', { generatedPrompt: newText });
    // Re-enable persistent bar
    if (newText) {
        // ... any additional logic for promptBuilder if needed
    }
    updatePromptDisplay();
    cancelEdit();
}

export function updatePromptDisplay() {
    if (els.finalPromptText) els.finalPromptText.textContent = state.g_promptEN || '';
}

export function syntaxHighlight(json) {
    if (!json) return "";
    if (typeof json !== 'string') json = JSON.stringify(json, undefined, 2);
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? 'key' : 'string';
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

export function cleanLLMResponse(raw) {
    if (!raw) return "";
    let clean = raw.trim();
    clean = clean.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    clean = clean.replace(/^```[a-z]*\n?/i, '');
    clean = clean.replace(/\n?```$/i, '');
    return clean.trim();
}

export function showImagePopup(img) {
    const overlay = document.createElement('div');
    overlay.className = 'image-popup-overlay';
    overlay.innerHTML = `
        <div class="image-popup-content">
            <button class="image-popup-close">×</button>
            <img src="${img.url}" class="image-popup-img">
            <div class="image-popup-footer">
                <span class="image-popup-name">${img.name}</span>
                <a href="${img.url}" download="${img.name}" class="btn primary small">Download</a>
            </div>
        </div>
    `;
    overlay.querySelector('.image-popup-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

/**
 * Initializes auto-expanding behavior for a textarea.
 * @param {HTMLTextAreaElement} textarea 
 */
export function initAutoExpand(textarea) {
    if (!textarea) return;

    const adjustHeight = () => {
        textarea.style.height = 'auto';
        // Clamp height between initial and 35% of the viewport height
        const maxHeight = window.innerHeight * 0.35;
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = newHeight + 'px';
        
        // Handle scrollbar visibility
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    textarea.addEventListener('input', adjustHeight);
    
    // Initial adjustment (for restored state)
    // Use a small timeout to ensure scrollHeight is calculated correctly
    setTimeout(adjustHeight, 0);

    // Also adjust on window resize
    window.addEventListener('resize', adjustHeight);
}

/**
 * Centrally managed seed generation logic (Stage 12.5)
 */
export function generateSeed() {
    return Math.floor(Math.random() * 100000000000000);
}

/**
 * Universal Mouse Wheel Value Control (Stage 12.6)
 * Handles both range sliders and number inputs.
 */
export function setupWheelControl(el, e) {
    if (!el || (el.type !== 'range' && el.type !== 'number')) return;
    
    // Determine increment
    let step = parseFloat(el.getAttribute('step')) || 1;
    if (el.type === 'range' && !el.getAttribute('step')) {
        const max = parseFloat(el.max) || 100;
        const min = parseFloat(el.min) || 0;
        if (max - min <= 1) step = 0.01;
        else if (max - min <= 10) step = 0.1;
    }

    // Special case for Seeds or large numbers: slightly larger steps on wheel
    if (el.id?.includes('seed') || el.classList.contains('seed-input')) {
        step = 1; // Always 1 for seeds
    }

    const direction = e.deltaY < 0 ? 1 : -1;
    let val = parseFloat(el.value) || 0;
    
    val += step * direction;

    // Clamp
    const min = (el.getAttribute('min') !== null && el.min !== "") ? parseFloat(el.min) : -Infinity;
    const max = (el.getAttribute('max') !== null && el.max !== "") ? parseFloat(el.max) : Infinity;
    
    if (val < min) val = min;
    if (val > max) val = max;

    // Formatting
    const stepStr = step.toString();
    const decimals = stepStr.indexOf('.') !== -1 ? stepStr.split('.')[1].length : 0;
    el.value = val.toFixed(decimals);
    
    // Trigger input event for reactive updates
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
