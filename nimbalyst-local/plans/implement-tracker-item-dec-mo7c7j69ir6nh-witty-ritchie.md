# Plan: Disable text-only ops when media present in PromptBox

Tracker: `dec_mo7c7j69ir6nhh` — decision, high priority.

## Context

When user drops/loads images (or videos) into the PromptBox, text-only operations (`t2i`, `t2v`) cannot consume that reference media — they ignore it. Today they remain selectable in the Op dropdown, which is misleading: a user can pick `t2i` while an image sits loaded, and the image is silently discarded at run time.

Goal:
1. When media is present in the PromptBox, mark text-only ops (any op with `requiresImages = 0` AND `requiresVideo = 0`) as **disabled** in the Op dropdown — still visible so the user knows the op exists for the model, but unselectable. This mirrors the existing pattern for image-requiring ops when no image is present.
2. If the currently-selected op becomes disabled as a result (i.e. user had `t2i` selected and dropped an image), auto-select the first remaining ENABLED op that supports the present media (preferring an op whose `requiresImages`/`requiresVideo` are met by the current `imageCount`/`videoCount`).
3. When all media is removed, text-only ops return to enabled state. Do NOT auto-revert the selection — user keeps whatever op they're on.

## Current State (verified)

- **Component:** `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`
  - `_mediaItems[]` (line 99) holds media; `_emitMediaChange()` (line 109) sets `el.imageCount`/`el.videoCount` and emits `'media-change'`.
  - `activeOperation` (line 78) is the selected op key.
  - `_refreshOpDropdown()` (line 438) builds the Op dropdown via `getAvailableCommands()`. Today it maps each cmd to `{ value, label, disabled: !cmd.available }` (line 447) — so the disable mechanism is already wired up. The existing `cmd.available` flag (set in `getAvailableCommands`, line 201) is computed from `imageCount >= requiresImages && videoCount >= requiresVideo && (!requiresMask || hasMask)`. There is also a `_context.filterNoInputOps` HIDE branch (lines 443-445); we will NOT use that — we want disable, not hide.
  - `el.setOperation(key)` (line 184) updates op + refreshes dropdown/slot/badge and emits `operation-change`.
- **Registry:** `js/data/commandRegistry.js`
  - `commands` map declares `requiresImages` and `requiresVideo` per op (lines 50-173).
  - Text-only ops in scope: `t2i` (line 55, requiresImages 0), `t2v` (line 110, requiresImages 0, no requiresVideo).
  - `getAvailableCommands(mediaType, model, ctx)` (line 190) returns `{ key, available, ...cmd }`. `available` already reflects `imageCount`/`videoCount`/`hasMask`.

The existing `cmd.available` flag from `getAvailableCommands` already drives `disabled` in the dropdown. To extend it to text-only ops, we add a tiny rule in the dropdown build: if `hasMedia && requiresImages === 0 && requiresVideo === 0` for that op's media-type lane, force `disabled = true`. Then auto-switch the active op if it lands on a disabled entry.

## Approach

Single component-local change inside `MpiPromptBox.js`. No registry changes, no new events, no state mutations.

Two parts:
- **Disable rule** in `_refreshOpDropdown()`: extend the `disabled` computation per cmd.
- **Auto-switch** in `_emitMediaChange()`: when media arrives and `activeOperation` is now disabled, pick a fallback and call `el.setOperation(fallback)`.

### Edits — all in `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`

1. **Modify `_refreshOpDropdown()` (line 438):**
   - Keep `getAvailableCommands(model.mediaType, model, _context)` call — but ensure `_context` carries up-to-date `imageCount`/`videoCount` (set by step 2 below) so existing `available` flag stays accurate.
   - Drop the `filterNoInputOps` HIDE branch (lines 443-445) since we're disabling, not hiding. Leave the field unconsumed — harmless. (If easier, leave the branch in place; it isn't currently triggered by anyone we care about. Decide during execution after a quick grep for `filterNoInputOps`.)
   - Compute `hasMedia = el.imageCount > 0 || el.videoCount > 0`.
   - Map each cmd to:
     ```
     const isTextOnly = (cmd.requiresImages ?? 0) === 0 && (cmd.requiresVideo ?? 0) === 0;
     const disabled = !cmd.available || (hasMedia && isTextOnly);
     return { value: cmd.key, label: cmd.label, disabled };
     ```
   - Rest of dropdown build unchanged. The `t2i`/`t2v` entries stay visible but greyed out.

