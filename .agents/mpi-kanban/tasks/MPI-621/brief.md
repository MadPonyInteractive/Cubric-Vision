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

---

## THE OPEN MEASUREMENT IS DONE — 2026-08-25. And it is not the extend factor.

Seven Klein 9B edits, fixed seed 424242, one prompt (`Replace the drawn scribble with a man
sitting on the sand.`), run straight at the local engine on 48188. Plate: `paint_001.png`,
896×1088, scribble measured by diffing against `t2i_005.png` at **x 770..820, y 445..519 =
51 × 75 px**, stroke median 3px.

| rung | crop | MP | scribble after 1MP normalise | box region correct? |
|---|---|---|---|---|
| 1× | 66×118 | 0.008 | ~850px | ✓ man right — but crop IS the box, so a 10× upscale smear is returned |
| 2× | 132×236 | 0.031 | ~425px | ✓ |
| **3.5×** | 231×413 | 0.095 | **~243px** | ✓ **best** — sharpest, most scene preserved |
| 4.25× | 281×502 | 0.141 | ~200px | ✓ (a tiger head invented at the crop edge — outside the box, discarded) |
| 5× | 330×590 | 0.195 | ~170px | ✗ man far too big |
| 6× | 396×708 | 0.280 | ~142px | ✗ too big and displaced, tiger regenerated larger |
| whole | 896×1088 | 0.975 | ~76px | ✗✗ **destructive** — the woman deleted, the tiger fused into the man as a chimera |

### The rule to build against

**The governing variable is how many pixels the drawn scribble occupies after Klein's ~1MP
normalisation — NOT the extend factor.** Threshold ≈ **200px**. Below it the scribble stops
being an anchor and the model composes the subject freely, at whatever scale reads naturally
for the frame.

```
scribble_after = scribble_source_px × sqrt(1.0 / crop_MP)
→  crop_MP  ≤  (scribble_source_px / 200)²
```

Plate-independent and directly computable from the drawn bbox, which the graph already has.
**So the crop must be sized from the drawing, not set to a fixed factor.** For this plate's
75px scribble that is `crop_MP ≤ 0.141`; the qualitative sweet spot was ~243px (0.095 MP).
Target band: **~240–425px after normalisation.**

This maps straight onto the node already in the graph. `InpaintCropImproved` carries
`output_resize_to_target_size: true` with `output_target_width/height: 1024`, so it *already*
normalises the crop to ~1MP itself. The knob is `context_from_mask_extend_factor`, and it has
to be **derived per run** so the resized crop leaves the scribble above threshold.

### Only the BOX has to be correct, not the crop

At 4.25× the model invented a whole enlarged tiger head from a sliver at the crop edge. That
does not matter: the crop is context, the stitch returns only the box. **Judge every rung on
the box region alone** — a wider crop hallucinating at its margins is free.

### Two predictions in this brief were WRONG — corrected here

**Law 1 does NOT transfer to this route.** No rung showed the glowing-blob signature, not even
1× with almost no scene in frame. Law 1 was measured on a *relight* op — match an
already-composited object to a scene, which genuinely needs global reference. Klein here
**generates** the subject and only needs to know what light to render it under, which the sand
colour and shadow direction inside a tight crop already carry. Different task, different
requirement. Do not re-derive this; do not cite Law 1 against a tight crop on this route.

**The failure direction is the opposite of what was predicted.** The brief expected legibility
to break at the wide end. It never does — every rung produced a man. What breaks is
**anchoring**: scale and position.

### And there is no absolute minimum drawn size

The crop manufactures resolution, so a 75px scribble with 3px strokes works fine — crop so it
lands above threshold. **The ~96px ControlNet ink floor does not carry over**, because that
floor came from stage 1 upscaling a starved control hint; there is no ControlNet here. The
user-facing size hint on the paint step should be revisited rather than ported.

### The one thing still unmeasured at the tight end

