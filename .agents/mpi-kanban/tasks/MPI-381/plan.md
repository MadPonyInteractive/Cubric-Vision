# MPI-381 Plan — mask tool split + black-and-white mask view

Compact plan. Pure UI, zero dependencies, no workflow and no weight touched.

## Scope call

MPI-368 is a live card carrying the WHOLE shapes gizmo (CropManager-derived
handles, rotation about a handle, triangle/ellipse hit-tests and rasterisers).
So this card ships **three** tools — Brush / Points / Detect — plus the B/W
view. Shapes becomes the 4th rail entry when MPI-368 ships; the split done here
is what makes that a one-line registry addition.

## Current State

- Rail mask group has two entries: `maskDetect` (strip with `brush: true`) and
  `maskPoints` (strip with `brush: false`).
- `MpiMaskStrip` already supports `brush: false`, so removing the brush from
  Detect is a prop flip, not a refactor.
- `MpiCanvas._renderOverlay()` mask block is ~15 lines; B/W is one branch in it.

## Implementation

- [ ] Implement the change set end to end. **Verify:** eslint clean on every
      touched module, then a user check in the app (verify mode `user-ux`).

1. New `MpiToolOptionsMaskBrush` organism — `enterMode('mask')`,
   `setMaskPointsMode(false)`, mounts `MpiMaskStrip { brush: true }` and nothing
   else. No CSS file (it is a slot wrapper), so no `preloadStyles.js` entry.
2. Wire it: `MpiHistoryTools` mask group gains `maskBrush` as the first entry;
   `MpiGroupHistoryBlock` gains it in `TOOL_OPTIONS_REGISTRY`, `_isMaskTool()`
   and `TOOL_LABELS`.
3. `MpiToolOptionsMaskDetect` mounts the strip with `brush: false`.
4. B/W render: `MaskManager.bwView` flag; in `_renderOverlay()` fill the image
   rect black and draw `maskCanvas` white at `globalAlpha = 1` (both flip when
   `displayInverted`), green auto layer unchanged on top. `MpiCanvas`
   `setMaskBwView` / `isMaskBwView` + the two proxy allowlists.
5. `MpiCanvasViewer` holds `_isMaskBwView` (survives the swapToCanvas remount
   like `_isMaskInverted`); `MpiMaskStrip` gains the toggle between invert and
   trash, persisted under the one `mask` tool key, and disables the opacity
   input while B/W is on. New icon in `js/utils/icons.js`.
6. `docs/masking.md`: delete the CANCELLED MPI-361 Phase B roadmap entry to buy
   room under the 200-line cap, correct the stale `Face / Hair / Hand / Person`
   model list to the shipped `Face / Hand / Person`, record the tool split and
   the B/W view.

## Verification

**Verify mode:** user-ux

- eslint clean on all touched modules.
- In the app: Brush / Points / Detect in the rail; brush pair only on Brush;
  a tool swap keeps the mask; B/W shows detection specks on black and paints;
  invert composes with B/W; green auto picks stay visible in B/W.

## Completed

All six steps shipped and USER-VERIFIED live 2026-07-29. One thing grew beyond the
plan, deliberately: step 3 was written as a prop flip, but `brush: false` only hid
the controls — a drag on Detect still painted, so the tools were split visually and
not actually. Added `setMaskPaintEnabled()` (MaskManager flag → canvas → viewer),
forwarded from the strip's existing `brush` prop, and held on the viewer so a canvas
rebuild cannot re-arm it. Also added `tests/mask-tool-registry.test.cjs`, negative-
control proven both ways.

## Remaining Work

None. Next in the masking order: MPI-380 (SAM3 foundation), then MPI-379.
