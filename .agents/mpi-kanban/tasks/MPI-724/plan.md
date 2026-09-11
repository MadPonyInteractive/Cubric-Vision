# PromptBox settings popup: a live LoRA rack at the top

Brief: `brief.md`. Read it first — it carries the MPI-356 doctrine this plan must not break.

## Current State

**The popup** (`MpiPromptBox.js:1498-1523`) is a portaled `MpiPopup` holding
`.mpi-prompt-box__settings` → `__settings-grid` (`#settings-op-slot`, filled per op by
`_refreshOpSlot()`) and `__settings-ops` (the op strip). It is anchored by its **bottom**
edge to the cog and grows upward (`positionPopup()`, `:1554`) — which is why the op strip is
the LAST child: a top-anchored section would jump under the cursor on every rebuild.

**`_refreshOpSlot()` (`:1802`) is the single convergence point** for a model or op change:
`el.setModel` (`:758`), `el.setModelList` (`:777`), the initial mount (`:2333`) and
`el.refreshControls` (`:706`) all funnel into it. `_refreshNegToggle()` and
`_refreshEnhanceBtn()` already refresh there.

**The LoRA UI today** lives only in `MpiModelSettings` (`Compounds/MpiModelSettings/`),
opened from the model picker's *LoRA & Upscale* tile and from `MpiBaseFlow:1603`. It renders
a fixed `LORA_COUNT = 6` slots — an `MpiTreePicker` + a strengths row (`_buildStrengthsRow`,
`:96`) + a bypass button (`_buildBypassBtn`, `:139`) each — with a staged variant
(`_mountStagedLoraSlots`, `:494`) for models declaring `loraStages`. Wan is the only one
today (`models.js:1297`): `{key:'high', label:'HIGH NOISE'}`, `{key:'low', label:'LOW
NOISE'}`, `loraStrengths: ['model']`. `_autoSave()` (`:355`) writes the whole `loras` value.

**Persistence** — `settings:model:update { modelId, key: 'loras', value }`, no `opName`;
`projectService.js:209` routes it to the model bucket because `loras` is in
`_MODEL_WIDE_KEYS` (`:72`). Debounced 300 ms into `project.json`. Bypass-at-zero injection
already shipped (MPI-223) — **no engine, workflow or injector work in this card.**

**`Events.emit` is synchronous** (`events.js:59`), which is what makes the self-echo guard
in § 4 a flag rather than a queue.

## Scope — do not widen

In: a new read-only rack Compound; its mount in the PromptBox popup; two-way live sync with
`MpiModelSettings`; extracting the shared row builders and path helpers so one definition
serves both surfaces; types + doc.

Out, settled with Fabio and not open to interpretation: **the rack can never add, remove or
re-point a LoRA.** No picker, no `+`, no clear, no empty slot — it adjusts values and
bypasses, nothing else. `MpiModelSettings` stays the only place the SET changes, and keeps
its six fixed slots. Also out: the
upscale-model selector; `MpiBaseFlow`'s flow fields; anything server-side, in
`comfy_workflows/` or in the injector.

## Ownership (files.json when this moves to `doing`)

```
js/components/Compounds/MpiLoraRack/MpiLoraRack.js          (new)
js/components/Compounds/MpiLoraRack/MpiLoraRack.css         (new)
js/components/Compounds/MpiModelSettings/loraSlotParts.js   (new — extracted)
js/components/Compounds/MpiModelSettings/MpiModelSettings.js
js/components/Organisms/MpiPromptBox/MpiPromptBox.js
js/components/Organisms/MpiPromptBox/MpiPromptBox.css
js/components/types.js
docs/component-contracts.md
```

**Unblocked.** MPI-721 closed 2026-09-11T02:51 and its write claim on `MpiPromptBox.js` /
`.css` (`state/files/f2c79865…`) reads `status: "complete"`. MPI-664's claim
(`62da4764…`) explicitly excludes `MpiPromptBox.js`. Re-read both files at claim time
anyway — MPI-721 rewrote the media strip, so the line numbers in § Current State are from
before that landed.

## Implementation

### 1 — Extract the shared parts → `Compounds/MpiModelSettings/loraSlotParts.js`

