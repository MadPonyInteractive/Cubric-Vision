# Hotkey System Refactor — Clean-slate, No Backward Compat

**Goal:** Single declarative source of truth for hotkeys. Fix root bug where `_handleKeyDown` calls `preventDefault`/`stopPropagation` unconditionally on match (blocks `space`/`B`/`E` typing in prompt boxes). Make MpiHelp render dynamically from registry.

**Status:** Planning complete — investigation files at `/tmp/investigation/01-current-manager.md`, `02-call-site-conflicts.md`, `03-mpihelp-current.md`.

**Source of truth:** App is unreleased. No legacy path. Old `register()`/`registerKeyup()`/`unregister()` API deleted entirely; all call sites migrated atomically.

---

## Out of scope

- `Ctrl+Enter` to submit prompt — not yet reimplemented post-refactor; future work
- Adding any new hotkeys beyond what already exists
- Changing what hotkeys do — only how they are wired

---

## Reserved keys (global policy)

- `tab` — always reserved for the radial menu. Any new feature needing tab uses `shift+tab` or a chord.

---

## Architecture (approved)

1. **`js/managers/hotkeyRegistry.js`** — declarative array of entries. Shape:
   ```js
   { id, key, category, scopeLabel, description, when(ctx), allowWhileTyping }
   ```
   `id` = stable string (e.g. `'overlay.close'`, `'mask.brush'`). `when(ctx)` optional — global gates only (currentPage, focusMode). Component-local gates handled via bind lifecycle (component binds on enter, unbinds on exit).

2. **`js/managers/hotkeyManager.js`** — full rewrite. API:
   - `bind(id, handler) → unbindFn`
   - `unbind(id, handler)`
   - `getRegistry() → entries[]` (for MpiHelp)
   No other public methods. No `register`/`registerKeyup`/`unregister`.

3. **Gating chain at keydown** (in order):
   1. Look up entry by normalized key string
   2. `isTyping` = `activeElement` is `INPUT`/`TEXTAREA`/`[contenteditable]`
   3. If `isTyping && !entry.allowWhileTyping`: block single-letter & bare-modifier keys; pass `Ctrl+`-chords and `F`-keys
   4. If `entry.when` defined: evaluate `when({ state, event, activeElement, isTyping })`
   5. Only if all guards pass → call handler → call `preventDefault`/`stopPropagation`

4. **Window listener** uses `on()` from `js/utils/dom.js` with capture, retains cleanup fn.

5. **MpiHelp** rebuilt: imports `getRegistry()`, groups entries by `category` then `scopeLabel`, renders BEM list. Preserves `.mpi-help` block, MpiOverlay wrapper, current visual layout.

---

## Conflict resolutions (decided in plan, executed in to-dos)

| Conflict | Decision |
|----------|----------|
| `b`/`e` in MpiToolOptionsMask + InputController | Keep both. MpiToolOptionsMask = workspace-level UI binding (id `mask.brush.toolbar`, `mask.eraser.toolbar`); InputController = inner-canvas focus binding (id `mask.brush.canvas`, `mask.eraser.canvas`). Both call same Events.emit. |
| `shift` in cropTool.js + CropManager | cropTool.js is active (imported by MpiVideoViewer). Consolidate: CropManager owns the shift bind for canvas crop; cropTool.js owns shift for video crop. Different ids (`crop.shift.canvas`, `crop.shift.video`). No double-bind on same key path. |
| `escape` in overlayManager + focusModeService + MpiGalleryGrid | Layer by lifecycle: overlay binds while overlay open; focus binds while focus mode on; gallery binds while selection mode active. Standardize key string to `'escape'` lowercase everywhere. First-bound-wins is fine because all three layers are mutually exclusive in practice. |
| `'Escape'` vs `'escape'` case mismatch in MpiGalleryGrid | Standardize to lowercase. Entry `id` is canonical; key normalization in manager. |

---

## To-dos

