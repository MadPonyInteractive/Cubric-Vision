# Searchable LoRA tree picker (MpiLoraPicker primitive)

## Problem (why this card exists)

The LoRA-slot pickers in **Model Settings** use the generic `MpiDropdown`, which
renders a flat portalled list of full relative paths
(`SDXL\Models\Liora_Lustify_v1.safetensors`). With hundreds of LoRAs across dozens
of subfolders this breaks down:

1. **Unreadable** — the full path is jammed into a fixed-width row; CSS ellipsis
   eats the distinguishing filename, so two different LoRAs read identically
   (`SDXL\Models\Liora_Lustif…`).
2. **No search** — no way to type-to-find one file among hundreds.
3. **No folder structure** — subfolders are flattened into the path string.

User-approved fix: a NEW `MpiLoraPicker` primitive — trigger opens a portalled box
with a **search input** + a **collapsible file-system folder tree**. Click a folder
row to expand/collapse; click a file row to select. Used for LoRA slots only.
The other 5 `MpiDropdown` consumers are NOT touched.

## Current State

- Project mode: file-backed board (`source_of_truth: file`).
- **Data source (no change needed):** `state.availableLoras` is a flat array of
  full relative path strings (Windows `\` or POSIX `/`), e.g.
  `SDXL\Models\Liora_Lustify_v1.safetensors`, `FashionPhotographyXL.safetensors`
  (root-level = universal). Populated by `loadAssets()` in
  `js/services/assetService.js`. The picker builds the tree in-memory from these
  strings. **No server route, no new state key.**
- **The stored value stays the full path string** — identical to today. This is the
  contract that keeps the entire generation/heal/inject pipeline untouched.
- **Where MpiDropdown is mounted for LoRAs** —
  [js/components/Compounds/MpiModelSettings/MpiModelSettings.js](../../../../js/components/Compounds/MpiModelSettings/MpiModelSettings.js):
  - `_mountLoraSlots(slots, modelType, kinds)` (~line 386) — flat model types
    (SDXL, Wan, etc.). Indexes `_loraSlots[i]`.
  - `_mountStagedLoraSlots(slots, modelType, loraStages, kinds)` (~line 475) —
    staged models (LTX multi-stage). Indexes `_loraSlots[stage.key][i]`.
  - BOTH build an identical slot row: `dropHost` (name picker) + `strengthsEl`
    (Model/Clip knobs, outside the picker) + `bypassBtn` (outside the picker).
    Only the name dropdown is being swapped → strengths/bypass/staging are
    picker-agnostic, so **all model types are covered by swapping both sites.**
  - Each site wraps the mount with heal/missing handling:
    `_resolveInfo`, `_isMissing`, `_withMissingOption`, the `mpi-dropdown--missing`
    class, and a `dd.on('change', ({value}) => …)` handler. `MpiLoraPicker` MUST
    accept the same props (`options`, `value`, `placeholder`, `extraClasses`) and
    emit the same `change` event `{ value, label }` so these wrappers keep working
    verbatim.
- **Reference primitive to copy proven bits from** —
  [js/components/Primitives/MpiDropdown/MpiDropdown.js](../../../../js/components/Primitives/MpiDropdown/MpiDropdown.js):
  portal-to-`document.body`, `positionList()` (viewport-coord alignment),
  outside-click close, `Events.on('ui:close-all-popups', close)`, and the
  `MutationObserver` teardown when `el` leaves the DOM. Reuse these patterns.
- **Rules that apply** (Critical Rules Snapshot in CLAUDE.md): BEM
  `.mpi-lora-picker__element--modifier`; icons ONLY from `js/utils/icons.js` (add
  a folder/chevron icon there if missing — do NOT paste raw SVG); DOM via `qs`/`qsa`
  from `js/utils/dom.js`; events via `on()`/`off()` (both return cleanup fns);
  colors ONLY via CSS vars from `styles/01_base.css`; `ComponentFactory.create()`;
  never modify `js/components/factory.js`.

## Implementation

- [ ] **Build `MpiLoraPicker` primitive + wire it into both LoRA-slot mount sites.**
  New files:
  `js/components/Primitives/MpiLoraPicker/MpiLoraPicker.js` +
  `js/components/Primitives/MpiLoraPicker/MpiLoraPicker.css`. Then:

  1. **Props (mirror MpiDropdown so the call-site wrappers keep working):**
     `options` (`Array<{label,value,disabled?}>` — the same list
     `_loraOptions(state.availableLoras)` produces: `{label:fullPath, value:fullPath}`
     plus the leading `{label:'— None —', value:''}` and any synthetic
     `(missing)` entry from `_withMissingOption`), `value` (selected full path),
     `placeholder`, `extraClasses` (forwards `mpi-dropdown--missing` today — keep
     supporting an equivalent so the red-missing state still shows).
     Emits `change` `{ value, label }`.
  2. **Trigger:** a button styled like the current dropdown trigger (label +
     chevron). Label = basename of the selected `value`, or the placeholder when
     empty/`— None —`. Click toggles the portalled box.
  3. **Portalled box** (append to `document.body`, position with a `positionList()`
     lifted from MpiDropdown so it's immune to ancestor `overflow:hidden` /
     transforms):
     - **Search input** at top. Empty → tree mode. Non-empty → filter: show only
       files whose basename (case-insensitive substring) matches; auto-expand /
       flatten so matches are always visible. A "— None —" clear row stays
       available.
     - **Tree** built from `options`: split each `value` on `[\\/]`, last segment =
       file, preceding = folder chain. Folder rows (`▸` collapsed / `▾` expanded,
       click toggles, one indent level per depth). File rows nested underneath,
       one full-width row each (filename only — no path crammed in, which is what
       fixes the ambiguity). Sort: folders A–Z then files A–Z, folders before
       files. `// ponytail:` note the linear rebuild-per-keystroke scan (fine for
       hundreds; debounce only if it ever hits thousands).
     - **Selected/missing:** highlight the row matching `value` (`is-active`) and
       auto-expand its parent folders on open so the user lands on their pick. A
       `disabled` option (the `(missing)` synthetic entry) renders as a pinned,
       non-selectable row so a saved-but-gone LoRA is still visible.
     - Clicking a file row → set value, close box, `emit('change', {value, label})`.
       Clicking a folder row → toggle only (never selects).
  4. **Teardown:** collect unsubs in `_unsubs`; define `el.destroy()` that closes
     the box, removes the portal node, calls unsubs, disconnects the observer, and
     unbinds `ui:close-all-popups` — same lifecycle as MpiDropdown. This matters
     because MpiModelSettings re-mounts pickers on every `el.open()` and on the
     `state:changed` live-rerender.
  5. **Register (mandatory for a new component):**
     - Add `'js/components/Primitives/MpiLoraPicker/MpiLoraPicker.css'` to the
       Primitives list in
       [js/shell/preloadStyles.js](../../../../js/shell/preloadStyles.js)
       (after the `MpiDropdown.css` line ~15).
     - Add an `MpiLoraPickerProps` typedef block in
       [js/components/types.js](../../../../js/components/types.js) (mirror the
       `MpiDropdownProps` block ~line 197, minus `direction`/`info`/`wrapLabels`).
  6. **Swap the two call sites in MpiModelSettings.js:**
     - Add `import { MpiLoraPicker } from '../../Primitives/MpiLoraPicker/MpiLoraPicker.js';`
     - In `_mountLoraSlots`: replace `MpiDropdown.mount(dropHost, {...})` with
       `MpiLoraPicker.mount(dropHost, {...})`, same props object, same
       `dd.on('change', …)` handler.
     - In `_mountStagedLoraSlots`: same replacement.
     - Leave the upscale dropdown (`_mountUpscaleDropdown`) and every other
       `MpiDropdown` consumer alone.

  **Verify:** (user-ux) Launch the app (see Verification), open **Model Settings**
  for an SDXL model with a deep LoRA folder tree. Confirm: (a) trigger opens a box
  with a search input + expandable folder rows; (b) clicking a folder expands to
  its files, nested; (c) typing filters to matching files across all folders;
  (d) two same-prefix LoRAs are now distinguishable (own rows, no path clipping);
  (e) selecting a file saves it and the slot shows its basename; (f) re-open a
  project with a saved LoRA — it's highlighted and its folders auto-expanded; a
  saved-but-deleted LoRA still shows red/missing; (g) a Wan (model-only) slot and
  an LTX staged model both use the new picker with their strength knobs + bypass
  button intact. Also run `npm test` if any guard tests touch model-settings.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Build the `MpiLoraPicker` primitive, register it (preloadStyles + types), and
  swap it into both LoRA-slot mount sites in MpiModelSettings.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

