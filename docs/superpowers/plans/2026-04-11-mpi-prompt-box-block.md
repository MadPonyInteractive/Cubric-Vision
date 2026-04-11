# MpiPromptBox Block + State Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote MpiPromptBox from Compound to Block, make it self-composing based on active model and operation, centralize selected model ID and active operation in state, and wire all workspaces to use the new architecture cleanly.

**Architecture:**

- `MpiPromptBox` (Block) receives `model`, `modelList`, `operation` as props. It internally owns the model dropdown, operation dropdown, media drop zone, negative toggle, and dynamic sub-slots per operation/model capability. Workspaces are thin — they provide model list and handle `run`/`cancel`/`settings` events only.
- `s_selectedModelId` (state.js) is the canonical source of truth for which model is selected globally. Workspaces write to it on model-change.
- `s_activeOperation` is per-workspace local state, not global — operations differ between gallery (t2i-based) and groupHistory (upscale-based). It lives in workspace closure.
- Existing `g_selectedModel` and `g_abortControllers` in state.js are legacy and cleaned up at the end.

**Tech Stack:** Vanilla JS, ComponentFactory, Events Bus, state.js Proxy

---

## File Map

### New Files
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.css` — moved from Compounds
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — promoted Block implementation
- `docs/superpowers/plans/2026-04-11-mpi-prompt-box-block.md` — this plan

### Modified Files
- `js/shell/preloadStyles.js` — move MpiPromptBox CSS from Compounds to Blocks section
- `js/components/types.js` — update MpiPromptBoxProps typedef to Block tier, add new props
- `js/state.js` — add `s_selectedModelId`, rename `g_selectedModel` → `s_selectedModelId` (migration)
- `js/workspaces/gallery/gallery.js` — adopt new MpiPromptBox Block, wire state, remove local model/op tracking
- `js/workspaces/groupHistory/groupHistory.js` — adopt new MpiPromptBox Block, wire state, remount on model-change
- `js/data/commandRegistry.js` — add `component` field to CommandDef to declare which sub-control a command needs injected
- `js/components/Compounds/MpiPromptBox/MpiPromptBox.js` — delegate to new Block (backward-compat shim, or remove after all callers updated)

---

## Phase 1: MpiPromptBox Block

### Task 1: Add `component` field to CommandDef

**Files:**
- Modify: `js/data/commandRegistry.js:24-33`

- [ ] **Step 1: Add `component` field to CommandDef typedef**

In the `@typedef {Object} CommandDef` block (line ~24), add:
```js
 * @property {string}  [component]  - Optional key for an operation-specific sub-control
 *                                   injected into MpiPromptBox's operation slot.
 *                                   Values: 'upscale' | 'motion' | 'crop' | null
```

- [ ] **Step 2: Add component declarations to each command**

In the `commands` record, add `component` to commands that need an injected control:

```js
upscale: {
    label: 'Upscale',
    mediaType: MEDIA_TYPE.IMAGE,
    requiresImages: 1,
    promptRequired: false,
    component: 'upscale',   // ← MpiPromptBox will inject upscale factor control
},
i2v: {
    label: 'Image to Video',
    mediaType: MEDIA_TYPE.VIDEO,
    requiresImages: 1,
    promptRequired: false,
    component: 'motion',    // ← MpiPromptBox will inject motion settings
},
detail: {
    label: 'Detail',
    mediaType: MEDIA_TYPE.IMAGE,
    requiresImages: 1,
    requiresMask: true,
    promptRequired: true,
    component: 'maskStrength',  // ← MpiPromptBox will inject denoise slider
},
change: {
    label: 'Change',
    mediaType: MEDIA_TYPE.IMAGE,
    requiresImages: 1,
    requiresMask: true,
    promptRequired: true,
    component: 'maskStrength',
},
remove: {
    label: 'Remove',
    mediaType: MEDIA_TYPE.IMAGE,
    requiresImages: 1,
    requiresMask: true,
    promptRequired: true,
    component: 'maskStrength',
},
```

All other commands omit `component` (or set to null).

- [ ] **Step 3: Add getCommandComponents utility**

After `getCommand` in commandRegistry.js, add:

```js
/**
 * Returns the component key for a given command, if any.
 * @param {string} key
 * @returns {string|null}
 */
