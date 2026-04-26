# Prompt Box Dropdown Reactivity + Toast Cleanup

## Goal

Fix four bugs surfaced after gallery prompt-box was changed to show ALL installed models (image + video):

1. **History workspace dropdown stale** — uninstalling an image model while inside an image history workspace leaves the uninstalled model still listed in the prompt-box dropdown.
2. **Op dropdown shows `--Select--`** — when prompt-box auto-swaps stale model in `setModelList` (e.g. after uninstall), the op dropdown selectedValue still points at the previous op (e.g. `t2i`) which is invalid for the new model. Same effect when user manually picks a new model in the dropdown — `model-change` sets `activeOperation = model.supportedOps[0]` but never pushes that to the op dropdown UI.
3. **Uninstall toast leaks developer terminology** — strings like "universal workflow files", "pip-install(s)", "shared file(s)", "Partially installed due to other's dependencies" surface to the user. Must be replaced with one of three plain messages.
4. **Debug `console.log` left in production paths** — gallery `s_installedModelIds` listener and `MpiPromptBox.setModelList` print to console.

## Background / current state

- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` was modified earlier this session: shows ALL installed models in dropdown via `installedAllModels = MODELS.filter(m => m.installed !== false)`. Listener at lines 394–400 reacts to `s_installedModelIds` and calls `_pb?.el?.setModelList(installedAllModels)`. Two debug `console.log` calls remain in that listener.
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` `setModelList` (lines 245–271) auto-swaps stale model when current selected model is no longer in the list. After swap it calls `_refreshOpDropdown()` and `_renderBadge()`. One debug `console.log` remains.
- `_refreshOpDropdown()` (lines ~535–568) re-mounts the op `MpiDropdown` passing `value: activeOperation`. Does NOT validate that `activeOperation` is in the new model's `supportedOps`. Result: when previous op is invalid for new model, the dropdown shows `--Select--`.
- `_renderBadge` reads `model?.name` and `commands[activeOperation]?.label`.
- `el.setOperation(key)` updates `activeOperation`, calls `_refreshOpDropdown()`, `_refreshOpSlot()`, `_renderBadge()`, emits `operation-change`.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` has NO `s_installedModelIds` listener that refreshes prompt-box dropdown. Existing listener (line ~705) only handles zero-image-models case (opens shell modal). `installedModels` is `const`, frozen at mount.
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` `download:uninstalled` listener (lines 466–488) emits one of three `ui:success/warning/info` events with messages containing developer terms.
- Recent change in this session also confirmed: `MpiGroupHistoryBlock` no longer mounts its own `MpiModelsModal` (was a duplicate, caused double-toast). Only the shell-owned modal exists. This earlier fix should be preserved.

## Proposed approach

Touch four files with surgical edits. No new utilities, no abstraction.

1. **MpiPromptBox.js**
   - In `setModelList`: remove debug log. In the stale-model swap branch, ensure `activeOperation` becomes a valid op for the new model (use `next.supportedOps?.[0]`, already done). After `_refreshOpDropdown()` etc., this is sufficient because `_refreshOpDropdown` re-mounts dropdown with current `activeOperation`. The remaining gap: when caller (gallery) externally calls `setModelList` with the SAME model that has different op-validity context, no swap fires and op dropdown can stay stale. To cover both cases, after the `_refreshOpDropdown()` in `setModelList`, validate `activeOperation` against `model.supportedOps`; if invalid, set it to `supportedOps[0]` and re-call `_refreshOpDropdown()` once. Cheap idempotent guard.
   - Optional: the `model-change` emit inside the swap branch — gallery's handler will reassign `activeOperation = model.supportedOps[0]` AGAIN. Two writes converge, no harm. Leave as-is.

2. **MpiGalleryBlock.js**
   - Remove the two debug `console.log` lines.
   - In `model-change` handler (lines 231–236), after `activeOperation = model.supportedOps[0]`, also call `_pb?.el?.setOperation(activeOperation)` so op dropdown selectedValue and badge sync. This covers the user-driven model-change path (separate from the stale-swap path inside `setModelList`).

3. **MpiGroupHistoryBlock.js**
   - Add a `s_installedModelIds` listener that calls `_pb?.el?.setModelList?.(getModelsByType(modeKind).filter(m => m.installed !== false))`. Place near the existing `_onZeroInstalled` listener. Keep zero-image-models branch intact.
   - Note: `installedModels` is `const`, but listener doesn't reassign it; it passes a freshly computed list directly to `setModelList`. PromptBox owns its `modelList` ref internally. No need to change `const` to `let`.

