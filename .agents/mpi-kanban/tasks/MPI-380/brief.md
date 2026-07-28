# MPI-380 Brief — SAM3 as the masking foundation

Brainstormed 2026-07-29. Every number below was measured live against our own
shipped engine (`engine/ComfyUI_windows_portable`, ComfyUI 0.28.0 on :8188) on
one test image, `Man_talking_to_woman_park_202606241940.jpeg`, 768x1376, two
people in a park. Harness scripts are throwaway; the numbers are not.

---

## Why this exists

MPI-361 Phase B closed SAM3 as a **finder** — correctly: it cannot enumerate
objects, so it can never drive hover-to-discover. That verdict stands. But the
closure's salvage note ("useful shape if SAM3 is ever revisited") was right:
SAM3 is excellent as a **refiner** and as an **open-vocabulary named detector**,
and both jobs are ones we currently do worse.

The user's hybrid design for MPI-379 is: a fast detector enumerates regions
(blobby, drives hover), and clicking a region refines it into a real mask. This
card owns the refiner half.

---

## Measured

| Path | Result | Wall |
|---|---|---|
| YOLO `segm/yolov8n-seg.pt` (enumerate) | 3 people, blobby | **0.5s** |
| SAM3 text `person` | **1** mask — silent cap | 5.0s cold |
| SAM3 text `person:10` | **10** people, scores 0.97 to 0.87 | 6.7s |
| SAM3 text `person:5` | 5 | 4.1s |
| SAM3 text `person:5, tree:5` | 8 | 6.3s |
| SAM3 text 4 categories | 13 | 10.5s |
| SAM3 text `face:5` / `hand:5` | 5 each | 3.6s |
| SAM3 **box** (fed YOLO's own box) | crisp | **1.7s** |
| SAM 1 `vit_b` box (what ships today) | crisp | 2.1 to 3.1s |
| SAM3 **points** (one dot) | whole person, crisp | **1.1s** |

Quality, eyeballed on identical input: SAM3 box refine resolved the beard and
excluded a backpack strap that SAM 1 swallowed into the body. YOLO's own segm
masks are visibly blobby — face profile collapses to a lump, hand becomes a
mitten, edges stair-step — fine for a transient hover highlight, not for a
committed mask.

Recall: SAM3 text found **10** people where YOLO found **3**.

---

## Traps found (all cost real debugging time)

1. **`max_detections` defaults to 1.** The text field is parsed by
   `_parse_prompts` in `comfy/text_encoders/sam3_clip.py`: comma splits
   categories, `name:N` sets that category's cap. A plain `"person"` silently
   returns ONE detection. Any injection we build must always emit `:N`.
2. **Text and box prompts are mutually exclusive.** In `SAM3_Detect.execute`
   the box branch is gated `if b_boxes is not None and not has_text`. With text
   present, boxes become a constraint on the detector instead of a
   segment-this-box instruction.
3. **SAM3 works at a fixed 1008x1008 internally**, then interpolates masks back
   to full size. SAM 1 works on a 1.8x crop around each box, so on very large
   images SAM 1 may still resolve small objects better. Untested at 4K — test
   before assuming SAM3 wins everywhere.
4. **The point path ignores `threshold` entirely** — only `refine_iterations`
   applies. The 3-candidate snapping that makes our Scope dial useless below 80
   simply does not exist there.
5. **Impact Pack decides bbox vs segm by FOLDER, not filename.** A `-seg` model
   in `ultralytics/bbox/` returns `NO_SEGM_DETECTOR` and crashes with
   `'NO_SEGM_DETECTOR' object has no attribute 'detect'`. It must live in
   `ultralytics/segm/`. Conversely a bbox-only model placed in `segm/` crashes
   with `'NoneType' object has no attribute 'data'`.
6. **`ImpactSEGSLabelFilter.preset` does NOTHING server-side.** Only the
   `labels` string is read; `preset` is a frontend convenience that types into
   it. Verified: `preset='person', labels=''` filters to zero.

---

## Licence — cleared

SAM License (Meta), fetched from `Comfy-Org/sam3.1`. Grep for commercial,
non-commercial, monthly active, revenue, research only: **zero hits**. Grant is
non-exclusive, worldwide, royalty-free. Obligations: ship a copy of the licence
when redistributing, no reverse-engineering, comply with trade controls, no
military or weapons use. Nothing blocks Vision.

Weight: `Comfy-Org/sam3.1` -> `checkpoints/sam3.1_multiplex_fp16.safetensors`,
**1745546848 bytes**. Loads through `CheckpointLoaderSimple` (MODEL + its own
CLIP via `comfy/text_encoders/sam3_clip.py`). It is a core ComfyUI 0.28 model —
no custom node, no ComfyUI bump.

---

## What SAM3 replaces, and what it does not

| Job | Verdict |
|---|---|
| Refiner (SAM 1 `vit_b`) | REPLACES — faster and crisper |
| Points tool plumbing | REPLACES — and simplifies hard, see below |
| Named detection (face / hand / person) | Could replace: open vocabulary beats a fixed 4-model list. But 3.6s vs 0.5s |
| Enumerate everything for hover | **CANNOT.** 4 categories already costs 10.5s; COCO YOLO does 80 classes in 0.5s flat |

**The points simplification is the quiet win.** Phase A ships points as a
rendered white-on-black dot image through `ImageToMask` -> `MaskToSEGS` ->
`SAMDetectorCombined`, with polarity carried by dot RADIUS (r=8 positive, r=4
negative) straddling the `mask_hint_use_negative='Small'` 10px cliff, plus a
threshold dial that snaps between 3 SAM candidates. SAM3 takes
`positive_coords` / `negative_coords` as plain JSON pixel coords
(`[{"x":int,"y":int}]`). That deletes the radius hack, the snapping dial, and
the staged points-mask PNG — which on a remote Pod is one less media upload per
run.

That JSON is also exactly the KJNodes `PointsEditor` format (the node's own
tooltip says so), which is what the user's Wan Animate graph already emits.

---

## Video — why this is foundation work, not a one-off

`SAM3_VideoTrack(images, model, detection_threshold, max_objects,
detect_interval, initial_mask, conditioning) -> track_data`, then
`SAM3_TrackToMask(track_data, object_indices) -> masks`.

That covers natively what one existing Wan Animate graph does with SeC-4B plus
a Points Editor plus ONNX pose. That stack is **one option the user happened to
be running, not a target to match** — we are free to pick whatever suits us,
and SAM3 is attractive precisely because one weight would serve image points,
image boxes, image text AND video tracking instead of four separate systems.
An image mask made in our UI is a MASK, so it can
seed `initial_mask` and track through a video. Bernini (video editor) will need
masks; `MpiBboxToMask` already sits at the box-to-mask seam and SAM3's text and
box paths both RETURN `BOUNDING_BOX` dicts. Build this image-side work so the
video path is a wiring job later, not a rewrite.

---

## Downstream payoff spotted during testing — Head Swap

SAM3 detects **`head`** from plain text, cleanly, including heads in a blurred
background crowd. No detector we ship has a head class: `face_yolov8n` gives a
face box (not the skull/hair silhouette) and `hair_yolov8n-seg_60` gives hair
alone. Head Swap (MPI-259 / MPI-306) currently has to approximate a head from
those. Open vocabulary means `head:N` is just a string — no new weight, no new
detector entry.

And for that use case the wanted output is often a **BOX, not an outline** — a
square region around the head to inpaint with a head LoRA. That is a first-class
deliverable, not just a hover preview: `MpiMaskSquareBbox` (which takes padding)
and `MpiBboxToMask` already sit at exactly that seam, and SAM3's text path
RETURNS `BOUNDING_BOX` dicts with scores. So `head:N` to a square mask is a
short wire, no new node.

Note this is a second, independent reason to keep boxes as a real output of the
mask family rather than treating them as a lesser mode of segmentation — see
the box-not-blob candidate on MPI-379.

Not in this card's scope. Flagged so whoever next touches Head Swap knows the
capability arrived for free.

---

## Scope of this card

1. Upload `sam3.1_multiplex_fp16.safetensors` to R2, declare it in
   `js/data/modelConstants/`, record sha256 and byte size.
2. Swap the mask refiner from SAM 1 to SAM3 on the box path.
3. Rewrite the points path onto `positive_coords` / `negative_coords`; retire
   the r=8 / r=4 radius hack and the points-mask image staging.
4. Decide the fate of SAM 1 `vit_b` — grep every consumer before removing it;
   it is loaded by the auto-mask graph and may have other users.

NOT in this card: hover-to-select, COCO YOLO enumeration, the 4-way mask tool
split. Those are MPI-379 and its siblings.

---

## Sequencing note — do not do the Scope remap first

The brainstorm also agreed to remap the points "Scope" dial so 0-100 maps onto
the only useful range, 80-100 (below 80 does nothing, because SAM 1 snaps
between 3 candidates). **If SAM3 lands, that dial disappears entirely** — the
SAM3 point path has no threshold. Doing the remap before this card is wasted
work. Sequence SAM3 first, or accept the remap as throwaway.

---

## Open question

Does SAM3 beat SAM 1 at 4K? SAM3 is capped at 1008x1008 internally while SAM 1
crops 1.8x around each box. Every measurement here is on a 768x1376 image. Test
a large image before declaring SAM 1 retired.
