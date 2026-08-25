# MPI-621 — Draw It In, rebuilt Klein-only: crop, edit, stitch

Carded 2026-08-25. **Supersedes the render-and-paste architecture**, and with it MPI-618's
live run and MPI-596's whole design.

## What settled it

Fabio ran the test himself, in the app, 2026-08-25. Same scribble, same photo:

| run | route | time | result |
|---|---|---|---|
| `flowScribObj_016` | SDXL + ControlNet + rembg + paste + LanPaint, 55 nodes, 2 models | **38s** | man standing apart, touching nothing |
| `kleinEdit_003` | Klein 9B, **one image, one sentence** | **15s** | hand on the tiger's back, **leg behind the tiger** |

Prompt: `Replace the drawn scribble with a man.` Source `imported_001`, 314×443.

The leg behind the tiger is the case this flow could not do by construction — the flat paste
lands on top, always. The hand on the tiger's back is the *"riding the tiger"* class:
interaction with content that was already in the photo. Both fell out of asking the edit
model directly.

**The old chain was six locally-correct steps downstream of one unasked question.** ControlNet
renders from a scribble → so it renders in isolation → so it needs rembg and a paste → so the
paste needs blending → so the blend needs a box → so the render needs full-body framing to
give the blend a contact point (that last one was MPI-618, shipped the day before). Nobody
re-asked whether an edit model just does this. When the flow was designed the answer was
probably no; **Klein 9B landed after, and the graph is still baked to 4B.**

## The design

```
user photo ──┐
             ├─ paint step: user draws on the photo
             ├─ box step:   the region that may change
             ↓
   InpaintCropImproved   (crop WIDER than the box — see the open measurement)
             ↓
   Klein 9B edit         ONE image in, instruction does the rest
             ↓
   InpaintStitchImproved (feathered, mask_blend_pixels)
```

**No masking.** No rembg, no silhouette, no SAM3, no `SetLatentNoiseMask`. The edit model does
not need to be told which pixels to touch.

**But the crop-stitch stays, and not as an optimisation.** `refcontrol.md`: Klein's edit
branch scales the input to a megapixel target and never reads `Input_Width`/`Input_Height`.
Fabio's test got away with a whole-image pass because the source was 314×443, so it was an
*upscale*. A 4000×3000 photo comes back at ~1MP with every face and every fine detail
re-rendered. Pixels outside the box are never sent, so they are bit-exact — **no prompt can
guarantee that.**

**And the stitch keeps its feather.** `blending-into-a-photo.md` Law 2 is measured on every
model tried: a localised crop/stitch re-grades the returned patch and leaves a visible
rectangle, worst over sky, water and flat sand. A hard rectangular paste-back brings it
straight back. The region handed over is a **filled rect, never a silhouette** (same doc).

## THE open measurement — do this before designing anything else

`blending-into-a-photo.md` **Law 1**: *"Relighting is a GLOBAL-REFERENCE op. It cannot be done
inside a crop."* Measured — a tower came back a glowing blob when cropped to its own region.

Every run above sent the **whole image**, so Law 1 is untested against this route. Crop
tightly and the lighting reference may vanish.

`InpaintCropImproved.context_from_mask_extend_factor` is the knob: **crop wider than the box
for context, stitch back only the box.** Sweep it on the beach plate — box the man tightly,
find where the lighting reference survives. One number, one afternoon, and the whole crop
design is downstream of it.

That knob also removes a tradeoff rather than teaching it: the user's box then means exactly
one thing — *the area that may change* — and context is the graph's problem, invisible.

## 9B only, and it is a correctness call not a preference

`kleinEdit_005` (4B, style applied) **left the scribble in the output** — the leash and head
survived as a grey mechanical object, and the tiger was corrupted into a cartoon dog.
`kleinEdit_006` (9B, same load) degraded gracefully: scribble gone, composition intact.

4B follows the drawn shape more closely and integrates worse — the same axis the old "Follow
the drawing" slider rode, reappearing as a model choice. But **4B's failure mode is leaving
the user's own ink in the picture**, which is the worst one available.

Cost to accept: the blend slot currently takes 9B *or* 4B so either holder can run. 9B-only
forces a download on 4B-only users — offset by dropping the SDXL checkpoint entirely.

## The prompt

The old blend prompt does NOT transplant — `Keep the object's shape and design` and `Place the
object into the scene` both describe a pasted object that no longer exists. Its **lessons**
do, and each one was a shipped bug (`blending-into-a-photo.md` § The blend prompt):

- **preservation guard** — change nothing but the scribble
- **the replace** — with the user's text, which is also where STYLE rides in (below)
- **erase the ink explicitly** — `005` proves ink survival is a real failure mode
- **conditional shadow physics, never an order** — a demanded shadow appears in scenes that
  have none, pointing the wrong way
- **no glow, no haze, no rim** — bit from both directions and cost real time
- **ask for occlusion** — `let nearby foreground elements overlap its edges` is what sells it

**Do NOT add a light-direction field.** Considered and rejected 2026-08-25. It is the
"never an ORDER" finding with an extra step, and worse here than on the old route: the model
is looking at the actual photo and has better information about its light than the user does.
Anything typed either agrees (no gain) or contradicts (active harm). Same reasoning that
killed the shadow toggle — *"asks a beginner to predict an outcome they cannot picture, on an
axis the image already knows."*

## No style control, and no LoRA rack

Style rides in the **user's own words** — *"a cartoon man wearing X, posing as Y"* styles only
the inserted subject. A style LoRA restyles the whole photo instead, which is exactly what
`kleinEdit_006` did.

This also answers what looked like a loss: **dropping the SDXL arms does not cost the anime
and pony users their capability here.** You do not need an anime checkpoint to insert an anime
character; you ask for one. Those users' home for real SDXL work is the sibling Scribble card.

Character LoRAs are a separate matter and mostly do not survive the swap — an SDXL, Pony or
Flux1 character LoRA **will not load on Klein**. The better answer is identity by
**reference image**: Klein chains three `ReferenceLatent` nodes already (`klein_t2i.json` 172
→ 178 → 176, with `Input_Image_2` / `Input_Image_3` exposed), so a character sheet in slot 2
plus *"replace the drawn scribble with the man from image 2"* is the no-training route, and it
is the project's stated bet. **Phase 2 — not this card.**

## What this supersedes

- **MPI-618** — the framing suffix. The commit ships and is inert; its live run validated a
  phase being deleted, so it was closed rather than run.
- **MPI-596 (Object Stamp)** — SAM3 extract → fit in box → Krea2 denoise blend is cut, paste,
  repair: the same architecture disproven here, and it has not been built yet. It also
  **converges with this flow** — both become "target + reference + instruction", differing only
  in how the user says *where* (596 a box, this a scribble; a scribble carries position, scale
  AND pose). Re-read 596 against this card before building it; it may not need to be a separate
  flow at all.

## Definition of done

1. `context_from_mask_extend_factor` measured and the value justified in the flow doc.
2. Klein 9B only; the SDXL render slot, rembg and the paste chain removed from the graph.
3. The prompt carries all six properties above, each traceable to its finding.
4. Verified on **more than one plate** — the old route was judged on five. At minimum: the
   beach plate, one small/distant subject, and one deliberate style mismatch (*"a cartoon
   man…"* into a photoreal scene).
5. `npm test` **and** `npm run test:desktop`.
6. Live run in the app.
