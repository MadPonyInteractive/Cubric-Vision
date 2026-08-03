# MPI-432 - Verify the macOS pinch-zoom fix on a real Mac

Blocked on hardware, not on work. The fix is written and shipped; nobody has been able
to run it on macOS. The rented Mac was a one-day box and is gone.

## What was reported

A RunPod-mode user on macOS, 2026-08-03:

> "On MacOS, using the two finger gesture to zoom-in the image (usually the intended
> behavior on mac), zoom the whole interface instead"

## Root cause (confirmed by reading, not by running)

macOS does not deliver a trackpad pinch as its own gesture in Chromium. It arrives as a
`wheel` event with `ctrlKey: true`. `js/init.js` had a document-level, bubble-phase
Ctrl+wheel handler with no origin check, so every pinch anywhere hit
`webFrame.setZoomFactor` and resized the whole interface.

The canvas wheel handler (`InputController.js` ~97) calls `preventDefault()` but never
`stopPropagation()`, so a pinch over the image fired BOTH - the image zoomed and the
shell zoomed on the same event. In paint mode the canvas branch resizes the brush
instead of zooming, so a pinch there resized the brush AND zoomed the shell.

## What was done

Ctrl+wheel UI zoom removed outright (user's call - keeps the wheel free for future
canvas/tool use). Ctrl+plus / Ctrl+minus remain the only UI-size control, and they
already covered the feature. Files:

- `js/init.js` - handler + `applyUiZoom` import deleted, NOTE comment left in place so
  nobody re-adds it
- `js/components/Compounds/LandingPages/mpi-hotkeys/mpi-hotkeys.js` - `CTRL+Wheel` row
  dropped from the System group
- `js/utils/uiZoom.js`, `js/managers/hotkeyManager.js`, `js/managers/hotkeyRegistry.js` -
  comments corrected; all three called Ctrl+wheel the primary control
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` ~1685 - orphaned
  `if (e.ctrlKey) return;` removed. It existed only to yield to the deleted handler
- Docs site (`c:\\AI\\Mpi\\Cubric Studio (Docs)`, edited NOT pushed - hard push block):
  `pages/vision/hotkeys.html` + generated `vision/hotkeys/index.html`. Both listed
  Ctrl/Cmd + Mouse Wheel; the mac half was wrong anyway since the handler read `ctrlKey`
  and Cmd+wheel never sets it

## Verify (needs a Mac)

1. Pinch over an image on the canvas - the IMAGE zooms, the interface does not.
2. Pinch with a mask paint tool active - image zooms, brush size unchanged.
3. Pinch over the gallery, sidebar, prompt box - nothing resizes.
4. Cmd+plus / Cmd+minus still change UI size (`hotkeyManager.js` ~231 folds `metaKey`
   into `control`, so the Cmd variants are live).
5. Windows/Linux regression check: Ctrl+wheel no longer changes UI size anywhere;
   Ctrl+plus / Ctrl+minus still do.

If a pinch still zooms the shell after this, the next suspect is Chromium's own visual
zoom (`webFrame.setVisualZoomLevelLimits`) rather than app code - nothing in the repo
calls it today, which is why it was not the first suspect.