At 1× the crop equals the box, so the ~10× upscale smear lands back in the photo. Whether it
survives the downscale to 66×118 is **untested**. There is therefore a practical floor on crop
size too, for a different reason than anchoring — upscale artefacts in the *returned* region.
Measure before allowing the derived crop to collapse onto the box.

### Harness

`scratchpad/run.js` — loads `klein_9b_t2i.json`, injects `Input_wf_type: 4` (kleinEdit),
`Input_Image`, `Input_Positive`, `Input_Seed`, POSTs to `127.0.0.1:48188/prompt`, polls
`/history`, pulls the image. ~14s per run. Produces **no gallery card**, which is correct for a
measurement — the skill's warning against `/proxy/prompt` is about user generations. Injection
mirrors `comfyController._inject` and **throws on a title that matches no node**, so a typo
cannot silently run the graph on its baked values.

Note `/proxy/*` is the REMOTE forwarder and is wrong for a local engine; and both 8188 and
48188 answer on this machine (8188 = standalone bench, 48188 = app engine) sharing one models
root, so a probe must pick deliberately. 48188 was used so 9B stayed resident once rather than
loading a second copy into a 16GB card.

## The STITCH half, measured on the same runs — no GPU needed

The crop sweep above only proves the render is right. Simulating the stitch (scale each ~1MP
result back to its crop size, cut the box out, composite into the untouched photo) answers what
the user actually gets, and it surfaced a second variable the brief never named.

### The return box must be ~2× the drawn bbox, or the subject gets SLICED

Stitching back the drawn bbox + margin (66×118 for a 51×75 scribble) cut a hard vertical line
through the man's torso. **The model renders the subject around and beyond the drawing** — the
scribble is where and how big, not an outline the render stays inside.

Re-stitching the same render at increasing return-box sizes, luma step across the boundary,
4px bands, hard paste with NO feather:

| return box | vs drawn bbox | left edge | bottom edge | subject |
|---|---|---|---|---|
| 66×118 | 1.0× | **−21.3** | −0.8 | **sliced** — the step IS his clipped body, not a seam |
| 106×189 | 1.6× | +1.4 | −6.2 | complete |
| 145×260 | 2.2× | +1.8 | −5.7 | complete |
| 198×354 | 3.0× | −2.6 | −5.2 | complete |

**≥1.6× is enough; 2.2× has margin.** In the shipped flow the user draws this box themselves on
step 3, and the hint already asks for *"the object plus room on the ground for its shadow"* —
this measurement puts a number under that copy. Whatever derives the region must not collapse
it onto the drawn bbox.

### Law 2 is milder here than the doc's worst case

With an adequate box, a **hard rectangular paste, zero feather, generated pixels meeting
original pixels, on uniform sand** — the exact worst case Law 2 names — measures a consistent
**≈5.5/255 (~2%) luma step** at the bottom edge and nothing at the sides. Visible in a
difference measurement, not to the eye at normal viewing.

So keep `mask_blend_pixels` as cheap insurance, but **it is not load-bearing on this evidence**
and should not drive the design. One plate, one scene — do not generalise past that.

### Careful with edge metrics

A luma step across the box boundary measures **content as often as it measures a seam**: the
large right-edge readings in the crop sweep (−50.7 at 3.5×, −72.0 at 4.25×) were the man's dark
body sitting at the box edge, not a re-grade. Only compare bands that are the same material on
both sides — the bottom edge, sand to sand — or zoom and look.

### Two variables, not one

| variable | what it controls | rule |
|---|---|---|
| **crop** (context) | whether the subject renders at the right scale and place | `crop_MP ≤ (scribble_px / 200)²`, target ~240–425px after normalise |
| **return box** (stitch) | whether the rendered subject survives intact | ≥1.6× the drawn bbox, 2.2× with margin |

They are independent and both derive from the drawn bbox. Neither is a fixed constant.

Artefacts for all of it are in the session scratchpad (`law1/`, `law1out/`, `stitched/`); the
end-to-end proof is `STITCHED_rung_3p5x` at a 2.2× box.
