# MpiPromptBox Internal Model Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MpiPromptBox expose `el.setModel(model)` and `el.setModelList(list)` so workspaces stay thin — no remounting on model change. Workspaces write to `state.s_selectedModelId` and call Block methods to sync the internal dropdown.

**Architecture:**

- `model` and `modelList` in MpiPromptBox's closure are promoted from `const` to mutable variables
- `_modelDropdown` stores a reference to the dropdown instance (null when single model)
- `el.setModel(model)` updates the closure variable, syncs `_modelDropdown`'s selected value, refreshes operation dropdown and op slot
- `el.setModelList(list)` updates the available options, refreshes ops
- Workspaces receive `model-change`, update `state.s_selectedModelId`, then call `el.setModel()` to sync — no remount
- `injectionParams` from the new control system flows through `run` payloads automatically

**Tech Stack:** Vanilla JS, ComponentFactory, Events Bus, state.js Proxy

---

## Context: What Was Built Before This Plan

The MpiPromptBox Block is already live. The previous plan (`2026-04-11-mpi-prompt-box-block.md`) already:
- Created `MpiPromptBox` as a Block with operation dropdown and media zone
- Added `s_selectedModelId` to `state.js` as canonical model ID
- Updated `gallery.js` and `groupHistory.js` to adopt the Block and write to `state.s_selectedModelId` on `model-change`
- Removed the old Compound

The control injection system (`PromptBoxControls.js`) is also already live with `ratio` as the working example.

**What this plan adds:** The thin-workspace pattern — `setModel()` / `setModelList()` so workspaces never need to remount.

---

## File Map

### Modified Files
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — convert `model`/`modelList` to mutable `let`, store `_modelDropdown` ref, add `setModel()` / `setModelList()`
- `js/components/types.js` — document `setModel()` and `setModelList()` in MpiPromptBoxProps
- `js/workspaces/gallery/gallery.js` — replace remount-on-model-change with `setModel()` call
- `js/workspaces/groupHistory/groupHistory.js` — replace remount-on-model-change with `setModel()` call

---

## Phase 1: Block Enhancement

### Task 1: Add `setModel()` and `setModelList()` to MpiPromptBox

**Files:**
- Modify: `js/components/Blocks/MpiPromptBox/MpiPromptBox.js:86-102`

- [ ] **Step 1: Convert `model` and `modelList` from `const` to `let`**

In `setup`, change:
```javascript
const model = props.model || null;
const modelList = props.modelList || [];
```

TO:
```javascript
let model = props.model || null;
let modelList = props.modelList || [];
```

Also add a `_modelDropdown` reference variable after the `_activeControls` declaration:
```javascript
const _activeControls = new Map();
let _modelDropdown = null;
```

---

**Files:**
- Modify: `js/components/Blocks/MpiPromptBox/MpiPromptBox.js:367-384`

- [ ] **Step 2: Store `_modelDropdown` reference when mounting the dropdown**

Find the model dropdown mount block (lines ~372-383). Wrap it so the instance is captured:

```javascript
if (modelList.length > 1) {
    _modelDropdown = MpiDropdown.mount(document.createElement('div'), {
        options:   modelList.map(m => ({ value: m.id, label: m.name })),
        value:     model.id,
        info:      'Active model',
        direction: 'up',
    });
    _modelDropdown.on('change', ({ value }) => {
        const selected = modelList.find(m => m.id === value);
        if (selected) emit('model-change', { model: selected });
    });
    leftSlot.appendChild(_modelDropdown.el);
}
```

Note: `_modelDropdown` is already declared as `null` above — just assign to it here.

---

**Files:**
- Modify: `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — after line ~238 (`el.setGenerating`)

- [ ] **Step 3: Add `el.setModel(model)` method**

Add after `el.setGenerating` (around line 239):

```javascript
el.setModel = (newModel) => {
    model = newModel;
    // Sync model dropdown if it exists
    if (_modelDropdown) {
        _modelDropdown.el.setOptions(
            modelList.map(m => ({ value: m.id, label: m.name })),
            newModel.id
        );
    }
    // Refresh operation dropdown and op slot to reflect new model's supported ops
    _refreshOpDropdown();
    _refreshOpSlot();
};
```

- [ ] **Step 4: Add `el.setModelList(modelList)` method**

Add after `el.setModel`:

```javascript
el.setModelList = (newModelList) => {
    modelList = newModelList;
    if (_modelDropdown) {
        _modelDropdown.el.setOptions(
            modelList.map(m => ({ value: m.id, label: m.name })),
            model?.id ?? null
        );
    }
    _refreshOpDropdown();
    _refreshOpSlot();
};
```

- [ ] **Step 5: Update JSDoc comment block in MpiPromptBox.js**

Update the Instance API section to include the new methods. Find the current JSDoc block (lines ~31-38) and add:

```javascript
 *   setModel(model)       — sync internal model dropdown to a new model (no remount)
 *   setModelList(list)    — update the available models list in the dropdown
