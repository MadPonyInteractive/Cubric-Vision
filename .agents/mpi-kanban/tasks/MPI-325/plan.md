# MPI-325 Plan — the box may leave the frame

**Verify mode:** user-ux — the gizmo is a hand-feel surface, and only a real run proves the
reference head comes back square.

## Current State

Card opened 2026-07-21 from MPI-324's first-run fail, never picked up, no plan until now. The
symptom on the card: a square box big enough to hold an edge-adjacent head also swallows the
neighbour, because the square is forced to stay INSIDE the image.

**The card asks for one fix and the graph needs one and a half.** Traced 2026-08-17 — the two
boxes reach different consumers and only one of them loses anything:

| | `box1` (target) | `box2` (reference) |
|---|---|---|
| Consumer | `MpiBoxMask` #91 → `InpaintCropImproved` #21 | `MpiBoxCrop` #89 → `image2` on `TextEncodeQwenImageEditPlus` #13/#14 |
| Output size | always full-frame | box ∩ image |
| Re-squared downstream? | **YES** — see below | **NO**, nothing does |
| Needs a pad? | no | **yes** |

`InpaintCropImproved.crop_magic_im` (`custom_nodes/comfyui-inpaint-cropandstitch/
inpaint_cropandstitch.py:395`) grows the context area to the target aspect ratio BEFORE
resizing — `new_w = int(h * target_aspect_ratio)` — with `output_target_width/height` both 1024.
So a clipped box1 mask is re-squared by node 21 itself and never hits a distorting resize. The
mask only marks the region; node 21 owns context, padding and the square resize.

`MpiBoxCrop` has no such mercy: `clamp_box` intersects and returns
`image[:, y:y+h, x:x+w, :]` (`ComfyUi-MpiNodes/img.py:599`). A 716-square overhanging by 256px
yields a 460x716 reference head handed straight to the text encoder. That is the distortion.

**Second asymmetry, and it rules out the card's own wording.** The card says "auto-pad the
image on that side". For box2 that is right — the crop is an intermediate, never delivered.
For box1 it is WRONG: padding image1 grows the delivered output canvas, so the user gets their
picture back with a strip on it. box1 must never be fixed by padding the source.

**Blocker found while tracing:** `MpiBox`'s `x`/`y` widgets are declared `"min": 0`
(`img.py:538`), so a negative origin cannot reach the graph at all. Relaxing the gizmo without
this is a no-op at the node boundary.

**2026-08-17 — all five phases SHIPPED, card is `validating`.** The box leaves the frame, the
reference crop pads back to square, and the default path is provably unchanged (`npm test`
625/625, eslint clean, injection rules conform; evidence in `validation.md`).

The live probe is the one worth remembering: mounting the REAL `MpiStepBox` on the isolated
app and dragging with real pointer events reported `x: -125` with overflow on and `x: 0` with
it off, from the same drag. `-125` is exactly `-w/2`, so the half-its-own-size bound held to
the pixel.

**Fabio verified the feel in the real app 2026-08-17** — reference box dragged off the
top-right, drawn into the stage margin with its handles reachable, readout held at `642 x 642`.
The `user-ux` verify mode is closed; the card is validating on the two blockers below only.

**Two things are NOT done, and neither is code:**

1. `ComfyUi-MpiNodes` is edited but NOT pushed and NOT pinned in `dev_configs/node_lock.json`.
   Push is user-authorized. This matters more than it reads: the graph now sends `pad: true`
   to `MpiBoxCrop`, ComfyUI silently DROPS an input a node does not declare, so on an
   unpinned engine the gizmo lets a user drag off-frame and hands the model a squashed
   reference head with no error anywhere. Pin before this reaches a user.
2. One real Head Swap generation through an overhanging box. Fabio ruled out GPU runs for the
   session; the checks either side of the graph boundary both pass, but not as one pipeline.

Next action: commit both repos by pathspec, then ask Fabio for the push + pin.

## Approach

One UI change shared by both slots, one consumer-side pad, one widget-range widening.

**Declared, not hardcoded.** The step opts in (`overflow: 'allow'`), so this stays data a
third-party manifest can carry — MPI-572's law, and the reason it is not a Head-Swap `if`.

