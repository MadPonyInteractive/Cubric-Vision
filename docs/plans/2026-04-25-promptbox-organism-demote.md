# Plan: Demote MpiPromptBox to Organism + Kill PromptBoxService

**Created:** 2026-04-25
**Status:** Complete (2026-04-25 review pass — T1–T16 ✓; T17/T18 substituted by user desktop smoke test, browser path obsolete)
**Goal:** Move `MpiPromptBox` from `Blocks/` to `Organisms/`. Absorb media strip render into the organism. Delete `js/shell/promptBoxService.js` entirely. Blocks (Gallery, History) mount the organism directly into the persistent `#prompt-box-mount` slot. Organism self-subscribes `s_installedModelIds`. Remove the now-obsolete "Service Ownership & Reactive Behavior" docs section.

---

## Why

`MpiPromptBox` only imports Primitives + 1 Compound registry — it is tier-legal as an Organism. The service-ownership pattern existed solely because Organisms did not exist when `MpiPromptBox` was built; Blocks could not import other Blocks, so the shell-level service brokered access. Now that Organisms exist (introduced in the recent Gallery/History refactor), the service is dead weight: ~141 LOC of indirection that duplicates lifecycle logic across the codebase.

Killing the service:
- Removes ~141 LOC from `js/shell/promptBoxService.js`
- Collapses the dual media-state path (component owns `_mediaItems`, service paints chips)
- Eliminates the `_currentModelType` cache leaking into the shell layer
- Prevents future workspaces (audio, etc.) from re-implementing service-ownership wiring
- Aligns `MpiPromptBox` with the rest of the post-refactor component system

---

## Constraints (hard)

- `ComponentFactory` is locked. Do not modify `js/components/factory.js`.
- `ComponentFactory.mount(container, props)` does `container.innerHTML = html` — it does **not** auto-destroy a prior instance. Blocks MUST destroy the previous handle before remounting on the same slot.
- `#prompt-box-mount` lives in `index.html` at `#app-shell` level (line 110) and is OUTSIDE `#tool-container`. `navigation.js` clears `tool-container` but does NOT touch the prompt-box mount, so a prior instance persists across workspace switches unless the Block destroys it.
- All cross-component communication must use `Events.on/emit`. No raw `window.addEventListener` or `document.querySelector` in components.
- Project state binding (operation/model settings) lives in `PromptBoxControls.js` already — do not touch that file.
- Keep events: `workspace:set-operation`, `workspace:inject-prompts` (Gallery cards rely on it).

---

## Investigation Findings (from parallel sub-agents)

### A. PromptBoxService call sites (25 total)

**`js/services/generationService.js`** (NOT a Block — needs Events-based replacement):
- Line 12: `import { PromptBoxService } from '../shell/promptBoxService.js';`
- Line 88: `PromptBoxService.component?.setGenerating(false);` (in `exec.onComplete`)
- Line 188: `PromptBoxService.component?.setGenerating(false);` (in `exec.onError`)

**`js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`**:
- Line 19 (import), 84 (`injectMedia`), 243 (`updateContext`), 334 (`mount`), 343 (`show`), 374-375 (hide/show on selection), 380 (`setOperation`), 401 (`component` null-check), 406 (`mount`), 414 (`show`).

**`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`**:
- Line 20 (import), 205/209 (show/hide), 326 (`injectMedia`), 360 (`updateContext`), 370 (`setOperation`), 390 (`mount`), 400 (`updateContext`), 411 (`setModel`), 578 (show).
- Plus dead `id="prompt-box-mount"` in template (~line 335).

### B. Media strip CSS — already colocated

All `.mpi-prompt-box-media-strip*` rules already live in `js/components/Blocks/MpiPromptBox/MpiPromptBox.css` (lines 209–281). No grep-and-move across files needed. `.mpi-prompt-box-host` is unstyled — can be deleted.

### C. Shell init — single touch point

`js/shell.js` line 23 (import) + line 76 (`PromptBoxService.init(promptBoxMount)`). No init-order dependencies. No other file in `js/shell/` or `js/services/` reaches into `#prompt-box-mount`.

### D. Mount-sharing pattern

Each Block must call `this._pb?.destroy?.()` before remounting, AND clear `this._pb` in its own `el.destroy`. No helper needed — direct pattern is fine. The persistent `#prompt-box-mount` slot survives navigation; a stale handle in memory leaks subscriptions if not destroyed.

### E. generationService replacement

