# MPI-270 — validation & resume notes

**Status: DONE (local USER-VERIFIED). Remote (RunPod) verify DEFERRED by user.**

Shipped 2026-07-12. Commit: see `feat(preview): MPI-270 …` on branch 1.2.0.

## What it does
Settings-gated OS floating window that shows live latents when the app is
minimized. Pure consumer of the MPI-269 `preview:frame` bus, forwarded to a
separate BrowserWindow over IPC (that window has its own empty Events bus and
blob: URLs don't cross documents — so the renderer converts blob→**data URL**
before sending).

Behavior (all user-confirmed for local engine):
- Shows when: **minimized AND `state.floatLatentWindow` on AND ≥1 running gen**.
- **Default ON** (`Storage.getFloatLatentWindow` defaults `true`).
- One tile per active gen, side by side (aggregates local + remote). Width =
  200px × gen count; right edge pinned so it grows leftward.
- Tile = latent img + model-name caption (`getModelById(modelId).name`).
- Header: drag strip + X. **X** = dismiss for this minimize cycle only; returns
  next minimize+gen (cleared on restore/focus). Setting untouched.
- **Click a tile** → restore + focus app, window closes.
- Gen ends (complete/cancelled/error) → tile removed; last tile → window closes.
  No final image (OS-notif/toast already covers completion).
- Mauve theme (oklch surface tokens, hue 350) matching the project page.
- **Remembers position + size** across sessions (`userData/float-latent-bounds.json`),
  first-ever open = bottom-right of the display holding the app. Multi-screen safe
  (`screen.getDisplayMatching`). A user-widened/maximized window is left alone
  (`userWidened` guard) — tiles flex to fill.
- **Frame throttle** (~8fps, newest-wins, one encode in flight per gen) — added
  after a fast/video gen flooded IPC with base64 data URLs and ate RAM. Maps
  cleared on gen-end + window-close.

## Verified
- ✅ **Local engine, USER-VERIFIED** (user watched latents appear on minimize,
  bottom-right, mauve, updating live, window persists on 2nd gen).
- ✅ Lint clean, syntax + resize/seq-drop logic self-checked (`node` assert).

## NOT verified — pick up here if revisiting
- ❌ **Remote (RunPod) engine — DEFERRED.** The bus emits `engine:'remote'` for
  Pod gens over the renderer-direct WSS proxy; forwarding is engine-agnostic so
  it *should* just work, but a local-only test does NOT prove remote
  ([[feedback_runpod_not_local_engine_proof]]). To verify: connect a Pod, run a
  remote gen (or local+remote concurrently), minimize → both tiles live at 400px.
- ❌ **LTX/VHS previews** (MPI-166 nonstandard header) not run this session — bus
  gate accepts them via SOI+size fallback, safe-by-default, but confirm on a real
  LTX gen.

## Files
NEW:
- `main/floatLatentWindow.cjs` — window lifecycle, tile map, right-pinned resize,
  bounds persistence, bottom-right default.
- `main/float-latent.html` — self-contained window UI (inline CSS/JS, mauve).
- `js/shell/floatLatentBridge.js` — renderer subscriber; blob→dataURL; throttle;
  IPC forward; answers main's show-state query; browser no-op.
EDIT:
- `main.js` — require module; `mainWindow.on(minimize/restore/focus)`; 6 ipcMain
  channels (`float-latent:*`); `floatDismissed` flag.
- `js/shell.js` — `initFloatLatentBridge()` after `bindWindowControls()`.
- `js/state.js` + `js/core/storage.js` + `js/core/storageKeys.js` —
  `floatLatentWindow` bool, persisted (peer of `notificationPrefs`/`pixelMode`).
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — checkbox.

## Gotchas learned
- `require('./main/floatLatentWindow')` FAILS — bare require resolves only
  `.js/.json/.node`, NOT `.cjs`. Must write `require('./main/floatLatentWindow.cjs')`.
- Float window is standalone (no app stylesheet link) → oklch color values are
  copied literally into float-latent.html; keep in sync with `--surface-*` tokens.
- Electron 41 = Chromium ~136 → oklch fully supported (app already uses it).

## Out of scope — separate bug surfaced this session (NOT filed yet)
- `appVideoStitch` / `MpiSaveVideo` ffmpeg crash on **odd video dimensions**:
  `width not divisible by 2 (2901x808)` → libx264 refuses → "Conversion failed".
  Fix = force even dims (`scale=trunc(iw/2)*2:trunc(ih/2)*2` or pad 1px). This is
  the video-stitch subsystem, unrelated to MPI-270. Worth a card if it recurs.
