# MPI-270 — OS floating latent window when minimized

Small always-on-top OS window showing live latents while the app is minimized.
Settings-gated. Pure consumer of the MPI-269 `preview:frame` bus, forwarded over IPC
(a separate BrowserWindow has its own empty Events bus — see docs/preview-bus.md).

## Locked behavior (from user)
- **Show gate:** app minimized **AND** setting on **AND** ≥1 active generation.
- **Multi-gen:** aggregate ALL active gens side-by-side, one tile each (local + remote
  together). Width dynamic: 200px (1 gen) / 400px (2 gens) / +200 per extra. Height 200.
- **Resizable:** user can corner-drag bigger.
- **Header:** draggable strip (`-webkit-app-region: drag`) + an X button.
- **X:** dismiss for THIS minimize cycle only. Reappears next time the app is
  minimized with a gen running. Setting untouched. (Session-dismiss flag, cleared on
  restore/focus.)
- **Tile:** latent image + tiny model-name caption under it.
- **Click a tile:** restore + focus + un-minimize the app; float window closes.
- **Gen ends** (complete/cancelled/error): remove its tile. Last tile gone → window
  closes. No final image shown (toast/OS-notif already covers completion).
- **Setting:** `state.floatLatentWindow` bool, checkbox in MpiSettings (mirror
  `notificationPrefs` pattern). Default OFF.

## Transport (the hard constraint)
`preview:frame` `url` is a `blob:` URL — per-document, will NOT resolve in the float
window. Main renderer subscribes `preview:frame`, converts blob→dataURL, and
`webContents.send`s `{ genId, engine, seq, title, dataUrl }` to the float window.
On tile-open, seed from `activeGenerations.getLastPreview(genId)` (also blob → convert).

## Architecture
- **main.js** — owns the float BrowserWindow lifecycle. New module `main/floatLatentWindow.cjs`
  (create/show/hide/close/resize/forwardFrame/removeTile). Same webPrefs as main window
  (`nodeIntegration:true, contextIsolation:false` — no preload needed). `alwaysOnTop:true,
  frame:false, skipTaskbar:true, resizable:true`.
- **Minimize detection (main process):** `mainWindow.on('minimize')` / `on('restore')` /
  `on('focus')`. On minimize → ask renderer for current show-state via IPC (setting +
  active gens); on restore/focus → close float window + clear session-dismiss.
- **Renderer bridge** — new `js/shell/floatLatentBridge.js`: subscribes `preview:frame`,
  `generation:started/complete/cancelled/error`; forwards frames + tile add/remove to main
  over IPC; answers main's "should I show?" query (reads `state.floatLatentWindow` +
  `activeGenerations.list()` filtered to running). Title per gen =
  `getModelById(entry.modelId)?.name || entry.modelId`.
- **Float window content** — standalone `main/float-latent.html` (own tiny inline JS/CSS,
  no app bundle). Receives IPC, renders tiles into a flex row, paints dataURLs, handles
  X (send `float-latent:dismiss`) and tile-click (send `float-latent:restore`).

## IPC channels (all in main.js ipcMain block)
- renderer→main: `float-latent:frame` `{genId, engine, seq, title, dataUrl}`
- renderer→main: `float-latent:tile-remove` `{genId}`
- renderer→main: `float-latent:show-state` (reply to main's query) `{on, gens:[{genId,title,dataUrl?}]}`
- float→main: `float-latent:dismiss` — hide + set session-dismiss flag
- float→main: `float-latent:restore` — `mainWindow.restore(); focus()`; close float
- main→renderer: `float-latent:query-show` — bridge replies with `float-latent:show-state`
- main→float: `float-latent:add-tile` / `:frame` / `:remove-tile`

## Files
- NEW `main/floatLatentWindow.cjs` — window lifecycle + tile map + resize math
- NEW `main/float-latent.html` — window content (inline)
- NEW `js/shell/floatLatentBridge.js` — renderer subscriber + blob→dataURL + IPC
- EDIT `main.js` — require floatLatentWindow, wire minimize/restore/focus, ipcMain handlers
- EDIT `js/shell/*` boot — init floatLatentBridge (where windowControls is bound)
- EDIT MpiSettings.js — add `floatLatentWindow` checkbox
- EDIT events.js — (no new app event needed; consumes existing)

## Verify
- Local gen → minimize → 200×200 window, live latent updates, model-name caption.
- 2 concurrent gens (local + remote) → 400×200, both tiles side-by-side, both live.
  (Both-engine rule — remote MUST be tested, not just local.)
- X → window gone; still minimized → stays gone; restore + re-minimize with gen → back.
- Click tile → app restores + focuses, window closes.
- Gen completes → tile removed; last one → window closes; OS-notif still fires.
- Setting OFF → never appears.
- Corner-drag resizes.
- Browser dev mode: bridge no-ops cleanly (no ipcRenderer) — desktop-only feature.