- [ ] **1. Build `js/managers/hotkeyRegistry.js` with all current hotkey entries declared**

  Create the new file. Declare every existing hotkey as a `HOTKEY_REGISTRY` array entry with `{ id, key, category, scopeLabel, description, when, allowWhileTyping }`.

  Entries to include (one per current registration site after conflict resolution):
  - `overlay.close` → `escape`, allowWhileTyping: true
  - `focusMode.toggle` → `f`
  - `focusMode.exit` → `escape`, allowWhileTyping: true
  - `memory.refresh` → `f5`
  - `mask.brush.toolbar` → `b`
  - `mask.eraser.toolbar` → `e`
  - `mask.brush.canvas` → `b`
  - `mask.eraser.canvas` → `e`
  - `memoryMonitor.ctrl.down` → `control` (keydown)
  - `memoryMonitor.ctrl.up` → `control` (keyup)
  - `gallery.selection.exit` → `escape`, allowWhileTyping: true
  - `gallery.size.inc` → `+` (single entry)
  - `gallery.size.dec` → `-`
  - `devtools.toggle` → `control+shift+i`, when: `ctx => APP_CONFIG.dev_mode`
  - `radialMenu.toggle` → `tab`
  - `modal.confirm` → `enter`
  - `crop.shift.canvas` → `shift` (down + up)
  - `crop.shift.video` → `shift` (down + up)
  - `canvas.pan.start` → `space` (down)
  - `canvas.pan.end` → `space` (up)

  Export `HOTKEY_REGISTRY` and a helper `getEntryById(id)`.

  Also export a `KEY_TYPE` enum for `'down' | 'up'` and include `type` on the relevant entries.

  **Verify:** Add a temporary `console.log('[hotkeyRegistry]', HOTKEY_REGISTRY.length, 'entries')` in the file. Reload app. Look in browser dev tools console for `[hotkeyRegistry] N entries` where N matches the count above. Confirm no duplicate `id` values by also logging `new Set(HOTKEY_REGISTRY.map(e => e.id)).size`.

- [ ] **2. Rewrite `js/managers/hotkeyManager.js` and migrate ALL call sites atomically**

  This is one to-do because old API deletion + call site migration cannot be split without breaking the app.

  **2a. Manager rewrite:**
  - Public API only: `bind(id, handler)`, `unbind(id, handler)`, `getRegistry()`, `init()` (call on shell startup)
  - Internal: `Map<id, Set<handler>>` (multi-bind allowed; one entry can have many handlers, all called)
  - Window listeners attached via `on()` from `js/utils/dom.js` with `{ capture: true }`
  - Key normalization helper (lowercase, modifier composition `control+shift+i`)
  - `_resolveEntry(event)` returns matching entry from registry by normalized key + type (down/up)
  - Gating chain in order: lookup → isTyping guard → `when(ctx)` → fire handlers → `preventDefault`/`stopPropagation`
  - `isTyping` = `INPUT`/`TEXTAREA`/`[contenteditable]` test
  - `allowWhileTyping` per-entry override
  - Single-letter detection: `event.key.length === 1` and no `ctrlKey`/`metaKey`
  - Bare modifier detection: `event.key` in {`Shift`,`Alt`,`Control`,`Meta`} with no other modifier held
  - F-keys always pass isTyping
  - Export the `Hotkeys` singleton with the new API only. No legacy methods.

  **2b. Migrate all 13 call sites** (replace every `Hotkeys.register(...)` / `Hotkeys.registerKeyup(...)` / `Hotkeys.unregister(...)`):
  - `js/managers/overlayManager.js`
  - `js/utils/cropTool.js` (id `crop.shift.video`)
  - `js/shell/focusModeService.js`
  - `js/shell/memoryOps.js`
  - `js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.js`
  - `js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js`
  - `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` (also fix `'Escape'` → `'escape'` is no longer relevant since now uses id `gallery.selection.exit`)
  - `js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js`
  - `js/components/Primitives/MpiModal/MpiModal.js`
  - `js/components/Primitives/MpiCanvas/managers/CropManager.js` (id `crop.shift.canvas`)
  - `js/components/Primitives/MpiCanvas/managers/InputController.js`

  Each component must collect unbind fns in `_unsubs` and call in `destroy()`.

  **2c. Delete legacy:** Confirm zero matches for `Hotkeys.register`, `Hotkeys.registerKeyup`, `Hotkeys.unregister` in `js/` after migration.

  **Verify (multiple checks; do all):**
  1. Reload app. Click into the prompt box (textarea). Type `B big eraser ending`. Confirm all letters and the space appear in the textarea — none of them toggle the brush/eraser or pan the canvas. Look in the browser dev tools console for the temporary log `[hotkey] blocked while typing: b` (add this log inside the isTyping block during implementation).
  2. Click outside the prompt box on the canvas. Press `B` — brush activates. Press `E` — eraser activates. Press and hold `space` — canvas pan engages; release — pan ends.
  3. Open any overlay. Press `Esc` — overlay closes. Open an overlay that contains a textarea, focus the textarea, press `Esc` — overlay still closes (allowWhileTyping path).
  4. Press `F` — focus mode toggles. Press `F5` — memory refresh fires.
  5. Open radial menu via `Tab` — menu appears. Press `Tab` again — menu cycles/closes per existing behavior.
  6. Enter gallery selection mode, press `Esc` — selection exits.
  7. Open a confirm modal, press `Enter` — modal confirms.
  8. Run a project-wide grep for `Hotkeys.register` / `Hotkeys.registerKeyup` / `Hotkeys.unregister` under `js/` — confirm zero matches.

  Remove the temporary console.logs from step 1 before marking the to-do done.