export function getCommandComponent(key) {
    return commands[key]?.component ?? null;
}
```

- [ ] **Step 4: Commit**

```bash
git add js/data/commandRegistry.js
git commit -m "feat(commands): add component field to CommandDef for operation-specific PromptBox controls"
```

---

### Task 2: Create MpiPromptBox Block

**Files:**
- Create: `js/components/Blocks/MpiPromptBox/MpiPromptBox.css` — copy from Compounds version
- Create: `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`
- Modify: `js/shell/preloadStyles.js:30` — update path from Compounds to Blocks
- Modify: `js/components/types.js:200-207` — update MpiPromptBoxProps typedef

- [ ] **Step 1: Copy CSS from Compounds to Blocks**

```bash
cp js/components/Compounds/MpiPromptBox/MpiPromptBox.css js/components/Blocks/MpiPromptBox/MpiPromptBox.css
```

- [ ] **Step 2: Write the MpiPromptBox Block**

Create `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`:

```javascript
/**
 * MpiPromptBox (Block) — Self-composing prompt input with model/operation awareness.
 *
 * Owns internally: model dropdown, operation dropdown, media drop zone,
 * negative prompt toggle, expansion lock, copy button, run/stop button.
 * Injects operation-specific sub-controls dynamically based on command.component.
 *
 * Tier: Block — imports Primitives (MpiInput, MpiButton, MpiDropdown) and
 * Compounds (MpiRatioSelector for upscale).
 *
 * Props:
 * @param {import('../../data/modelRegistry.js').ModelDef|null} [model=null]
 *   Active model — drives media drop zone acceptance and operation list.
 *   If null, only a placeholder is shown (zero-installed state handled by caller).
 * @param {import('../../data/modelRegistry.js').ModelDef[]} [modelList=[]]
 *   Filtered list of available models (caller filters by installed + mediaType).
 *   Dropdown shown when length > 1.
 * @param {string} [operation='t2i'] - Active operation key.
 * @param {string} [value='']         - Initial positive prompt text.
 * @param {string} [negativeValue=''] - Initial negative prompt text.
 * @param {boolean} [includeNegative=false] - Show negative prompt toggle.
 * @param {boolean} [showSettings=true] - Show gear button next to model selector.
 * @param {boolean} [generating=false] - Initial generating state (syncs run/stop button).
 * @param {Object} [context={}]       - Runtime context for operation availability:
 *                                      { imageCount, videoCount, hasMask }
 *
 * Instance API (on instance.el):
 *   el.imageCount    {number}
 *   el.videoCount    {number}
 *   el.getMediaItems()
 *   el.clearMedia()
 *   el.setOperation(key)
 *   el.setGenerating(bool)
 *
 * Emits:
 *   'model-change'  { model }
 *   'operation-change' { operation }
 *   'media-change'  { imageCount, videoCount, items }
 *   'run'           { operation, positive, negative, mediaItems }
 *   'cancel'        {}
 *   'settings'      { model }
 */

import { ComponentFactory } from '../../factory.js';
import { MpiInput }    from '../Primitives/MpiInput/MpiInput.js';
import { MpiButton }   from '../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRatioSelector } from '../Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';
import { commands, getAvailableCommands, getCommandComponent } from '../../../data/commandRegistry.js';

