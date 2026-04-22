# Batch Generation Control (1–4)

Tracker: `tsk_mo91eh9ev0mpiw`

## Context

User wants to generate up to 4 images per run, rendered as 4 cards in one go. Needs a new prompt-box control (MpiButton toggle + MpiPopUp with vertical 1/2/3/4) mirroring the ratio-selector pattern. Control value injects into the ComfyUI node titled **Batch** at run time. Comfy produces N images natively (batch_size on latent); current `generationService` drops `urls[1..N]` — must fix so all N become history items (= N cards).

## Decisions

- **Batch mode:** Native Comfy batch (single run, N outputs).
- **Persistence:** Per-model, mirrors `ratio` (`state.currentProject.settings.models[modelId].batch`).
- **Operation scope:** Image ops only — `t2i`, `i2i`, `upscale`. Skip video.

---

## Files to Create

### 1. `js/components/Compounds/MpiBatchSelector/MpiBatchSelector.js`
Clone structure from `js/components/Compounds/MpiRatioSelector/MpiRatioSelector.js`. Simplifications:

- Props: `{ value = 1 }` (integer 1–4).
- `template(props)`:
  - Trigger: `MpiButton.template({ icon: 'batch' /* add to icons.js if missing — else reuse 'grid' or 'stack' */, label: String(value), size: 'md', active, toggleable: true, stroke: true, info: 'Batch size' })`.
  - Popup: `MpiPopup.template({ active, position: 'top' }, gridHtml)` where grid renders four `MpiButton` entries (labels "1","2","3","4") stacked vertically via a column flex class `.mpi-batch-sel__grid`.
- `setup(el, props)`:
  - Portal popup to `document.body` (same as ratio-selector line ~165).
  - Track active state on trigger click → toggles popup, emits `'popup_toggle' { active }`.
  - Click on number → updates internal value, updates trigger label, re-renders selected state in popup, closes popup, emits `'change' { value: N }`.
  - `el.setValue(n)` imperative setter.
  - `el.destroy()` cleans up body portal + any `Events.on` / outside-click listeners (`_unsubs` array pattern per Critical Rules).

### 2. `js/components/Compounds/MpiBatchSelector/MpiBatchSelector.css`
BEM classes under `.mpi-batch-sel__*`. Only CSS vars from `styles/01_base.css`. Vertical grid (`flex-direction: column; gap: var(--space-1)`).

---

## Files to Modify

### 3. `js/components/Blocks/MpiPromptBox/PromptBoxControls.js`
Add new entry to `PROMPT_BOX_CONTROLS` (alongside `ratio`, ~line 20):

```js
batch: {
  mount(host, opts = {}) {
    const modelId = opts.modelId;
    const saved = state.currentProject?.settings?.models?.[modelId]?.batch ?? 1;
    const inst = ComponentFactory.create(MpiBatchSelector, { value: saved });
    host.appendChild(inst.el);
    const offChange = Events.on(inst.el, 'change', ({ value }) => {
      Events.emit('settings:model:update', { modelId, patch: { batch: value } });
    });
    inst.el._unsubBatch = offChange;
    return inst;
  },
  getInjectionParams(modelId) {
    const v = state.currentProject?.settings?.models?.[modelId]?.batch ?? 1;
    return { Batch: v };   // node title "Batch" → inputs.value (or .int — verify in comfy_injection.md:32 for Batch_Size equivalent)
  },
}
```

Verify node-title key. Ref: `.claude/rules/comfy_injection.md` line 32 (`Batch_Size → inputs.value`). Tracker specifies node is titled `Batch` — use that exact casing (match is case-insensitive per comfy_injection rules).

### 4. `js/services/commandRegistry.js`
Add `'batch'` to `components[]` array for operations: `t2i`, `i2i`, `upscale`.

### 5. `js/services/generationService.js` (lines 85–161)
Replace `urls[0]`-only handling with loop over `urls`:

- Current (line ~98): `let filePath = urls[0]; ...; createImageItem(...); appendToHistory(group, item);`
- New: iterate `for (const url of urls) { const item = createImageItem(url, ...); appendToHistory(group, item); }`. Keep same `group`, same prompt/params metadata; each item gets its own uuid / `.meta/<uuid>.json` via existing `createImageItem` path.
- Ensure `selectedIndex` update points to the last appended item so UI shows newest (matches current behavior for single-item case).
- Video path unaffected (batch control not added to video ops).

### 6. `js/components/types.js`
Add typedef block after the `MpiRatioSelectorProps` entry (~line 160):

```
@typedef {Object} MpiBatchSelectorProps (Compound — js/components/Compounds/MpiBatchSelector)
@property {number} [value=1] — batch count 1..4
Emits:
  'change' { value: number }
  'popup_toggle' { active: boolean }
```

### 7. `js/shell/preloadStyles.js`
Add line in Compounds section: `'js/components/Compounds/MpiBatchSelector/MpiBatchSelector.css',`.

### 8. `js/utils/icons.js` (only if needed)
If no suitable batch/stack/grid icon exists, add one. Check first before adding — reuse existing if available.

### 9. `.claude/rules/component-mounts.md`, `component-events.md`, `component-state.md`, `component-comfy.md`
**Ask user at end of session** (per Cardinal Rule 3) whether to update these with the new component.

---

## Verification

1. Launch app (`npm run dev` or existing dev command). Open browser at `http://127.0.0.1:3000/`.
2. Open prompt box settings popup → confirm Batch control visible next to Ratio for `t2i`, `i2i`, `upscale` models.
3. Click Batch toggle → popup shows 1/2/3/4 vertically. Select `3` → trigger label updates to "3", popup closes.
4. Switch model → batch value reloads from per-model state. Switch back → value persists.
5. Run a `t2i` generation with Batch=3 → 3 cards appear in gallery, each with its own `.meta/<uuid>.json` on disk under `projects/<current>/.meta/`.
6. Run with Batch=1 → single card (regression check).
7. Check `logs/app.log` tail — workflow injection log should show `Batch: 3` written to node titled "Batch".
8. Playwright-cli sanity: navigate, toggle popup, click "4", verify DOM has trigger label "4".

## Risks / Notes

- Confirm node-title is exactly `"Batch"` in workflow JSONs (tracker says so). If workflows use `"Batch_Size"` instead, adjust injection key or rename node — align with `comfy_injection.md:32`.
- `generationService` loop change must preserve `exec.onComplete` single-call contract and avoid double-committing the group. Check `appendToHistory` is idempotent per-item (it uses uuid per item, so safe).
- No change to `js/components/factory.js` (locked).
