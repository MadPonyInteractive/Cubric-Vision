# Draw It In

> The user draws on top of their own photo, says what it is, and the flow renders that
> subject into the scene — at the drawn place, scale and pose, lit by the photo's own light,
> casting a shadow on its ground, with whatever is already in front of it overlapping its
> edges. Cards: **MPI-567** (built), **MPI-621** (rebuilt Klein-only, 2026-08-25).
>
> **Renamed 2026-08-23** — "object" was the wrong word, Fabio had been drawing characters. The
> display name and the workflow filename moved; the `id` (`scribble-object`), the op
> (`flowScribObj`) and this file's name deliberately did NOT, because gallery cards already
> carry the `FLOWSCRIBOBJ_` prefix and their sidecars' `flowId`.
>
> Portable UI decisions live in [../ui/](../ui/); the any-of model set lives in
> [../any-of-models.md](../any-of-models.md).

## The shape — one model, one pass

```
photo ──┬──────────────────────────────────┐
        │  paint step: the user draws on it │
        ↓                                   ↓
   ImageCompositeMasked  (the drawing ONTO the photo — this is what Klein sees)
        ↓
   InpaintCropImproved   mask = the user's box; context = DERIVED from the drawing
        ↓                                   (see "The two sizing rules")
   Klein 9B edit         one image in, the instruction does the rest
        ↓
   ColorMatch            put the photo's own grade back on the patch (see below)
        ↓
   InpaintStitchImproved feathered, returns ONLY the box
```

35 nodes. **No mask, no rembg, no silhouette, no `SetLatentNoiseMask`, no ControlNet, no
second model.** The edit model does not need to be told which pixels to touch.

**The crop/stitch is a CORRECTNESS requirement, not an optimisation.** Klein's edit branch
scales its input to a megapixel target and never reads the source size, so a whole-image pass
on a 4000×3000 photo re-renders every face and every fine detail at ~1MP. Pixels outside the
crop are never sent, so they come back bit-exact — **no prompt can promise that.** Run
whole-image on the measured plate and it deleted a bystander and fused the tiger into the man.

**The stitch keeps its feather** (`mask_blend_pixels: 32`). See "Law 2" below: the re-grade is
real but mild here, so the feather is cheap insurance rather than the thing holding it up.

## Why the SDXL architecture was deleted

Fabio ran both himself, same scribble and same photo (2026-08-25). The 55-node two-model route
took **38s** and left the man standing apart touching nothing; **one Klein 9B edit** took
**15s** and put his hand on the tiger's back and his leg **behind** it — the case a flat paste
could never do, because a paste lands on top. The old chain was six locally-correct steps
downstream of one unasked question, and Klein 9B landed after it was designed. Full evidence:
`.agents/mpi-kanban/tasks/MPI-621/brief.md`.

## The two sizing rules — measured, do not re-derive

Both derive from the drawn bbox. Neither is a constant. Seven Klein 9B runs at fixed seed on
one plate, plus a no-GPU stitch simulation off the same renders (MPI-621).

### 1. CROP (context) — how big a region Klein sees

**The governing variable is how many pixels the scribble occupies AFTER Klein's ~1MP
normalise**, not the extend factor. Threshold ≈ **200px**: below it the scribble stops being an
anchor and the model composes the subject freely, at whatever scale reads for the frame. The
failure at the wide end is **anchoring — scale and position — never legibility.** Every rung
produced a man; the wide ones produced one that was too big, displaced, or fused with the
scene.

```
crop_MP  ≤  (scribble_px / 200)²          target band ~240–425px after normalise
```

**Within that band, take the WIDEST crop that still anchors, not the tightest that fits** —
seam tone improves with context. A 0.031MP crop stitched back showed a plainly visible lighter
rectangle on sand; the 0.095MP crop at the same box did not.

In the graph this is three nodes and **no new node type**:

```
MpiMaskSquareBbox(drawn region, padding 0) -> size S
MpiMaskSquareBbox(box mask,     padding 0) -> size B
MpiMath(a=S, b=B) -> InpaintCropImproved.context_from_mask_extend_factor
```