export const MpiPromptBox = ComponentFactory.create({
    name: 'MpiPromptBox',
    css: ['js/components/Blocks/MpiPromptBox/MpiPromptBox.css'],

    template: (props) => `
        <div class="mpi-prompt-box">
            <div class="mpi-prompt-box__lock-container" id="expand-lock-slot"></div>

            <div class="mpi-prompt-box__media-zone" id="media-zone">
                <div class="mpi-prompt-box__media-chips" id="media-chips"></div>
                <div class="mpi-prompt-box__drop-hint" id="drop-hint">
                    <span class="mpi-prompt-box__drop-hint-icon">${renderIcon('media', 'sm')}</span>
                    <span class="mpi-prompt-box__drop-hint-text"></span>
                </div>
            </div>

            <div class="mpi-prompt-box__prompts">
                <div id="textarea-slot" class="mpi-prompt-box__main-textarea"></div>
                <div class="mpi-prompt-box__copy-wrapper" id="copy-btn-slot"></div>
            </div>

            <div class="mpi-prompt-box__separator"></div>

            <div class="mpi-prompt-box__bottom">
                <div class="mpi-prompt-box__area mpi-prompt-box__area--left"    id="bottom-left-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--center"  id="bottom-center-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--right"   id="bottom-right-slot"></div>
                <div class="mpi-prompt-box__area mpi-prompt-box__area--bottom"  id="bottom-bottom-slot"></div>
            </div>
        </div>
    `,

    setup: (el, props, emit) => {
        // ── Core state ──────────────────────────────────────────────────────────
        let isNegativeMode   = false;
        let positiveValue    = props.value        || '';
        let negativeValue    = props.negativeValue || '';
        let activeOperation  = props.operation    || 't2i';
        let isGenerating     = props.generating   || false;
        let _context         = props.context       || { imageCount: 0, videoCount: 0, hasMask: false };

        const model = props.model || null;
        const modelList = props.modelList || [];

        const acceptsImage = model
            ? model.supportedOps.some(op => (commands[op]?.requiresImages ?? 0) >= 1)
            : false;
        const acceptsVideo = model
            ? model.supportedOps.some(op => (commands[op]?.requiresVideo  ?? 0) >= 1)
            : false;

        // ── Media items ─────────────────────────────────────────────────────────
        /** @type {Array<{id:string, url:string, file:File|null, mediaType:'image'|'video', source:'file'|'app'}>} */
        const _mediaItems = [];

        const mediaZone = el.querySelector('#media-zone');
        const chipsEl   = el.querySelector('#media-chips');
        const dropHint  = el.querySelector('#drop-hint');

        function _syncDropHint() {
            if (!dropHint) return;
            const empty = _mediaItems.length === 0;
            dropHint.style.display = empty ? '' : 'none';
            if (empty) {
                const parts = [];
                if (acceptsImage) parts.push('image');
                if (acceptsVideo) parts.push('video');
                dropHint.querySelector('.mpi-prompt-box__drop-hint-text').textContent =
                    `Drop ${parts.join(' or ')} here`;
            }
            mediaZone.classList.toggle('mpi-prompt-box__media-zone--has-media', !empty);
        }

        function _addChip(item) {
            const chip = document.createElement('div');
            chip.className = 'mpi-prompt-box__media-chip';
            chip.dataset.id = item.id;
            chip.innerHTML = item.mediaType === 'image'
                ? `<img src="${item.url}" class="mpi-prompt-box__chip-thumb" alt="">
                   <button class="mpi-prompt-box__chip-remove" title="Remove">${renderIcon('close', 'xs')}</button>`
                : `<div class="mpi-prompt-box__chip-video-thumb">${renderIcon('video', 'sm')}</div>
                   <button class="mpi-prompt-box__chip-remove" title="Remove">${renderIcon('close', 'xs')}</button>`;
            chip.querySelector('.mpi-prompt-box__chip-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                _removeItem(item.id);
            });
            chipsEl.appendChild(chip);
        }

        function _removeItem(id) {
            const idx = _mediaItems.findIndex(m => m.id === id);
            if (idx === -1) return;
            const item = _mediaItems.splice(idx, 1)[0];
            if (item.source === 'file') URL.revokeObjectURL(item.url);
            chipsEl.querySelector(`[data-id="${id}"]`)?.remove();
            _syncDropHint();
            _emitMediaChange();
        }

        function _emitMediaChange() {
            el.imageCount = _mediaItems.filter(m => m.mediaType === 'image').length;
            el.videoCount = _mediaItems.filter(m => m.mediaType === 'video').length;
            emit('media-change', { imageCount: el.imageCount, videoCount: el.videoCount, items: [..._mediaItems] });
        }

        function _tryAddMedia({ url, file, mediaType, source }) {
            const existing = _mediaItems.find(m => m.mediaType === mediaType);
            if (existing) _removeItem(existing.id);
            const item = { id: crypto.randomUUID(), url, file: file || null, mediaType, source };
            _mediaItems.push(item);
            _addChip(item);
            _syncDropHint();
            _emitMediaChange();
        }

        // ── Drop zone events ─────────────────────────────────────────────────────
        if (mediaZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
                el.addEventListener(ev, e => e.preventDefault())
            );
            el.addEventListener('dragenter',  () => mediaZone.classList.add('mpi-prompt-box__media-zone--drag-over'));
            el.addEventListener('dragover',   () => mediaZone.classList.add('mpi-prompt-box__media-zone--drag-over'));
            el.addEventListener('dragleave', (e) => {
                if (!el.contains(e.relatedTarget)) mediaZone.classList.remove('mpi-prompt-box__media-zone--drag-over');
            });
            el.addEventListener('drop', (e) => {
                mediaZone.classList.remove('mpi-prompt-box__media-zone--drag-over');
                const appData = e.dataTransfer.getData('application/mpi-media');
                if (appData) {
                    try {
                        const { filePath, type } = JSON.parse(appData);
                        if (type === 'image' && !acceptsImage) return;
                        if (type === 'video' && !acceptsVideo) return;
                        _tryAddMedia({ url: filePath, file: null, mediaType: type, source: 'app' });
                    } catch { /* malformed */ }
                    return;
                }
                const file = e.dataTransfer.files[0];
                if (!file) return;
                const mediaType = file.type.startsWith('image/') ? 'image'
                                : file.type.startsWith('video/') ? 'video'
                                : null;
                if (!mediaType) return;
                if (mediaType === 'image' && !acceptsImage) return;
                if (mediaType === 'video' && !acceptsVideo) return;
                _tryAddMedia({ url: URL.createObjectURL(file), file, mediaType, source: 'file' });
            });
            _syncDropHint();
        }

        // ── Public API ──────────────────────────────────────────────────────────
        el.imageCount    = 0;
        el.videoCount    = 0;
        el.getMediaItems = () => [..._mediaItems];
        el.clearMedia    = () => [..._mediaItems].forEach(m => _removeItem(m.id));
        el.setOperation  = (key) => {
            activeOperation = key;
            _refreshOpDropdown();
            _refreshOpSlot();
        };
        el.setGenerating = (active) => {
            isGenerating = active;
            runBtn.el.classList.toggle('is-active', active);
        };

        // ── Radial menu → operation sync ─────────────────────────────────────────
        const _onSetOperation = ({ operation }) => {
            const opts = _buildOpOptions();
            const match = opts.find(o => o.value === operation && !o.disabled);
            if (match) {
                activeOperation = operation;
                _refreshOpDropdown();
                _refreshOpSlot();
            }
        };
        Events.on('workspace:set-operation', _onSetOperation);

        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                Events.off('workspace:set-operation', _onSetOperation);
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });

        // ── Textarea ─────────────────────────────────────────────────────────────
        const mainInput = MpiInput.mount(el.querySelector('#textarea-slot'), {
            type: 'textarea',
            placeholder: 'Type your prompt...',
            value: positiveValue,
        });
        const textareaEl = mainInput.el.querySelector('textarea');

        const updateHeight = () => {
            textareaEl.style.height = 'auto';
            textareaEl.style.height = Math.min(Math.max(textareaEl.scrollHeight, 56), 224) + 'px';
        };
        textareaEl.addEventListener('input', () => {
            if (isNegativeMode) negativeValue = textareaEl.value;
            else positiveValue = textareaEl.value;
            emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
        });
        setTimeout(updateHeight, 0);

        // ── Expansion lock ──────────────────────────────────────────────────────
        MpiButton.mount(el.querySelector('#expand-lock-slot'), {
            icon: 'chevronDown', iconActive: 'chevronUp',
            info: 'Toggle Expanding Height',
            size: 'sm', variant: 'ghost', toggleable: true, active: false,
        }).on('click', (data) => {
            textareaEl.style.height = data.active ? 'auto' : '3.5rem';
        });

        // ── Copy button ─────────────────────────────────────────────────────────
        MpiButton.mount(el.querySelector('#copy-btn-slot'), {
            icon: 'copy', variant: 'ghost', size: 'sm', info: 'Copy current Text to Clipboard',
        }).on('click', () => {
            navigator.clipboard.writeText(textareaEl.value);
            emit('copy', { text: textareaEl.value });
        });

        // ── Operation dropdown (center slot) ────────────────────────────────────
        function _buildOpOptions() {
            if (!model) return [];
            return getAvailableCommands(model.mediaType, model, _context)
                .map(cmd => ({ value: cmd.key, label: cmd.label, disabled: !cmd.available }));
        }

        let _opDropdown = null;
        let _opSlot = null;

        function _refreshOpDropdown() {
            if (!_opDropdown) return;
            const opts = _buildOpOptions();
            const currentStillOk = opts.find(o => o.value === activeOperation && !o.disabled);
            if (!currentStillOk) {
                const fallback = opts.find(o => !o.disabled);
                if (fallback) activeOperation = fallback.value;
            }
            _opDropdown.el.setOptions(opts, activeOperation);
        }

        // ── Operation sub-slot (bottom slot, injected per command.component) ─────
        function _refreshOpSlot() {
            const slot = el.querySelector('#bottom-bottom-slot');
            if (!slot) return;
            slot.innerHTML = '';
            const component = getCommandComponent(activeOperation);
            if (component === 'upscale') {
                const ratio = MpiRatioSelector.mount(document.createElement('div'), {
                    modelType: model?.id?.includes('sdxl') ? 'sdxl' : 'flux',
                    value: '1x',
                });
                slot.appendChild(ratio.el);
            }
            // Other components (motion, maskStrength, etc.) — added in future phases
        }

        if (model) {
            _opDropdown = MpiDropdown.mount(document.createElement('div'), {
                options:    _buildOpOptions(),
                value:      activeOperation,
                info:       'Generation operation',
                direction:  'up',
            });
            _opDropdown.on('change', ({ value }) => {
                activeOperation = value;
                _refreshOpSlot();
                emit('operation-change', { operation: activeOperation });
            });
            el.querySelector('#bottom-center-slot').appendChild(_opDropdown.el);
            _refreshOpSlot();
        }

        // ── Model selector + gear (left slot) ───────────────────────────────────
        if (model) {
            const leftSlot = el.querySelector('#bottom-left-slot');

            if (modelList.length > 1) {
                const modelDropdown = MpiDropdown.mount(document.createElement('div'), {
                    options:   modelList.map(m => ({ value: m.id, label: m.name })),
                    value:     model.id,
                    info:      'Active model',
                    direction: 'up',
                });
                modelDropdown.on('change', ({ value }) => {
                    const selected = modelList.find(m => m.id === value);
                    if (selected) emit('model-change', { model: selected });
                });
                leftSlot.appendChild(modelDropdown.el);
            }

            if (props.showSettings !== false) {
                const gearBtn = MpiButton.mount(document.createElement('div'), {
                    icon: 'settings', variant: 'ghost', size: 'sm', info: 'Model Settings',
                });
                gearBtn.on('click', () => emit('settings', { model }));
                leftSlot.appendChild(gearBtn.el);
            }
        }

        // ── Negative mode toggle ────────────────────────────────────────────────
        if (props.includeNegative) {
            MpiButton.mount(el.querySelector('#bottom-center-slot'), {
                icon: 'check', iconActive: 'negative',
                info: 'Switch between Positive and Negative Prompt',
                size: 'sm', variant: 'primary', toggleable: true, active: isNegativeMode,
            }).on('click', (data) => {
                isNegativeMode = data.active;
                textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
                textareaEl.placeholder = isNegativeMode ? 'Type negative prompt...' : 'Type your prompt...';
                emit('mode-change', { mode: isNegativeMode ? 'negative' : 'positive' });
            });
        }

        // ── Run / Stop button ────────────────────────────────────────────────────
        const runBtnSlot = document.createElement('div');
        el.querySelector('#bottom-right-slot').appendChild(runBtnSlot);
        const runBtn = MpiButton.mount(runBtnSlot, {
            icon: 'play', iconActive: 'stop',
            info: 'Generate / Stop',
            size: 'md', variant: 'primary',
            toggleable: true, active: isGenerating,
        });
        runBtn.on('toggle', (data) => {
            if (data.active) {
                isGenerating = true;
                emit('run', {
                    operation:  activeOperation,
                    positive:   positiveValue,
                    negative:   negativeValue,
                    mediaItems: el.getMediaItems(),
                });
            } else if (isGenerating) {
                isGenerating = false;
                emit('cancel', {});
            }
        });

        // ── Context update API (called by workspace on media-change) ─────────────
        el.updateContext = (ctx) => {
            _context = ctx;
            _refreshOpDropdown();
        };
    }
});
```

- [ ] **Step 3: Register CSS in preloadStyles.js**

Move `MpiPromptBox.css` entry from Compounds section to Blocks section in `js/shell/preloadStyles.js`:

From line 30 (Compounds section), remove:
```js
'js/components/Compounds/MpiPromptBox/MpiPromptBox.css',
```

Add to Blocks section (after line 55):
```js
'js/components/Blocks/MpiPromptBox/MpiPromptBox.css',
```

- [ ] **Step 4: Update MpiPromptBoxProps typedef in types.js**

Replace the existing `MpiPromptBoxProps` typedef (line ~200) with:

```js
/**
 * @typedef {Object} MpiPromptBoxProps (Block — js/components/Blocks/MpiPromptBox)
 * @property {import('./data/modelRegistry.js').ModelDef|null} [model=null]
 * @property {import('./data/modelRegistry.js').ModelDef[]} [modelList=[]]
 * @property {string} [operation='t2i']
 * @property {string} [value='']
 * @property {string} [negativeValue='']
 * @property {boolean} [includeNegative=false]
 * @property {boolean} [showSettings=true]
 * @property {boolean} [generating=false]
 * @property {Object} [context={}]
 *
 * Instance methods (on instance.el):
 *   imageCount    {number}
 *   videoCount    {number}
 *   getMediaItems()
 *   clearMedia()
 *   setOperation(key)
 *   setGenerating(bool)
 *   updateContext({ imageCount, videoCount, hasMask })
 *
 * Emits:
 *   'model-change'      { model }
 *   'operation-change'  { operation }
 *   'media-change'      { imageCount, videoCount, items }
 *   'run'               { operation, positive, negative, mediaItems }
 *   'cancel'            {}
 *   'settings'          { model }
 */
