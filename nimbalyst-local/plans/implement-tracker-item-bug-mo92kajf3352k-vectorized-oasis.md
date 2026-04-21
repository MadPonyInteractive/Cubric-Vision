# Plan: Fix missing "generation finished" toast

**Tracker:** `bug_mo92kajf3352kn`

## Context

When ComfyUI generation completes successfully, no toast appears. User expects a success-variant toast saying generation finished.

Toast infrastructure already wired up — `StatusBar.progress.complete()` at `js/shell/statusBar.js:172-204` mounts an `MpiToast` with `variant: 'success'` when `silent=false`. But the `tool:idle` listener at line 239 calls `complete('Done!', true)`, silencing the toast.

Root cause: the `silent=true` flag on line 239.

### Regression origin (confirmed via git)

Commit `e2ce32a` ("Refactor: Gallery prompt box plan implemented.") introduced the `silent` param AND flipped the `tool:idle` call site to `complete('Done!', true)`. Before that commit, the toast fired via `complete('Done!')`. This confirms it *was* working before and the refactor disabled it.

### No competing implementation

Verified no other code attempts a generation-complete toast:
- `MpiToast.mount` callers: statusBar, downloadService, components demo, MpiPromptBox (warning). None tied to `generation:complete`.
- `generation:complete` listeners: `MpiGalleryBlock.js:375`, `MpiGroupHistoryBlock.js:209` — both update gallery/history UI only, no toast.
- `progress.complete` callers: components demo (button test), MpiCanvasViewer (crop saved), statusBar itself. No duplication.

Single fix site = `statusBar.js:239`.

## Change

**File:** `js/shell/statusBar.js:239`

Before:
```javascript
if (tool === 'groupHistory') StatusBar.progress.complete('Done!', true);
```

After:
```javascript
if (tool === 'groupHistory') StatusBar.progress.complete('Generation finished', false);
```

Rationale:
- Drop `silent=true` → toast fires.
- Message upgraded from `'Done!'` to `'Generation finished'` per tracker wording.
- Existing success-variant path in `complete()` (lines 191-201) is already correct — no edits needed there.

## Files touched

- `js/shell/statusBar.js` (one line)

## Verification

1. Start app (Electron or browser at `http://127.0.0.1:3000/`).
2. Run a ComfyUI generation (any groupHistory operation) to successful completion.
3. Expect: green success toast with text "Generation finished", ~3s duration, auto-dismiss.
4. Cancel path: trigger `tool:cancelled` — confirm no toast (handled by `cancel()`, unchanged).
5. Error path: trigger workflow failure — confirm error toast via `ui:error` still works (unchanged).

## Non-goals

- No refactor of toast mount pattern.
- No changes to `generation:complete` event listeners in gallery/history blocks.
- No new event wiring — `tool:idle` already dispatched by `generationService.js`.

## Post-implement

Call `tracker_update` with id `bug_mo92kajf3352kn`, status `done`.
