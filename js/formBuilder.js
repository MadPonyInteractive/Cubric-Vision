import { state } from './state.js';
import { els } from './elements.js';
import { MpiProgressBar } from './components/Primitives/MpiProgressBar/MpiProgressBar.js';

/* Legacy Prompt Enhancer functions removed - replaced by Prompt Builder (Stage 11) */

export async function loadGuide(guideFile) {
    try {
        const res = await fetch(`/${guideFile}`);
        if (!res.ok) throw new Error('Failed to load guide ' + guideFile);
        state.g_currentGuide = await res.json();
    } catch (e) {
        console.error(e);
        state.g_currentGuide = null;
    }
}

export function buildDynamicForm() {
    els.dynamicFormContainer.innerHTML = '';
    if (!state.g_currentGuide || !state.g_currentGuide.questions) return;

    state.g_currentGuide.questions.forEach(q => {
        const group = document.createElement('div');
        group.className = 'form-group box-section';
        if (q.id.startsWith('cam_')) group.classList.add('category-camera');
        else if (q.id.startsWith('shot_')) group.classList.add('category-shot');
        else if (q.id.startsWith('light_')) group.classList.add('category-lighting');
        else if (q.id.startsWith('color_')) group.classList.add('category-color');
        else if (q.id.startsWith('video_')) group.classList.add('category-video');

        const label = document.createElement('label');
        label.textContent = q.label;
        label.htmlFor = `dyn_${q.id}`;
        group.appendChild(label);

        let containerEl;
        if (q.type === 'shots') {
            containerEl = document.createElement('div');
            containerEl.className = 'shot-manager';
            containerEl.id = `dyn_${q.id}`;
            containerEl.dataset.key = q.id;
            const shotList = document.createElement('div');
            shotList.className = 'shot-list';
            containerEl.appendChild(shotList);
            const addBtn = document.createElement('button');
            addBtn.className = 'btn secondary add-shot-btn';
            addBtn.textContent = 'Add Shot';
            addBtn.type = 'button';
            addBtn.onclick = () => addShotRow(shotList, null, q.options);
            containerEl.appendChild(addBtn);
            group.appendChild(containerEl);
        } else if (q.type === 'choice') {
            containerEl = document.createElement('div');
            containerEl.dataset.key = q.id;
            containerEl.dataset.type = 'choice';

            // Ensure 'None' exists and remove 'Any'
            let options = q.options.filter(o => o !== 'Any');
            if (!options.includes('None')) options.unshift('None');

            if (options.length <= 10) {
                containerEl.className = 'radio-group-horizontal small wrap';
                options.forEach(optStr => {
                    const labelWrap = document.createElement('label');
                    labelWrap.className = 'radio-card compact';
                    labelWrap.innerHTML = `<input type="radio" name="dyn_${q.id}" value="${optStr}" ${optStr === 'None' ? 'checked' : ''}>
                                           <div class="card-content">${optStr}</div>`;
                    containerEl.appendChild(labelWrap);
                });
            } else {
                containerEl.className = 'dropdown-wrapper';
                const sel = document.createElement('select');
                sel.className = 'dyn-select';
                options.forEach(optStr => {
                    const option = document.createElement('option');
                    option.value = optStr;
                    option.textContent = optStr;
                    if (optStr === 'None') option.selected = true;
                    sel.appendChild(option);
                });
                containerEl.appendChild(sel);
            }
            group.appendChild(containerEl);
        } else if (q.type === 'textarea') {
            containerEl = document.createElement('textarea');
            containerEl.id = `dyn_${q.id}`;
            containerEl.dataset.key = q.id;
            containerEl.rows = 4;
            if (q.placeholder) containerEl.placeholder = q.placeholder;
            group.appendChild(containerEl);
        } else {
            containerEl = document.createElement('input');
            containerEl.type = 'text';
            containerEl.id = `dyn_${q.id}`;
            containerEl.dataset.key = q.id;
            if (q.placeholder) containerEl.placeholder = q.placeholder;
            group.appendChild(containerEl);
        }

        els.dynamicFormContainer.appendChild(group);

        if (state.g_formValues[q.id]) {
            if (q.type === 'shots') {
                const mgr = group.querySelector('.shot-list');
                if (mgr) { mgr.innerHTML = ''; state.g_formValues[q.id].forEach(shot => addShotRow(mgr, shot, q.options)); }
            } else if (q.type === 'choice') {
                const storedVal = state.g_formValues[q.id];
                if (group.querySelector('input[type="radio"]')) {
                    group.querySelectorAll('input[type="radio"]').forEach(rb => { if (rb.value === storedVal) rb.checked = true; });
                } else if (group.querySelector('select')) {
                    group.querySelector('select').value = storedVal;
                }
            } else {
                if (containerEl) containerEl.value = state.g_formValues[q.id];
            }
        } else {
            if (q.type === 'shots') {
                const mgr = group.querySelector('.shot-list');
                if (mgr) addShotRow(mgr, null, q.options);
            }
        }
    });
}

