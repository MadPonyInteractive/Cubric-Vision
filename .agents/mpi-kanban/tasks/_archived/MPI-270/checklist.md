# MPI-270 checklist

## Build — DONE (lint clean, syntax + logic self-checked)
- [x] `main/floatLatentWindow.cjs` — create/show/hide/close, tile map, dynamic resize (N×200 wide, 200 high), alwaysOnTop/frameless/skipTaskbar/resizable
- [x] `main/float-latent.html` — inline JS/CSS; flex-row tiles (img + caption), draggable header, X btn, tile-click → restore
- [x] `js/shell/floatLatentBridge.js` — subscribe preview:frame + gen lifecycle; blob→dataURL; IPC forward; answer show-state query; browser no-op
- [x] `main.js` — require module; mainWindow.on(minimize/restore/focus); ipcMain handlers for all channels + floatDismissed flag
- [x] boot wiring — initFloatLatentBridge() in shell.js after bindWindowControls
- [x] MpiSettings.js — `state.floatLatentWindow` checkbox (default OFF) + hint; persisted via Storage.get/setFloatLatentWindow (storageKeys + storage + state mirror)

## Verify (desktop, `npm run test:desktop` or manual)
- [ ] Local gen + minimize → 200×200, live latent, model caption
- [ ] 2 concurrent gens (local + remote) → 400×200 side-by-side, both live [BOTH-ENGINE]
- [ ] X → gone, stays gone while minimized; restore+re-minimize+gen → returns
- [ ] Click tile → app restores/focuses, window closes
- [ ] Gen ends → tile removed; last gone → window closes; OS-notif unaffected
- [ ] Setting OFF → never shows
- [ ] Corner-drag resizes
- [ ] Browser dev mode → clean no-op