`4.267 = 1024 / 240`. `InpaintCropImproved` grows the **mask** bbox by the factor in every
direction, then forces the region to the target ASPECT and resizes it to exactly
1024 × 1024 — so the crop is square and its side is `factor × max(box_w, box_h)`. Feeding
`4.267 × S / B` therefore lands the scribble at ~240px whatever the user drew.

- **`max()` is NOT available to `MpiMath`.** `safe_math` allows `math.*` only, and an
  unknown call is caught and returned as **0.0**, silently — a factor of 0 skips the growth
  entirely and the crop collapses onto the box. The floor is written as a conditional
  expression instead: `1.0 if b <= 0 else (4.267*a/b if 4.267*a/b > 1.0 else 1.0)`.
- **`optional_context_mask` is deliberately unwired.** The crop node UNIONS it with the grown
  bbox, so anything there re-widens the crop and defeats the derivation.
- The `1.0` floor is honest, not defensive: a crop can never be smaller than the region that
  has to be returned. A user who boxes far wider than they drew gets a subject rendered
  larger than they drew it, and the box step's hint says so.

### 2. RETURN BOX (stitch) — how much comes back

**The model renders the subject AROUND and BEYOND the drawing.** The scribble is where and how
big, not an outline the render stays inside. Stitching back the drawn bbox cut a hard vertical
line through the man's torso.

| return box vs drawn bbox | subject |
|---|---|
| 1.0× | **sliced** |
| 1.6× | complete |
| 2.2× | complete, with margin |

**≥1.6× is the floor and shadow room is ON TOP of it** — and shadow room is scene-dependent (a
low sun casts a long shadow), which is exactly why the user draws this box and the graph does
not derive it. The box step's hint copy is load-bearing; keep it.

### Predictions that were WRONG

- **Law 1 (["Relighting is a GLOBAL-REFERENCE op"](../blending-into-a-photo.md)) does NOT
  transfer to this route.** No rung showed the glowing-blob signature, not even a 0.008MP
  crop. Law 1 was measured on a *relight* op — matching an already-composited object to a
  scene genuinely needs global reference. Klein here **generates** the subject and only needs
  to know what light to render it under, which the sand colour and shadow direction inside a
  tight crop already carry. **Do not cite Law 1 against a tight crop on this route.**
- **Law 2 looked much milder here — and that was a plate artefact.** A hard rectangular paste,
  zero feather, on uniform sand measured ≈5.5/255 and was invisible. Then Fabio ran a
  **vintage** plate and the seam was obvious. See the next section: the measurement was right
  and the generalisation was wrong.
- **The "upscale the source first" fix is redundant here.** The crab-with-a-detached-shadow
  failure did not reproduce at any rung: the crop is normalised to ~1MP however small the
  region is, so it manufactures the pixels per run instead of a blanket 2× upscale. What DID
  survive from that instinct is rule 2 — the shadow is generated at 1MP and stitched at source
  scale, so the box must contain it.
- **A big crop upscale is fine on textured ground.** A 141px crop → 1024 (**7.3×**) stitched
  back with no visible seam and no softness, the tiger's leg running through the box edge
  unbroken. What showed instead was Law 2 over sky/water: the same figure over the horizon came
  back as a lighter rectangle.

**Careful with edge metrics.** A luma step across the box boundary measures CONTENT as often as
a seam — the big right-edge readings in the sweep were the man's dark body at the box edge, not
a re-grade. Compare same-material bands (sand to sand), or zoom and look.

## The grade match — the model RESTORES the photo, and that is the seam

Found by Fabio's first run in the app, 2026-08-25, on a **vintage** plate: faded, warm, low
contrast. The subject was right and the region came back as a visibly *cleaner* rectangle. His
read was exactly right — **the model fixed what made the photo vintage.** Measured on his run:

| | patch vs the source it replaced |
|---|---|
| mean | **+9.5 / +5.5 / +2.6** RGB — channel-uneven, i.e. a de-fade, not a brightness shift |
| sd | **+5.9 / +4.8 / +4.4** — contrast restored |
| top-edge luma step | **3.60**, where the photo's own step across that line is 0.39 |

**Two things this is NOT.** It is not lack of context — he tried a bigger box and it changed
nothing, because the model is not missing the reference, it is *correcting* it. And it is not
an edge artefact, so the feather cannot touch it: a feather softens a boundary, and this is a
whole-patch shift.