Best fit: **Events-based**. Block emits `promptbox:set-generating` (or organism listens internally to existing run/cancel events). `generationService` uses `Events.emit('promptbox:generation-end')` instead of reaching for the component. This keeps `generationService` decoupled from the mount lifecycle.

Concrete: organism listens for `promptbox:generation-end` → calls `setGenerating(false)` internally. `generationService` emits the event in `onComplete`/`onError`.

### F. Hidden coupling — none

`prompt-box-mount`, `mpi-prompt-box-host`, `_boxHostEl`, `_stripEl` only referenced in `shell.js`, `promptBoxService.js`, `MpiGroupHistoryBlock.js` (dead). No surprise dependencies.

### G. Dev gallery — no entry

`js/pages/components.js` does not import `MpiPromptBox`. `js/components/types.js` labels it as Block — must update to Organism. No demo to migrate.

---

## Risks

1. **Forgetting to destroy the prior `_pb` handle on remount** → subscription leak + duplicate `state:changed` handlers. Mitigation: explicit destroy step in Block setup BEFORE mount; verify in `el.destroy`.
2. **`setGenerating` event mis-fires** → run button stuck in active state. Mitigation: emit only from `onComplete`/`onError`; organism listens once via `_unsubs`.
3. **Media strip layout drift** — strip currently rendered as sibling above the box (`.mpi-prompt-box-media-strip` is `position: fixed`). Once absorbed inside the organism template, verify the `position: fixed` + bottom calc still works (it should, since z-index/positioning is viewport-relative).
4. **Stale instance reference inside organism** — if a Block forgets to null `this._pb` on destroy, a follow-up call to `this._pb.el.show()` could fire on a destroyed element. Mitigation: optional chaining + null after destroy.
5. **Doc drift** — `.claude/rules/components.md` "Service Ownership & Reactive Behavior" section (lines 39–54) and the matching `CLAUDE.md` table reference. Both must update; orphan docs are confusing.

---

## To-Dos (execution order)

### Phase 1 — Setup & docs (low-risk, no runtime impact)

- [x] **T1.** Update `js/components/types.js`: change `MpiPromptBox` typedef header from `(Block — js/components/Blocks/MpiPromptBox)` to `(Organism — js/components/Organisms/MpiPromptBox)`. Search for all references that mention the Block path.

- [x] **T2.** Update `js/shell/preloadStyles.js`: change CSS path from `js/components/Blocks/MpiPromptBox/MpiPromptBox.css` to `js/components/Organisms/MpiPromptBox/MpiPromptBox.css`.

- [x] **T3.** Remove dead `id="prompt-box-mount"` from `MpiGroupHistoryBlock.js` template (~line 335). Verify no JS reads it locally before removing.

### Phase 2 — Move + extend organism

- [x] **T4.** Move directory: `git mv js/components/Blocks/MpiPromptBox js/components/Organisms/MpiPromptBox`. Includes `MpiPromptBox.js`, `MpiPromptBox.css`, `PromptBoxControls.js`, any sub-files.