```

- [ ] **Step 5: Verify old Compound path still works (no-op if callers not updated yet)**

No callers updated yet — this is expected. The old Compound at `js/components/Compounds/MpiPromptBox/MpiPromptBox.js` still exists and is imported by existing callers. Do not remove it yet.

- [ ] **Step 6: Commit**

```bash
git add js/components/Blocks/MpiPromptBox/ js/shell/preloadStyles.js js/components/types.js js/data/commandRegistry.js
git commit -m "feat: create MpiPromptBox Block with self-composing operation slots"
```

---

## Phase 2: State Architecture

### Task 3: Add s_selectedModelId to state.js

**Files:**
- Modify: `js/state.js:22`

- [ ] **Step 1: Add s_selectedModelId to state.js**

In `js/state.js`, change:
```js
g_selectedModel: null,      // Used by navigation.js and gallery.js
```
to:
```js
s_selectedModelId: null,    // Canonical selected model ID — written by any workspace
                           // that hosts a model selector. Read by other workspaces to
                           // sync the dropdown when switching pages.
```

- [ ] **Step 2: Update navigation.js (read s_selectedModelId)**

Search for where `state.g_selectedModel` is read:

```bash
grep -n "g_selectedModel" js/shell/navigation.js
```

Read those lines and update to use `state.s_selectedModelId` + `getModelById()`.

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "feat(state): add s_selectedModelId as canonical selected model ID"
```