**The fix is to put the grade back**, with `ColorMatch` (KJNodes, already in the shipped
engine) between the decode and the stitch — `image_ref` = the ORIGINAL crop
(`InpaintCropImproved` output 1), `image_target` = the Klein decode, `mkl`, strength 1.
Verified live on the same plate: mean delta **−3.2/−3.2/−2.6** (uniform, so tone rather than
restoration), sd delta down 3.7×, **top-edge step 3.60 → −0.20** — below the plate's own
natural variation, and no rectangle to see.

Wire `image_ref` from the SAME crop node the stitch takes its stitcher from, and take the ref
from the whole crop rather than a border ring: matching on a ring was tried and measured worse
(−2.58), because the ring catches whatever else crosses the box edge. **Known ceiling:** the
reference includes the subject's own new pixels, so a subject that FILLS the box drags its
tone toward the background it replaced. It has not bitten yet; drop `strength` below 1 if it
does. `tests/inject-params-titles.test.cjs` pins the wiring — deleting the node is silent,
the run just succeeds with the seam back.

## 9B only — a correctness call, not a quality preference

Under style load, **4B left the user's own ink in the output**: the drawn leash and head
survived as a grey mechanical object while the tiger was corrupted into a cartoon dog. 9B under
the same load degraded gracefully — scribble gone, composition intact. 4B follows the drawn
shape more closely and integrates worse, which is the same axis the deleted "Follow the
drawing" slider rode, reappearing as a model choice; its failure mode is the worst one
available. Cost accepted: a 4B-only user downloads 9B, offset by dropping SDXL entirely.

## The prompt

Built as `MpiText(prefix) + Input_Positive + MpiText(guardrails)` through two
`StringConcatenate` nodes, so the user's words land inside the instruction rather than beside
it. The guardrail half carries six properties, and **each one was a shipped bug** — see
[../blending-into-a-photo.md § The blend prompt](../blending-into-a-photo.md):

1. **preservation guard** — change nothing but the drawn region
2. **the replace** — with the user's own text, which is also where STYLE rides in
3. **erase the ink explicitly** — ink survival is a measured failure mode, not a worry
4. **conditional shadow physics, never an order** — a demanded shadow appears in scenes that
   have none, pointing the wrong way
5. **no glow, no haze, no rim** — bit from both directions and cost real time
6. **ask for occlusion** — "let nearby foreground elements overlap its edges" is what sells it

The old blend prompt does **not** transplant. `Keep the object's shape and design` and `Place
the object into the scene` both describe a pasted object that no longer exists.

## What this flow deliberately does NOT have

- **No style control and no LoRA rack.** Style rides in the user's own words — *"a cartoon man
  wearing X"* styles only the inserted subject, where a style LoRA restyles the whole
  photograph. An SDXL, Pony or Flux1 character LoRA will not load on Klein at all. Identity by
  **reference image** is the route (the graph's `ReferenceLatent` chain already supports it)
  and it is a later card.
- **No light-direction field.** Considered and rejected 2026-08-25. It is the documented
  "never an ORDER" shadow finding with an extra step, and worse here: the model is looking at
  the actual photo and knows its light better than the user does. Anything typed either agrees
  (no gain) or contradicts (active harm).
- **No drawn-size floor.** The old "~96px tall" hint came from ControlNet starving on a small
  hint. There is no ControlNet, and the crop is sized from the drawing, so a 75px scribble with
  3px strokes rendered a grounded figure with contact shading.
- **No ControlNet strength slider.** Its axis became the model choice; see 9B-only above.

## Siblings

**MPI-620 (Scribble)** is where the deleted SDXL half goes — drawing on a *blank canvas*, where
rendering in isolation is correct. Reusable measurements are in its brief; two worth naming so
nobody re-measures them: control strength **0.60** at `end_percent 0.569` (0.5 did not follow
the drawing, 0.65 put the doodle through), and the ~**96px** ink floor. The rest is in this
file's pre-rebuild version — `git log -- <this file>`.

**MPI-596 (Object Stamp)** is the same cut/paste/repair architecture disproven here and has not
been built. Both are "target + reference + instruction", differing only in how the user says
*where* — 596 a box, this a scribble, and a scribble carries position, scale AND pose. Read it
against this flow first; they may not need to be two flows.