- [ ] **3. Rewrite `js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js` to render dynamically from registry**

  - Delete the static innerHTML hotkey list
  - Import `getRegistry` from `hotkeyManager` (or `HOTKEY_REGISTRY` from `hotkeyRegistry`)
  - Group entries by `category`, then within each category by `scopeLabel`
  - Render BEM list items: `.mpi-help__row`, `.mpi-help__key`, `.mpi-help__desc`
  - Preserve existing `.mpi-help` block CSS, MpiOverlay wrapper, header subheading divider pattern
  - For multi-key entries, render keys joined by `/`
  - Skip entries that have no `description` (defensive)

  **Verify:** Open the app, navigate to where MpiHelp opens (per `projectUI.js` mount). Open MpiHelp. Confirm all hotkey categories appear, each with the correct scope subheading, and the listed keys match the new registry. Specifically check: `B` and `E` appear under the mask category; `Esc` appears under overlay/focus/gallery; `Tab` appears under radial menu; `F` appears under focus mode; `F5` appears under memory.

- [ ] **4. Update docs and ESLint rule to reference the new API**

  Files to update (text replacement of the old API names with the new ones):
  - `docs/shell.md` (lines 33-34: `Hotkeys.register/unregister` → `Hotkeys.bind/unbind`)
  - `docs/components.md` (lines 50-51)
  - `docs/PROJECT.md` (line 44)
  - `.claude/rules/components.md` (lines 15, 147-148)
  - `.claude/rules/component-events.md` (lines 185, 300)
  - `.eslint-rules/no-window-hotkey.js` (line 5 description, line 41 message — replace `Hotkeys.register` with `Hotkeys.bind`)
  - `CLAUDE.md` (Critical Rules Snapshot line referencing `Hotkeys.register`/`Hotkeys.unregister`)

  Add a new short section to `docs/shell.md` describing the registry pattern: how to add a hotkey (declare in registry, bind in component) and the isTyping/when gating model.

  **Verify:** Run a project-wide grep for `Hotkeys.register` and `Hotkeys.unregister`. Confirm zero matches in `js/`, `docs/`, `.claude/`, `.eslint-rules/`, and `CLAUDE.md`. Run ESLint against a file containing `window.addEventListener('keydown', ...)` — rule still fires with the updated message.

---

## Notes for executor

- Follow the project's component lifecycle rule: any component calling `Hotkeys.bind` MUST collect the returned unbind in `_unsubs` and call it in `destroy()`.
- Use `on()`/`off()` from `js/utils/dom.js` inside `hotkeyManager` — never raw `addEventListener`.
- BEM in MpiHelp restyle. CSS vars from `styles/01_base.css`. No hardcoded colors.
- After to-do 2 step 3 is verified, the original bug (typing blocked in prompt box) is closed — that is the load-bearing acceptance.
- After to-do 4, ask the user about the documentation drift rule: should `.claude/rules/component-events.md` and `component-mounts.md` be regenerated to reflect the new id-based binds?