export function addShotRow(container, initialData = null, options = null) {
    const shotCount = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'shot-row';
    const descVal = initialData ? initialData.desc : "";
    const durVal = initialData ? initialData.duration : 3;
    const angleVal = initialData ? initialData.angle : "None";
    const sizeVal = initialData ? initialData.size : "None";
    const moveVal = initialData ? initialData.move : "None";
    const speedVal = initialData ? initialData.speed : "None";

    let dropdownsHTML = '';
    if (options) {
        const createSelect = (opts, val, cls) => {
            const cleanOpts = (opts || []).filter(o => o !== 'Any');
            if (!cleanOpts.includes('None')) cleanOpts.unshift('None');
            return `<select class="dyn-select small ${cls}">${cleanOpts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
        };
        dropdownsHTML = `<div class="shot-dropdowns">
            ${createSelect(options.angles, angleVal, 'shot-angle')}
            ${createSelect(options.sizes, sizeVal, 'shot-size')}
            ${createSelect(options.movements, moveVal, 'shot-move')}
            ${createSelect(options.speeds, speedVal, 'shot-speed')}
        </div>`;
    }

    row.innerHTML = `
    <div class="shot-header">
      <span class="shot-label">Shot ${shotCount}</span>
      ${shotCount > 1 || container.children.length > 0 ? '<button type="button" class="remove-shot-btn" title="Remove Shot">−</button>' : ''}
    </div>
    <div class="shot-inputs">
      <textarea placeholder="Describe the action in this shot..." class="shot-desc dyn-select" rows="2">${descVal}</textarea>
      <div class="shot-duration-unit"></div>
      ${dropdownsHTML}
    </div>
    `;

    const sliderContainer = row.querySelector('.shot-duration-unit');
    if (sliderContainer) {
        MpiProgressBar.mount(sliderContainer, {
            prefix: 'DURATION: ',
            suffix: 's',
            min: 1,
            max: 15,
            step: 1,
            value: durVal,
            interactive: true,
            wheel: true,
            name: 'shot-duration'
        });
    }

    const removeBtn = row.querySelector('.remove-shot-btn');
    if (removeBtn) { removeBtn.onclick = () => { row.remove(); renumberShots(container); }; }
    container.appendChild(row);
}

export function renumberShots(container) {
    const rows = container.querySelectorAll('.shot-row');
    rows.forEach((row, idx) => {
        const label = row.querySelector('.shot-label');
        if (label) label.textContent = `Shot ${idx + 1}`;
    });
}

export function getFormAnswers() {
    const answers = {
        basePrompt: (els.basePrompt && els.basePrompt.value) ? els.basePrompt.value : "",
        model: 'prompt-builder',
        details: {}
    };

    if (state.g_currentGuide && state.g_currentGuide.questions) {
        const dynContainers = els.dynamicFormContainer.querySelectorAll('[data-key]');
        dynContainers.forEach(container => {
            const gKey = container.dataset.key;
            const guideQuestion = state.g_currentGuide.questions.find(q => q.id === gKey);
            const labelStr = guideQuestion ? guideQuestion.label : gKey;

            if (container.classList.contains('shot-manager')) {
                const rows = container.querySelectorAll('.shot-row');
                const shotDataPrompt = [];
                const shotDataCache = [];
                rows.forEach((row, idx) => {
                    const desc = row.querySelector('.shot-desc').value;
                    const durInput = row.querySelector('input[name="shot-duration"]');
                    const dur = durInput ? durInput.value : 5;
                    const angle = row.querySelector('.shot-angle') ? row.querySelector('.shot-angle').value : '';
                    const size = row.querySelector('.shot-size') ? row.querySelector('.shot-size').value : '';
                    const move = row.querySelector('.shot-move') ? row.querySelector('.shot-move').value : '';
                    const speed = row.querySelector('.shot-speed') ? row.querySelector('.shot-speed').value : '';
                    let parts = [desc];
                    if (angle && angle !== 'None') parts.push(`[${angle}]`);
                    if (size && size !== 'None') parts.push(`[${size}]`);
                    if (move && move !== 'None') parts.push(`[${move}]`);
                    if (speed && speed !== 'None') parts.push(`[${speed}]`);
                    const shotStr = parts.filter(Boolean).join(' - ');
                    if (shotStr) shotDataPrompt.push(`Shot ${idx + 1} — ${dur}s\n${shotStr}`);
                    shotDataCache.push({ desc, duration: dur, angle, size, move, speed });
                });
                if (shotDataPrompt.length) answers.details[labelStr] = shotDataPrompt.join('\n\n');
                state.g_formValues[gKey] = shotDataCache;
            } else if (container.dataset.type === 'choice') {
                let valStr = '';
                const checkedRadio = container.querySelector('input[type="radio"]:checked');
                if (checkedRadio) valStr = checkedRadio.value;
                else { const select = container.querySelector('select'); if (select) valStr = select.value; }
                state.g_formValues[gKey] = valStr;
                if (valStr && valStr !== 'None') {
                    let cleanLabel = labelStr.includes(':') ? labelStr.split(':')[1].trim() : labelStr;
                    answers.details[cleanLabel] = valStr;
                }
            } else {
                const valStr = container.value || '';
                state.g_formValues[gKey] = valStr;
                if (valStr && valStr !== 'None') answers.details[labelStr] = valStr;
            }
        });
    }
    return answers;
}
