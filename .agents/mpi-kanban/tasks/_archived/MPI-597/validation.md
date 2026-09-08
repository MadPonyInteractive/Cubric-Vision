# MPI-597 - validation

## The bug, in one line

`MpiCanvas.resize()` measured a container that was `display:none`, and fed the 0x0 rect to
`ViewManager.handleResize()`.

- **Hide** (Model Library overlay stashes the workspace): `handleResize(600, 400, 0, 0)` →
  `offsetX += (0 - 600) / 2`, `offsetY += (0 - 400) / 2`. The view loses half the viewport.
- **Restore**: `handleResize(0, 0, 600, 400)` → the method's own `if (oldW > 0 && oldH > 0)`
  guard skips it, so the matching *add* never happens.
- Net displacement `-(w/2, h/2)`, every time, permanently — which is why the image ends up
  clipped into the top-left corner.

Only a view with `isManagedView === false` is affected — i.e. one the user has panned or
zoomed (`InputController.js:134/213/225/250`). A managed view takes the `refit()` branch,
which already bailed on a 0x0 container, and that is why the bug looks intermittent.

The user's screenshot is a direct match: a 736x1168 entry in a ~1525x835 viewer fits at
scale 0.715 with offsets (499, 0); after the shift, (-263, -417) — leaving exactly the
265x417 fragment visible at the top-left that the screenshot shows.

## The fix

`js/components/Primitives/MpiCanvas/MpiCanvas.js` — `resize()` returns early when the
container has no box. A hidden element is not a resize, it is *not rendered*: measuring it
is meaningless in both branches, and keeping the last real size in `screenUICanvas` is what
lets the restore pass compare against something valid. Same guard `_refitForCrop()` already
carries one method below.

## Blast radius

`ViewManager.handleResize()` has exactly one caller in the codebase (grepped) — the one
fixed. The other `ResizeObserver` consumers that drive a view were checked and all already
reject a 0x0 read:

- `MpiMaskedImagePreview.js:121` — calls `view.refit()` only, which bails on 0.
- `MpiBaseFlow.js:1462` → `_fitResultView()` — explicit `if (!rect.width || !rect.height) return`.
- `MpiVideoViewer.js:198` — syncs the crop overlay off the *video* rect, no view offsets.

## Evidence

Browser harness (temporary page served off the repo, driven with playwright-cli), mounting
the real `MpiCanvas` in a 600x400 container and hiding/restoring its wrapper with
`display:none` — the exact transition `MpiOverlay`'s Stash Pattern performs
(`_stash.style.display = 'none'`).

| | panned view: before / while hidden / after |
|---|---|
| guard mutated out (RED) | `137,42` → `-163,-158` → `-163,-158` — a shift of exactly `-300,-200` |
| guard in place (GREEN) | `137,42` → `137,42` → `137,42` |

Also green in the same run:
- managed view survives hide/show unchanged (scale 1.3333 @ 166.67, 0);
- managed view still refits a REAL resize — container narrowed to 300px, offsets recentred
  to 16.67, 0.

`npx eslint` on the changed file: exit 0.

**Not run:** the Model Library overlay itself in the live app — the user's session owns
:3000 and was not touched. The chain from that overlay to a 0x0 rect is code-read
(`MpiOverlay._doShow` stashes every `document.body` child under a `display:none` div), and
the harness drives that same transition directly.
