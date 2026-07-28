# MPI-361 — Masking methods research

Probed the live bench (`/object_info`, 1842 nodes) + searched what the community ships in 2026.
Everything below is **verified against the running install**, not recalled.

Today's ceiling: `img_auto_mask.json` = `UltralyticsDetectorProvider` (4 models: face/hair/hand/person)
→ `ImpactSimpleDetectorSEGS` → `SAMLoader(sam_vit_b_01ec64.pth)` refine → `ImpactSEGSPicker`.
YOLO closed vocabulary. "Mask the headphones" is impossible on that path, permanently.

---

## Tier 0 — already installed, ZERO downloads

### 0.1 Mask Pointer — click points + confidence (this IS the ComfyUI feature the user remembers)

Chain, all Impact Pack, all present:

```
painted dots (MASK) → MaskToSEGS(combined=False, drop_size=1)
                    → SAMDetectorCombined(sam_model=sam_vit_b, image,
                        detection_hint='mask-points',
                        threshold=<the confidence dial>,
                        dilation, mask_hint_use_negative)
                    → MASK
```

- `detection_hint` enum confirmed on the bench: `center-1, horizontal-2, vertical-2, rect-4,
  diamond-4, mask-area, mask-points, mask-point-bbox, none`.
- `threshold` (default 0.93) tooltip, verbatim: *"A higher value generates a more specific mask
  with a narrower range. For example, when pointing to a person's area, it might detect clothes,
  which is a narrower range, instead of the entire person."* — that is the exact behaviour the
  user described ("selects everything belonging to that area").
- **Negative points**: `mask_hint_use_negative='Small'` reads SMALLER dots as negative, larger as
  positive. Polarity = brush size. Workable, but crude; a 2-layer mask (pos/neg) is cleaner if we
  want an explicit right-click-to-exclude.
- **Weight cost: zero.** `sam_vit_b_01ec64.pth` is already loaded by our auto-mask graph.
- App-side cost: a **points** brush mode on `MpiCanvas/MaskManager` + one extra graph branch.
  The run/thumbs/pick/composite plumbing already exists (`runAutoMaskDetect` →
  `commandExecutor.js:889` → params-by-title → `MpiAutoMaskThumbs`).

#### LIVE PROOF — run 2026-07-28 on the app's own engine (ComfyUI 0.28.0, `engine/ComfyUI_windows_portable`)

Probe script: [research/maskpoint_probe.py](research/maskpoint_probe.py). Test image = a 928×1136
photo of a woman walking a dog. **One** positive dot (r=8) at `(458, 572)` — the centre of her
denim shorts. YOLO has no "shorts" class, so the shipped path cannot produce this at any setting.

| threshold | result | white px | % of frame |
|---|---|---|---|
| **0.93** | **the shorts alone**, clean garment cutout with the leg-gap notch | 15,583 | 1.48% |
| **0.50** | **the whole person**, head to shoes | 94,512 | 8.97% |

[thr 0.93](research/probe-thr093-shorts.png) · [thr 0.50](research/probe-thr050-person.png)

Same click, one slider, 6× scope change, sub-part → whole object. Zero downloads. **Phase A is proven.**

#### Openable graph for hands-on tuning

[research/maskpoints_probe.json](research/maskpoints_probe.json) — a **LiteGraph** file, drag it onto
the ComfyUI canvas. Paints-and-runs out of the box: `LoadImage` is preset to `mpi361_probe.png`
(copied into `engine/ComfyUI_windows_portable/ComfyUI/input/`) with one demo dot baked into its
alpha, so **Run** works on first click. Right-click the node → *Open in MaskEditor* to move the dots.

Two `SAMDetectorCombined` branches share the same dots at 0.93 and 0.50, each into an
`ImageAndMaskPreview` overlay, so the threshold A/B is visible side by side. A `Note` node carries
the usage rules and the knob list, with a `--- YOUR NOTES BELOW ---` section to write into.

Verified: converts through `scripts/workflow-to-api.mjs` with 0 dangling links and 0 missing
required inputs, and the converted API graph **executed successfully** on the live engine —
TIGHT returned the shorts, BROAD the whole person.

**Note on `LoadImage`'s MASK**: it is `1 - alpha`, so a painted point is alpha **0**. Only matters
for the baked demo dot; MaskEditor handles it correctly on its own.

#### How `threshold` actually behaves (read from `modules/impact/core.py`)

Not a smooth confidence. `sam_predict` takes SAM's **3 candidate masks** (part / subpart / whole)
with their scores, keeps every mask scoring **≥ threshold**, and unions them. If none pass it falls
back to the single highest-scoring mask.

