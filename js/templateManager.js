// LocalStorage preset save, load, and restore logic.
import { state } from './state.js';
import { els } from './elements.js';
import { getFormAnswers, buildDynamicForm } from './formBuilder.js';

/**
 * Save a template to localStorage.
 * @param {string} storageKey - The key to use in localStorage.
 * @param {HTMLSelectElement} selector - The dropdown to update.
 * @param {object} customData - Optional data to save instead of current form.
 */
export async function saveTemplate(storageKey = 'pb_templates', selector = els.templateSelector, customData = null) {
    if (!customData) {
        getFormAnswers();
    }

    const name = await window.MpiPrompt("Enter a name for this preset:");
    if (!name) return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    saved[name] = customData || {
        formValuesCache: { ...state.g_formValues }
    };
    
    localStorage.setItem(storageKey, JSON.stringify(saved));
    alert(`Preset "${name}" saved!`);
    loadTemplates(storageKey, selector);
    
    if (selector) {
        selector.value = name;
        // Trigger change to update delete button state
        selector.dispatchEvent(new Event('change'));
    }
}

/**
 * Load template names into a selector.
 */
export function loadTemplates(storageKey = 'pb_templates', selector = els.templateSelector) {
    if (!selector) return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const defaultLabel = selector.id.includes('global') ? 'Load Global Preset...' : 
                         (selector.id.includes('tool') ? 'Tool Preset...' : 'Load Preset...');
                         
    selector.innerHTML = `<option value="">${defaultLabel}</option>`;
    Object.keys(saved).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selector.appendChild(opt);
    });
}

/**
 * Handle loading a template when selected.
 */
export async function loadTemplateSelection(e, storageKey = 'pb_templates', onLoaded = null) {
    const name = e.target.value;
    const deleteBtn = e.target.parentElement.querySelector('button[id$="DeleteTemplateBtn"]');
    
    if (deleteBtn) {
        deleteBtn.disabled = !name;
    }
    
    if (!name) return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const template = saved[name];
    if (!template) return;

    if (onLoaded) {
        onLoaded(template);
    } else {
        // Default behavior for Step 2 refinement
        state.g_formValues = template.formValuesCache || {};
        buildDynamicForm();
    }
    
    console.log(`[Templates] Loaded preset: ${name} from ${storageKey}`);
}

/**
 * Delete a selected preset.
 */
export async function deletePreset(storageKey = 'pb_templates', selector = els.templateSelector) {
    const name = selector.value;
    if (!name) return;

    if (!(await window.MpiConfirm(`Are you sure you want to delete the preset "${name}"?`))) {
        return;
    }

    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    delete saved[name];
    localStorage.setItem(storageKey, JSON.stringify(saved));
    
    alert(`Preset "${name}" deleted.`);
    loadTemplates(storageKey, selector);
}