```

Also update the `'run'` emits line to reflect the new payload shape:
```javascript
 *   'run'          { operation, positive, negative, mediaItems, injectionParams }
```

- [ ] **Step 6: Update types.js**

Find the MpiPromptBoxProps typedef in `js/components/types.js` (around line 201). Add to Instance methods:

```javascript
 *   setModel(model)      — sync internal model dropdown to a new model (no remount)
 *   setModelList(list)   — update the available models list in the dropdown
```

- [ ] **Step 7: Commit**
```bash
git add js/components/Blocks/MpiPromptBox/MpiPromptBox.js js/components/types.js
git commit -m "feat(MpiPromptBox): add setModel/setModelList for internal model swap"
```

---

## Phase 2: gallery.js — Replace remount with setModel()

**Files:**
- Modify: `js/workspaces/gallery/gallery.js`

### Task 2: Replace model-change remount with `setModel()` call

- [ ] **Step 1: Find the `model-change` handler in gallery.js**

Search for `promptBox.on('model-change'`. The current handler likely calls `_mountPromptBox()` or remounts the Block.

- [ ] **Step 2: Replace remount with `setModel()` sync**

**CURRENT pattern (remount):**
```javascript
promptBox.on('model-change', ({ model }) => {
    state.s_selectedModelId = model.id;
    activeModel = model;
    // ... remount logic or _mountPromptBox() call
});
```

**REPLACE with:**
```javascript
promptBox.on('model-change', ({ model }) => {
    state.s_selectedModelId = model.id;
    promptBox.el.setModel(model);
});
```

- [ ] **Step 3: Verify `activeModel` local variable is already removed or replaced**

The previous plan (`2026-04-11-mpi-prompt-box-block.md`) should have already replaced `activeModel` with `activeModelId`. Search for `activeModel` in gallery.js — if it still exists as a full object, replace references with `activeModelId` (string ID only).

For any `runCommand({ modelId: activeModel.id, ... })` calls, replace with:
```javascript
runCommand({ modelId: state.s_selectedModelId, ... })
```

Or track `activeModelId` as a local and use that.

- [ ] **Step 4: Commit**
```bash
git add js/workspaces/gallery/gallery.js
git commit -m "refactor(gallery): use setModel() sync, remove model-change remount"
```

---

## Phase 3: groupHistory.js — Replace remount with setModel()

**Files:**
- Modify: `js/workspaces/groupHistory/groupHistory.js`

### Task 3: Replace model-change remount with `setModel()` call

- [ ] **Step 1: Find the `model-change` handler in groupHistory.js**

Search for `promptBox.on('model-change'`.

- [ ] **Step 2: Replace remount with `setModel()` sync**

**CURRENT pattern (remount):**
```javascript
promptBox.on('model-change', ({ model }) => {
    state.s_selectedModelId = model.id;
    activeModel = model;
    _mountPromptBox(); // or inline remount
});
```

**REPLACE with:**
```javascript
promptBox.on('model-change', ({ model }) => {
    state.s_selectedModelId = model.id;
    promptBox.el.setModel(model);
});
```

- [ ] **Step 3: Verify `activeModel` local variable is already replaced**

Same as gallery — if `activeModel` (object) still exists, replace with `activeModelId` (string). Update all `activeModel.id` references.

- [ ] **Step 4: Commit**
```bash
git add js/workspaces/groupHistory/groupHistory.js
git commit -m "refactor(groupHistory): use setModel() sync, remove model-change remount"
```

---

## Self-Review Checklist

- [ ] `model` and `modelList` are `let` (not `const`) in MpiPromptBox setup
- [ ] `_modelDropdown` reference is stored when the dropdown is created
- [ ] `el.setModel(model)` exists and syncs the dropdown + refreshes op dropdown and op slot
- [ ] `el.setModelList(list)` exists and syncs dropdown options + refreshes ops
- [ ] `types.js` documents both new methods
- [ ] gallery.js: `model-change` handler uses `setModel()` — no remount
- [ ] gallery.js: no `activeModel` object variable (only `activeModelId` string or derived from state)
- [ ] groupHistory.js: `model-change` handler uses `setModel()` — no remount
- [ ] groupHistory.js: no `activeModel` object variable
- [ ] `injectionParams` flows through `run` payload from all active controls
- [ ] No `console.log` or bare `console.error` used (use `clientLogger`)