- High (0.93) → nothing passes → fallback = **one tightest mask**.
- Low (0.50) → several pass → **union** = broader.

So the dial is real and useful, but **steppy** — it snaps between 3 candidates, it does not glide.
Design the UI for that (a few detents, or just re-run on release) rather than promising a smooth ramp.

Two more facts read from the same source, both load-bearing:

- In the `mask-points` branch SAM runs **once over the FULL image** with every point centre at once
  (`sam_obj.predict(image, points, plabs, None, threshold)`, bbox `None`). **`crop_factor` does NOT
  cage it** — a tiny dot can still select a huge object. This was the main risk and it is dead.
- Negative points: with `mask_hint_use_negative='Small'`, a dot whose **bbox width is < 10 px**
  becomes `plab=0`. That is the exact cutoff. Brush size is the polarity switch — usable, but a
  10px cliff is a poor thing to hang UX on. Prefer two explicit point layers in our UI.

Also learned: `MpiLoadImageFromPath` emits a preview image in the prompt `outputs` map. A result
reader that grabs the first `outputs` entry will pick up the INPUT, not the result. Key by node id.

### 0.2 Colour/luma wand — no model at all

`ColorToMask` (KJ: RGB + `threshold` tolerance), `ImageColorToMask` (core), `ThresholdMask` (core).
Instant, free, purely colour — no texture, no semantics. Good as a *secondary* refine tool
(e.g. "grab the sky"), useless for "the headphones".

### 0.3 CLIPSeg — open-vocabulary TEXT, drop-in

`CLIPSegDetectorProvider` (Impact) outputs a `BBOX_DETECTOR` — it plugs **straight into the
`bbox_detector` slot our graph already has**, replacing Ultralytics with zero rewiring.
Inputs: `text` (comma-separated targets), `blur`, `threshold`, `dilation_factor`.
KJ twin: `DownloadAndLoadCLIPSeg` + `BatchCLIPSeg` → text → MASK directly (fp16 repack, ~75MB).

Caveat: the node self-downloads `CIDAS/clipseg-rd64-refined` (~150MB) through transformers — an
uncontrolled download outside our dep system. And CLIPSeg quality is well below SAM3; blobby edges.

### 0.4 Face parts — `MediaPipeFaceMask` (core)

`face_oval / lips / left_eye / right_eye / irises`, combinable. Free, precise, tiny. Nice-to-have
for portrait retouch ops, not a general masking answer.

---

## Tier 1 — SAM3, one 1.75GB download, the real answer

`SAM3_Detect` is **core** (`comfy_extras.nodes_sam3`, no custom pack). Verified schema on the bench:

| input | type | note |
|---|---|---|
| `model` | MODEL | from `CheckpointLoaderSimple` |
| `image` | IMAGE | |
| `threshold` | FLOAT 0.5 | **text detections only** — does NOT gate the point path |
| `refine_iterations` | INT 0–5, def 2 | SAM decoder passes; 0 = raw detector masks |
| `individual_masks` | BOOL false | per-object masks vs union |
| `conditioning` *(opt)* | CONDITIONING | from `CLIPTextEncode` = the TEXT prompt |
| `bboxes` *(opt)* | BOUNDING_BOX | box prompt |
| `positive_coords` *(opt)* | STRING | `[{"x":100,"y":200},…]` pixel coords |
| `negative_coords` *(opt)* | STRING | same, exclusions |

Outputs `MASK` + `BOUNDING_BOX`. **One node covers all three prompt modes** — text, click, box.

Weight (verified live on the HF API):

```
Comfy-Org/sam3.1  →  checkpoints/sam3.1_multiplex_fp16.safetensors
1,745,546,848 bytes
sha256 9ba99c92703c2e8b4f47de2d34a539bb8e18923049e238b780d70dbe6368eb03
gated: false        license: SAM License (repo LICENSE, 7352 B)
```

Not gated → **no MPI-357 licence gate needed**. SAM License (2025-11-19) grants distribute/modify
royalty-free, no non-commercial clause; condition = the Agreement travels with the weights. R2-hostable.

### Traps found
- `positive_coords` / `negative_coords` are `forceInput: true`. That is a **frontend** hint —
  the API accepts a literal string — but our injector writes widget values, so the safe pattern is
  an `MpiString` node titled `Input_Points_Pos` / `Input_Points_Neg` feeding the socket. Same shape
  as every other injectable control in the repo.