2. **Extend `_emitMediaChange()` (line 109):**
   - After setting `el.imageCount`/`el.videoCount`, update `_context = { ..._context, imageCount: el.imageCount, videoCount: el.videoCount }`. This lets `getAvailableCommands` correctly mark image-requiring ops `available` and updates the dropdown's `disabled` calc.
   - Compute `hasMedia = el.imageCount > 0 || el.videoCount > 0`.
   - If `hasMedia` and current op is text-only (`commands[activeOperation]` has `requiresImages === 0 && requiresVideo === 0`):
     - Compute fallback via `_pickFallbackOp()` (helper below).
     - If fallback found, call `el.setOperation(fallback)` — this triggers `_refreshOpDropdown` + `_refreshOpSlot` + `_renderBadge` + emits `operation-change`.
     - If no fallback (model only supports text-only ops for that mediaType), leave the op as-is. The dropdown will show the active op as disabled; `MpiDropdown` should still display the current value's label even when disabled (verify during execution; if not, the `t2i`-only model case is unreachable anyway since `acceptsImage` guard at line 144/157 blocks the drop).
   - If no auto-switch is needed, call `_refreshOpDropdown()` directly so the disable state updates.
   - Then emit `'media-change'` as today.

3. **Add helper `_pickFallbackOp()`** near `_refreshOpDropdown()`:
   ```
   function _pickFallbackOp() {
       if (!model) return null;
       const cmds = getAvailableCommands(model.mediaType, model, _context);
       const candidates = cmds.filter(c => (c.requiresImages ?? 0) > 0 || (c.requiresVideo ?? 0) > 0);
       // Prefer one whose requirements are met by current media counts.
       const ready = candidates.find(c => c.available);
       return (ready ?? candidates[0])?.key ?? null;
   }
   ```

4. **Initial sync:** none needed. PromptBox mounts empty → `hasMedia` is false on first render; existing initial `_refreshOpDropdown()` already runs.

## Files to Modify

- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — only file touched.

## Existing Utilities Reused

- `getAvailableCommands(mediaType, model, ctx)` — `js/data/commandRegistry.js:190`
- `commands[key]` map — `js/data/commandRegistry.js:50` (read `requiresImages`, `requiresVideo`)
- `el.setOperation(key)` — `MpiPromptBox.js:184` (handles dropdown/slot/badge refresh + emits `operation-change`)
- Existing `disabled: !cmd.available` mapping in `_refreshOpDropdown()` — `MpiPromptBox.js:447` (extended, not replaced)

## Rules Compliance

- No new global state, no `state` mutation — all internal to component.
- No new events emitted; existing `operation-change` already fires via `setOperation`.
- No CSS changes, no new icons.
- Cleanup: no new listeners or observers created → no `_unsubs` additions needed.

## Verification

Manual (browser at http://127.0.0.1:3000/):

1. Open a workspace with PromptBox visible. Pick a model that supports both `t2i` and `i2i` (e.g. SDXL).
2. Op dropdown shows `t2i, i2i, ...` all enabled (well, image-requiring ones disabled until image present, per existing behavior). Select `t2i`.
3. Drop an image into the PromptBox.
   - Expect: `t2i` is still listed but **disabled/greyed**. Image-requiring ops (`i2i`, `upscale`, `edit`, ...) become enabled. Selected op auto-switches to `i2i` (or first image-supporting available op). `operation-change` fires. Op slot controls update to match the new op.
4. Remove the image (clear media).
   - Expect: `t2i` re-enables in dropdown. Image-requiring ops become disabled again. Selection stays on `i2i` (no auto-revert).
5. Repeat with a video model and `t2v` → `i2v` transition when video drops. Confirm `t2v` shows disabled while video loaded.
6. Edge: model that only supports `t2i` (no image ops). Drop image → it should be rejected by `acceptsImage` guard at line 144/157 before reaching `_tryAddMedia`, so this path is unreachable. Confirm by looking at toast.
7. Edge: confirm `MpiDropdown` honors per-option `disabled: true` — open the dropdown menu and verify the disabled entry is unselectable (cursor / styling). Should match the existing image-required-but-no-image disable behavior already shipping.

Console / log:
- Tail `logs/app.log` for any errors after each step.
- No backend changes, so no server-side verification needed.

After implementation: call `tracker_update` with `id: "dec_mo7c7j69ir6nhh"`, `status: "done"`.