`COORDS PASS THROUGH UNCONVERTED` (box-gizmo.md § Coord contract) still holds. The box origin
simply gains a negative range; no arithmetic is added on the way to the graph.

## Phases

### Phase 1: `allowOverflow` on cropTool
`createCropTool({ allowOverflow = false })`. Relax the POSITION clamps only — `clamp01`'s
x/y, the body-drag clamp (`cropTool.js:251`), the free-mode origin clamp (`:290`) and the
ratio-locked branch. **Size clamps stay**: the card wants a tight square near an edge, not a
box bigger than the picture. Bound the drag so the rect must keep a minimum overlap with the
image — a box dragged entirely into nowhere is not a selection.
**Sweep:** two consumers only — `MpiStepBox` (opting in) and `MpiVideoViewer.js:175` (must be
untouched; it never passes the flag, and a video crop that leaves the frame is meaningless).
**Verify:** `MpiVideoViewer`'s rect is byte-identical for the same drags; default-off proven
by unit test.

### Phase 2: `MpiStepBox` honours `step.overflow`
Pass `allowOverflow: step.overflow === 'allow'` into cropTool, and make `_normToSourcePx` stop
clamping the EDGES under that flag so a negative origin and the full square size survive to
`getValue()`. `_sourcePxToNorm` already round-trips negatives with no change.
**Verify:** unit test — a box dragged past the left edge reports negative `x` with `w === h`.

### Phase 3: the node half (`c:\AI\Mpi\ComfyUi-MpiNodes\img.py`)
Follows the sibling repo's own `.claude/commands/update-node.md` (append at the bottom, new
params get defaults, README + changelog, no new version header).
1. `MpiBox` — widen `x`/`y` `min` below zero. Range widening only; saved workflows keep their
   values and every existing graph is byte-identical.
2. `MpiBoxCrop` — new **optional** `pad` BOOLEAN, `default False`, appended last. On, the
   intersection is padded back out to the requested box with edge replication, so the crop is
   the size that was asked for. Off, byte-identical to today.
**Verify:** a box overhanging by 256px on a 1792-wide source returns 716x716 with `pad` on and
460x716 with it off.

### Phase 4: wire it
`flowsRegistry.js` head-swap steps gain `overflow: 'allow'`; `flow_head_swap.json` node 89
gains `pad: true` (node 91 does NOT — the mask must stay clipped, node 21 re-squares it);
`headSwapInjector._clampBox` stops forcing the origin to >= 0 for an overflow box while
keeping the min-size guard.
**Verify:** `_collectInputs` emits a negative-origin box; `npm test` green.

### Phase 5: doc drift
`docs/playbooks/add-flow/ui/box-gizmo.md` § "Out of bounds CLAMPS" currently states the
opposite of what will be true, and its § Open says "nothing outstanding on the coord contract".
Rewrite both: the box MAY leave the frame when the step declares it, a MASK consumer wants the
clip, a CROP consumer wants `pad`.

## Verification

**Verify mode:** user-ux.

1. `npm test` + `npx eslint js/`
2. `npm run app:isolated` (own port, own profile) → Head Swap, drag both boxes off an edge.
3. Generate. The reference head comes back square and un-squashed; the target's mask clips
   flush to the edge with no padded strip on the delivered image.
4. `MpiVideoViewer` crop still refuses to leave the frame.

## Out of scope

- The BLENDED head-swap result (MPI-572's validation). Qwen leaking the source through a
  correct mask. Fabio owns the workflow revisit and has tests still to run — **deliberately
  not carded**, do not open one.
- Pushing + pinning `ComfyUi-MpiNodes`. A node change ships only when committed → pushed →
  pinned in `dev_configs/node_lock.json`; the dev machine symlinks the pack, so local work
  verifies with no pin. Push is user-authorized — flag it, do not do it.

## Plan Drift

- 2026-08-17: plan written at pickup, 13 months after the card. Scope changed twice while
  tracing: the card's "auto-pad the image" applies to the REFERENCE crop only (padding the
  target would grow the delivered output), and `MpiBox`'s `min: 0` on x/y turned out to block
  the whole thing at the node boundary — neither was on the card.