Move out of `MpiModelSettings.js`, exported: `buildStrengthsRow`, `buildBypassBtn`,
`baseName`, `resolveInfo`, `isMissing`. Two contract changes, because § 4 needs handles:

- `buildStrengthsRow` returns `{ el, modelInput, clipInput }` instead of a bare element
  (`MpiInput` exposes `el.setValue`, `MpiInput.js:119` — live sync sets values through it
  rather than rebuilding, so a half-typed number never loses focus).
- `buildBypassBtn` returns the button as today, and gains an exported
  `applyBypass(btn, slotEl, next)` that writes `aria-pressed` + toggles the `--bypassed`
  class. `aria-pressed` stays the single source of truth (MPI-588) — do not add
  `toggleable`.

`MpiModelSettings.js` imports them and drops its private copies. Both its mount paths
(`_mountLoraSlots`, `_mountStagedLoraSlots`) keep the returned handles in a registry keyed
`` `${stageKey ?? ''}:${index}` ``. Verify: no behaviour change — the overlay still mounts 6
slots per stage with working picker, strength and bypass.

### 2 — `MpiLoraRack` Compound

Props `{ modelId }`; methods `el.setModel(modelId|null)` and `el.refresh()`. Per render:

- resolve `getModelById(modelId)` + `getModelSettings(state.currentProject, modelId)`;
- **flat model** → filter the slot array to `slot.name` truthy, **keeping the original
  index** (a write must land back in its own slot, never a compacted one). One or more
  rows → a `LORAS` section label above them;
- **staged model** (`model.loraStages`) → the same per stage, in the model's declared stage
  order (Wan: HIGH NOISE then LOW NOISE — same order as the overlay, so the two surfaces
  read identically). The stage's own `label` + ` LORAS` replaces the single `LORAS` label;
  a stage with no filled slot renders no header and no rows;
- **nothing filled anywhere**, or no model, or no project → render **nothing**: no label, no
  rows, no placeholder, zero height;
- each row: `MpiBadge` (label `baseName(name)` minus extension, `variant:'secondary'`,
  `pill:true`, `title` = the full stored path) + `buildStrengthsRow(slot, model.loraStrengths
  ?? ['model','clip'], …)` + `buildBypassBtn`;
- writes mutate the held `loras` value **in place at its original index / stage key** and
  emit `settings:model:update { modelId, key:'loras', value }` — byte-identical to
  `MpiModelSettings._autoSave()`, so the two surfaces cannot drift apart.

**BEM**: `.mpi-lora-rack`, `__label`, `__row`, `__name`, `__strengths`, `__bypass`,
`--bypassed`, `--missing`. Non-selectable name = `user-select:none` on `__name` (it is a
`<span>`; do not add a listener to prove it is inert). A LoRA whose file is gone
(`isMissing`) renders `--missing` with a title reading *file missing — fix in LoRA &
Upscale*; the rack never heals or re-picks, that is the overlay's job.

### 3 — Mount it in the popup

`<div id="settings-lora-slot"></div>` as the FIRST child of `.mpi-prompt-box__settings`,
above `__settings-grid`. Mount the rack once when the popup node is built; push its
`destroy` into the existing teardown. Call `rack.el.setModel(model?.id ?? null)` from the
tail of `_refreshOpSlot()`, beside `_refreshNegToggle()` — that is the one convergence
point, do not add a second call site. Call `rack.el.refresh()` from the popup's open
handler so a LoRA added in the overlay while the popup was shut is present on the next open.

**Height**: the popup grows upward, so a rack appearing, disappearing or changing row count
moves the TOP edge only — the bottom stays pinned to the cog. Re-call `positionPopup()`
after any rack rebuild that happens while `popupActive`, so the viewport clamp re-runs.

### 4 — Two-way live sync (the point of the card)

Both surfaces listen to `settings:model:update` and filter `key === 'loras'` +
`modelId === my context`. **Each skips its own echo** with a `_selfWrite` flag set around
its own `Events.emit` — safe because `emit` is synchronous.

- **Rack ← overlay**: the overlay can change the filled SET (pick or clear a LoRA), so the
  rack compares a signature of `stageKey:index:name` pairs. Signature changed → full
  rebuild (rows appear/disappear, the label appears/disappears) + `positionPopup()` if open.
  Signature same → in-place `setValue` / `applyBypass` on the held handles.
