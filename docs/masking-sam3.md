# SAM3 masking — points and text

The two SAM3-driven mask tools and the graph branches behind them. Split out of
[masking.md](masking.md) at MPI-384, when a second SAM3 branch pushed that doc past the
200-line cap. Read [masking.md](masking.md) first for the layer model, the overlay draw and
the tool-family contract every mask tool obeys.

One model file serves both: `sam3.1_multiplex_fp16.safetensors`. Both branches rejoin the
SAME picker chain, and both hang off lazy `MpiIfElse` gates, so only the selected one runs.

---

## Click-point masking (MPI-361, rebuilt on SAM3 in MPI-380)

Click a point and SAM3 segments whatever it belongs to — the answer to the YOLO vocabulary
ceiling ("mask the headphones" is permanently impossible on `UltralyticsDetectorProvider`).
Runs on `sam3.1_multiplex_fp16.safetensors` (1.75GB, `engineAsset`, SAM License —
commercially clear) through a plain `CheckpointLoaderSimple`: SAM3 is a **core ComfyUI 0.28
model**, no custom node. SAM 1 (`sam_vit_b`) is **NOT retired** — it still refines the YOLO
segment branch, whose Impact `SAM_MODEL` slot SAM3 cannot fill (MPI-379).

### The points layer

Points are a fourth layer and deliberately **not a canvas** — a list of dots the graph turns
into a mask. `points[]` is in **SOURCE-image px**, not the `MASK_MAX_EDGE`-capped working
size: SAM3 normalises coords against the image it loads. **Polarity is which LIST a point
lands in**, not how big it is drawn: `getPointsJSON()` splits `points[]` into two
`[{"x":int,"y":int}]` strings (the KJNodes `PointsEditor` shape SAM3 documents), both always
emitted — `[]` included, or the previous run's coords stay on the node. No dot image is
rendered, staged or uploaded: **one less media upload per remote run.**

### The graph branch — `comfy_workflows/img_auto_mask.json`

```
Input_Points_Positive / Input_Points_Negative (MpiText, JSON pixel coords)
  -> SAM3 Points (SAM3_Detect, refine_iterations 2, individual_masks false)
  -> GrowMaskWithBlur(-4) -> GrowMaskWithBlur(+4, fill_holes)   # scatter cleanup
  -> MaskToSEGS(combined=True)
  -> Input_Points_Mode (MpiIfElse) -> the shared SEGS fan-out (below)
```

Injectable keys: `Input_Points_Positive`, `Input_Points_Negative`, `Input_Points_Mode`
(bool, default **false**). The branch rejoins the **existing** chain, so thumbs /
pick / composite plumbing is reused, not forked, and the shipped one-mask-per-pick contract
(`ImpactSEGSToMaskList`, never `SegsToCombinedMask`) stays intact. `MpiIfElse` inputs are
lazy, so points mode never runs YOLO.

### One SEGS list, two outputs — and NO pick input (MPI-421)

Every branch ends at the same fan-out, and both halves read the SAME SEGS node:

```
<gate> -+-> SEGSPreview -> MpiBlockIfEmptyList -> PreviewImage "Output_Detected"   # thumbs
        `-> ImpactSEGSToMaskList -> MaskToImage -> PreviewImage "Output_image"     # masks
