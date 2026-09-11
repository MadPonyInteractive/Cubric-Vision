# MPI-715 — plan

Opened 2026-09-10, out of the MPI-711 Bernini session. The card `description` carries the
WHY and the decisions already taken; this file is the running plan.

**Verify mode:** user-ux

It is a gizmo. Verification is the user's eyes on a real clip with a real bad frame — the
measured case is a person mask whose arm drops out on a few frames.

## Current State

Designed with the user 2026-09-10, nothing built. Every part except one already exists in
the repo, verified by reading it this session:

| Piece | Where it already is |
|---|---|
| SAM3 over a frame batch | bench `flow_bernini_video_edit.json` node 979, `image ← MpiListRange` |
| Per-instance detect ("two faces") | `img_auto_mask.json` node 1663, `individual_masks: true` |
| Mask-over-frame overlay look | `MpiMaskPreview` (MPI-713), `invert_mask` on, `alpha 0.70` |
| Hole fill / bbox cleanup | `MpiMaskFillHoles` (MPI-714), `MpiMaskSquareBbox` |
| Brush + layers + undo | `MpiStepCutout` mounts `MaskManager` + `UndoStack` + `brushDab` whole |
| Video surface in a step | `MpiStepPreview` |
| Frame N as a canvas, frame-accurate | `surface.captureFrameCanvas(idx)` — `MpiVideoViewer.js:424` |
| Grow / shrink / edge band, client-side | `MaskManager` line 589 (MPI-382) |
| The reusable-step mechanism | `STEP_KINDS` in `stepKinds.js` — and it already reserves the name `mask` |

**The one thing that does not exist is transport.** `STEP_MEDIA` adapters return ONE
composed image per role (`stepKinds.js:254`), and `Input_Mask` is `MpiString` — a single
path — in 14 IMAGE workflows and ZERO video ones. Both ends are singular.

Next action: Phase 1.

## Phase 1 — The mask clip, end to end, no gizmo

**Verify:** a masked video generation runs from a mask clip produced outside the UI, and the
stitched result matches what the bench graph produces from its in-graph SAM3 mask.

Prove the transport before building UI on top of it. Ship the mask as a greyscale CLIP:
staged like any other video media, loaded by the same video loader `Input_Video` uses,
`ImageToMask` after. `Input_Mask` stays `MpiString`; only what the path points at changes.

- **LOSSLESS ONLY** — FFV1 or a PNG sequence. h264 softens mask edges into grey and a mask
  wants hard edges. This is the trap most likely to be found late and misread as a model
  problem.
- One video workflow gains a mask input. Pick the Bernini graph, since MPI-711 is already
  driving it.

## Phase 2 — `MpiStepMask`, the gizmo

**Verify:** the user's eyes. Play a clip, see the mask over it, scrub, adjust, and fix a
frame whose arm dropped out.

One component + one line in `STEP_KINDS`. Copy `MpiStepCutout`'s engine mount and
`MpiStepPreview`'s video surface.

- Play the clip with the mask overlaid; scrub frame by frame.
- Clip-wide controls: grow / shrink (already client-side), fill holes, re-detect with a new
  vocabulary.
- Per-frame brush. **SPARSE** — `Map<frameIndex, overrideCanvas>`, only touched frames
  allocate. Paint on the canvas `captureFrameCanvas(idx)` hands back; the override replaces
  that frame in the emitted clip.
- Undo comes with the `MaskManager` + `UndoStack` mount. A paint layer with no `UndoStack`
  entry is a silent hole in Ctrl+Z (`CLAUDE.md` § Critical Rules Snapshot).

## Phase 3 — Prove reuse

**Verify:** a SECOND flow declares `kind: 'mask'` and gets the whole gizmo with no frame
change and no per-flow layout code.

The registry's contract claims this. One line in a second Flow is what tests it.

## Remaining Work

- [ ] Phase 1 — mask clip transport, lossless, one video workflow
- [ ] Phase 2 — `MpiStepMask` in `STEP_KINDS`
- [ ] Phase 3 — a second Flow proves the reuse

## Decisions already taken (do not re-open)

- **Mask ships as a clip, not a sequence API.** Reuses media staging and the existing video
  loader; `Input_Mask` stays `MpiString`.
- **Fill holes is not a re-dispatch toggle.** MPI-421 deleted the pick input because a chip
  toggle re-dispatched the whole graph. Either always-on in the graph, or client-side beside
  grow/shrink — not a button that re-runs detect.
- **Not multi-stage.** `_ms` (`.claude/rules/comfy_injection_multistage.md`) is a sampling
  preview→resume mechanism. Same word, different problem. Confirmed with the user.
- **Per-instance detect uses `individual_masks: true`.** The bench graph sets it FALSE
  ("head + hat, unioned") deliberately for Bernini's crop. Do not carry the bench setting
  into the flow.

## Plan Drift

- 2026-09-10: card opened. Design settled in conversation during the MPI-711 session; no
  code written.
