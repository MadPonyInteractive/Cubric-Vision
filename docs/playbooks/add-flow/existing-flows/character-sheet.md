# Character Sheet (MPI-504)

> One prompt in, a three-view reference sheet out — front full-body, back full-body, and a
> head-and-shoulders portrait — with an optional **Remove Head** pass that leaves the
> wardrobe standing. Four recipe templates (Photoreal, 3D, Anime, Cartoon). No input media.

**Head removal does not GENERATE anything.** It is pure compositing — two masks and a grey
plate. If you are reading a doc, a card or a comment that says this flow inpaints, samples,
or runs `LanPaint_KSampler`, that doc is out of date; see § History below before acting on
it.

---

## The sheet layout is a prompt promise, and the graph depends on it

Every recipe (`Recipe_Photoreal` #666 / `Recipe_3D` #667 / `Recipe_Anime` #668 /
`Recipe_Cartoon` #669) asks for the same frame:

> *"…three views of the same character arranged side by side in one unbroken frame… The
> right half of the image is filled by a head and shoulders portrait… The left half holds
> two narrow full-body standing views of equal width, one seen from the front and one from
> directly behind… Plain smooth eighteen percent grey card seamless studio background."*

So the sheet divides into quarters:

| quarter | content |
|---|---|
| 1 (leftmost) | **front** full-body |
| 2 | **back** full-body |
| 3 + 4 (right half) | head-and-shoulders portrait |

Two things in the graph are wired to that promise and break silently if a recipe is ever
reworded: the head mask's crop (below), and the grey plate's colour.

**The grey plate is `8421504` = `0x808080`** (`EmptyImage` #852) — matched to the recipe's
"eighteen percent grey card". That match is why a masked-out region reads as *absent*
rather than as a grey rectangle. Change the backdrop wording and this constant has to move
with it.

---

## Two masks, and only one of them is about the head

### 1. The head mask — deliberately confined to quarter 1

```
#774 MpiMath "a // 4" (Get_W)  ->  #752 MpiBox(width W//4, height H, x 0, y 0)
#759 MpiBlocker (gated on Input_Remove_Head)  ->  #758 MpiBoxCrop
    ->  #755 SAM3_Detect  "face, hat, moustache"  (threshold 0.5, individual_masks false)
    ->  #757 MaskComposite(add) onto #756 SolidMask(W x H) at (0,0)
    ->  #854 GrowMask(expand 6, tapered)
```

SAM3 only ever sees the left quarter, and the result is pasted back at `(0,0)`. **The head
mask cannot reach quarters 2–4 by construction.** Keep that in mind when something looks
"removed" elsewhere on the sheet — it is not this branch, and chasing it here wastes a run.

`MpiBlocker` #759 gates the crop on `Input_Remove_Head`, so SAM3 does not run when the
toggle is off.

### 2. The subject matte — SAM3 on the BACKGROUND, inverted

```
#864 SAM3_Detect  "background:3"  on the FULL sheet (threshold 0.5, individual_masks false)
    ->  #868 MaskComposite(add) onto #870 SolidMask(W x H)
    ->  #875 GrowMaskWithBlur(expand 3, blur_radius 1, tapered)
    ->  #874 InvertMask                      <- everything that is NOT backdrop
```

`GrowMaskWithBlur` grows the **background** before the invert, so the subject is trimmed 3px
inward with a soft edge — that is what stops a halo of backdrop surviving around each figure.

`background:3` — three panels, three background regions. The `:N` suffix is a hard
`max_detections` cap that **defaults to 1**, so a bare `background` mattes one panel and
greys the other two, silently. The full rule, its measurements, and the separate trap that
`:1` detects *nothing*, are in [../../../masking-sam3.md](../../../masking-sam3.md)
§ "Behaviour you must not fix" — do not restate them here, and read them before editing any
SAM3 vocabulary in this graph.

### They meet at one switch

```
#742 MpiIfElse(Input_Remove_Head)
        true  <- #858 MaskComposite(subtract): subject matte MINUS grown head mask
        false <- #874 InvertMask: subject matte
    ->  #859 InvertMask
    ->  #851 ImageCompositeMasked(destination = the sheet, source = grey #852)
    ->  #494 Output_Image
```

**The grey composite is NOT gated on `Input_Remove_Head`.** Both switch arms lead to it, so
every run repaints the backdrop whether or not the head is being removed. This is the single
most useful fact in the file — see below.

---

## THE LESSON: matte what you THROW AWAY, not what you KEEP

The subject matte came from BiRefNet (`RemoveBackground` + `LoadBackgroundRemovalModel`)
between 2026-08-27 and 2026-08-28, and it **shipped a defect**: a wizard's staff vanished
from the sheet, and it read as "head removal is removing the staff".

It was not the head branch. BiRefNet is a **single-salient-subject** segmenter and it was
handed a three-panel sheet; it locked onto the large right-half portrait and under-segmented
the two narrow full-body views. Anything it failed to call *subject* fell outside the keep
mask and `#851` painted `0x808080` over it — the same grey as the backdrop, so a dropped
staff did not look dropped, it looked deleted on purpose.

**Segmenting the subject is open-world.** "Keep the person" has to name every object that
should survive — a staff, a cape, a satchel — and that list is different for every character,
so it can never be a fixed widget. The first repair attempt (`person:3`) hit exactly this: it
selected three people correctly and still dropped all three staffs, because a staff is not a
person.

**Segmenting the background is closed-world.** "Throw away the backdrop, keep the rest" needs
no vocabulary for props at all — anything the model fails to recognise as background survives
by default. The failure mode inverts from *silently losing content* to *keeping a bit too
much*, which is both visible and harmless on a flat grey card.

Reach for this shape whenever a mask decides what SURVIVES rather than what is edited.

### The diagnostic that settled it in one run

Because the grey composite is unconditional, **bypassing Remove Head does not bypass the
matte**. Turning the toggle off and seeing the staff still vanish exonerated the entire head
branch immediately, with no generation spent. When something disappears from this sheet, run
that check first.

---

## History — do not resurrect any of these

| when | head-removal recipe |
|---|---|
| MPI-354 / MPI-504 | `flux2-klein-4b-outpaint` LoRA @ 1.1 + a **green** plate (`EmptyImage` 65280) + `ImageCompositeMasked` + `SamplerCustomAdvanced`. A workaround for inpainting. |
| 2026-08-23, MPI-603 (`08dbde02`) | `LanPaint_KSampler` + `SetLatentNoiseMask` + `InpaintCropImproved`/`StitchImproved`. Live-confirmed working. |
| 2026-08-27 (`19ec571c`) | The sampler pass deleted entirely; replaced by a BiRefNet subject matte + grey plate. **Shipped the dropped-staff defect.** |
| 2026-08-28 | BiRefNet replaced by the SAM3 `background:3` matte above. One fewer model in the graph. |

The LanPaint row is the one most likely to mislead — it is still described as current in
older card records. It was real, it worked, and it is gone.

**`birefnet` is still a live dep — do not remove it.** `comfy_workflows/remove_background.json`
is a separate op that uses it. Leaving this graph cost one *node*, not one model on a user's
disk.

## Related

- [scribble-to-object.md](scribble-to-object.md) — the other SAM3-adjacent flow; different
  problem (single subject, crop-and-stitch), do not copy its blend phase in here.
- [../../../models/klein/removal.md](../../../models/klein/removal.md) — the outpaint LoRA's
  characterisation, kept as history only.