---

## Phase 3: Update gallery.js

**Files:**
- Modify: `js/workspaces/gallery/gallery.js`

### Task 4: Refactor gallery.js to use MpiPromptBox Block + state

- [ ] **Step 1: Read current gallery.js lines 161-240 (PromptBox section)**

The refactor targets these sections:
- Lines ~163-166: `imageModels` derivation and local `activeModel`/`activeOperation`
- Lines ~201-237: `_mountPromptBox()` function — will be replaced with direct MpiPromptBox mount
- Lines ~252-355: `promptBox.on('run')` handler
- Lines ~368-377: Radial listener — simplify since MpiPromptBox now owns operation sync internally

Key changes:
1. `modelList` is still filtered by `getModelsByType('image').filter(m => m.installed)`
2. `activeModel` is derived from `state.s_selectedModelId` via `getModelById()` — with fallback to first in filtered list
3. `_mountPromptBox()` is replaced by a direct `MpiPromptBox.mount()` call
4. `promptBox.on('model-change')` → `state.s_selectedModelId = model.id`
5. `promptBox.on('operation-change')` → local `activeOperation` var updated (no state write)
6. `promptBox.on('media-change')` → `_promptBox.el.updateContext({ imageCount, videoCount, hasMask: false })`
7. Remove `opDropdown` local var — operation dropdown is now inside MpiPromptBox
8. Radial listener is simplified — MpiPromptBox already subscribes to `workspace:set-operation`