- [x] **T5.** In `js/components/Organisms/MpiPromptBox/MpiPromptBox.js`:
  - Update CSS import path declared in `ComponentFactory.create({ css: [...] })` to the new Organisms path.
  - Add `mpi-prompt-box-media-strip` element to template directly above the main box element (replaces what the service used to scaffold). Remove the `.mpi-prompt-box-host` wrapper concept entirely.
  - Add `_renderStrip(items)` private function inside `setup`, mirroring the logic from `promptBoxService.js:40-58`. Use `qs(el, '.mpi-prompt-box-media-strip')` from `js/utils/dom.js`.
  - Wire it: in the existing `_emitMediaChange` / `media-change` flow, also call `_renderStrip(_mediaItems)`.
  - Add `el.show = () => el.classList.remove('hide')` and `el.hide = () => el.classList.add('hide')` methods. (`#prompt-box-mount` `.hide` toggling moves to the organism's own root.)
  - Add `s_installedModelIds` subscription inside `setup`. Capture `_currentModelType` from `props.model?.mediaType || props.modelList?.[0]?.mediaType`. Subscribe via `Events.on('state:changed', ...)` and refresh dropdown via internal `setModelList` path. Push unsubscribe into `_unsubs`.
  - Add listener for `promptbox:generation-end` event → call `setGenerating(false)`. Push unsubscribe into `_unsubs`.
  - Verify `el.destroy` collects every subscription (existing `workspace:*` subs + new ones) into `_unsubs` and runs them.
  - Confirm `injectPrompts({ positive, negative })` and `injectMedia({ url, mediaType })` already exist on `el` (they do — lines 203-279 of original) and remain reachable.

- [x] **T6.** In `js/components/Organisms/MpiPromptBox/MpiPromptBox.css`:
  - Adjust strip positioning if it changes when nested inside the organism root. Likely keep `position: fixed` + bottom calc; verify visually.
  - Delete any `.mpi-prompt-box-host` rules if present (audit confirmed none exist; double-check).

### Phase 3 — Block migration (Gallery first, then History)

- [x] **T7.** Update `MpiGalleryBlock.js`:
  - Replace `import { PromptBoxService } from '../../../shell/promptBoxService.js';` with `import { MpiPromptBox } from '../../Organisms/MpiPromptBox/MpiPromptBox.js';`.
  - Add `import { qs } from '../../../utils/dom.js';` if not already imported.
  - In `setup`, before the first mount: `this._pb?.destroy?.();` then `this._pb = MpiPromptBox.mount(qs('#prompt-box-mount'), { ... });`. Apply same pattern at line 406.
  - Replace each `PromptBoxService.show()` → `this._pb?.el?.show()`; `.hide()` → `this._pb?.el?.hide()`.
  - Replace `PromptBoxService.injectMedia(...)` → `this._pb?.el?.injectMedia(...)`.
  - Replace `PromptBoxService.component?.foo(...)` → `this._pb?.el?.foo(...)` (covers `setOperation`, `updateContext`, etc.).
  - Replace `if (!PromptBoxService.component && ...)` → `if (!this._pb?.el && ...)`.
  - Extend Block's `el.destroy` to call `this._pb?.destroy?.()` and null `this._pb`.

- [x] **T8.** Apply the same migration to `MpiGroupHistoryBlock.js` (line list above). Same pattern.

### Phase 4 — Service deletion + shell cleanup

- [x] **T9.** Update `js/services/generationService.js`:
  - Remove line 12 `import { PromptBoxService }`.
  - Replace line 88 + line 188 `PromptBoxService.component?.setGenerating(false)` with `Events.emit('promptbox:generation-end')`. Add `Events` import if missing.

- [x] **T10.** Update `js/shell.js`: remove line 23 import + line 76 `PromptBoxService.init(...)` + the now-unused `promptBoxMount` const (or keep the `qs` lookup if anything else uses it — verify; likely delete entirely).

- [x] **T11.** **DELETE** `js/shell/promptBoxService.js`.

### Phase 5 — Doc updates

- [x] **T12.** Edit `.claude/rules/components.md`: remove the entire "Service Ownership & Reactive Behavior" section (lines 39–54). Adjust surrounding heading separators so structure stays clean.

- [x] **T13.** Edit `CLAUDE.md`: remove or update the table row that mentions PromptBoxService / shell-services entry, if applicable. Search for "PromptBoxService" in CLAUDE.md.

- [x] **T14.** Edit `docs/shell.md` (if it documents PromptBoxService): remove that subsection.

### Phase 6 — Verification

- [x] **T15.** Grep `PromptBoxService` across the entire repo. Expect zero hits.

- [x] **T16.** Grep `Blocks/MpiPromptBox` across the repo. Expect zero hits (only `Organisms/MpiPromptBox`).

- [x] **T17.** Run app in browser at `http://127.0.0.1:3000/`:
  - Gallery workspace: PromptBox renders, media strip appears on drag-drop, run button toggles on `setGenerating`, model dropdown refreshes when a new model is installed.
  - History workspace: PromptBox renders, `setOperation` from history-row click works, `injectMedia` from preview works, show/hide toggles based on operation type.
  - Switch Gallery ↔ History: no duplicate event handlers (check console for warnings), no orphan listeners (Block destroy fires `_pb.destroy`).
  - Card "use prompts" button (Gallery): `workspace:inject-prompts` event still injects into the box.
  - Run a generation: completion + error paths both clear the `setGenerating` state via `promptbox:generation-end`.

- [x] **T18.** Tail `logs/app.log` last 50 lines after the manual test — no errors related to PromptBox.

---

## Out of scope

- Splitting the media strip into its own sub-organism (deferred — single organism is fine for now).
- Changing `PromptBoxControls.js` project-state binding.
- Adding a dev-gallery demo entry for `MpiPromptBox` (separate task; the brainstorm confirmed there is none today).
- Touching the audio workspace (not yet built).

---

## Rollback

If verification fails: revert via `git restore` on the modified Block files, undo `git mv` (`git mv` reverses cleanly), restore `promptBoxService.js` from git, restore the Service Ownership section in `components.md`. All changes are in tracked files except the directory move, which `git` handles natively.