4. **MpiModelsModal.js**
   - Rewrite `download:uninstalled` listener body to produce only three messages:
     - Full uninstall (`removed.length > 0 && keptTotal === 0`):
       `Events.emit('ui:success', { title: 'Uninstalled', message: `${modelName} uninstalled.` })`
     - Partial (`removed.length > 0 && keptTotal > 0`):
       `Events.emit('ui:info', { title: 'Uninstalled', message: `${modelName} uninstalled (some shared files kept).` })`
     - Nothing removed (`removed.length === 0`):
       `Events.emit('ui:warning', { title: 'Not uninstalled', message: `${modelName} — no files removed.` })`
   - Drop the `parts` array, `keptUniversal/keptShared/keptModelFiles/keptPipInstalls` breakdown, and any developer phrasing entirely. The destructured args stay the same (we still need them to compute `keptTotal`).

## Rules to follow (from CLAUDE.md)

- BEM, no raw `document.querySelector`, no raw `addEventListener`, etc. — none of these edits add UI or DOM listeners.
- Use `Events.on` / `Events.emit` for cross-component messaging — already in use here.
- Don't mutate `state` sub-objects — this plan doesn't touch state.
- Don't add comments unless WHY is non-obvious.
- No backwards-compat shims, no error fallbacks for impossible cases.

## To-Dos

- [x] **MpiPromptBox.js — drop debug log + validate op against new model's supportedOps in `setModelList`.**
  - File: `js/components/Organisms/MpiPromptBox/MpiPromptBox.js`
  - Remove the `console.log('[PromptBox] setModelList ...')` line at the top of `setModelList` (line ~247).
  - After the stale-swap branch (or unconditionally, just before `_refreshOpDropdown()`): if `model && !model.supportedOps?.includes(activeOperation)`, set `activeOperation = model.supportedOps?.[0] ?? activeOperation`. This guarantees op dropdown's selectedValue is valid for whatever model is current.
  - Verify: open gallery, uninstall the currently-selected model, confirm op dropdown auto-selects new model's first op (no `--Select--`).

- [x] **MpiGalleryBlock.js — drop debug logs + push activeOperation to PromptBox UI on model-change.**
  - File: `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
  - In `s_installedModelIds` listener (around lines 394–400): remove the two `console.log` calls. Keep the rest of the body.
  - In `model-change` handler on the PromptBox (around lines 231–236): after `activeOperation = model.supportedOps[0];`, add `_pb?.el?.setOperation(activeOperation);` so the op dropdown selectedValue + badge update visually.
  - Verify: in gallery, manually pick wan-22 from model dropdown — op dropdown should immediately show `t2v` (or whichever first supportedOp is).

- [x] **MpiGroupHistoryBlock.js — add live dropdown refresh on install/uninstall.**
  - File: `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
  - Locate the existing `_onZeroInstalled` listener registration (around line 705–708).
  - Add a second listener (push to `_unsubs` array): `Events.onState('s_installedModelIds', () => { _pb?.el?.setModelList?.(getModelsByType(modeKind).filter(m => m.installed !== false)); })`.
  - Either combine into the existing `_onZeroInstalled` callback (preferred — single subscription) OR keep separate. If combined, run the zero-image branch first, then the dropdown refresh.
  - Verify: open an image history workspace with several image models installed. Uninstall one of them via the models modal. Confirm the prompt-box dropdown updates live, removing the uninstalled model. If the uninstalled model was the currently-selected one, badge + op dropdown should auto-swap to the next available image model (covered by MpiPromptBox.setModelList stale-swap logic).

- [x] **MpiModelsModal.js — rewrite uninstall toast text to plain user-facing messages.**
  - File: `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
  - Replace the body of the `download:uninstalled` listener (lines 466–488). Keep the destructuring, keep `modelName` and `keptTotal`. Replace the three `Events.emit` blocks with the new strings (see "Proposed approach" section above).
  - Drop the `parts` array, drop `keptUniversal/keptShared/keptModelFiles/keptPipInstalls` references inside the `else` branch — they're no longer needed for messaging (still in destructuring so backend payload schema stays the same).
  - Verify: uninstall a model that has zero shared deps → toast says "Wan 2.2 Smooth uninstalled." Uninstall a model that shares deps with another installed model → toast says "Wan 2.2 Smooth uninstalled (some shared files kept)." Confirm no string contains "universal workflow", "pip", "shared dep" terminology.

## Out of scope

- Bug E from prior turn: install getting stuck after restoring uninstalled files from system trash, then "Cancel" reporting "installed". User flagged this as outside scope.
- Reworking `_refreshOpDropdown` to be diff-based instead of full re-mount — current re-mount is fine.
- Restoring the internal `Events.on('state:changed', ...)` listener inside MpiPromptBox that was removed earlier this session. Parent blocks (gallery + history) now own list management.
