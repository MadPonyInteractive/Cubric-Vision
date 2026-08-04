# MPI-318 — Drag cards out to the file system

## STOP. Read these before writing any code.

The previous attempt (2026-07-20) failed *because it skipped this step*. Route through
the Context Router in `CLAUDE.md`, then read:

- `.claude/rules/components.md` — component/event contracts
- `docs/gallery.md` — gallery cards, selection, drag/drop
- `.claude/rules/events.md` — cross-component payload contract
- `.claude/rules/dos_and_donts.md` — baseline

The answer to "what else consumes this dragstart?" is in those docs. The last session
grepped instead of routing, and that single shortcut is the whole reason this card exists.

## The goal (user's words)

> "drag a card into a folder and keep dragging cards into a folder to create a small
> library in my file system"

So: **multi-select drag-out**, each file landing with its **real on-disk name**. The user
noted this is largely the same job as the existing right-click Download — same
selection → group → `filePath` list — differing only in where the destination comes from
(folder picker vs. OS drop target).

## What is broken today (pre-existing, still true after the revert)

Dragging a card to Explorer drops a file named `project-file.png`, sourced from
`C:\WINDOWS`. Every card produces that same name, so dropping a second card raises a
Windows "file already exists" conflict dialog. Cause: the card drags the `<img>` element's
HTTP URL (`/project-file?path=...`), and the OS names the dropped file from the URL path.

Also observed and **never explained**: pressing Cancel on that Windows conflict dialog
made the app exit. `main.js` has no `render-process-gone` / `uncaughtException` handler, so
a renderer death leaves nothing in `logs/app.log` — the log had no trace. Adding those
handlers first would turn a silent exit into a reason. Treat the crash as an open,
undiagnosed issue; do not assume it was caused by the reverted code (that code was not
even running at the time of the first crash report).

## What was tried and why it was reverted

Approach: Electron native drag-out. Renderer sends abs paths over IPC; main calls
`webContents.startDrag({ file, files, icon })`.

**It worked** — real filenames, multi-file drop in one gesture. Then it broke something else.

**The fatal detail: `e.preventDefault()` in the card's `dragstart`.**
`startDrag` only wins if the browser's own URL drag is suppressed, so the agent called
`preventDefault()`. But that same `dragstart` serves **two destinations**:

1. `dataTransfer.setData('application/mpi-media', ...)` → in-app drops (prompt chips)
2. the browser drag itself → what the OS drag-out was riding on

`preventDefault()` kills the HTML5 drag, so no in-app drop event ever fires. Result: cards
dragged *within* the library stopped going to the prompt and were treated as **imported
cards** instead. The `dataTransfer` payload was still set — it just had no delivery path.

Both behaviours can coexist, but **not** by suppressing the browser drag unconditionally.
Sketch options (decide after reading the docs, do not assume):
- gate native drag on a modifier key or on the drop target
- keep the HTML5 drag as-is and give drag-out its own affordance
- detect internal vs. external drop and choose per-drag

Touch points from the reverted attempt (for orientation only — all reverted):
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` — two `dragstart` handlers
  (image thumb + video thumb), plus `_selectedIds` / `_selectionMode` for multi-select
- `js/utils/mediaActions.js` — `extractAbsPath()` already exists and is the right helper;
  `downloadMediaFiles()` is the pattern to mirror
- `main.js` — IPC handler calling `startDrag`
- `js/data/projectModel.js` — `getSelectedItem(group)` is the group to item mapping the
  Download path uses; reuse it rather than re-deriving

## Verified facts worth keeping

- `favicon.png` is **2000x2000** (~1.4MB). Passing it straight to `startDrag` as `icon`
  makes Windows render a huge smeared drag image. `nativeImage.createFromPath(...)
  .resize({width:64,height:64})` was probed live under Electron and returns a valid
  non-empty 64x64. Any size-sensitive OS API using this file needs the downscale.
- `startDrag` requires `file` even when `files` carries the real list.
- `nodeIntegration: true` / `contextIsolation: false` — the renderer uses `ipcRenderer`
  directly, no preload bridge.
- Electron-only is fine. User confirmed: "we never run this in the browser."

## Process lessons (why this card exists at all)

1. **Route before you grep.** The Context Router exists precisely to surface the
   consumers a grep will not show you.
2. **A shared event has more than one consumer.** Before suppressing or altering an event,
   enumerate everything that depends on it. `preventDefault()` on a shared `dragstart` is a
   blast-radius change, not a local one.
3. **Ask the question that matters.** The last session asked about filename choice and
   Electron-vs-browser scope, but never "what else does this drag feed?" — the only
   question whose answer would have prevented the breakage.
4. **Test the path you did not change.** Drag-out was verified; drag-to-prompt was never
   re-tested after `preventDefault()` was added. The user found it.
5. One mid-session claim ("the app is running pre-restart code") was wrong — the user had
   restarted, and the fix genuinely was not working. Do not explain away a failed result
   with an unverified assumption about the environment.