```

**`masks[i]` is the mask for thumb `i`** — true only because one list is walked in one order
by both. Anything that reorders, combines or merges SEGS in front of either output breaks the
mapping silently: the counts still match, the picks paint the wrong objects.

`ImpactSEGSPicker` (`Input_Selected_Masks_Input`) used to sit on the mask half and trim it to
the selected chips, which is why **a chip toggle re-dispatched the whole graph** — the masks
for an unselected chip did not exist. It is deleted, along with the injected key; one detect
returns every object's mask and the client picks between them (`MaskManager.autoPickMasks` is
a `Map<index, bitmap>` with a separate selected `Set`, so this was always a one-line client
operation). Do not re-add a pick input to save engine time: the masks are cheap, the round
trip is not. Measured live 2026-08-04 on `hair:2, eye:2` — 4 thumbs, 4 masks, one run.

The old picker did **not** emit zero images for an empty picks string; it emitted **one**
arbitrary mask, which `runAutoMask` discarded (`if (!payload.picks?.size) return`). That guard
is gone with the picker — a bare detect's masks are now the cache fill, and suppressing them
means every chip re-dispatches again.

### Behaviour you must not "fix"

- **N dots do NOT give N objects.** All points go into one predict call, so SAM3 returns a
  single region consistent with **all** of them. One part per run; Add accumulates.
- **A detection leaves the masked ops LOCKED until Add** (MPI-426). The green picks are a
  preview living in the display-only `autoCanvas`; `hasMask()` reads the baked mask, which is
  what gates the op strip. Reads as "the strip is broken after a detect" and is not — before
  this, an un-Added pick shipped straight into `Input_Mask`. `docs/masking.md` § A detection is
  NOT mask content until Add.
- **There is no threshold on the point path.** `SAM3_Detect` takes one, but the point branch
  ignores it — only `refine_iterations` applies. That is why MPI-380 **deleted** the Scope
  dial instead of remapping it. Do not re-add a threshold control here.
- **`positive_coords` / `negative_coords` are `forceInput` STRING** — WIRED from `MpiText`
  nodes, never widget values on `SAM3_Detect`. **`MpiText`, not `MpiString`**: `MpiString` is
  in `comfyController`'s `PATH_MEDIA_CLASSES`, so the coords would be media-staged and the
  remote leg would try to upload a file named after the JSON.
- **Nothing in the graph gates an empty run.** The old branch self-gated on
  `MpiLoadImageFromPath(block_if_empty)`; string nodes cannot. `MpiCanvasViewer` refuses the
  run with a toast — load-bearing, not a nicety.
- **The cleanup pair stays equal and opposite** (`-4` then `+4`), else the mask grows or
  shrinks overall — 4/4 is the shipping default.
- Points mode auto-picks index 0 up front (ONE round trip), relying on
  `MpiAutoMaskThumbs.setPicks()` **not** emitting `'change'`. That silence is deliberate.
- The points-mode `contextmenu` handler calls `stopPropagation` *and* `preventDefault`
  (`MpiCanvasViewer` has its own on its root). Leaving the tool must call
  `setMaskPointsMode(false)` or right-click stays broken app-wide.

---

## Text masking — name the object (MPI-384)

Same model, its **open-vocabulary detector** instead of the point predictor. This is what
Points fights with: thin, strappy subjects (a bikini, a purse, a strap) where dots
over-select and a face can need six of them. ~3.6s on a deliberate Detect press — it is NOT
the cancelled hover enumerator (MPI-361 Phase B, killed at 10.5s for 4 categories);
hover-to-discover stays YOLO's job.

```
Input_Text_Prompt (CLIPTextEncode, fed by the SAM3 checkpoint's own CLIP — free until now)
  -> SAM3 Text (SAM3_Detect, individual_masks TRUE)
  -> MaskToSEGS(combined=True)      # Impact loops mask.shape[0] -> one SEG per object
  -> Input_Text_Mode (MpiIfElse) -> the Input_Points_Mode gate -> the same SEGS fan-out
```

Injectable keys: `Input_Text_Mode` (bool, default **false**) and the DOTTED
`Input_Text_Prompt.text`. Dotted because the prompt rides `CLIPTextEncode`'s own `text`
widget — which is also why no `MpiText` relay is needed here: the encoder is not in
`PATH_MEDIA_CLASSES`, so nothing is media-staged.

### Behaviour you must not "fix"

- **`name:N` is MANDATORY for N ≥ 2 — and FORBIDDEN for N = 1.** `_parse_prompts`
  (`comfy/text_encoders/sam3_clip.py`) reads `:N` as that category's detection cap; a BARE
  category returns exactly **one** object. The count input IS that N, stamped per
  comma-separated category by `js/utils/maskTextPrompt.js`. Measured on one image, MPI-384:
  `horn:2` → 2 chips, bare `horn` → **1**, `horn:2, eye:2` → 4, and `horn:2` with
  `individual_masks` off → 1.
- **`:1` detects NOTHING — never stamp it.** `SAM3TokenizerWrapper.tokenize_with_weights`
  early-outs on "one category, cap 1" (`sam3_clip.py:53`) and hands `super()` the **raw**
  string, `:1` included, so the suffix is tokenized as literal text and the match falls
  under `threshold`. Bare already means `:1` to the parser, so `maskTextPrompt.js` emits
  bare below 2 — the fix is app-side because we do not own the engine tree. Measured
  2026-08-02 on `depth_008.png` @ threshold 0.5: `hair:1` → **0 masks**, `shirt:1` → **0**,
  bare `hair` / `shirt` → 1 each, `hair:2` → 2, `hair:1, shirt:1` → 2 (two categories miss
  the early-out), `hair:1` @ threshold 0.1 → 1. MPI-384 only ever measured N ≥ 2, so this
  shipped broken for the default count of 1 and read as "text detect finds nothing".
- **Text and box are mutually exclusive.** `SAM3_Detect.execute` gates the box branch on
  `not has_text`. Never wire bboxes into the text node — and never hang conditioning on the
  POINTS node, which would make every points run `has_text`. Hence two `SAM3_Detect` nodes.
  - **`bboxes` IS NOT A REGION RESTRICTION, whatever its tooltip says.** The socket reads
    *"Bounding boxes to segment within"*, which invites exactly the wrong design: pass the whole
    image plus a box and get back only what is inside it. With text present the box never even
    reaches the SAM decoder — the boxes are run through `geometry_encoder` and **concatenated
    onto the text embeddings** as extra prompt tokens (`comfy/ldm/sam3/detector.py` `_encode_boxes`
    → `_detect`), so the detector still scores over the whole frame. It BIASES the pick; it does
    not confine it. To confine a text detect to a region, **crop the image** and offset the mask
    back (MPI-504's head branch: `MpiBox` → `MpiBoxCrop` → SAM3 → `SolidMask` + `MaskComposite`).
    Cost of trusting the tooltip: a whole redesign specced against it, twice, 2026-08-21.
- **`individual_masks: true`** is what gives one chip per object; off, SAM3 unions everything
  and the chip strip collapses to a single thumb.
- Text uses the detector's **normal detect-then-pick** flow (N results to choose between),
  not the points tool's auto-pick-0. Empty prompt is gated app-side, same as zero dots.
- No erode/dilate pair on this branch — detector masks come back clean at the EDGE. Add the
  `-4/+4` only if specks show up. They are **not** clean on the inside — see the next bullet.
- **A `face` / `head` mask arrives with the lips and teeth punched out of it, and NO widget
  on the node fixes that.** The hole is in the detector's own concept mask, so the two
  parameters that look like the fix both miss:
  - `threshold` gates a detection **score** — which objects survive the pick. It never
    decides which pixels a kept mask covers, so lowering it adds detections and changes
    nothing inside one.
  - `refine_iterations` **cannot carve anything**. `_refine_mask` returns
    `((full_mask[0] > 0) | (coarse_full[0] > 0))` — `comfy_extras/nodes_sam3.py:84`. The SAM
    decoder's result is **unioned** with the coarse mask, so refinement only ever ADDS
    pixels; at 0 the same coarse mask comes back through `_coarse_fallback`, hole included.
    Reaching for it is the natural move and it is a dead end in both directions.

  Two fixes, covering different failures — a mask that is holed AND bitten needs both:
  - **Enclosed hole** (mouth closed, gap surrounded by mask): `MpiMaskFillHoles`. Fills only
    what the mask already surrounds, so the silhouette is untouched. Prefer it to a
    `GrowMask +N / -N` close, which reaches a hole only as a side effect of dilating
    everything: it is capped by its iteration count, costs `abs(expand)` scipy passes per
    frame each way, and welds shut any outer concavity narrower than 2N — the chin-to-hair
    gap goes first. Measured on one 768×1344 frame with a 120×60 lips-shaped hole: **20.5 ms**
    for the node against **126.1 ms** for `GrowMask +12/−12`, and the close **did not close
    the hole** — ±12 reaches a gap about 24px wide and the hole is 60px tall. It is not a
    slower equivalent; a radius big enough to match it is a radius big enough to weld the
    silhouette.
  - **Bite out of the silhouette** (mouth open, gap reaching the jaw line): no fill can see
    it, because it is not enclosed. Name it in the vocabulary — `head, hat, mouth`.
    `SAM3_Detect` unions every comma-separated category's mask when `individual_masks` is
    off (`nodes_sam3.py:244`), at one extra detector pass per frame per category.

  On video the hole is frame-dependent, so it reads as flicker rather than as a bad mask —
  and flicker at a seam invites blaming the compositor. Found 2026-09-10 on a Bernini video
  graph; node written as MPI-7 in `ComfyUi-MpiNodes` (that repo's changelog carries the
  measurements).

  **This does NOT reopen MPI-431.** That ruling — "the app is now the only thing that closes
  a hole", `masking-adjust.md` § Fill Holes — is about hole-closing that runs **without being
  asked**: `mask_fill_holes` defaulted on inside raw templates and turned a deliberate ring
  mask into a disc before the sampler saw it, and `compositeThroughMask()` was found holding a
  second copy of the same default. `MpiMaskFillHoles` is the opposite shape — a node an author
  places, on a branch they chose, repairing a mask the app never drew. Nothing acquires
  hole-filling by default. Keep it that way: the day it becomes a flag on an existing node, or
  a default in a shipped template, it IS the third copy.