```javascript
// NEW gallery.js PromptBox section (replace lines 161–240):

const installedImageModels = getModelsByType('image').filter(m => m.installed);

// Derive activeModel from state (canonical) with fallback to first installed
let activeModel = state.s_selectedModelId
    ? (installedImageModels.find(m => m.id === state.s_selectedModelId) || installedImageModels[0] || null)
    : (installedImageModels[0] || null);

// Ensure state is in sync on mount
if (activeModel) state.s_selectedModelId = activeModel.id;

let activeOperation = 't2i';
let imageCount = 0;
let videoCount = 0;

const promptSlot = grid.el.getPromptSlot();
let promptBox = null;

// Model settings overlay — single instance, reused across model changes
const _settingsOverlay = MpiModelSettings.mount(document.createElement('div'));

function _mountPromptBox() {
    if (!activeModel) { promptSlot.innerHTML = ''; promptBox = null; return; }

    promptSlot.innerHTML = '';
    promptBox = null;
    imageCount = 0;
    videoCount = 0;

    promptBox = MpiPromptBox.mount(promptSlot, {
        model:           activeModel,
        modelList:       installedImageModels,
        operation:       activeOperation,
        includeNegative: true,
    });

    promptBox.on('model-change', ({ model }) => {
        state.s_selectedModelId = model.id;
        activeModel = model;
        activeOperation = 't2i';
        _mountPromptBox();
    });

    promptBox.on('operation-change', ({ operation }) => {
        activeOperation = operation;
    });

    promptBox.on('settings', () => {
        _settingsOverlay.el.open({ modelId: activeModel.id });
    });

    promptBox.on('media-change', ({ imageCount: ic, videoCount: vc }) => {
        imageCount = ic;
        videoCount = vc;
        promptBox.el.updateContext({ imageCount, videoCount, hasMask: false });
        refreshRadial({ imageCount, videoCount });
    });

    promptBox.on('run', ({ operation, positive, negative, mediaItems }) => {
        const tempId = crypto.randomUUID();
        const cardType = activeModel.mediaType;

        grid.el.addGeneratingCard(tempId, cardType);
        StatusBar.progress.start('Generating...');

        const exec = runCommand({ operation, modelId: activeModel.id, positive, negative, mediaItems });

        exec.onPreview = (url) => grid.el.updatePreview(tempId, url);
        exec.onProgress = (value) => StatusBar.progress.update(value);

        exec.onComplete = async (urls) => {
            promptBox.el.setGenerating(false);
            if (!urls.length) {
                StatusBar.progress.cancel();
                grid.el.removeGeneratingCard(tempId);
                return;
            }
            let filePath = urls[0];
            let displayName = operation;
            if (state.currentProject?.folderPath) {
                try {
                    const res = await fetch('/project/save-generation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            folderPath: state.currentProject.folderPath,
                            comfyViewUrl: urls[0],
                            operation,
                            meta: { prompt: positive, negativePrompt: negative, modelId: activeModel.id },
                        }),
                    });
                    const data = await res.json();
                    if (data.success) {
                        filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                        displayName = data.filename.replace(/\.[^.]+$/, '');
                    }
                } catch (err) { console.warn('[gallery] save-generation failed:', err); }
            }
            const cardName = displayName.length > 28 ? displayName.slice(0, 27) + '…' : displayName;
            const item = createImageItem({ filePath, modelId: activeModel.id, operation, prompt: positive, negativePrompt: negative });
            let group = createItemGroup(cardType, { name: cardName });
            group = appendToHistory(group, item);
            if (state.currentProject) {
                state.currentProject = addGroupToProject(state.currentProject, group);
                _persistGroups();
            }
            StatusBar.progress.complete('Image generated!');
            grid.el.finalizeCard(tempId, group);
        };

        exec.onError = (err) => {
            promptBox.el.setGenerating(false);
            StatusBar.progress.cancel();
            grid.el.removeGeneratingCard(tempId);
            console.error('[gallery] Generation error:', err);
        };
    });

    promptBox.on('cancel', () => {
        StatusBar.progress.cancel();
    });
}

_mountPromptBox();

// Radial menu → operation sync (MpiPromptBox handles internal subscription)
// Still needed: when radial fires op change, sync the dropdown inside the box
const _onRadialOp = ({ operation }) => {
    if (!promptBox) return;
    const opts = getAvailableCommands(activeModel.mediaType, activeModel, { imageCount, videoCount });
    const match = opts.find(o => o.value === operation && !o.disabled);
    if (match) {
        activeOperation = operation;
        promptBox.el.setOperation(activeOperation);
    }
};
Events.on('workspace:set-operation', _onRadialOp);

const _observer = new MutationObserver(() => {
    if (!document.contains(container)) {
        Events.off('workspace:set-operation', _onRadialOp);
        _observer.disconnect();
    }
});
_observer.observe(document.body, { childList: true, subtree: true });
```