This card has a visual/interactive surface the user must judge in the running app
(the tree open/expand/search/select flow, name readability, missing-state color).

- **Launch the app** (Electron is the ship target): from the repo root, unset
  `ELECTRON_RUN_AS_NODE` then `npm start` (background). App binds
  `http://127.0.0.1:3000/` — make sure no other Cubric Studio instance holds :3000.
  Browser dev mode at that URL works for a quick look but some features are
  Electron-only. Model Settings is reached via a model's settings/gear affordance.
- Walk the (a)–(g) checklist under **Implementation → Verify** above.
- If any guard test references MpiModelSettings/dropdown wiring, run `npm test`
  and confirm green.

## Preservation Notes

- **New component → doc obligations already in the plan:** `preloadStyles.js` +
  `types.js` registration are mandatory (CLAUDE.md rule). Don't skip.
- **Component map rules** (`.claude/rules/component-mounts.md`, `-events.md`,
  `-state.md`, `-comfy.md`): a new primitive that only replaces a dropdown inside
  an existing compound is low-impact, but if a map audit runs later, note that
  MpiLoraPicker is mounted by MpiModelSettings (LoRA slots) and emits `change`.
  Regenerate via the `mpic-update-component-map` skill if a sweep is wanted — not
  required for this card.
- **Icons:** if a folder or chevron-right icon is added to `js/utils/icons.js`,
  that's the canonical home — never inline SVG.
- **Do NOT touch** the heal/missing/inject logic (`_resolveInfo`, `_isMissing`,
  `_withMissingOption`, generation-side path resolution). The picker preserving the
  full-path value string is what keeps all of it working. Recent LoRA path/inject
  fixes (MPI-198/219/229) live in that logic — regressing it would reopen them.
- At end-session, if component wiring changed materially, CLAUDE.md asks whether to
  update `.claude/rules/` — ask the user, don't auto-edit rule files.
