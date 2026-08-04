# MPI-373 Validation

**Verify mode:** user-ux — the point of this card is that the blend is VISIBLE while it
is being decided, which only the user can judge in the running app.

## User-run, 2026-08-04 — PASSED

Fabio ran the Composite group in the Electron app and confirmed the original defect is
fixed. Three rounds, each finding something the round before hid:

1. **First build.** Paint Comp worked — paste an image, erase, the underlay showed
   through live. Mask Comp's Apply stayed disabled.
2. **After the redesign** (`Send to Composite` on the canvas, mask slot deleted,
   `maskComp` reading the selected entry's own mask): the cut appeared under the mask
   immediately and Apply produced a correct new entry. Two further defects surfaced and
   were fixed — see below.
3. **Final:** *"the original bug that we were fixing is fixed."*

## What the user found, and what each turned out to be

- **Apply never enabled (Mask Comp).** NOT the stale-gate defect fixed earlier. Both
  branches of `getMaskDataURLForEntry()` return an OPAQUE black-and-white PNG, which
  makes `isEmpty()` false — so a mask that reached the canvas would have ENABLED Apply.
  It never got there: `_copiedMask.flat` was null and the slot's Paste row was gated off
  it, so the row never appeared, while `Copy mask` still "succeeded" and `Paste mask`
  still worked. Both silent gates died with the pasted-mask slot.
- **The cut died when changing entry.** Selecting another history entry does not remount
  the panel, so its mount-time mask read never fired again while `loadImage()` wiped the
  hole. Fixed by re-reading in `MpiCanvasViewer.loadEntry()` after `_restoreLayers()`,
  gated on `CompositeManager.followMask` so Paint Comp keeps its brush cut.
- **A 4px strip of the base down the right edge of the result.** Reproduced offline from
  his own pair (928x1136 base, 896x1088 overlay): columns 0-923 matched the overlay to
  0.0 and 924-927 matched the base to 0.0, exactly 4x1136 = 4544 px. `joinChannel` in the
  same sharp pipeline as a `fit:'cover'` resize binds the alpha plane to the PRE-crop
  image. **A regression this card introduced** — impossible under the previous
  `fit:'fill'`. Fixed by materialising the resize before joining.
  *The user's call on the underlying mismatch: "I hadn't realised the images have
  different dimensions. It's fine as it is." Cover-crop stands.*

## Automated

- `node --test "tests/*.test.cjs"` — **392/0** (374 at plan time).
- `npx eslint js/ services/` — 0 errors (19 pre-existing warnings, none in new files).
- Negative controls fired and the tree restored green: 4 on the redesign, 3 on the fixes
  (incl. the real-pixel one, which is the only kind that can see the libvips defect).
- Board validator delta: 416 before, 416 after — its resting state, unchanged.

## Not done, deliberately

- No real-pixel probe of the cover-fit MATHS via playwright-cli. Both ends are guarded by
  source tests, and the thing a probe would add — proof that erasing reveals the underlay
  — is what the user checked directly.
- The mask tint draws OVER the composite reveal in Mask Comp, so the blend is judged
  through a 70% white wash. Raised with the user, deliberately not actioned: it is a
  design call, not a defect.
