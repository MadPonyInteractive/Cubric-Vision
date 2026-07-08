# MPI-223 — Per-LoRA bypass toggle

## Goal
Per-slot bypass button in Model Settings LoRA slots. Pressed → grey out that slot's
dropdown + strength inputs (values stay **visible + unchanged**) and inject
`strength_model=0, strength_clip=0` at generation. Works even when the LoRA file is
missing. Un-bypass restores saved values instantly. Persists in project.json.

## Decision log
- **Option A** (always inject `lora_name` at strength 0). Hybrid rejected — see card.
- No graph-shape change → no model reload/OOM (matches the proven strength-0↔0.5 A/B pattern).
- Both engines get it for free: zeroing happens at param-build (`_buildParams`), upstream
  of the engine split. No remote/Pod twin to patch.

## Files (verified against live code)

### 1. Data shape — `js/data/projectModel.js`
- `_defaultLoraSlots()` (line ~333): add `bypass: false`.

### 2. UI — `js/components/Compounds/MpiModelSettings/MpiModelSettings.js`
- `_normaliseLoraSlots` (line ~432) + the inline normalise in `_mountLoraSlots`
  (lines ~369–376): carry `bypass: s.bypass ?? false`.
- Add a bypass toggle button per slot in **both**:
  - `_mountLoraSlots` (flat, line ~381 loop)
  - `_mountStagedLoraSlots` (staged, line ~460 loop)
- Button: `renderIcon('negative', ...)` (existing circle+slash glyph — no new icon, no raw SVG).
- Click handler: flip `_loraSlots[i].bypass` (flat) / `_loraSlots[stage.key][i].bypass`
  (staged) → toggle `--bypassed` class on `slotEl` → set `disabled` on that slot's
  MpiDropdown + strength MpiInputs → `_autoSave()`.
- The dropdown/inputs already support `disabled` (MpiDropdown props.disabled +
  `.mpi-dropdown--disabled`; MpiInput props.disabled + `.mpi-input--disabled`). To toggle
  disabled after mount, re-mount the slot's controls on bypass change OR add a
  disabled-setter — pick the smaller diff; re-mount of just the affected slot is simplest.
  `// ponytail:` re-render one slot, not the whole list.

### 3. CSS — `MpiModelSettings.css`
- `.mpi-model-settings__lora-slot--bypassed .mpi-model-settings__lora-dropdown,
   .mpi-model-settings__lora-slot--bypassed .mpi-model-settings__lora-strengths`
  → `opacity: 0.35; pointer-events: none;` (reuse the pattern at line 117).
- Bypass button active/inactive state (accent when bypassed). No hardcoded colors —
  CSS vars only.

### 4. Injection — `js/services/commandExecutor.js` `_buildParams`
- Staged branch (lines ~630–639) and flat branch (lines ~646–653): when `slot.bypass`,
  force `strength_model: 0, strength_clip: 0` in the emitted object.
- Missing-block: `_findMissingModel` (line ~360) hard-blocks on a missing LoRA file.
  A bypassed slot must NOT block. Simplest: when `slot.bypass`, if the file is missing,
  **skip emitting the param entirely** (nothing to inject, nothing to block); if present,
  emit `lora_name` at strength 0. → bypass always generates.

### 5. Types — `js/components/types.js`
- Document `bypass: boolean` in the LoRA slot shape.

## Verify
1. Guard: extend `tests/lora-injection-routing.test.cjs` — bypassed slot → `strength_model=0,
   strength_clip=0` (present file) / param omitted (missing file). `node --test`.
2. Live (Electron): open Model Settings on a model with a LoRA set → press bypass →
   dropdown + numbers grey out, numbers unchanged → generate → confirm submitted workflow
   JSON has `strength_model=0` for that node.
3. Live: bypass a slot whose LoRA file was deleted from disk → generation runs (no
   missing-LoRA block).
4. Live: un-bypass → saved strength (e.g. 0.75) restored in UI, injects normally.

## Out of scope
- Hybrid zero-vs-none by workflow repeat (rejected).
- Any change to the ComfyUI cacheHit "No changes, skipping" path.
