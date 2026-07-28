# MPI-381 Validation

Verify mode: **user-ux** — the deliverable is a UI surface, so the final word is
the user's eyes in the app. Frontend only: Ctrl+R reload is enough, no restart.

## Automated — PASSED

- `npx eslint js/` → **0 errors** (18 warnings, all pre-existing and in files this
  card never touched).
- `tests/mask-tool-registry.test.cjs` (new) → **4/4 pass**, and NEGATIVE-CONTROL
  proven in both directions: deleting `maskBrush` from `_MASK_TOOLS` fails test 2,
  deleting its `TOOL_OPTIONS_REGISTRY` entry fails test 3. The file was restored
  and re-verified green after each control.
- Full suite `node --test "tests/*.test.cjs"` → 219/228. The 9 failures are
  PRE-EXISTING and unrelated: missing fixtures in
  `optional-media-placeholder`, drifted source regexes in
  `permodel-key-allowlist`, plus `resolve-model-deps` and 4 `remoteProxy` cases.
  None of them reads a file this card touched.

## Shipped

**A. Three tools, one job each.** `MpiToolOptionsMaskBrush` (new, ~50 lines, no
CSS — it *is* the strip with its brush pair), Points unchanged, Detect now mounts
the strip with `brush: false`. Rail order: Brush · Points · Detect.

Scope call: MPI-368 still owns the whole shapes gizmo, so Shapes becomes the 4th
rail entry when that card ships. The split done here makes it a one-line addition.

**B. `brush: false` now means it.** The strip forwards the prop to a new
`setMaskPaintEnabled()`, so a brushless tool pans on drag instead of painting,
zooms on wheel instead of resizing an invisible brush, and keeps its cursor.
Without this the tools were only *visually* separated — a drag on Detect still
painted. Held on the viewer, because a canvas rebuild would restore the manager
default (`true`) and silently re-arm the brush.

**C. Black-and-white view.** New toggle between invert and trash. Alpha pinned to
1 over a flat backdrop; composes with the display-only invert (backdrop and mask
swap together); green auto layer still drawn on top; opacity slider goes inert
rather than producing grey mush.

## USER-VERIFIED 2026-07-29 — card closed

The user exercised the list below in the app and accepted it. Card moved to done.

## Checked in the app

1. Rail shows Brush / Points / Detect; each mounts only its own controls.
2. Paint on Brush; confirm a drag on Detect and Points does NOT paint (it pans).
3. Swap between the three tools — the mask must survive every swap.
4. B/W toggle: specks readable on black, paint + erase work while it is on.
5. B/W + invert together; green detection picks still visible in B/W.
6. Leave a mask tool, then right-click the image — the context menu must work
   (the `setMaskPointsMode(false)` contract).