- The confidence dial the user wants does **not** exist on SAM3's point path (`threshold` is
  text-only). On the Impact path it does. Worth knowing before promising a slider.
- `bboxes` would let the existing box gizmo (`MpiBoxMask`, Head Swap `Input_Box`) drive masking for free.
- Not on the bench yet — `CheckpointLoaderSimple` enum shows only `ILL_Anime` / `SDXL_NSFW`.
  Live testing needs the download first.

---

## Not installed — community packs (each = a new custom-node dependency)

| Pack | Brings | Verdict |
|---|---|---|
| **ComfyUI-RMBG** (1038lab) | RMBG-2.0, BEN2, BiRefNet, SDMatte, SAM/SAM2/SAM3, GroundingDINO in one pack | The popular one. **BiRefNet** = best-in-class subject cutout / hair-level alpha. Real candidate for a better `removeBackground`, separate from this card |
| ComfyUI-segment-anything-2 (Kijai) | SAM2 + points | Superseded by core SAM3 |
| ComfyUI-Easy-Sam3 / TBG-SAM3 / comfyui_sam3 | SAM3 + **interactive point-collector canvas** | The canvas is the selling point and it is worthless to us — our users never see the ComfyUI graph. Core `SAM3_Detect` gives the same segmentation with no pack |
| Florence2 | phrase grounding → boxes → SAM refine | The 2025 combo. SAM3 does it in one node now |

Also confirmed present but not useful here: `ImpactSAM2VideoDetectorSEGS`, `SAM3_VideoTrack` /
`SAM3_TrackToMask` (video mask propagation — a future video-masking card, not this one).

---

## User bench session 2026-07-28 — decisions + the scatter problem

User opened the probe graph in ComfyUI and drove it. Outcomes:

1. **`threshold` IS the old Preview Bridge "confidence"** — confirmed by the user from memory.
2. **Nudging it does nothing** and this is expected, not a bug. It re-selects only when a SAM
   candidate's *score* falls between the old and new value, so `0.50 -> 0.60` is usually identical.
   Sweep it, don't nudge it. This must be said in the app's info box or users will think it's broken.
3. **`dilation` stays 0.** User verified it grows into unwanted areas — it is a blind dilate of
   whatever SAM returned, scatter included. The eraser brush is the better answer.
4. **BROAD branch dropped.** Tight is enough. Multiple dots segment multiple parts in one run
   (shirt + hair proven). Shirt-then-pants = two runs, accepted as the shape of the feature.
5. **No slider remapping / MpiNormalizeValue rig.** User retracted it — an info box plus a raw
   threshold control is enough, users learn tools fast.
6. **THE REAL DEFECT: scatter.** Masks come back with loose specks and pinholes. This is not
   cosmetic — the **detailer masks each zone individually**, so a stray speck buys a wasted detail
   pass. User confirms the same failure on the existing detect-person path, so fixing it here fixes
   both. This is now the main open problem of Phase A.

### CORRECTION — N dots do NOT give N objects

An earlier note in this brief claimed multiple dots segment multiple parts in one run. **That is
wrong.** In the `mask-points` branch every point goes into **one** `sam_obj.predict(...)` call, so
SAM returns a **single region consistent with all the points**. Verified in source and confirmed on
the bench:

- one dot on the crop top → the crop top alone ✅
- top dot + pants dot → **the whole body** (SAM's best single region covering both)
- shirt dot + hair dot → the whole person

`SAMDetectorSegmented` has the byte-identical `mask-points` branch, so it is not an escape hatch.
Only the `else` branch (`center-1` etc.) loops per-seg — but it passes each dot's own bbox as SAM's
box constraint, so a 16px dot boxes SAM into 16px unless `bbox_expansion` is cranked, which
reintroduces exactly the crop ceiling `mask-points` was chosen to avoid.

**So Phase A is genuinely one part per run**, as the user predicted. That is fine: Add/Subtract
against the accumulated canvas mask builds up multi-part selections across runs, and negative dots
still refine within a run. Multi-object-per-run stays an unbuilt experiment (`center-1` +
`SAMDetectorSegmented` + a tuned `bbox_expansion`), not a Phase A requirement.

### Add / Subtract is app-side, not graph-side

`MaskManager` already keeps `manualCanvas` (paint), `subtractCanvas` (erase) and derives
`maskCanvas = (manual ∪ ⋃autoPickMasks) AND NOT subtract`. So a returned SAM mask is **Add** =
draw into `manualCanvas`, **Subtract** = draw into `subtractCanvas`. No `AddMask`/`SubtractMask`
nodes, no extra round-trip per boolean, undo preserved, and it composes with the existing brush.

### Scatter fix — CONFIRMED ON THE BENCH

User ran it: **the open+close pair closes the holes.** Visible on the crop-top case — RAW carried
pink specks through the hair falling over the shoulder, CLEANED came back solid. `4/4` is the
shipping default; expose it only if it proves too gentle in real use.

### Scatter fix under test — morphological open + close, 2 nodes, no new weights

```
SAM mask -> GrowMaskWithBlur(expand=-4)                  # erode: detached specks < 8px vanish
         -> GrowMaskWithBlur(expand=+4, fill_holes=true) # dilate back + close pinholes
```

The pair must stay **equal and opposite** or the mask grows or shrinks overall. Suggested sweep:
`4/4` gentle (dust only) · `6/6` moderate · `10/10` aggressive (also eats fingers, straps, thin hair).
If cleanup eats something needed, that is this approach's ceiling — lower the pair, never raise `dilation`.

Probe graph v2 rebuilt to this shape: one tight `SAMDetectorCombined`, RAW vs CLEANED previews
side by side. Converts clean and executes on the live engine.

Rejected alternative: `SeparateMasks` (KJ) filters connected components by size, which is the more
literal despeckle, but it emits a mask **batch** and needs `ImpactFlattenMask` to recombine — more
nodes, and an all-scatter input can yield an empty mask. Open+close is deterministic and cheaper.

## Recommendation — two increments, not one

**A. Points + confidence on the weight we already ship** (no download, no licence, no dep entry).
New `points` mode in the mask tool: left-click = positive dot, right-click = negative, a
confidence slider bound to `SAMDetectorCombined.threshold`, existing **Detect** button runs it.
Graph branch: `MaskToSEGS → SAMDetectorCombined(mask-points)`. Ships the exact remembered feature.

**B. SAM3 behind the same UI** (follow-up): adds the TEXT path ("headphones"), true negative
points, box prompts, and better edges. Costs 1.75GB + a dep entry + the LICENSE file beside the weight.

A proves the UI cheaply; B swaps the segmenter behind it without touching the UI again.

Open question for the user: does the old YOLO path stay as a fast Face/Hand/Person shortcut, or
get removed once points land?

---

## Plan Drift — 2026-07-28, user direction after Phase A verification

### Landed in this session (colour defect close-out)

- **Detection colour split.** `MaskManager` gained `autoCanvas` — a DISPLAY-ONLY twin of
  `maskCanvas` holding `(⋃autoPickMasks[selected]) AND NOT subtract`, rebuilt in
  `_recompositeAuto()` and skipped entirely when nothing is selected (the brush hot path pays
  nothing). `MpiCanvas._renderOverlay()` draws it as a second pass tinted `--accent-ok` green on
  top of the white union, through a shared `_recolorMaskLayer()` helper that also absorbed the
  old invert branch's scratch buffer. **Export is untouched** — `getURL()` /
  `getMaskDataURL()` still flatten the single unioned `maskCanvas`.
- **Add / Subtract now show in BOTH sources.** The `commitRow.hidden = !_pointsMode` gate is
  gone; `el.bakeAutoPicks()` was already mode-agnostic (it clears thumbs, the pick store and the
  points in one go), so a YOLO detection now renders green and waits for Add or Subtract exactly
  like a points run.

### Agreed direction — the mask tool becomes a TOOL FAMILY (own card, not this one)

The user wants the mask surface split into real sibling tools rather than one panel with a
source radio:

| Tool | Source | Status |
|---|---|---|
| **Points** | `SAMDetectorCombined(mask-points)` on the shipped `sam_vit_b` weight | Phase A, shipped |
| **Detect** | `UltralyticsDetectorProvider` — Face / Hair / Hand / Person | shipped, predates this card |
| **Shapes** | rectangle / triangle / ellipse gizmo, Add or Subtract | **MPI-368** |
| **Text** | `SAM3_Detect` + `CLIPTextEncode` — type what to mask, press Detect | **Phase B of this card** |

**Answered for the user:** yes, text-prompt masking is on THIS card — it is Phase B (the 1.75GB
`sam3.1_multiplex_fp16` weight, licence shippable, acceptance criteria already written above).
It becomes the fourth tool when Phase B lands; it is not a fifth thing to scope.

Every tool in the family carries the SAME bottom strip — brush, eraser, invert, clear, opacity.
That strip must be extracted into one shared component rather than copy-pasted per tool, so it is
updated in one place. That extraction is a component refactor and belongs on its own card.
