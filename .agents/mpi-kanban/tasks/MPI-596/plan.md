# Object Stamp Flow — extract an object from one image, place it into another

Design settled in [brief.md](brief.md). **Run `/mpi-add-flow`** — it enforces
`docs/playbooks/add-flow/`, and this plan does not restate it. Graphics are a separate pass
(`/mpi-flow-graphics`, `06-preview-image.md`).

## Current State

Project mode: `scalable-foundation`.

The UI half is **already built**. Verified at plan time:

| Assumption | Verified |
|---|---|
| The placement step needs no new step kind | `kind: 'box'` is registered (`stepKinds.js`), and `head-swap` already binds two of them to graph params (`flowsRegistry.js:283-312`) |
| The naming step needs no new step kind | `kind: 'fields'` (FRAME_KINDS) is the media-less step — `character-sheet` uses it (`flowsRegistry.js:635-641`) |
| The box gizmo is documented and reusable | `docs/playbooks/add-flow/ui/box-gizmo.md` — do NOT author new drag/resize behaviour |
| SAM3 is available to a graph | `SAM3_Detect` is already a `class_type` in shipped workflows; `sam3-multiplex` installs with the engine |
| A box reaches the graph as a mask at full frame size | `Mpi Box Mask` — "white rect on black at the box position, full frame size" (`box-gizmo.md:103`) — this is the inpaint mask for the detail pass |
| A box unpacks to integers | `MpiFromBox` → `(width, height, x, y)` INTs (`ComfyUi-MpiNodes/img.py:564-581`) |

**So the app-side work is a descriptor plus a workflow.** No new component, no new step kind,
no mid-flow dispatch. The risk is entirely in the graph.

### The one fork, decided here

**Aspect-preserving fit is not expressible in the current node set.** `MpiFromBox` gives the
box's `w/h/x/y` and core `ImageCompositeMasked` takes `x/y`, but scaling the cutout to *fit
inside* the box without distorting it needs `scale = min(box_w/src_w, box_h/src_h)` — a
computation core has no clean node for. Three ways, in preference order:

1. **Author one node — `MpiFitInBox`** (image + MPI_BOX in; scaled image + placement x/y out).
   One node, one file, in the pack that already owns `MpiBox` / `MpiBoxCrop` / `MpiBoxMask`, so
   it sits exactly where a reader would look for it. Ships via **`/mpi-nodes-sync`**: committed,
   pushed, and **pinned in `dev_configs/node_lock.json`** — a node change is not shipped until
   it is pinned.
2. Chain core math nodes if the bench shows a clean expression exists. Check before writing
   Python; a graph that needs five nodes to do one multiplication is worse than the node.
3. **Do NOT stretch the cutout to the box.** Rejected by design — a person stamped into a
   non-matching box arrives squashed, and the box is a *bounding* box, not a target rectangle.

**This changes the card's size.** If (1) is taken, MPI-596 is *descriptor + workflow + one node
+ a pin bump*, not *descriptor + workflow*. Decide it on the bench in Phase 1 and record the
answer in Plan Drift before building anything downstream.

### Unresolved by design — measure, do not guess

- **Denoise range for the detail pass.** Enough to blend the seam, little enough to keep the
  object. Measure on the bench; do not ship a guessed default.
- **What the box step actually renders at.** Step 0 loads media at thumbnail size, which is why
  `kind: 'preview'` exists. If boxing a placement on a thumbnail is too coarse, add a `preview`
  step — but check what `MpiStepBox` renders before adding UI.
- **What happens when SAM3 finds nothing.** The named object may not be in the source image.
  Returning the untouched target with no explanation is the bad outcome; the flow must say so.
  Mind the `name:N` trap (`docs/masking-sam3.md`).

## Implementation

- [ ] **Author and prove the graph on the bench FIRST.** SAM3 text-segment the named object out
      of image2, fit the cutout into the box on image1, Krea2 detail pass over the `Mpi Box
      Mask` region at the chosen denoise. Settle the aspect-fit fork above and record it.
      **Verify:** a real run on the bench produces a correctly-scaled, blended stamp — and a
      deliberate miss (an object that is not in the source) fails legibly.
- [ ] **Ship the node, if the fork took option 1.** Via `/mpi-nodes-sync`: the sibling repo's
      own `new-node.md` procedure, then commit, push, and pin in `dev_configs/node_lock.json`.
      **Verify:** the pinned commit installs and the node appears in `/object_info` on a fresh
      engine gate — read it back, do not assume the import succeeded.
- [ ] **Wire the flow.** `FlowDef` in `flowsRegistry.js` (two image inputs; a `fields` step
      naming the object; a `box` step on `image1` bound via `param`; a denoise slider on the run
      slide) plus the op in its 4 files, per `01-descriptor-and-ops.md` and `02-media-io.md`.
      Decide `result: { compare: 'image1' }` — the flow improves media the user supplied, which
      is the stated trigger (MPI-585). **Verify:** the inject test and `node --check` from
      `05-verify.md`.
- [ ] **Live-run it in the app** end to end, including reuse. **Verify:** `05-verify.md`'s
      Definition of Done — a live run and a reuse round trip, not a validation pass.

## Completed

- [ ] Nothing yet.

## Remaining Work

- All four implementation items above.
- Graphics (tile + hero) — a separate `/mpi-flow-graphics` pass after the flow runs.

## Verification

**Verify mode:** user-ux

The output is a picture whose whole point is that the stamp does not read as a sticker. The
mechanical half self-verifies (inject test, `node --check`, `/object_info` for the node, a live
run completing), but the blend quality is the user's call.

Bench work goes to the standalone ComfyUI on **port 8188**; the app engine is **48188**. Drive
the app with `npm run app:isolated`, never `:3000`.

## Preservation Notes

- Add `docs/playbooks/add-flow/existing-flows/object-stamp.md` — one file per flow is the
  convention, and it is where the denoise measurement and the aspect-fit decision belong.
- If a new node ships, the pack's own `changelog.md` and the app's `node_lock.json` pin both
  move. A node change that is committed but not pinned has not shipped.
- Sibling card **MPI-454** (the Place tool) is the same capability on the workspace surface.
  Deliberate duplication (`project_flows_are_the_beginner_surface`) — shared control
  vocabulary, **zero shared code**. Do not converge them, and do not make one wait for the
  other: they share no files.
- Flows are dev-gated until there are enough of them; this one does not change that.
