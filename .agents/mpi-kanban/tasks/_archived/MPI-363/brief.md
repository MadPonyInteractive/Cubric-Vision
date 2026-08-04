# MPI-363 — Alt+drag a gallery card into another app

## Symptom

Dragging a gallery card into the OS file system works. Dragging it into Discord,
Photoshop or a browser upload zone does nothing at all.

## Root cause (not a bug — a Chromium limit)

`_addDownloadUrl()` in `MpiGalleryGrid.js` (MPI-318) sets Chromium's `DownloadURL`
type. That is a **virtual-file promise** (`CFSTR_FILEDESCRIPTOR`/`FILECONTENTS` on
Windows), not a file on disk. Explorer/Finder know how to materialize it — that is
why the file-system drop works. Third-party drop targets read `CF_HDROP` (a real
path) and find nothing, so the drop is a no-op.

The only mechanism that produces a real `CF_HDROP` is Electron
`webContents.startDrag({ files, icon })`.

## Why it needs its own gesture

`startDrag` **replaces** the in-flight HTML5 drag session (it is documented as
`event.preventDefault()` + `startDrag` inside `dragstart`). Firing it on the plain
card drag would instantly kill the in-app `application/mpi-media` drop — PromptBox
media chip and group-history. One gesture cannot be both. An HTML5 drag also cannot
be upgraded to a native drag mid-flight, so "detect when the pointer leaves the
window" is not available.

Gesture picked: **Alt + drag**. `Ctrl` and `Shift` are taken by gallery selection;
`Alt` is free. Plain drag keeps its exact MPI-318 behaviour.

## Shape

- `main.js` — `ipcMain.on('drag-out-files')` → validates paths exist → `startDrag`
  with a `nativeImage` icon (first file, falling back to `favicon.png`).
- `MpiGalleryGrid.js` — `_tryNativeDragOut(e, group)` in setup scope, called as the
  first line of BOTH card `dragstart` handlers (image thumb + promoted video).
  Bails unless `e.altKey` and `window.require` (Electron) are present.
- Multi-file: Alt+drag a card that is part of an active selection drags every
  selected card's file. `DownloadURL` capped at one file; `startDrag` does not —
  this recovers the multi-select export dropped in MPI-318.

## Notes

- `docs/gallery.md` says NEVER `preventDefault()` in the card `dragstart`. That rule
  guards the plain-drag path (it kills the in-app drop). The native path *requires*
  `preventDefault()` and is gated behind `altKey`, so the plain path is untouched.
- Windows reads drop modifiers at DROP time, not drag-start time — Alt can be
  released once the drag is moving, so dropping in Explorer still copies rather than
  creating a shortcut.
- Browser-dev mode has no `window.require` → Alt+drag silently falls through to the
  normal HTML5 drag. Electron desktop only, by design.

## Validation

Cannot be automated — a real OS drag crosses the process boundary. Manual:
Alt+drag a card into Discord (uploads), Photoshop (opens), a browser file input.
Then plain-drag the same card to the PromptBox (chip still appears) and to a folder
(file still lands with its real name).