- **Overlay ← rack**: the rack never changes the filled set, so it is always in-place
  `setValue` / `applyBypass` through § 1's registry. Never re-run `_mountLoraSlots` on a
  rack write — rebuilding the `MpiTreePicker`s would close an open search dropdown.

**Do not** reach for a `state:changed` subscription instead. The write lands in
`state.currentProject` 300 ms later and a `state:changed` listener re-enters on it;
`MpiModelSettings` needed its `_rescanning` flag for exactly that loop (MPI-356, "an
unclosable reopen loop that flooded the console with ERR_INSUFFICIENT_RESOURCES").

### 5 — Types + doc

`types.js`: `MpiLoraRackProps` + the two instance methods, in the Compounds block.
`docs/component-contracts.md`: the rack's contract — read-only by design, the shared write
shape, the sync protocol and its self-echo guard, and why it refuses a `state:changed`
subscription.

## Plan Drift

**The open-path re-read was wrong, and the live app proved it.** § 3 said to call
`rack.el.refresh()` from the popup's open handler so an overlay edit made while the popup
was shut would be picked up. Measured 2026-09-11 in a live instance: emit LoRAs, click the
cog in the same tick, and the rack came up **empty**. `projectService._enqueueModelUpdate`
debounces 300 ms and assigns `state.currentProject` **inside the timer** — the state write
and the disk write are one deferral, not two — so the open-time read landed on a project
that had not caught up.

The premise was wrong too: the rack's `settings:model:update` listener is subscribed
whether the popup is shown or not, so that edit had *already* arrived. Fixed both halves:

- the open path no longer reads (`openPopup` just positions);
- every re-read goes through `_adopt()`, which keeps the held value while this rack's own
  write is still in flight (`_dirtyFor`). Without that, the same bug fires from
  `_refreshOpSlot`, which runs on **every op change** — pick an op within 300 ms of editing
  a strength and the stale project value would silently revert the number just typed.
  Probed: value survives a mid-debounce `refreshControls()` and still persists (1.90).

`refresh()` stays on the API and is not dead: **Reuse Prompt writes `loras` straight into
the project with no event** (`applyPromptReuseSettings` → `setModelSettings`) and reaches
the rack via `el.refreshControls()` → `_refreshOpSlot` → `setModel`. It is the one writer
of this key the sync listener cannot hear.

Two smaller drifts: `MpiInput type="number"` commits on **blur/Enter/wheel**, not on a
`change` event (`MpiInput.js`), so that is what a probe must dispatch — not a defect, and
the same for the overlay. And the name badge was `display:block`, which stretched the pill
across the whole column; `inline-block` lets it hug the name and ellipsize only when long.

## Verification

1. `npm run lint` and `npm run lint:components` clean.
2. `npm test` green (918+ at time of writing).
3. **Live, in your OWN instance** — `npm run app:isolated` (own profile AND port; never
   `:3000`). SDXL or any `loraStrengths:['model','clip']` model: add ONE LoRA via *LoRA &
   Upscale*, close, open the cog → a `LORAS` label and exactly one row, name matching,
   Model + Clip inputs at the saved values, bypass reflecting the saved flag.
4. Add a second → two rows. Clear both → **no label, no rows, nothing** in the popup.
5. **Sync, rack → overlay**: with the overlay reachable, change a strength in the rack, open
   the overlay → the new value is there, and `project.json`
   `modelSettings[<id>].loras[<original index>].strengthModel` matches.
6. **Sync, overlay → rack**: change a strength and toggle a bypass in the overlay → the
   rack's input and pressed state follow without a reopen, and the open TreePicker in the
   overlay is not torn down by the echo.
7. Bypass in the rack → run → the dispatched graph carries strength 0 for that LoRA (diff it
   out of Comfy `/history`, not out of the staged file).
8. **Wan** (`models.js:1297`): two LoRAs on HIGH, one on LOW → `HIGH NOISE LORAS` with two
   rows, `LOW NOISE LORAS` with one, Model strength only (no Clip input), and a write to one
   stage leaves the other untouched. Fill HIGH only → the LOW header does not render.
9. A model with no LoRAs, and an upscale-type model → the rack renders nothing.
10. Switch models with the popup OPEN → the rack swaps and the popup stays anchored to the
    cog (regression check for § 3's height note).
