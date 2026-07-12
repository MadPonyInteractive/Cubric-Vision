# Wrong preview painted: LTX multi-stage preview displayed the previous (WAN) preview's video

## Current State

Project mode: scalable-foundation. **This is the ORIGINAL symptom that opened the
2026-07-08 session** — the session then followed a downstream reuse-404 (MPI-225)
and never came back to the actual first report. Carding it now so it is not lost.

Investigation-first. No fix without a confirmed repro + root cause.

## The bug (exact repro, user-reported, Chroma project)

1. WAN multi-stage gen with **"Preview Initial Stage"** ON → preview card shown,
   video previewable OK.
2. **Continue this preview** → final WAN video displayed correctly.
3. Repeat for **LTX** multi-stage → when the LTX preview FINISHED, the card
   displayed **the WAN preview's video instead of the LTX preview** (wrong-item
   paint).
4. **Continue** → finished with the correct LTX video.

So: the mis-paint is **transient**, occurs at the PREVIEW-DISPLAY stage of the
SECOND back-to-back multi-stage gen, and self-corrects on Finish. The wrong video
shown is the PRIOR multi-stage preview's video.

(Step 5 in the user's numbered report. Steps 7-9 — delete reused-from video →
cue → error — are the MPI-225 reuse-404, a DIFFERENT bug, already handled
gracefully + rooted by MPI-227. Do not conflate.)

## Hypotheses to test (do NOT assume)

- **Preview player/element latch:** the preview card's video element or blob/URL
  from the first multi-stage preview is reused/cached when the second preview
  completes, so it paints stale until the store/URL updates.
- **generationStore survivor re-latch (MPI-208/213):** the derived-UI re-latch
  logic that keeps a survivor card could latch the wrong job's display payload
  when two multi-stage previews complete close together. See MPI-226 (same
  refactor) — check whether this is the same wrong-state paint.
- **Preview-latent / hot-store staging bleed:** the WS preview-frame stream or the
  hot-store preview staging keyed the second preview to the first's asset.
- **Card tempId / group reuse:** the preview card's tempId or group binding from
  the first gen leaks into the second.

## Investigation (do FIRST)

- [ ] Reproduce: two back-to-back multi-stage previews (WAN then LTX, both
      "Preview Initial Stage" on). Confirm the second preview paints the first's
      video on completion. Capture the renderer console + note the exact moment
      (on preview `generation:complete`? on the card swap-to-preview?).
- [ ] Trace the preview-display path: how a finished PREVIEW (stage-1) result gets
      its video URL bound to the card/player. Grep for the preview swap +
      `generation:complete` handling for the preview stage (generationService.js
      preview save ~L792-916, MpiGalleryGrid/_swapThumbToImage, the video player
      binding).
- [ ] Check generationStore: does the second preview's job correctly own its
      display payload, or can it inherit the first's (survivor re-latch,
      two-lane accounting, `generation-store:changed`)? Cross-ref MPI-226.
- [ ] Determine if this is store/display (client) or a genuinely wrong URL saved
      (server) — inspect what URL the second preview's card actually points at vs
      what the sidecar/store holds.

## Verification

**Verify mode:** user-ux.
- Two back-to-back multi-stage previews (different models) each paint THEIR OWN
  preview video on completion — never the prior one's.
- No regression to the Continue→final path (which already works).

## Preservation Notes

- Likely shares surface with MPI-226 (208/213 store/queue refactor) — if the root
  is the same survivor-relatch/wrong-state paint, consider merging. Keep separate
  until proven.
- Preview/hot-store staging knowledge: `docs/builder/research/` +
  `.claude/rules/comfy_engine.md`. Store contract: MPI-208
  `requirements-archaeology.md`.
- `logs/app.log` is comfy/download/server stdout ONLY — renderer clientLogger
  (the preview-paint events) is NOT there; use DevTools console.
