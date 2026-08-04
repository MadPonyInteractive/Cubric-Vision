# MPI-421 — validation

## Verified by me (2026-08-04)

**The graph half, live on the local engine (48188).** Dispatched the rewired
`img_auto_mask.json` straight to ComfyUI with the text branch on and `hair:2, eye:2`:

```
status success
  node 1571 (SEGSPreview)      : 4 images
  node 1628 (Output_Detected)  : 4 images
  node 1559 (Output_image)     : 4 images     <- one mask per detected object
```

**Negative control** — the pre-change graph (`git show HEAD:…`), same prompt, `picks=''` as a
bare Detect sent it: `Output_image` returned **1** image. So the picker did not emit zero on an
empty pick string, it emitted one arbitrary mask that `runAutoMask` discarded — which is why
selecting a chip had to re-dispatch. 1 -> 4 is the whole card.

**Static + regression.** `tests/auto-mask-pick-cache.test.cjs` (new, 5 tests) holds the wiring
the cache depends on; sabotage-checked by pointing the mask branch at a different gate — the
alignment test failed, and the file restored byte-identical. Full suite: **396 pass, 0 fail**.
ESLint clean on all three touched JS files.

## NOT verified by me — needs an in-app pass

Everything renderer-side. The engine proof above cannot exercise a chip click:

1. **Detect** on a busy image (Text tool, e.g. `hair:2, eye:2`). While it runs: the status bar
   shows an indeterminate `DETECTING` pulse with a clock, and the Detect button is replaced by a
   red **Stop**. Bar returns to IDLE when it lands.
2. **Toggle chips on and off.** Each one composites instantly and dispatches **nothing** — the
   check that matters. Confirm against ComfyUI's queue/history: the count must not move.
   Toggling a chip back on a second time must also be instant (the bitmap is kept).
3. **Add** still bakes the selection, and the op strip stays locked until you press it
   (MPI-426's behaviour must be unchanged).
4. **Stop** mid-detect: the run ends, the bar clears, no masks land.
5. **Points tool** — still auto-picks its single region on one round trip.
6. Leave the tool with an un-Added detection: the preview and the cache both go (preview
   contract), and re-entering Detect does not resurrect them.
