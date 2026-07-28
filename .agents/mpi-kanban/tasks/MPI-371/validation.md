# MPI-371 Validation

Status: **automated checks PASS — waiting on the user's eyes in the app.**

## What shipped

| Component | Role |
|---|---|
| `MpiMaskStrip` (Compound) | the shared bottom strip — paint / erase (**optional**), invert, clear, opacity |
| `MpiMaskDetectRow` (Compound) | thumbs · Detect · Add / Subtract, blocked as a unit while Cue is busy |
| `MpiToolOptionsMaskDetect` (Organism) | model + Box/Segment radios; strip WITH brush |
| `MpiToolOptionsMaskPoints` (Organism) | Scope dial, click info, Clear points; strip WITHOUT brush |

`MpiToolOptionsMask` deleted. Rail tool modes are `maskDetect` / `maskPoints`; the viewer
still knows only `'mask'`, bridged by `MpiGroupHistoryBlock._viewerModeFor()`.
Settings stay on the single `mask` tool key, so everything persists across a tool swap.

## Automated — PASS 2026-07-28

`npx eslint` on every new + touched file: **0 errors** (1 pre-existing warning in
`preloadStyles.js:105`, untouched).

Live app at `127.0.0.1:3000`, headless Chromium: all four new modules import and expose a
mountable component, all four new `.css` files serve 200, no page errors.

Both tools mounted against a stub viewer, 14/14 checks PASS:

- Detect strip renders 3 controls (brush pair + invert + clear); Points renders 2
- Detect binds `mask.brush.toolbar` + `mask.eraser.toolbar`; **Points binds neither**
- invert, opacity and the detect row are present on both
- Detect mount calls `setMaskPointsMode(false)`; Points mount calls `setMaskPointsMode(true)`
- **Points `destroy()` calls `setMaskPointsMode(false)`** — the right-click trap
- **neither `destroy()` calls `clearMask()`** — the paint-layer trap, mechanically proven

## Still needs the user — UI/UX and real state

1. **Rail** — MASK group shows two icons (Detect = magnifier, Points = ring). Hover names read right.
2. **Mask survives a tool swap** — paint on Detect, switch to Points, switch back. Paint still there.
3. **Right-click survives leaving Points** — place a dot, switch to Crop, right-click the image.
4. **Settings persist across a restart** — opacity, invert, model, Box/Segment, Scope.
5. **Both tools still detect** — YOLO on Detect, click-prompts on Points; thumbs, Add and Subtract on both.
6. **The queue gate** — with a Cue job running, the Detect row greys out and the note shows.
   Note the deliberate change: the gate now covers the detect row only, not the whole panel,
   so the model radios / Scope slider stay live while Cue is busy. Neither runs anything.
