# MPI-445 — Paint Adjust's first slider move at 4096

Member of **MPI-440** (canvas tool family umbrella #2). Reported by the user on 2026-08-04 while
validating [MPI-436](../MPI-436/validation.md): *"8K images are a bit too much lag on the sliders."*

Confirmed and already measured. This is not an investigation card — MPI-436 shipped knowing this
number and wrote the fix down in a `ponytail:` comment. This card spends it.

## The numbers, measured not estimated

Chromium, `PaintManager.previewAdjust()`, first slider move then each later frame:

| Layer | First move | Later frames | Who lands here |
|---|---|---|---|
| 1536² (the **mask**) | 125 ms | 3.5 ms | every mask Adjust — no problem to fix |
| 2048² (paint) | 247 ms | 7 ms | an ordinary source — nobody notices |
| **4096² (paint)** | **1563 ms** | **64 ms** | **any source ≥ 8192 px — the report** |

`PAINT_MAX_EDGE` is 4096, so an 8K source is clamped to a 4096 layer: 16.7M pixels, two
`Float32Array`s of them inside `signedSquaredDistanceField()`.

## The trap: it is NOT only the first move

The user said "it's only on the start-up", and that is how it feels — but 64 ms/frame afterwards is
**~15 fps on a drag**. So the whole family of fixes that defer the 1563 ms rather than remove it —
a spinner, a Web Worker, preview-on-release — leaves the drag at 15 fps and does not close this
card. **Fix the pixel count, not the moment it is paid.** Both numbers have to fall.

## Options, cheapest first

1. **Bound the field to the CONTENT — try this first.** The field is built over the whole canvas,
   but a scribble usually covers a fraction of it. Building over the painted bounding box **padded
   by the max radius** is exact — it loses nothing at all — and on a typical scribble beats the cap
   below. The catch is the border convention: `distanceField.js` treats outside-the-canvas as
   background (its border clamp), so the box must be **padded**, never clamped to content, or a
   layer that runs to the frame edge starts eroding from a border that is not there.
2. **Cap the field at 1536 and upscale the region mask** — the fix MPI-436 named. Both costs fall
   by `(4096/1536)² = 7.1×`: first move ≈ 220 ms, drag ≈ 9 ms. **It costs radius precision**, which
   is exactly what [MPI-441](../MPI-441/validation.md) was written to buy — it replaced a
   blur-and-threshold precisely because grow/shrink rounded the mask off, and proved edges landing
   on the exact pixel (481, not 480). A 1536 field driving a 4096 layer quantises the region
   boundary to ~2.7 layer px and re-softens it on the upscale.
   **For paint that may well be fine** — the artifact is a colour ring, not a sampler input — but
   decide it on a real screenshot of a 20 px outline at both settings, not on the assumption that
   paint is more forgiving.
3. **Lower `PAINT_MAX_EDGE`.** Rejected on sight: 4096 exists because paint becomes REAL PIXELS
   ([painting.md](../../../../docs/painting.md)), and downscaling would soften every stroke on
   flatten.
4. **Cache the field across previews.** Already done — it is built once per snapshot, lazily. The
   1563 ms *is* the once.

## Constraints

- **The mask's Adjust is not broken and must not change behaviour.** It runs at 1536 and is fast.
  `distanceField.js` is shared by both managers, so any change inside it sweeps BOTH call sites —
  a one-consumer fix on a shared primitive is a false done.
- `tests/paint-adjust.test.cjs` and `tests/mask-distance-field.test.cjs` both stay green, and the
  geometry test gains a case for whichever path is taken.
- Correct the two places that currently state the ceiling as permanent: the measured table in
  `docs/masking-adjust.md` § The paint layer, and the `ponytail:` comment in
  `PaintManager._ensureAdjustField()`.

## Read first

`docs/masking-adjust.md` (both halves), `managers/distanceField.js` (the border clamp, and why
everything stays squared integers), `tasks/MPI-441/validation.md` (the exactness a cap would spend).
