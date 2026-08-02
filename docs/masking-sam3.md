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
  -> Input_Points_Mode (MpiIfElse) -> existing ImpactSEGSPicker + SEGSPreview
```

Injectable keys: `Input_Points_Positive`, `Input_Points_Negative`, `Input_Points_Mode`
(bool, default **false**). The branch rejoins the **existing** picker chain, so thumbs /
pick / composite plumbing is reused, not forked, and the shipped one-mask-per-pick contract
(`ImpactSEGSToMaskList`, never `SegsToCombinedMask`) stays intact. `MpiIfElse` inputs are
lazy, so points mode never runs YOLO.

**Mask ORDER is part of that contract.** JS maps `image[i] → sortedPicks[i]` (picks sorted
ascending — `commandExecutor.js`), so the graph must emit per-SEG masks in **ascending SEG
order** or picks land on the wrong segment. `ImpactSEGSPicker` + `ImpactSEGSToMaskList` preserve
it; any node that reorders, combines or merges SEGS before `Output_image` re-breaks multi-pick
silently.

### Behaviour you must not "fix"

- **N dots do NOT give N objects.** All points go into one predict call, so SAM3 returns a
  single region consistent with **all** of them. One part per run; Add accumulates.
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
  -> Input_Text_Mode (MpiIfElse) -> the Input_Points_Mode gate -> the same picker chain
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
- **`individual_masks: true`** is what gives one chip per object; off, SAM3 unions everything
  and the chip strip collapses to a single thumb.
- Text uses the detector's **normal detect-then-pick** flow (N results to choose between),
  not the points tool's auto-pick-0. Empty prompt is gated app-side, same as zero dots.
- No erode/dilate pair on this branch — detector masks come back clean. Add the `-4/+4` only
  if specks show up.
