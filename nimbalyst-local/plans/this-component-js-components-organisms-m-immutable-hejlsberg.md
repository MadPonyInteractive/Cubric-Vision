# MpiVideoPlayer Demote + MpiVideoViewer Rule Fixes

## Context

`MpiVideoViewer` (Organism) imports `MpiVideoPlayer` (Organism) — violates tier rule "never import up/sideways" from `.claude/rules/components.md`. `MpiVideoPlayer` actually only imports Primitives (`MpiButton`, `MpiProgressBar`) + utils → structurally qualifies as Compound. Demoting Player to Compound legalizes the Viewer composition.

Additional Viewer violations:
- `captureSnapshot()` duplicates `captureFrame` logic that should live in `utils/Video.js`
- Raw `el.querySelector` instead of `utils/dom.js` shorthands
- Raw `addEventListener('loadedmetadata', ...)` on video element

Goal: demote Player, fix Viewer violations, update all references + rule docs.

## Steps

### 1. Pre-flight discovery
- Grep all consumers of `MpiVideoPlayer` import path `Organisms/MpiVideoPlayer`
- Read `js/utils/Video.js` — confirm `captureFrame` signature (crop-aware? returns blob+dataUrl?)
- Read `js/utils/dom.js` — identify shorthand API (`$`, `qs`, `on`, etc.)
- Read `js/shell/preloadStyles.js` entry for MpiVideoPlayer
- Read `js/components/types.js` Player entry
- Grep `MpiVideoPlayer` mentions in `.claude/rules/component-*.md`

### 2. Move Player files
- Move `js/components/Organisms/MpiVideoPlayer/` → `js/components/Compounds/MpiVideoPlayer/`
  - `MpiVideoPlayer.js`
  - `MpiVideoPlayer.css`
- Update Player's own `css:` array inside the file: `'js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css'`

### 3. Update references
- `js/shell/preloadStyles.js` — change CSS path
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js` — import path `../MpiVideoPlayer/MpiVideoPlayer.js` → `../../Compounds/MpiVideoPlayer/MpiVideoPlayer.js`
- Any other consumers found in step 1
- `js/components/types.js` — update tier if tagged
- `js/pages/components.js` gallery — if Player demoed

### 4. Fix MpiVideoViewer violations
- Replace `captureSnapshot` body: call `captureFrame` from `utils/Video.js`; pass crop rect when in crop mode. Keep method name + return shape `{blob, dataUrl}` for API compat.
- Swap raw `el.querySelector` / `_playerInstance.el.querySelector` for `utils/dom.js` shorthand
- Swap raw `_videoElement.addEventListener('loadedmetadata', ...)` for dom.js `on()` helper if exists; keep unsub push

### 5. Update rule docs
- `.claude/rules/components.md` line 32 — remove `MpiVideoPlayer` from Organism examples; add to Compound examples or omit
- `.claude/rules/component-mounts.md` — update tier section
- `.claude/rules/component-events.md` — update tier section
- `.claude/rules/component-state.md` — update tier section
- `.claude/rules/component-comfy.md` — if referenced

### 6. Verify
- Grep old path `Organisms/MpiVideoPlayer` — should return 0 matches
- Load app, open workspace using Viewer
- Test: video load, play/pause, volume, frame-step, loop, fullscreen
- Test: enter crop mode, drag crop, exit crop mode
- Test: `captureSnapshot()` with + without crop — returns valid `{blob, dataUrl}`
- Check `logs/app.log` tail for errors

## Critical files
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js` (moved)
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css` (moved)
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js`
- `js/shell/preloadStyles.js`
- `js/components/types.js`
- `js/utils/Video.js` (read only — confirm `captureFrame`)
- `js/utils/dom.js` (read only — confirm shorthand API)
- `.claude/rules/components.md`
- `.claude/rules/component-mounts.md`
- `.claude/rules/component-events.md`
- `.claude/rules/component-state.md`
- `.claude/rules/component-comfy.md`

## Reused utilities
- `js/utils/Video.js` `captureFrame` — replaces viewer's inline snapshot
- `js/utils/dom.js` shorthands — replace raw `querySelector`
- Existing `_unsubs` cleanup pattern in Viewer `destroy()`

## Verification
- Grep confirms zero stale imports of `Organisms/MpiVideoPlayer`
- Manual browser test: Viewer-hosting workspace — playback, crop, snapshot all work
- No console or `logs/app.log` errors