- [ ] **Step 2: Remove now-unused imports in gallery.js**

After the refactor, these are no longer used:
- `MpiDropdown` — operation dropdown is now inside MpiPromptBox
- `Events` — only used for radial op sync (still needed, don't remove)

Confirm no other usage of `MpiDropdown` in gallery.js before removing the import.

- [ ] **Step 3: Commit**

```bash
git add js/workspaces/gallery/gallery.js
git commit -m "refactor(gallery): adopt MpiPromptBox Block with state-backed model selection"
```

---

## Phase 4: Update groupHistory.js

**Files:**
- Modify: `js/workspaces/groupHistory/groupHistory.js`

### Task 5: Refactor groupHistory.js to use MpiPromptBox Block + state

- [ ] **Step 1: Identify sections to change**

Key changes:
1. Lines ~730-732: `models` and `activeModel` local vars → derive from state
2. Lines ~776-812: `_opDropdown` + `_promptBox` mount → replace with single MpiPromptBox mount
3. Remove local `activeOperation` var (promptBox manages it internally), but track it locally for `_opOptions` which still controls toolbar availability
4. `promptBox.on('model-change')` → `state.s_selectedModelId = model.id` + full remount
5. Subscribe to `state:changed` for `s_selectedModelId` — when model changes externally, remount
6. Lines ~815-825: radial listener simplifies — MpiPromptBox handles internal op sync

The `_opOptions()` and `_refreshOpOptions()` functions are still needed because the history toolbar (crop/mask/autoMask) availability depends on the current operation + context, not just what's in the dropdown.

**Critical:** `_promptBox` is still needed as a module-level reference (used by `_refreshOpOptions` to call `el.setOperation`). Keep `let _promptBox = null` and the remount logic.

```javascript
// Changes to groupHistory.js — replace the models/activeModel section (~line 730)
// and the promptBox mounting section (~line 776):

// Derive activeModel from state with fallback to first installed for this group type
const isVideo = _group.type === 'video';
const installedModels = getModelsByType(isVideo ? 'video' : 'image').filter(m => m.installed);

let activeModel = state.s_selectedModelId
    ? (installedModels.find(m => m.id === state.s_selectedModelId) || installedModels[0] || null)
    : (installedModels[0] || null);

// Ensure state is in sync on mount
if (activeModel) state.s_selectedModelId = activeModel.id;
```

```javascript
// Replace _opDropdown + _promptBox mount block (~line 776):
let _promptBox = null;

if (activeModel) {
    _promptBox = MpiPromptBox.mount(bottom, {
        model:           activeModel,
        modelList:       installedModels,
        operation:       activeOperation,
        includeNegative: true,
    });

    _promptBox.on('settings', () => {
        _settingsOverlay.el.open({ modelId: activeModel.id });
    });

    _promptBox.on('model-change', ({ model }) => {
        state.s_selectedModelId = model.id;
        activeModel = model;
        _mountPromptBox();
    });

    _promptBox.on('operation-change', ({ operation }) => {
        activeOperation = operation;
        _refreshOpOptions();
    });

    _promptBox.on('run', ({ operation, positive, negative, mediaItems }) => {
        const maskDataUrl = _hasMask ? _canvas.getMaskDataURL('black', 'white') : null;
        _runGenerate({ operation, positive, negative, mediaItems, maskDataUrl });
    });

    _promptBox.on('cancel', () => {
        StatusBar.progress.cancel();
    });
}

// Subscribe to external model changes (from gallery or other workspace)
const _onStateModelChange = ({ key, value }) => {
    if (key !== 's_selectedModelId') return;
    if (!value) return;
    const newModel = installedModels.find(m => m.id === value);
    if (newModel && newModel !== activeModel) {
        activeModel = newModel;
        _mountPromptBox();
    }
};
Events.on('state:changed', _onStateModelChange);
```

- [ ] **Step 2: Remove now-unused MpiDropdown import**

Check if MpiDropdown is still used elsewhere in groupHistory.js (it is — for the autoMask dropdown at line ~593). So don't remove the import.

- [ ] **Step 3: Cleanup — remove g_selectedModel writes**

Remove any writes to `state.g_selectedModel` (it was being written by gallery but never read by groupHistory). Search and confirm none exist.

- [ ] **Step 4: Commit**

```bash
git add js/workspaces/groupHistory/groupHistory.js
git commit -m "refactor(groupHistory): adopt MpiPromptBox Block with state-backed model selection"
```

---

## Phase 5: Cleanup Legacy State

### Task 6: Remove g_selectedModel from state.js

**Files:**
- Modify: `js/state.js:22`

- [ ] **Step 1: Remove g_selectedModel from state.js**

Change:
```js
g_selectedModel: null,      // Used by navigation.js and gallery.js
```
to:
```js
// (remove entirely — replaced by s_selectedModelId)
```

- [ ] **Step 2: Update navigation.js**

Search `g_selectedModel` across the codebase to find any remaining reads:
```bash
grep -rn "g_selectedModel" js/
```

Update any remaining reads to use `state.s_selectedModelId` + `getModelById()`.

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "cleanup(state): remove legacy g_selectedModel, replaced by s_selectedModelId"
```

---

## Phase 6: Remove Old MpiPromptBox Compound

### Task 7: Remove old MpiPromptBox Compound

**Files:**
- Delete: `js/components/Compounds/MpiPromptBox/`
- Modify: `js/shell/preloadStyles.js` — remove Compounds MpiPromptBox entry (already moved to Blocks)

- [ ] **Step 1: Delete the old Compound directory**

```bash
rm -rf js/components/Compounds/MpiPromptBox/
```

- [ ] **Step 2: Verify no remaining imports of old path**

```bash
grep -rn "Compounds/MpiPromptBox" js/
```

Should return zero results.

- [ ] **Step 3: Commit**

```bash
git add -A js/
git commit -m "cleanup: remove old MpiPromptBox Compound after Block promotion"
```

---

## Self-Review Checklist

- [ ] `MpiPromptBoxProps` typedef updated in types.js
- [ ] `MpiPromptBox.css` moved from Compounds to Blocks preloadStyles entry
- [ ] `s_selectedModelId` added to state.js
- [ ] `g_selectedModel` removed from state.js and all imports updated
- [ ] gallery.js: no more local `activeModel` var, no more `opDropdown`, no more `_mountPromptBox()`
- [ ] gallery.js: `modelList` filtered to `.filter(m => m.installed)`
- [ ] gallery.js: `promptBox.on('model-change')` writes to `state.s_selectedModelId`
- [ ] groupHistory.js: subscribes to `state:changed` for `s_selectedModelId` and remounts promptBox on external change
- [ ] groupHistory.js: `promptBox.on('model-change')` writes to `state.s_selectedModelId`
- [ ] `commandRegistry.js`: `component` field added to `CommandDef` and populated for upscale/i2v/detail/change/remove
- [ ] `getCommandComponent()` added to commandRegistry.js
- [ ] MpiPromptBox Block: `updateContext()` method exists on `el`
- [ ] Old Compound deleted and no remaining imports reference it
- [ ] No `console.log` or bare `console.error` used (use `clientLogger`)
