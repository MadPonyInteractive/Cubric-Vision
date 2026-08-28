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

One thing in the graph is wired to that promise and breaks silently if a recipe is ever
reworded: the head mask's crop (below).

**There is no longer a grey plate constant, and there must never be one again.** Until
2026-08-28 the head hole was filled with `EmptyImage` `8421504` (`0x808080`), documented
here as "matched to the recipe's eighteen percent grey card". **That match never existed.**
Measured across nine runs, the model paints its card at RGB ~176 under turbo and ~137 at 25
steps, and it moves again with the recipe wording — up to **114 levels** from the constant.
The fill is now *sampled from the sheet at generation time* (below), which is the only thing
that can track a backdrop the model chooses per run.

---

## One mask, and it is only ever about the head

### The head mask — deliberately confined to quarter 1

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

### The fill — sampled from the sheet, never a constant

```
#730 the sheet  ->  #887 ImageCrop(x 0, y 0, 32x32)   <- top-left corner: backdrop
                ->  #889 ImageScale(nearest-exact, W x H)
                ->  #883 ImageCompositeMasked.source
```

The crop is the colour sample. `resize_source` on `#883` would stretch any size, so the
second scale is only there to make the source sheet-sized explicitly.

**Prefer `ImageScale(area, 1, 1)` between the two** if you touch this: `area` down to 1×1 is
an exact mean (it goes straight to `torch.nn.functional.interpolate(mode='area')`), so a
contaminated corner shifts the colour slightly instead of being stretched into a visible
32×32 block. The corner had zero margin on one of the nine measured runs, so contamination
is not hypothetical.

Sampling position was chosen by measurement, not intuition. Mean error against the true
local backdrop, worst case across nine runs: constant `0x808080` **114**, top-left 32×32
**26**, the gap between the two full-body figures **16**, a mask-weighted blur fill **8.5**.
The corner wins on simplicity and is comfortably inside "close to the background"; the gap
strip needs a maths node for `W/4 − 12` and buys 10 levels.

### The switch

```
#742 MpiIfElse(Input_Remove_Head)
        true  <- #883 ImageCompositeMasked(destination = the sheet, source = the sample,
                                           mask = #854 the grown HEAD mask)
        false <- #730 the sheet, UNTOUCHED
    ->  #882 Output_Image
```

**The composite IS gated on `Input_Remove_Head`, and nothing else in the flow modifies the
sheet.** With the toggle off the generated image is emitted exactly as sampled. This is the
opposite of what this file said before 2026-08-28, when an ungated composite repainted the
whole backdrop on every run — do not reintroduce that; `tests/flow-model-choice.test.cjs`
pins all three properties (head-only mask, sampled source, the gate) and is mutation-checked.

---

## THE LESSON: matte what you THROW AWAY, not what you KEEP

> **History as of 2026-08-28 — there is no subject matte in this flow any more.** The
> reasoning below is kept because it is correct and reusable, and because the two failed
> designs it describes are the ones most likely to be reinvented. It no longer describes
> the shipped graph.

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

### The diagnostic that settled it — and why it no longer works

While the composite was ungated, bypassing Remove Head did *not* bypass the matte, so
turning the toggle off and watching the staff still vanish exonerated the head branch with
no generation spent. **That shortcut is gone**: the composite is now gated, so with the
toggle off nothing is modified at all. Today the equivalent check is the opposite one — if
anything looks wrong with Remove Head *off*, it came out of the sampler, not this flow.

## THE OTHER LESSON: the recipes, not the graph

Two full sessions were spent hunting a matte bug that was a **prompt** bug. Anime and
Cartoon sheets came out with the figures nearly the same tone as the card, so every edge
artefact was amplified. The cause was the word **`flat`**, used for several different
targets in one paragraph — and under Krea 2's Qwen3-VL encoder, which reads whole sentences
rather than tags, that reads as one global flatness instruction. The count predicted the
severity exactly:

| recipe | uses of `flat` | silhouette below contrast 30 |
|---|---|---|
| Photoreal | 2 | fine |
| 3D | 2 | 2.6% |
| Anime | 3 | 14.3% |
| Cartoon | 4 | 21.2% |

Rewriting Anime and Cartoon to use `flat` zero times, grouping the background into its own
sentence, and asking explicitly for tonal separation from the card took Cartoon from 21.2%
to **7.8%**. Krea 2's own research names this failure mode — *style-adjective stacking
muddies output* — in `Cubric-Prompt/dev-docs/recipe-research/krea-2/research.md` Q4.

Two corollaries worth keeping:

- **A photometric numeral in a prompt is not a colour control.** `eighteen percent grey`
  binds only at high step counts and leaks onto the wardrobe when it does — changing it to
  `80 percent` left the card 13 levels *lighter* and turned the robes dark.
- **Turbo ignores the tail of the prompt.** Backdrop tone, layout fidelity and style clauses
  all move between 2-step and 25-step runs. Judge a recipe change at turbo, since that is
  the shipping default and the worse case.

---

## History — do not resurrect any of these

| when | head-removal recipe |
|---|---|
| MPI-354 / MPI-504 | `flux2-klein-4b-outpaint` LoRA @ 1.1 + a **green** plate (`EmptyImage` 65280) + `ImageCompositeMasked` + `SamplerCustomAdvanced`. A workaround for inpainting. |
| 2026-08-23, MPI-603 (`08dbde02`) | `LanPaint_KSampler` + `SetLatentNoiseMask` + `InpaintCropImproved`/`StitchImproved`. Live-confirmed working. |
| 2026-08-27 (`19ec571c`) | The sampler pass deleted entirely; replaced by a BiRefNet subject matte + grey plate. **Shipped the dropped-staff defect.** |
| 2026-08-28 (morning) | BiRefNet replaced by a SAM3 `background:3` matte. One fewer model in the graph — and the dropped-staff defect fixed — but the backdrop was still repainted with the constant plate. |
| **2026-08-28 (current)** | **Whole-sheet matte removed entirely.** The composite is gated on `Input_Remove_Head` and fills only the head hole, with a colour **sampled from the sheet**. Backdrop is never repainted. Anime and Cartoon recipes rewritten (see § THE OTHER LESSON). |

Two rows are likely to mislead. **LanPaint** is still described as current in older card
records — it was real, it worked, and it is gone. **The SAM3 `background:3` matte** lasted
one day and is described in detail above under a history banner; it was not wrong, it was
unnecessary. The card the model generates is already flat (std 2.8 measured), so repainting
it bought nothing and made every masking error visible.

**`birefnet` is still a live dep — do not remove it.** `comfy_workflows/remove_background.json`
is a separate op that uses it. Leaving this graph cost one *node*, not one model on a user's
disk.

## Related

- [scribble-to-object.md](scribble-to-object.md) — the other SAM3-adjacent flow; different
  problem (single subject, crop-and-stitch), do not copy its blend phase in here.
- [../../../models/klein/removal.md](../../../models/klein/removal.md) — the outpaint LoRA's
  characterisation, kept as history only.
